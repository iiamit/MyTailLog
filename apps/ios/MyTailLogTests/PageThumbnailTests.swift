import SwiftUI
import Testing
import UIKit
@testable import MyTailLog

@MainActor
struct PageThumbnailTests {
    @Test(arguments: [CGSize(width: 300, height: 400), CGSize(width: 1200, height: 400), CGSize(width: 2400, height: 400)])
    func scanAspectDoesNotChangeCellSize(size: CGSize) throws {
        let image = UIGraphicsImageRenderer(size: size).image { context in
            UIColor.red.setFill()
            context.fill(CGRect(origin: .zero, size: size))
        }
        for width in [110.0, 180.0, 260.0] {
            let host = UIHostingController(rootView: PageThumbnail(image: image))
            let measured = host.sizeThatFits(in: CGSize(width: width, height: width * 4 / 3))
            #expect(abs(measured.width - width) < 0.5)
            #expect(abs(measured.height - width * 4 / 3) < 0.5)

            let renderer = ImageRenderer(content: PageThumbnail(image: image))
            renderer.proposedSize = ProposedViewSize(width: width, height: width * 4 / 3)
            let rendered = try #require(renderer.uiImage)
            #expect(abs(rendered.size.width - width) < 0.5)
            #expect(abs(rendered.size.height - width * 4 / 3) < 0.5)
        }
        let grid = ImageRenderer(content:
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 110), spacing: 8)], spacing: 8) {
                ForEach(1...6, id: \.self) { number in
                    PageThumbnail(image: image)
                        .overlay(alignment: .bottomTrailing) {
                            Text("\(number)").foregroundStyle(.black).padding(4).background(.white)
                        }
                }
            }.padding(8).frame(width: 390).background(.white)
        )
        Attachment.record(try #require(grid.uiImage?.pngData()), named: "page-grid-\(Int(size.width)).png")
    }
}
