import CoreGraphics
import ImageIO
import Vision

/// Reading the hour meter on the phone (05 §16): no network, no allowance, nothing written or uploaded.
/// Parsing and the 3-frame rule are pure; `recognize` is Vision.
enum TachReader {
    /// What the last reading says about the next one.
    struct Context: Equatable, Sendable {
        /// The last reading for this meter; nil when the aircraft has none (any value is plausible).
        var last: Double?
        /// Days since that reading (fractions count).
        var daysSinceLast: Double = 1
        /// Recent median flight length, the score's centre (05 §16).
        var typicalFlight: Double = 1.5

        /// ≥ last and ≤ last + 24 h a day since it, capped at +100 h.
        func plausible(_ v: Double) -> Bool {
            guard let last else { return v > 0 }
            return v >= last && v <= last + min(24 * max(daysSinceLast, 0), 100)
        }
    }

    private static let run = try! NSRegularExpression(pattern: #"(?<![\d.])(\d[\d ]{1,7}\d)(?:[.,](\d))?(?![\d])"#)

    /// Every value a line could mean: runs of 3 to 6 digits, with or without a decimal point. A run without one is
    /// also read as tenths on the last drum (`value / 10`). Spaces between drums are ignored.
    static func candidates(_ text: String) -> [Double] {
        let ns = text as NSString
        var out: [Double] = []
        for m in run.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            let whole = ns.substring(with: m.range(at: 1)).replacingOccurrences(of: " ", with: "")
            let tenths = m.range(at: 2).location == NSNotFound ? nil : ns.substring(with: m.range(at: 2))
            let digits = whole.count + (tenths == nil ? 0 : 1)
            guard (3...6).contains(digits), let n = Double(whole) else { continue }
            if let tenths, let t = Double(tenths) {
                out.append(n + t / 10)
            } else {
                out.append(n)
                out.append(n / 10)
            }
        }
        return out
    }

    /// The best plausible value among the recognized lines: plausible only, then closest to last + a typical flight.
    /// Implausible values (lower than the last reading, or far above it) are never offered (M-FLIGHT-02 acceptance).
    static func best(_ lines: [String], _ ctx: Context) -> Double? {
        let target = (ctx.last ?? 0) + ctx.typicalFlight
        let values = lines.flatMap(candidates).filter(ctx.plausible)
        return values.min { abs($0 - target) < abs($1 - target) }.map { ($0 * 10).rounded() / 10 }
    }

    /// Lines of text inside `region` (normalized, origin bottom left as Vision has it). Accurate, no language
    /// correction, text at least a tenth of the region tall.
    static func recognize(_ request: VNImageRequestHandler, region: CGRect = CGRect(x: 0, y: 0, width: 1, height: 1)) -> [String] {
        let r = VNRecognizeTextRequest()
        r.recognitionLevel = .accurate
        r.usesLanguageCorrection = false
        r.regionOfInterest = region
        r.minimumTextHeight = 0.1
        guard (try? request.perform([r])) != nil else { return [] }
        return (r.results ?? []).flatMap { $0.topCandidates(3).map(\.string) }
    }

    static func read(_ image: CGImage, _ ctx: Context, region: CGRect = CGRect(x: 0, y: 0, width: 1, height: 1)) -> Double? {
        best(recognize(VNImageRequestHandler(cgImage: image), region: region), ctx)
    }
}

/// "Found" when the same value wins three frames in a row (05 §16).
struct TachConsensus {
    var needed = 3
    private var last: Double?
    private var streak = 0

    mutating func feed(_ v: Double?) -> Double? {
        guard let v else { last = nil; streak = 0; return nil }
        streak = v == last ? streak + 1 : 1
        last = v
        return streak >= needed ? v : nil
    }
}
