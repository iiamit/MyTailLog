import SwiftUI

/// A highlight over the page (02 §6.1): `selected` a yellow highlighter, `quiet` the dashed entry outline,
/// `doubt` the alarm tint the phone uses for a doubtful field.
struct ScanHighlight: Equatable {
    enum Style { case selected, quiet, doubt }
    let box: FieldBox
    let style: Style
}

/// Loads a page image from the model; a leaf-2 block while it comes, a line when it can't.
struct PageImage<Content: View>: View {
    let model: BooksModel
    let pageId: String
    var thumb = false
    @ViewBuilder var content: (UIImage) -> Content
    @State private var image: UIImage?
    @State private var missing = false

    var body: some View {
        Group {
            if let image {
                content(image)
            } else if missing {
                Text("This page isn't on this phone yet.").dFont(.small).foregroundStyle(Tokens.Colors.onCover2)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                Tokens.Colors.cover2.accessibilityLabel("Loading the page")
            }
        }
        .task(id: "\(pageId)|\(thumb)") {
            image = await model.image(pageId, thumb: thumb)
            missing = image == nil
        }
    }
}

/// The page with its highlights drawn in image coordinates; fits the width, keeps its aspect ratio (02 §6.1).
struct HighlightedPage: View {
    let image: UIImage
    var highlights: [ScanHighlight] = []

    var body: some View {
        Image(uiImage: image).resizable().aspectRatio(contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 2))
            .overlay {
                GeometryReader { g in
                    ForEach(Array(highlights.enumerated()), id: \.offset) { _, h in
                        let rect = CGRect(x: h.box.x * g.size.width - 3, y: h.box.y * g.size.height - 3,
                                          width: h.box.w * g.size.width + 6, height: h.box.h * g.size.height + 6)
                        let shape = RoundedRectangle(cornerRadius: 3)
                        switch h.style {
                        case .selected:
                            shape.fill(Tokens.Colors.highlight).overlay(shape.stroke(Tokens.Colors.highlightEdge, lineWidth: 2))
                                .frame(width: rect.width, height: rect.height).position(x: rect.midX, y: rect.midY)
                        case .quiet:
                            shape.stroke(Tokens.Colors.highlightEdge, style: StrokeStyle(lineWidth: 2, dash: [5, 4]))
                                .frame(width: rect.width, height: rect.height).position(x: rect.midX, y: rect.midY)
                        case .doubt:
                            shape.fill(Tokens.Colors.alarm.opacity(0.16)).overlay(shape.stroke(Tokens.Colors.alarm, lineWidth: 2))
                                .frame(width: rect.width, height: rect.height).position(x: rect.midX, y: rect.midY)
                        }
                    }
                }
                .allowsHitTesting(false)
            }
            .accessibilityElement()
            .accessibilityLabel("Scanned page")
            .accessibilityAddTraits(.isImage)
    }
}

/// A crop of the page around `box` (M-BOOKS-02 page crop), on the SourceMat, highlighted. The crop is labelled so the
/// owner knows the page goes on (02 §6.1: the page is evidence, never silently cropped).
struct PageCrop: View {
    let model: BooksModel
    let pageId: String
    let box: FieldBox?
    var height: CGFloat = 120

    var body: some View {
        PageImage(model: model, pageId: pageId) { image in
            GeometryReader { g in
                let b = box.map { FieldBox(x: max($0.x - 0.03, 0), y: max($0.y - 0.02, 0), w: min($0.w + 0.06, 1), h: $0.h + 0.04) }
                    ?? FieldBox(x: 0, y: 0, w: 1, h: 0.3)
                let shownW = g.size.width / b.w
                let shownH = shownW * image.size.height / max(image.size.width, 1)
                let y = -b.y * shownH + (g.size.height - b.h * shownH) / 2
                HighlightedPage(image: image, highlights: box.map { [ScanHighlight(box: $0, style: .quiet)] } ?? [])
                    .frame(width: shownW, height: shownH)
                    .offset(x: -b.x * shownW, y: min(0, y))
            }
            .clipped()
        }
        .frame(height: height)
        .frame(maxWidth: .infinity)
        .background(Tokens.Colors.mat)
        .clipShape(RoundedRectangle(cornerRadius: Tokens.Radius.s))
        .accessibilityElement()
        .accessibilityLabel(box == nil ? "Top of the scanned page" : "The entry on the scanned page")
        .accessibilityAddTraits(.isImage)
    }
}

/// ScanViewer (02 §6.1): pinch 1–5×, drag to pan, double-tap toggles 2×; `focus` zooms to a field's ink.
struct ZoomableScan: View {
    let image: UIImage
    var highlights: [ScanHighlight] = []
    var focus: FieldBox?
    /// Moves the focused ink up by this share of the view, above a drawer covering the lower part.
    var focusLift: CGFloat = 0
    @State private var scale: CGFloat = 1
    @State private var base: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var dragBase: CGSize = .zero
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GeometryReader { g in
            let fitW = min(g.size.width, g.size.height * image.size.width / max(image.size.height, 1))
            let fitH = fitW * image.size.height / max(image.size.width, 1)
            HighlightedPage(image: image, highlights: highlights)
                .frame(width: fitW, height: fitH)
                .scaleEffect(scale)
                .offset(offset)
                .frame(width: g.size.width, height: g.size.height)
                .contentShape(Rectangle())
                .gesture(MagnifyGesture()
                    .onChanged { scale = min(max(base * $0.magnification, 1), 5) }
                    .onEnded { _ in base = scale; if scale == 1 { offset = .zero; dragBase = .zero } })
                .simultaneousGesture(DragGesture(minimumDistance: 8)
                    .onChanged { v in
                        guard scale > 1 else { return }
                        offset = CGSize(width: dragBase.width + v.translation.width, height: dragBase.height + v.translation.height)
                    }
                    .onEnded { _ in dragBase = offset })
                .onTapGesture(count: 2) {
                    withAnimation(reduceMotion ? nil : .easeInOut(duration: Tokens.Motion.durationBase)) {
                        if scale > 1 { set(1, .zero) } else { set(2, .zero) }
                    }
                }
                .onChange(of: focus, initial: true) { _, box in
                    withAnimation(reduceMotion ? nil : .easeInOut(duration: Tokens.Motion.durationBase)) { zoom(to: box, fitW, fitH, lift: g.size.height * focusLift) }
                }
                .accessibilityZoomAction { action in
                    set(action.direction == .zoomIn ? min(scale + 1, 5) : max(scale - 1, 1), scale > 2 ? offset : .zero)
                }
        }
        .clipped()
    }

    private func set(_ s: CGFloat, _ o: CGSize) {
        scale = s; base = s; offset = o; dragBase = o
    }

    /// 2.5× centred on the box, or fit when there is none.
    private func zoom(to box: FieldBox?, _ w: CGFloat, _ h: CGFloat, lift: CGFloat) {
        guard let box else { set(1, .zero); return }
        let s: CGFloat = 2.5
        let cx = (box.x + box.w / 2 - 0.5) * w, cy = (box.y + box.h / 2 - 0.5) * h
        set(s, CGSize(width: -cx * s, height: -cy * s - lift))
    }
}

/// The full page, full screen, with swipe between a book's pages (M-BOOKS-06 tap a thumbnail, M-BOOKS-02 Open page).
struct ScanViewerScreen: View {
    let model: BooksModel
    let pageIds: [String]
    @State var current: String
    var highlight: [String: FieldBox] = [:]
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button { dismiss() } label: {
                    HStack(spacing: 2) { Icon("chevron-left"); Text("Back").dFont(.bodyStrong) }
                        .frame(minHeight: Tokens.Size.phoneTouchMin)
                }
                .buttonStyle(.plain)
                Spacer()
                if let page = model.page(current) {
                    VStack(alignment: .trailing, spacing: 0) {
                        Text(model.label(page)).dFont(.bodyStrong)
                        Text(position).dFont(.caption).foregroundStyle(Tokens.Colors.onCover2)
                    }
                }
            }
            .foregroundStyle(Tokens.Colors.onCover)
            .padding(.horizontal, Tokens.Space.s4)
            .frame(minHeight: 56)
            .background(Tokens.Colors.cover)
            TabView(selection: $current) {
                ForEach(pageIds, id: \.self) { id in
                    PageImage(model: model, pageId: id) { image in
                        ZoomableScan(image: image, highlights: highlight[id].map { [ScanHighlight(box: $0, style: .selected)] } ?? [])
                    }
                    .padding(Tokens.Space.s3)
                    .tag(id)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .background(Tokens.Colors.mat)
            if let page = model.page(current) {
                let n = model.entries(on: page).count
                Text(n == 1 ? "1 entry on this page" : "\(n) entries on this page")
                    .dFont(.small).foregroundStyle(Tokens.Colors.onCover2)
                    .frame(maxWidth: .infinity, minHeight: 44).background(Tokens.Colors.cover)
            }
        }
        .background(Tokens.Colors.cover.ignoresSafeArea())
    }

    private var position: String {
        guard pageIds.count > 1, let i = pageIds.firstIndex(of: current) else { return "" }
        return "\(i + 1) of \(pageIds.count)"
    }
}
