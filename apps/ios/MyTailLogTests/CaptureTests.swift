import CoreImage
import Foundation
import Testing
import UIKit
@testable import MyTailLog

/// Sample images drawn at test time: a hour-meter readout and a logbook page on a dark table, so the pipeline runs on
/// real Vision without a camera (the simulator has none).
enum Samples {
    static func meter(_ text: String, size: CGSize = CGSize(width: 900, height: 400)) -> CGImage {
        UIGraphicsImageRenderer(size: size, format: format).image { ctx in
            UIColor.black.setFill(); ctx.fill(CGRect(origin: .zero, size: size))
            UIColor.white.setFill(); ctx.fill(CGRect(x: 60, y: 90, width: size.width - 120, height: 220))
            let font = UIFont.monospacedDigitSystemFont(ofSize: 150, weight: .bold)
            (text as NSString).draw(at: CGPoint(x: 120, y: 105), withAttributes: [.font: font, .foregroundColor: UIColor.black])
        }.cgImage!
    }

    /// A white page, slightly rotated, on a dark table, with two dated entries.
    static func page(lines: [String] = ["Jun 11 1984  Annual inspection, tach 1874.6", "6/30/84  Oil changed, 8 qt"]) -> CGImage {
        let size = CGSize(width: 1500, height: 2000)
        return UIGraphicsImageRenderer(size: size, format: format).image { ctx in
            UIColor(white: 0.12, alpha: 1).setFill(); ctx.fill(CGRect(origin: .zero, size: size))
            let c = ctx.cgContext
            c.translateBy(x: size.width / 2, y: size.height / 2)
            c.rotate(by: 0.05)
            let page = CGRect(x: -560, y: -760, width: 1120, height: 1520)
            UIColor.white.setFill(); c.fill(page)
            let font = UIFont.systemFont(ofSize: 44, weight: .regular)
            for (i, line) in lines.enumerated() {
                (line as NSString).draw(at: CGPoint(x: page.minX + 60, y: page.minY + 120 + CGFloat(i) * 90),
                                        withAttributes: [.font: font, .foregroundColor: UIColor.black])
            }
        }.cgImage!
    }

    private static var format: UIGraphicsImageRendererFormat {
        let f = UIGraphicsImageRendererFormat()
        f.scale = 1
        return f
    }
}

struct TachParsingTests {
    let ctx = TachReader.Context(last: 4212.4, daysSinceLast: 1, typicalFlight: 1.5)

    @Test func runsOfThreeToSixDigitsWithOrWithoutAPoint() {
        #expect(TachReader.candidates("4214.8") == [4214.8])
        // No point: also tenths on the last drum.
        #expect(TachReader.candidates("42148") == [42148, 4214.8])
        #expect(TachReader.candidates("4 2 1 4 8") == [42148, 4214.8])
        #expect(TachReader.candidates("12").isEmpty)
        #expect(TachReader.candidates("1234567").isEmpty)
        #expect(TachReader.candidates("HOURS 0421.3").contains(421.3))
    }

    @Test func picksThePlausibleValueClosestToATypicalFlight() {
        #expect(TachReader.best(["N734DM", "42148", "1/10 HOURS"], ctx) == 4214.8)
        #expect(TachReader.best(["4213.0", "4214.0"], ctx) == 4214.0)
    }

    @Test func neverOffersImplausibleValues() {
        #expect(TachReader.best(["4210.0"], ctx) == nil)        // lower than the last reading
        #expect(TachReader.best(["4240.0"], ctx) == nil)        // more than 24 h a day since it
        let week = TachReader.Context(last: 4212.4, daysSinceLast: 30)
        #expect(TachReader.best(["4313.0"], week) == nil)       // the +100 h cap
        #expect(TachReader.best(["4311.0"], week) == 4311.0)
    }

    @Test func withoutALastReadingAnyPositiveValueCounts() {
        #expect(TachReader.best(["1874.6"], TachReader.Context(last: nil)) == 1874.6)
    }

    @Test func foundAfterThreeFramesInARow() {
        var c = TachConsensus()
        // A miss restarts the count.
        let got = [4214.8, 4214.8, nil, 4214.8, 4214.8, 4214.8].map { c.feed($0) }
        #expect(got == [nil, nil, nil, nil, nil, 4214.8])
    }

    @Test func readsTheMeterInASampleImageOnTheDevice() {
        // Vision text recognition, offline, no allowance (05 §16).
        #expect(TachReader.read(Samples.meter("4214.8"), ctx) == 4214.8)
        #expect(TachReader.read(Samples.meter("4209.1"), ctx) == nil)
    }

    @Test func guideMapsToVisionSpaceThroughAspectFill() {
        // A 3:4 buffer filling a 300×400 preview: no crop; the guide's top band is high in Vision's bottom-left space.
        let r = TachCameraModel.visionRegion(guide: CGRect(x: 0, y: 0, width: 300, height: 100), preview: CGSize(width: 300, height: 400),
                                             buffer: CGSize(width: 1500, height: 2000))
        #expect(abs(r.minY - 0.75) < 0.001 && abs(r.height - 0.25) < 0.001 && abs(r.width - 1) < 0.001)
        let fill = aspectFillRect(content: CGSize(width: 3, height: 4), in: CGSize(width: 400, height: 400))
        #expect(fill.width == 400 && abs(fill.height - 533.33) < 0.1 && fill.minY < 0)
    }
}

struct CoachingTests {
    let page = Quad(topLeft: CGPoint(x: 0.1, y: 0.1), topRight: CGPoint(x: 0.9, y: 0.12),
                    bottomRight: CGPoint(x: 0.88, y: 0.9), bottomLeft: CGPoint(x: 0.12, y: 0.88))

    @Test func hintsInOrder() {
        #expect(CoachHint.hint(quad: page, brightness: 0.1) == .moreLight)
        #expect(CoachHint.hint(quad: nil, brightness: 0.6) == .looking)
        let cut = Quad(topLeft: CGPoint(x: 0, y: 0.1), topRight: CGPoint(x: 0.9, y: 0.1), bottomRight: CGPoint(x: 0.9, y: 0.9), bottomLeft: CGPoint(x: 0.1, y: 0.9))
        #expect(CoachHint.hint(quad: cut, brightness: 0.6) == .moveBack)
        #expect(CoachHint.hint(quad: page, brightness: 0.6) == .holdStill)
        #expect(CoachHint.holdStill.text == "Page found. Hold still.")
    }

    @Test func areaIsAShareOfTheFrame() {
        let full = Quad(topLeft: .zero, topRight: CGPoint(x: 1, y: 0), bottomRight: CGPoint(x: 1, y: 1), bottomLeft: CGPoint(x: 0, y: 1))
        #expect(abs(full.area - 1) < 0.0001)
        #expect(page.area > 0.6 && page.area < 0.7)
    }

    @Test func steadyForSixTenthsOfASecondFiresOnce() {
        var s = Steadiness()
        var moved = page
        moved.topLeft.x += 0.05          // more than 2% of the diagonal
        let fired = [s.feed(page, at: 0), s.feed(page, at: 0.3), s.feed(page, at: 0.61),
                     s.feed(page, at: 0.9),                       // once per steady spell
                     s.feed(moved, at: 1.0), s.feed(moved, at: 1.3), s.feed(moved, at: 1.61),
                     s.feed(page, at: 2.5, deviceStill: false)]
        #expect(fired == [false, false, true, false, false, false, true, false])
    }
}

struct PageDateTests {
    @Test func readsNumericAndNamedDates() {
        #expect(PageDates.years(["6/11/84 Annual", "Jun 11 1984 oil", "7/2/1985", "13/40/85 not a date"], now: 2026) == [1984, 1984, 1985])
        #expect(PageDates.years(["Jun 111984 Annual inspection"], now: 2026) == [1984])
        #expect(PageDates.years(["3/4/19"], now: 2026) == [2019])
        #expect(PageDates.medianYear(["no dates here"]) == nil)
        #expect(PageDates.medianYear(["1/1/80", "1/1/84", "1/1/99"]) == 1984)
    }

    @Test func landsInTheGapOrAfterAPage() {
        let gaps = [LandsIn.Gap(from: "1983-02-01", to: "1991-03-01")]
        let pages = [LandsIn.Page(sequence: 12, landingDate: "1979-05-01"), LandsIn.Page(sequence: 203, landingDate: "1993-01-10")]
        #expect(LandsIn.line(year: 1984, logbook: "Airframe", gaps: gaps, pages: pages) == "Lands in 1984, inside the airframe gap")
        #expect(LandsIn.line(year: 1995, logbook: "Airframe", gaps: gaps, pages: pages) == "Lands in 1995, after page 203")
        #expect(LandsIn.line(year: 1975, logbook: "Airframe", gaps: gaps, pages: pages) == "Lands in 1975")
        // No legible date: no line (M-SCAN-02 acceptance).
        #expect(LandsIn.line(year: nil, logbook: "Airframe", gaps: gaps, pages: pages) == nil)
    }
}

struct PagePipelineTests {
    @Test func findsTheSamplePage() throws {
        let quad = try #require(PageFinder.find(in: Samples.page()))
        // The page is 1120×1520 of 1500×2000, about 57% of the frame.
        #expect(quad.area > 0.45 && quad.area < 0.7)
        #expect(quad.topLeft.y < 0.25 && quad.bottomRight.y > 0.75)
    }

    @Test func processesAPageForUpload() throws {
        let page = try #require(PageProcessor.process(Samples.page()))
        let full = try #require(UIImage(data: page.jpeg)), thumb = try #require(UIImage(data: page.thumb))
        #expect(max(full.size.width, full.size.height) <= 2000)
        #expect(max(thumb.size.width, thumb.size.height) <= 400)
        #expect(page.phash?.count == 16)
        #expect(page.year == 1984)
        // The flattened page is mostly white: the table is cropped away.
        #expect(PageImaging.brightness(CIImage(cgImage: full.cgImage!)) > 0.8)
    }

    @Test func dHashIsStableAndNearForTheSamePage() {
        let a = PageImaging.dHash(Samples.page())!, b = PageImaging.dHash(Samples.page())!
        let c = PageImaging.dHash(Samples.page(lines: ["Jun 11 1984  Annual inspection, tach 1874.6", "6/30/84  Oil changed, 9 qt"]))!
        let other = PageImaging.dHash(Samples.meter("4214.8"))!
        func hamming(_ x: String, _ y: String) -> Int { (UInt64(x, radix: 16)! ^ UInt64(y, radix: 16)!).nonzeroBitCount }
        #expect(a == b)
        #expect(hamming(a, c) <= 6)       // the server's DUPLICATE_DISTANCE
        #expect(hamming(a, other) > 6)
    }
}
