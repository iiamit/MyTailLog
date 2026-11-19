import CoreImage
import CoreImage.CIFilterBuiltins
import ImageIO
import UIKit
import UniformTypeIdentifiers
import Vision

// The page pipeline behind ScanCamera (05 §15.1), the system scanner and photos: find the page, coach the owner,
// flatten it, read the first dates for the lands-in line, and encode what uploads. Pure where it can be, so the
// rules are unit-tested on images without a camera.

/// A page outline as four corners in normalized image space, origin top left (UIKit), clockwise from top left.
struct Quad: Equatable, Sendable {
    var topLeft, topRight, bottomRight, bottomLeft: CGPoint

    var corners: [CGPoint] { [topLeft, topRight, bottomRight, bottomLeft] }

    /// Shoelace area, as a share of the frame.
    var area: CGFloat {
        let c = corners
        var s: CGFloat = 0
        for i in 0..<4 { let a = c[i], b = c[(i + 1) % 4]; s += a.x * b.y - b.x * a.y }
        return abs(s) / 2
    }

    /// The largest distance any corner moved, in normalized units (the frame diagonal is √2).
    func movement(to other: Quad) -> CGFloat {
        zip(corners, other.corners).map { hypot($0.x - $1.x, $0.y - $1.y) }.max() ?? 0
    }

    /// From Vision's observation (normalized, origin bottom left).
    init(_ o: VNRectangleObservation) {
        func flip(_ p: CGPoint) -> CGPoint { CGPoint(x: p.x, y: 1 - p.y) }
        self.init(topLeft: flip(o.topLeft), topRight: flip(o.topRight), bottomRight: flip(o.bottomRight), bottomLeft: flip(o.bottomLeft))
    }

    init(topLeft: CGPoint, topRight: CGPoint, bottomRight: CGPoint, bottomLeft: CGPoint) {
        self.topLeft = topLeft; self.topRight = topRight; self.bottomRight = bottomRight; self.bottomLeft = bottomLeft
    }
}

enum PageFinder {
    /// The page in an image: Vision document segmentation, falling back to the largest rectangle when the
    /// segmentation model is unavailable (the simulator's CPU-only Vision). Pages under 25% of the frame are ignored.
    static func find(in image: CGImage, orientation: CGImagePropertyOrientation = .up) -> Quad? {
        let handler = VNImageRequestHandler(cgImage: image, orientation: orientation)
        let segment = VNDetectDocumentSegmentationRequest()
        if (try? handler.perform([segment])) != nil, let o = segment.results?.first, o.confidence > 0.5 {
            let q = Quad(o)
            if q.area >= 0.25 { return q }
        }
        let rect = VNDetectRectanglesRequest()
        rect.minimumSize = 0.4
        rect.minimumAspectRatio = 0.3
        rect.maximumObservations = 1
        rect.quadratureTolerance = 20
        guard (try? handler.perform([rect])) != nil, let o = rect.results?.first else { return nil }
        let q = Quad(o)
        return q.area >= 0.25 ? q : nil
    }

    static func find(in buffer: CVPixelBuffer, orientation: CGImagePropertyOrientation) -> Quad? {
        let handler = VNImageRequestHandler(cvPixelBuffer: buffer, orientation: orientation)
        let segment = VNDetectDocumentSegmentationRequest()
        guard (try? handler.perform([segment])) != nil, let o = segment.results?.first, o.confidence > 0.5 else { return nil }
        let q = Quad(o)
        return q.area >= 0.25 ? q : nil
    }
}

/// The camera's hint pill (06 M-SCAN-02), from what the frame shows. First match wins.
enum CoachHint: Equatable, Sendable {
    case moreLight, looking, moveBack, holdStill

    var text: String {
        switch self {
        case .moreLight: "More light, or turn on the torch"
        case .looking: "Looking for the page edges"
        case .moveBack: "Move back so the whole page fits"
        case .holdStill: "Page found. Hold still."
        }
    }

    /// `brightness` is the frame's mean luma 0…1. A page whose corner sits on the frame edge, or that fills
    /// almost all of it, is probably cut off.
    static func hint(quad: Quad?, brightness: Double) -> CoachHint {
        if brightness < 0.18 { return .moreLight }
        guard let quad else { return .looking }
        let edge: CGFloat = 0.015
        let touches = quad.corners.contains { $0.x < edge || $0.y < edge || $0.x > 1 - edge || $0.y > 1 - edge }
        if touches || quad.area > 0.92 { return .moveBack }
        return .holdStill
    }
}

/// "Hold still" (05 §15.1): the corners move under 2% of the frame diagonal for 0.6 s, and the phone itself is
/// still. Feed it every analysed frame; it says when to take the shot, once per steady spell.
struct Steadiness {
    var window: TimeInterval = 0.6
    var tolerance: CGFloat = 0.02 * sqrt(2)
    private var anchor: Quad?
    private var since: TimeInterval = 0
    private var fired = false

    /// True exactly once per steady spell.
    mutating func feed(_ quad: Quad?, at time: TimeInterval, deviceStill: Bool = true) -> Bool {
        guard let quad, deviceStill else { anchor = nil; fired = false; return false }
        if let a = anchor, a.movement(to: quad) < tolerance {
            if !fired, time - since >= window { fired = true; return true }
            return false
        }
        anchor = quad
        since = time
        fired = false
        return false
    }

    /// After a capture the next page needs a fresh steady spell (and usually a page turn).
    mutating func reset() { anchor = nil; fired = false }
}

enum PageImaging {
    static let context = CIContext(options: [.useSoftwareRenderer: false])

    /// CIPerspectiveCorrection with the quad (no colour filters: the page image stays faithful).
    static func flatten(_ image: CIImage, quad: Quad) -> CIImage {
        let w = image.extent.width, h = image.extent.height
        // CoreImage is bottom-left origin.
        func p(_ n: CGPoint) -> CGPoint { CGPoint(x: image.extent.minX + n.x * w, y: image.extent.minY + (1 - n.y) * h) }
        let f = CIFilter.perspectiveCorrection()
        f.inputImage = image
        f.topLeft = p(quad.topLeft); f.topRight = p(quad.topRight)
        f.bottomRight = p(quad.bottomRight); f.bottomLeft = p(quad.bottomLeft)
        return f.outputImage ?? image
    }

    /// Scaled so the longest edge is at most `edge` pixels.
    static func scaled(_ image: CIImage, longEdge edge: CGFloat) -> CIImage {
        let long = max(image.extent.width, image.extent.height)
        guard long > edge else { return image }
        let s = edge / long
        return image.transformed(by: CGAffineTransform(scaleX: s, y: s))
    }

    static func cgImage(_ image: CIImage) -> CGImage? {
        context.createCGImage(image, from: image.extent.integral)
    }

    /// JPEG at `quality` (05 §7.2: 0.85), no metadata (no location is ever written).
    static func jpeg(_ image: CGImage, quality: CGFloat = 0.85) -> Data? {
        let data = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(data, UTType.jpeg.identifier as CFString, 1, nil) else { return nil }
        CGImageDestinationAddImage(dest, image, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
        return CGImageDestinationFinalize(dest) ? data as Data : nil
    }

    /// 64-bit dHash of the page scaled to 9×8 greyscale, 16 hex characters (09 §3.9.3). Bit order: rows top to
    /// bottom, columns left to right, most significant first; a bit is set when a pixel is brighter than its right neighbour.
    static func dHash(_ image: CGImage) -> String? {
        let w = 9, h = 8
        var px = [UInt8](repeating: 0, count: w * h)
        guard let ctx = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w,
                                  space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return nil }
        ctx.interpolationQuality = .medium
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
        // The bitmap's first row in memory is the top of the drawn image.
        var bits: UInt64 = 0
        for y in 0..<h {
            for x in 0..<(w - 1) {
                bits <<= 1
                if px[y * w + x] > px[y * w + x + 1] { bits |= 1 }
            }
        }
        return String(format: "%016llx", bits)
    }

    /// Mean luma of a small rendition, 0…1 (the "more light" hint).
    static func brightness(_ image: CIImage) -> Double {
        let f = CIFilter.areaAverage()
        f.inputImage = image
        f.extent = image.extent
        guard let out = f.outputImage else { return 1 }
        var rgba = [UInt8](repeating: 0, count: 4)
        context.render(out, toBitmap: &rgba, rowBytes: 4, bounds: CGRect(x: 0, y: 0, width: 1, height: 1), format: .RGBA8, colorSpace: nil)
        return (0.299 * Double(rgba[0]) + 0.587 * Double(rgba[1]) + 0.114 * Double(rgba[2])) / 255
    }
}

/// One page ready to hold: the 2000px JPEG, the 400px thumbnail, its fingerprint and any dates read off it.
struct ProcessedPage: Sendable {
    let jpeg: Data
    let thumb: Data
    let phash: String?
    let year: Int?
}

enum PageProcessor {
    /// Finds and flattens the page (unless `quad` is given, or `alreadyFlat` for the system scanner's output), then
    /// encodes it (05 §7.2: JPEG 0.85, long edge 2000; thumbnail 400) and reads its dates (05 §15.1).
    static func process(_ cg: CGImage, quad given: Quad? = nil, alreadyFlat: Bool = false) -> ProcessedPage? {
        var image = CIImage(cgImage: cg)
        if !alreadyFlat, let quad = given ?? PageFinder.find(in: cg) {
            image = PageImaging.flatten(image, quad: quad)
        }
        guard let page = PageImaging.cgImage(PageImaging.scaled(image, longEdge: 2000)),
              let thumbImage = PageImaging.cgImage(PageImaging.scaled(image, longEdge: 400)),
              let jpeg = PageImaging.jpeg(page), let thumb = PageImaging.jpeg(thumbImage, quality: 0.8) else { return nil }
        return ProcessedPage(jpeg: jpeg, thumb: thumb, phash: PageImaging.dHash(page), year: PageDates.year(in: page))
    }
}

/// Dates on a page (05 §15.1): fast text recognition, en-US, no language correction; m/d/yy, m/d/yyyy and
/// "Jun 11 1984"; the median year. Never stored as data: it only places the lands-in line.
enum PageDates {
    static func year(in image: CGImage) -> Int? {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .fast
        request.recognitionLanguages = ["en-US"]
        request.usesLanguageCorrection = false
        guard (try? VNImageRequestHandler(cgImage: image).perform([request])) != nil else { return nil }
        let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
        return medianYear(lines)
    }

    private static let numeric = try! NSRegularExpression(pattern: #"\b(\d{1,2})[/\-.|](\d{1,2})[/\-.|](\d{2}|\d{4})\b"#)
    private static let named = try! NSRegularExpression(
        pattern: #"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s*(\d{4})\b"#, options: .caseInsensitive)

    /// Years of every legible date (fast recognition often drops the space in "Jun 11 1984"), two-digit years read as 19xx above the current year's last two digits.
    static func years(_ lines: [String], now: Int = Calendar(identifier: .gregorian).component(.year, from: Date())) -> [Int] {
        var out: [Int] = []
        for line in lines {
            let ns = line as NSString, all = NSRange(location: 0, length: ns.length)
            for m in numeric.matches(in: line, range: all) {
                guard let mo = Int(ns.substring(with: m.range(at: 1))), let d = Int(ns.substring(with: m.range(at: 2))),
                      (1...12).contains(mo), (1...31).contains(d), var y = Int(ns.substring(with: m.range(at: 3))) else { continue }
                if y < 100 { y += y > now % 100 ? 1900 : 2000 }
                out.append(y)
            }
            for m in named.matches(in: line, range: all) {
                guard let d = Int(ns.substring(with: m.range(at: 2))), (1...31).contains(d), let y = Int(ns.substring(with: m.range(at: 3))) else { continue }
                out.append(y)
            }
        }
        return out.filter { (1900...now).contains($0) }
    }

    static func medianYear(_ lines: [String]) -> Int? {
        let ys = years(lines).sorted()
        return ys.isEmpty ? nil : ys[ys.count / 2]
    }
}

/// "Lands in 1984, inside the airframe gap" / "Lands in 1993, after page 203" (05 §15.1), from the map's gaps and
/// the book's pages. Nil when no date was legible, so the line never shows without one (M-SCAN-02 acceptance).
enum LandsIn {
    struct Gap: Equatable { let from: String; let to: String }
    struct Page: Equatable { let sequence: Int; let landingDate: String }

    static func line(year: Int?, logbook: String, gaps: [Gap], pages: [Page]) -> String? {
        guard let year else { return nil }
        if gaps.contains(where: { (yearOf($0.from) ?? .max) <= year && year <= (yearOf($0.to) ?? .min) }) {
            return "Lands in \(year), inside the \(logbook.lowercased()) gap"
        }
        if let before = pages.filter({ (yearOf($0.landingDate) ?? .max) <= year }).max(by: { $0.landingDate < $1.landingDate }) {
            return "Lands in \(year), after page \(before.sequence)"
        }
        return "Lands in \(year)"
    }

    private static func yearOf(_ iso: String) -> Int? { Int(iso.prefix(4)) }
}
