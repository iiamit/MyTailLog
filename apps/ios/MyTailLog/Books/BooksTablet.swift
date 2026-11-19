import SwiftUI

/// T-BOOKS-01: the horizontal RouteMap on the left leaf with the selection's entries under it; the selection's pages
/// on the SourceMat at right, one tab per book for a visit. Pages and Review as on the phone, in a leaf.
struct BooksTablet: View {
    let model: BooksModel
    @State private var tab: BooksTab = .map
    @State private var selected: MapElement?
    @State private var book = 0
    @State private var width: CGFloat = 0
    @State private var cover: BooksCover?
    @State private var pending: BooksCover?
    @State private var gap: MapData.Gap?
    @State private var scanBook: ScanChoice?
    @Environment(TabModel.self) private var tabs

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s3) {
            HStack(spacing: Tokens.Space.s4) {
                Picker("Logbooks pages", selection: $tab) {
                    Text("Map").tag(BooksTab.map)
                    Text("Pages").tag(BooksTab.pages)
                    Text(model.queue.isEmpty ? "Review" : "Review \(model.queue.count)").tag(BooksTab.review)
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 420)
                ScanRow(model: model, scanBook: $scanBook).frame(maxWidth: 360)
            }
            switch tab {
            case .map: map
            case .pages: TabletLeaf { PagesContent(model: model, actions: actions, review: { tab = .review }) }
            case .review: TabletLeaf { ReviewQueueContent(model: model, start: { cover = .review(start: $0) }) }
            }
        }
        .navigationDestination(for: BooksRoute.self) { route in
            switch route {
            case .entry(let id): EntryScreen(model: model, entryId: id, actions: actions)
            case .book(let id): BookPagesScreen(model: model, logbookId: id, actions: actions)
            case .list: EntriesListScreen(model: model, actions: actions)
            }
        }
        // A link to Review (05 §5.5) opens the flow here; it also ends the reading Live Activity (05 §12).
        .task(id: tabs.reviewPending) {
            guard tabs.reviewPending else { return }
            tabs.reviewPending = false
            ReadingLive.shared.endAll()
            cover = .review(start: nil)
        }
        .fullScreenCover(item: $cover) { c in
            switch c {
            case .pages(let ids, let current, let box):
                ScanViewerScreen(model: model, pageIds: ids, current: current, highlight: box.map { [current: $0] } ?? [:])
            case .review(let start): ReviewFlow(model: model, start: start)
            }
        }
        .sheet(item: $gap, onDismiss: { cover = pending; pending = nil }) { g in GapSheet(model: model, gap: g, actions: actions).presentationDetents([.medium, .large]) }
    }

    private var actions: BooksActions {
        BooksActions(
            stop: { s in selected = MapElement(kind: .stop, key: s.id, x: 0, y: 0, w: 0, h: 0, name: "") },
            entry: { tabs.paths[.books, default: NavigationPath()].append(BooksRoute.entry($0)) },
            page: { id, box in
                let book = model.page(id)?.logbook_id
                cover = .pages(model.pages.filter { $0.logbook_id == book }.map(\.id), current: id, box: box)
            },
            review: { id in if gap == nil { cover = .review(start: id) } else { pending = .review(start: id); gap = nil } },
            scan: model.canEdit ? { id in
                gap = nil
                Task { try? await Task.sleep(for: .milliseconds(450)); scanBook = ScanChoice(logbookId: id) }
            } : nil)
    }

    /// The stops behind the selection: one for a stop, one per book for a visit.
    private var selectedStops: [MapData.Stop] {
        guard let map = model.map, let sel = selected else { return [] }
        switch sel.kind {
        case .stop: return map.stops.filter { $0.id == sel.key }
        case .visit:
            let ids = map.interchanges.first { $0.id == sel.key }?.stopIds ?? []
            return map.stops.filter { ids.contains($0.id) }.sorted { laneOrder($0.logbook) < laneOrder($1.logbook) }
        default: return []
        }
    }

    private var map: some View {
        HStack(alignment: .top, spacing: Tokens.Space.s4) {
            TabletLeaf {
                if let map = model.map {
                    let confirmed = model.entries.filter { $0.owner_confirmed }.count
                    let years = Int(map.today.prefix(4))! - Int(map.range.from.prefix(4))!
                    Text("\(years) years, \(confirmed) confirmed entries · tap a stop or a visit").dFont(.small).foregroundStyle(Tokens.Colors.ink3)
                    if width > 0 {
                        let layout = map.layout(MapLayoutOptions(size: "routemap", renderedWidth: width))
                        let elements = mapElements(layout, map) { s in s.entryIds.first.flatMap(model.entry)?.title }
                        RouteMapView(data: map, layout: layout, elements: elements, selected: selected?.id, open: open)
                    }
                    Button("Show as list") { tabs.paths[.books, default: NavigationPath()].append(BooksRoute.list) }.buttonStyle(.quiet)
                    selection
                } else if model.failed {
                    Text("We could not load the logbooks right now.").dFont(.lede).foregroundStyle(Tokens.Colors.ink2)
                    Button("Retry") { Task { await model.refresh() } }.buttonStyle(.quiet)
                } else {
                    Skeleton(fraction: 1, height: 400)
                }
            }
            .onGeometryChange(for: CGFloat.self) { $0.size.width - 60 } action: { width = max($0, 0) }
            .refreshable { await model.refresh() }
            pagesMat.frame(maxWidth: 380)
        }
    }

    private func open(_ e: MapElement) {
        switch e.kind {
        case .gap: gap = model.map?.gaps.first { $0.id == e.key }
        case .ring:
            tabs.selected = .status
        default:
            selected = e
            book = 0
        }
    }

    /// Under the map: the selection's entries, in the paper's voice, each with its trust mark.
    @ViewBuilder private var selection: some View {
        let stops = selectedStops
        if !stops.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                GroupHeader(title: stops.count > 1 ? "\(Day.format(stops[0].date)) · \(stops.count) books" : Day.format(stops[0].date))
                ForEach(stops) { s in
                    let e = s.entryIds.first.flatMap(model.entry)
                    Button { if let e { actions.entry(e.id) } } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                LineChip(line: s.logbook, label: bookName(s.logbook) ?? "")
                                Spacer()
                                TrustMark(level: e?.trustLevel ?? .confirmed, label: trustLabel(e?.trustLevel ?? .confirmed))
                            }
                            Text(e?.work_performed ?? e?.description ?? "").dFont(.paper).foregroundStyle(Tokens.Colors.ink)
                                .multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.vertical, Tokens.Space.s3)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(RowButtonStyle())
                    .overlay(alignment: .bottom) { Rule() }
                }
            }
        }
    }

    /// The right leaf: the selection's page on the mat; one tab per book for a visit.
    private var pagesMat: some View {
        let stops = selectedStops
        return VStack(alignment: .leading, spacing: Tokens.Space.s3) {
            if stops.isEmpty {
                Text("Tap a stop to see its page.").dFont(.body).foregroundStyle(Tokens.Colors.onCover2)
            } else {
                let i = min(book, stops.count - 1)
                let s = stops[i], e = s.entryIds.first.flatMap(model.entry)
                Text([e?.signature_name, e?.tach.map { "tach \(EntryRow.number($0))" }].compactMap { $0 }.joined(separator: " · "))
                    .dFont(.small).foregroundStyle(Tokens.Colors.onCover2)
                if stops.count > 1 {
                    Picker("Book", selection: $book) {
                        ForEach(Array(stops.enumerated()), id: \.offset) { j, st in Text(bookName(st.logbook) ?? "").tag(j) }
                    }
                    .pickerStyle(.segmented)
                }
                if let pageId = s.pageIds.first, let page = model.page(pageId) {
                    PageImage(model: model, pageId: pageId) { image in
                        ZoomableScan(image: image, highlights: e?.entryBox.map { [ScanHighlight(box: $0, style: .selected)] } ?? [])
                    }
                    HStack {
                        Text(model.label(page) + (stops.count > 1 ? " · \(i + 1) of \(stops.count)" : "")).dFont(.small).foregroundStyle(Tokens.Colors.onCover2)
                        Spacer()
                        Button { actions.page(pageId, e?.entryBox) } label: {
                            HStack(spacing: 4) { Icon("zoom-in", size: 18); Text("Zoom").dFont(.small, weight: 700) }
                                .foregroundStyle(Tokens.Colors.onCover).frame(minHeight: 44)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Tokens.Colors.mat, in: RoundedRectangle(cornerRadius: Tokens.Radius.s))
    }
}
