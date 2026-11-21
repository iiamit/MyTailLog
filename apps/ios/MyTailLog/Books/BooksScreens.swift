import SwiftUI

/// Pushed Logbooks screens on the phone.
enum BooksRoute: Hashable {
    case entry(String)
    case book(String)
    case list
}

/// The map's sheets (M-BOOKS-02/03/04).
enum MapSheet: Identifiable {
    case stop(MapData.Stop), visit(MapData.Interchange), gap(MapData.Gap)
    var id: String {
        switch self {
        case .stop(let s): "stop:\(s.id)"
        case .visit(let v): "visit:\(v.id)"
        case .gap(let g): "gap:\(g.id)"
        }
    }
}

enum BooksTab: Hashable { case map, pages, review }

/// A full-screen page or review the Logbooks screens open over everything.
enum BooksCover: Identifiable {
    case pages([String], current: String, box: FieldBox?)
    case review(start: String?)
    var id: String {
        switch self {
        case .pages(_, let c, _): "pages:\(c)"
        case .review(let s): "review:\(s ?? "")"
        }
    }
}

/// The Logbooks tab on the phone (06 §6): SubTabs Map · Pages · Review n, the open one below.
struct BooksHome: View {
    let model: BooksModel
    @State private var tab: BooksTab = .map
    @State private var sheet: MapSheet?
    @State private var cover: BooksCover?
    @State private var pending: BooksCover?
    @State private var scanBook: ScanChoice?
    @Environment(TabModel.self) private var tabs
    @Environment(OfflineStore.self) private var offline: OfflineStore?
    @Environment(\.duoCoverTrailingInset) private var coverInset

    var body: some View {
        VStack(spacing: Tokens.Space.s2) {
            captureRow
            Picker("Logbooks pages", selection: $tab) {
                Text("Map").tag(BooksTab.map)
                Text("Pages").tag(BooksTab.pages)
                Text(model.queue.isEmpty ? "Review" : "Review \(model.queue.count)").tag(BooksTab.review)
                    .accessibilityLabel(model.queue.isEmpty ? "Review" : "Review, \(model.queue.count) pages waiting")
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, Tokens.Space.s4)
            content
        }
        .navigationDestination(for: BooksRoute.self) { route in
            switch route {
            case .entry(let id): EntryScreen(model: model, entryId: id, actions: actions)
            case .book(let id): BookPagesScreen(model: model, logbookId: id, actions: actions)
            case .list: EntriesListScreen(model: model, actions: actions)
            }
        }
        .sheet(item: $sheet, onDismiss: { cover = pending; pending = nil }) { s in
            Group {
                switch s {
                case .stop(let stop): StopSheet(model: model, stop: stop, actions: actions)
                    .presentationDetents([.height(360), .large])
                case .visit(let v): VisitSheet(model: model, visit: v, actions: actions)
                    .presentationDetents([.height(440), .large])
                case .gap(let g): GapSheet(model: model, gap: g, actions: actions)
                    .presentationDetents([.height(480), .large])
                }
            }
            .presentationBackgroundInteraction(.enabled(upThrough: .height(360)))
            .presentationBackground(Tokens.Colors.leaf)
        }
        // Pages scanned on this phone show up once their sync lands, not only on pull to refresh.
        .onChange(of: model.offline?.lastSyncAt) { _, _ in if let offline = model.offline { model.readMirror(offline) } }
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
    }

    private var captureRow: some View {
        ScanRow(model: model, scanBook: $scanBook)
            .padding(.horizontal, Tokens.Space.s4)
            .padding(.trailing, coverInset)
    }

    @ViewBuilder private var content: some View {
        switch tab {
        case .map:
            MapPane(model: model, select: select, list: { push(.list) })
        case .pages:
            PhoneLeaf { PagesContent(model: model, actions: actions, review: { tab = .review }) }
                .refreshable { await model.refresh() }
        case .review:
            PhoneLeaf { ReviewQueueContent(model: model, start: { cover = .review(start: $0) }) }
                .refreshable { await model.refresh() }
        }
    }

    private var actions: BooksActions {
        BooksActions(
            stop: { sheet = .stop($0) },
            entry: { id in sheet = nil; push(.entry(id)) },
            page: { id, box in
                let book = model.page(id)?.logbook_id
                let ids = model.pages.filter { $0.logbook_id == book }.map(\.id)
                show(.pages(ids.isEmpty ? [id] : ids, current: id, box: box))
            },
            review: { id in show(.review(start: id)) },
            scan: offline == nil ? nil : { id in
                sheet = nil
                Task { try? await Task.sleep(for: .milliseconds(450)); scanBook = ScanChoice(logbookId: id) }
            })
    }

    /// A cover can't present while a sheet is up: close the sheet first, then present from its onDismiss.
    private func show(_ c: BooksCover) {
        if sheet == nil { cover = c } else { pending = c; sheet = nil }
    }

    private func select(_ e: MapElement) {
        guard let map = model.map else { return }
        switch e.kind {
        case .stop:
            let ids = map.stops.first { $0.id == e.key }.map { [$0] } ?? []
            if let stop = ids.first { sheet = .stop(stop) }
        case .visit: if let v = map.interchanges.first(where: { $0.id == e.key }) { sheet = .visit(v) }
        case .gap: if let g = map.gaps.first(where: { $0.id == e.key }) { sheet = .gap(g) }
        case .ring:
            tabs.selected = .status
            tabs.paths[.status, default: NavigationPath()].append(StatusRoute.item(e.key))
        }
    }

    private func push(_ route: BooksRoute) {
        tabs.paths[.books, default: NavigationPath()].append(route)
    }
}

/// M-BOOKS-01 / M-BOOKS-05: the vertical map in the leaf, column heads pinned, the book filter and the List chip.
struct MapPane: View {
    let model: BooksModel
    let select: (MapElement) -> Void
    let list: () -> Void
    @State private var only: String?
    @State private var zoom: Double = 1
    @State private var zoomBase: Double = 1
    @Environment(\.section) private var section

    var body: some View {
        GeometryReader { viewport in
          VStack(spacing: 0) {
            if let map = model.map {
                let data = only.map { map.only(lineId: $0) } ?? map
                let width = max(viewport.size.width - 2 * Tokens.Space.s3, 0)
                let layout = width > 0 ? data.layout(MapLayoutOptions(size: "phone", renderedWidth: width, allEras: only != nil)) : nil
                ZStack(alignment: .trailing) {
                    if let layout { MapColumnHeads(layout: layout).frame(maxWidth: .infinity, alignment: .leading) }
                    bookMenu(map)
                }
                .frame(height: 44)
                .padding(.horizontal, Tokens.Space.s3)
                ScrollView {
                    if let layout {
                        let elements = mapElements(layout, data) { stop in stop.entryIds.first.flatMap(model.entry)?.title }
                        VStack(alignment: .leading, spacing: Tokens.Space.s2) {
                            if map.stops.isEmpty { noPages }
                            RouteMapView(data: data, layout: layout, elements: elements, zoom: zoom, open: select)
                                .padding(.horizontal, Tokens.Space.s3)
                            footer(map, layout)
                        }
                        .padding(.bottom, 72)
                    }
                }
                .simultaneousGesture(MagnifyGesture()
                    .onChanged { zoom = min(max(zoomBase * $0.magnification, 1), 6) }
                    .onEnded { _ in zoomBase = zoom })
                .refreshable { await model.refresh() }
            } else if model.failed {
                VStack(alignment: .leading) {
                    Text("We could not load the logbooks right now.").dFont(.lede).foregroundStyle(Tokens.Colors.ink2)
                    Button("Retry") { Task { await model.refresh() } }.buttonStyle(.quiet)
                }
                .padding(Tokens.Space.s4)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            } else {
                VStack(spacing: Tokens.Space.s3) {
                    ForEach(0..<6) { Skeleton(fraction: $0 % 2 == 0 ? 0.8 : 0.6, height: 40) }
                }
                .padding(Tokens.Space.s4)
                .frame(maxHeight: .infinity, alignment: .top)
                .accessibilityElement()
                .accessibilityLabel("Loading the map")
            }
          }
          .frame(width: viewport.size.width, height: viewport.size.height)
          .background(Tokens.Colors.leaf)
          .clipShape(UnevenRoundedRectangle(topLeadingRadius: Tokens.Radius.s, topTrailingRadius: Tokens.Radius.s))
        }
        .padding(.horizontal, Tokens.Space.s2)
        .overlay(alignment: .bottomLeading) {
            Button(action: list) {
                HStack(spacing: 6) { Icon("list", size: 18); Text("List").dFont(.bodyStrong) }
                    .padding(.horizontal, Tokens.Space.s4)
                    .frame(minHeight: Tokens.Size.phoneTouchMin)
            }
            .buttonStyle(FillButtonStyle(fill: Tokens.Colors.ink, content: Tokens.Colors.leaf, shape: Capsule()))
            .padding(Tokens.Space.s5)
            .padding(.bottom, Tokens.Space.s8) // clear of the tab bar, whose open tab rises into the leaf
            .accessibilityLabel("Show as list")
        }
    }

    private func bookMenu(_ map: MapData) -> some View {
        Menu {
            Button("All books") { only = nil; zoom = 1; zoomBase = 1 }
            ForEach(map.lines, id: \.lineId) { line in
                Button(line.name) { only = line.lineId; zoom = 1; zoomBase = 1 }
            }
        } label: {
            HStack(spacing: 4) {
                Text(only.flatMap { id in map.lines.first { $0.lineId == id }?.name } ?? "All books").dFont(.small, weight: 700)
                Icon("chevron-down", size: 16)
            }
            .foregroundStyle(section.boardInk)
            .frame(minHeight: Tokens.Size.phoneTouchMin)
        }
        .accessibilityLabel("Book filter")
    }

    private var noPages: some View {
        Text("The map draws itself from dated entries. None yet.")
            .dFont(.body).foregroundStyle(Tokens.Colors.ink)
            .padding(Tokens.Space.s4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Tokens.Colors.leaf2, in: RoundedRectangle(cornerRadius: Tokens.Radius.s))
            .padding(.horizontal, Tokens.Space.s3)
    }

    @ViewBuilder private func footer(_ map: MapData, _ layout: MapLayout) -> some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s1) {
            if layout.more > 0 {
                Button(layout.more == 1 ? "1 more item: see the list" : "\(layout.more) more items: see the list", action: list)
                    .buttonStyle(.quiet)
            }
            if map.undatedEntries > 0 {
                Text(map.undatedEntries == 1 ? "1 entry without a date" : "\(map.undatedEntries) entries without a date")
                    .dFont(.small).foregroundStyle(Tokens.Colors.ink3)
            }
        }
        .padding(.horizontal, Tokens.Space.s4)
    }
}

/// M-BOOKS-06: the review banner, the books with their coverage, then a book's pages.
struct PagesContent: View {
    let model: BooksModel
    let actions: BooksActions
    let review: () -> Void
    @Environment(TabModel.self) private var tabs

    var body: some View {
        let queue = model.queue
        if !queue.isEmpty {
            let clean = queue.filter { p in model.entries(on: p).allSatisfy { e in !e.reviewFields.contains(where: \.doubtful) } }.count
            HStack(alignment: .center, spacing: Tokens.Space.s3) {
                Text((queue.count == 1 ? "1 page waits for review." : "\(queue.count) pages wait for review.")
                     + (clean > 0 ? " \(clean) read cleanly." : ""))
                    .dFont(.body).foregroundStyle(Tokens.Colors.ink)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Button("Review", action: review).buttonStyle(.secondary).frame(maxWidth: 110)
            }
            .padding(Tokens.Space.s3)
            .background(Tokens.Colors.leaf2, in: RoundedRectangle(cornerRadius: Tokens.Radius.s))
        }
        Text("\(model.pages.count) pages · \(model.entries.count) entries").dFont(.small).foregroundStyle(Tokens.Colors.ink3)
        VStack(spacing: 0) {
            ForEach(model.logbooks.sorted { laneOrder($0.type) < laneOrder($1.type) }) { book in
                bookRow(book)
            }
        }
    }

    private func bookRow(_ book: LogbookRow) -> some View {
        let pages = model.pages.filter { $0.logbook_id == book.id }
        let gaps = model.map?.gaps.filter { $0.lineId == book.id && $0.status != "no_pages_exist" } ?? []
        let meta = [pages.count == 1 ? "1 page" : "\(pages.count) pages"] + gaps.map { "gap \($0.from.prefix(4)) to \($0.to.prefix(4))" }
        return Button { tabs.paths[.books, default: NavigationPath()].append(BooksRoute.book(book.id)) } label: {
            HStack(spacing: Tokens.Space.s3) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(book.name).dFont(.bodyStrong).foregroundStyle(Tokens.Colors.ink)
                    Text(meta.joined(separator: " · ")).dFont(.small).foregroundStyle(Tokens.Colors.ink3)
                    if let map = model.map { CoverageBar(map: map, lineId: book.id) }
                }
                Icon("chevron-right").foregroundStyle(Tokens.Colors.ink3)
            }
            .padding(.vertical, Tokens.Space.s3)
            .frame(minHeight: 72)
            .contentShape(Rectangle())
        }
        .buttonStyle(RowButtonStyle())
        .overlay(alignment: .bottom) { Rule() }
    }
}

/// CoverageBar (M-BOOKS-06): first page to today; stops as ticks in the book's ink, gaps hatched in alarm.
struct CoverageBar: View {
    let map: MapData
    let lineId: String

    var body: some View {
        Canvas { ctx, size in
            let a = Double(Day.between("1970-01-01", map.range.from)), z = Double(Day.between("1970-01-01", map.today))
            func x(_ d: String) -> CGFloat { CGFloat((Double(Day.between("1970-01-01", d)) - a) / max(z - a, 1)) * size.width }
            ctx.fill(Path(roundedRect: CGRect(origin: .zero, size: size), cornerRadius: 2), with: .color(Tokens.Colors.leaf2))
            let ink = Tokens.Colors.line(map.lines.first { $0.lineId == lineId }?.logbook)
            for s in map.stops where s.lineId == lineId {
                ctx.fill(Path(CGRect(x: x(s.date) - 1, y: 0, width: 3, height: size.height)), with: .color(ink))
            }
            for g in map.gaps where g.lineId == lineId && g.status != "no_pages_exist" {
                let rect = CGRect(x: x(g.from), y: 0, width: max(x(g.to) - x(g.from), 2), height: size.height)
                ctx.clip(to: Path(rect))
                var hatch = Path()
                var i = rect.minX - size.height
                while i < rect.maxX { hatch.move(to: CGPoint(x: i, y: size.height)); hatch.addLine(to: CGPoint(x: i + size.height, y: 0)); i += 5 }
                ctx.stroke(hatch, with: .color(Tokens.Colors.alarm), lineWidth: 1.5)
            }
        }
        .frame(height: 12)
        .accessibilityHidden(true)
    }
}

/// M-BOOKS-06 book page: thumbnails in a grid (3 on the phone, 5 on the tablet), each with its page number and state.
/// shortcut: no Select mode (retake, move, delete, reorder) or volumes on the phone; the web pages view does them.
/// Add them when owners ask to fix page order from the phone.
struct BookPagesScreen: View {
    let model: BooksModel
    let logbookId: String
    let actions: BooksActions

    var body: some View {
        let book = model.logbook(logbookId)
        let pages = model.pages.filter { $0.logbook_id == logbookId }
        PhoneBoard(section: .books, title: book?.name ?? "Logbook", back: "Logbooks") {
            PhoneLeaf {
                if pages.isEmpty {
                    Text("No pages in the \(book?.name ?? "") logbook yet.").dFont(.body).foregroundStyle(Tokens.Colors.ink)
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 110), spacing: Tokens.Space.s2)],
                              spacing: Tokens.Space.s2) {
                        ForEach(pages) { page in thumb(page) }
                    }
                }
            }
        }
    }

    private func thumb(_ page: PageRow) -> some View {
        let state = pageState(page)
        return Button { actions.page(page.id, nil) } label: {
            PageImage(model: model, pageId: page.id, thumb: true) { image in
                Image(uiImage: image).resizable().aspectRatio(contentMode: .fill)
            }
            .aspectRatio(3 / 4, contentMode: .fit)
            .frame(maxWidth: .infinity)
            .clipped()
            .background(Tokens.Colors.mat)
            .clipShape(RoundedRectangle(cornerRadius: Tokens.Radius.s))
            .overlay(alignment: .bottomTrailing) {
                if let n = page.page_sequence {
                    Text("\(n)").dFont(.caption, weight: 700).foregroundStyle(Tokens.Colors.ink)
                        .padding(.horizontal, 6).background(Tokens.Colors.leaf, in: RoundedRectangle(cornerRadius: Tokens.Radius.s))
                        .padding(4)
                }
            }
            .overlay(alignment: .topLeading) { if let state { PageStateMark(state: state).padding(4) } }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(model.longLabel(page))" + (state.map { ", \($0.words)" } ?? ""))
    }

    private func pageState(_ page: PageRow) -> PageState? {
        if beingRead.contains(page.extraction_status) { return .reading }
        if page.needs_look == true { return .needsLook }
        if waitsForReview(page, entries: model.entries) { return .waiting }
        return nil
    }
}

/// A thumbnail's state mark (M-BOOKS-06): dotted read by AI and waiting, alarm ring needs a look, a clock being read.
enum PageState {
    case waiting, needsLook, reading
    var words: String {
        switch self {
        case .waiting: "read by AI, waiting for review"
        case .needsLook: "needs a look"
        case .reading: "being read"
        }
    }
}

struct PageStateMark: View {
    let state: PageState
    var body: some View {
        Group {
            switch state {
            case .waiting: Circle().inset(by: 1.5).stroke(Tokens.Colors.ink, style: StrokeStyle(lineWidth: 3, dash: [2, 2]))
            case .needsLook: Circle().inset(by: 1.5).stroke(Tokens.Colors.alarm, lineWidth: 3)
            case .reading: Circle().inset(by: 1.5).stroke(Tokens.Colors.ink3, style: StrokeStyle(lineWidth: 2, dash: [3, 3]))
            }
        }
        .frame(width: 16, height: 16)
        .background(Tokens.Colors.leaf, in: Circle())
        .accessibilityHidden(true)
    }
}

/// M-BOOKS-07: one entry with its scan on top, the transcription in the paper's type, previous and next on its line.
/// shortcut: no "What it satisfied", attached documents or Edit form of its own (the web entry page has them); Edit
/// opens this page on the review desk, where the same fields are edited. Add them when owners ask for them on the phone.
struct EntryScreen: View {
    let model: BooksModel
    let entryId: String
    let actions: BooksActions
    @State private var current: String?
    @Environment(\.verticalSizeClass) private var vSize

    var body: some View {
        let id = current ?? entryId
        let e = model.entry(id)
        PhoneBoard(section: .books, title: e?.title ?? "Entry", back: "Logbooks") {
            if let e {
                VStack(spacing: 0) {
                    lineStrip(e)
                    ScrollView {
                        VStack(alignment: .leading, spacing: Tokens.Space.s3) {
                            if let pageId = e.page_id, let page = model.page(pageId) { pageMat(e, page) }
                            content(e)
                        }
                        .padding(.bottom, Tokens.Space.s8)
                    }
                    .background(Tokens.Colors.leaf)
                }
                .clipShape(UnevenRoundedRectangle(topLeadingRadius: Tokens.Radius.s, topTrailingRadius: Tokens.Radius.s))
                .padding(.horizontal, Tokens.Space.s2)
            }
        }
    }

    /// The stops on this entry's line, oldest first.
    private func line(_ e: EntryRow) -> [EntryRow] {
        model.entries.filter { $0.logbook_id == e.logbook_id && $0.entry_date != nil }.sorted { ($0.entry_date!, $0.id) < ($1.entry_date!, $1.id) }
    }

    private func lineStrip(_ e: EntryRow) -> some View {
        let l = line(e), i = l.firstIndex { $0.id == e.id }
        let prev = i.flatMap { $0 > 0 ? l[$0 - 1] : nil }, next = i.flatMap { $0 < l.count - 1 ? l[$0 + 1] : nil }
        return HStack {
            Button { current = prev?.id } label: { HStack(spacing: 2) { Icon("chevron-left", size: 18); Text("Previous") } }
                .disabled(prev == nil).accessibilityLabel("Previous on this line")
            Spacer()
            LineChip(line: model.logbook(e.logbook_id)?.type, label: model.logbook(e.logbook_id)?.name ?? "")
            Spacer()
            Button { current = next?.id } label: { HStack(spacing: 2) { Text("Next"); Icon("chevron-right", size: 18) } }
                .disabled(next == nil).accessibilityLabel("Next on this line")
        }
        .dFont(.small, weight: 700)
        .foregroundStyle(Tokens.Colors.ink)
        .buttonStyle(.plain)
        .padding(.horizontal, Tokens.Space.s3)
        .frame(minHeight: Tokens.Size.phoneTouchMin)
        .background(Tokens.Colors.leaf2)
    }

    private func pageMat(_ e: EntryRow, _ page: PageRow) -> some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s2) {
            PageImage(model: model, pageId: page.id) { image in
                ZoomableScan(image: image, highlights: e.entryBox.map { [ScanHighlight(box: $0, style: .quiet)] } ?? [], focus: e.entryBox)
            }
            .containerRelativeFrame(.vertical) { h, _ in h * (vSize == .compact ? 0.6 : 0.46) }
            HStack {
                Text(model.longLabel(page)).dFont(.small).foregroundStyle(Tokens.Colors.onCover2)
                Spacer()
                Button { actions.page(page.id, e.entryBox) } label: {
                    HStack(spacing: 4) { Icon("zoom-in", size: 18); Text("Zoom").dFont(.small, weight: 700) }
                        .foregroundStyle(Tokens.Colors.onCover).frame(minHeight: 44)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(Tokens.Space.s3)
        .background(Tokens.Colors.mat)
    }

    @ViewBuilder private func content(_ e: EntryRow) -> some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s3) {
            TrustMark(level: e.trustLevel, label: trustLabel(e.trustLevel))
            Text(e.title).dFont(.heading).foregroundStyle(Tokens.Colors.ink).accessibilityAddTraits(.isHeader)
            Text(metaLine(e)).dFont(.small).foregroundStyle(Tokens.Colors.ink3).textSelection(.enabled)
            Text(e.work_performed ?? e.description ?? "").dFont(.paper).foregroundStyle(Tokens.Colors.ink)
                .textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
            if let refs = e.ad_refs, !refs.isEmpty {
                Text("ADs: \(refs.joined(separator: ", "))").dFont(.small).foregroundStyle(Tokens.Colors.ink2).textSelection(.enabled)
            }
            if let also = alsoSigned(e) { Text(also).dFont(.small).foregroundStyle(Tokens.Colors.ink2) }
            if e.trustLevel == .aiRead {
                Text("Not confirmed yet.").dFont(.small).foregroundStyle(Tokens.Colors.ink2)
                Button("Review this page") { actions.review(e.page_id) }.buttonStyle(.primary)
            } else {
                HStack(spacing: Tokens.Space.s3) {
                    if model.canEdit && e.trustLevel != .signed {
                        Button { actions.review(e.page_id) } label: { HStack(spacing: 6) { Icon("pencil", size: 18); Text("Edit entry") } }
                            .buttonStyle(.secondary)
                    }
                    ShareLink(item: shareText(e)) { HStack(spacing: 6) { Icon("share-2", size: 18); Text("Share") } }
                        .buttonStyle(.secondary)
                }
            }
        }
        .padding(.horizontal, Tokens.Space.s4)
        .environment(\.section, .books)
    }

    private func metaLine(_ e: EntryRow) -> String {
        [e.entry_date.map(Day.format), e.tach.map { "tach \(EntryRow.number($0))" },
         [e.signature_name, e.mechanic_cert_number].compactMap { $0 }.joined(separator: ", ").nilIfEmpty].compactMap { $0 }.joined(separator: " · ")
    }

    /// "Also signed in Engine p. 37 and Propeller p. 12" when the entry is part of a visit.
    private func alsoSigned(_ e: EntryRow) -> String? {
        guard let map = model.map, let stop = map.stops.first(where: { $0.entryIds.contains(e.id) }),
              let visit = map.interchanges.first(where: { $0.stopIds.contains(stop.id) }) else { return nil }
        let others = visit.stopIds.filter { $0 != stop.id }.compactMap { id in map.stops.first { $0.id == id } }
            .map { s in s.pageIds.first.flatMap(model.page).map(model.label) ?? (bookName(s.logbook) ?? "") }
        return others.isEmpty ? nil : "Also signed in " + others.joined(separator: " and ")
    }

    private func shareText(_ e: EntryRow) -> String {
        [e.title, metaLine(e), e.work_performed ?? ""].filter { !$0.isEmpty }.joined(separator: "\n")
    }
}

/// M-BOOKS-08: the map's entries as a list by year, for reading and for anyone who prefers lists.
/// shortcut: no draggable year strip; the year headers carry the counts. Add the strip when a list runs past about
/// 30 years and scrolling to a year gets slow.
struct EntriesListScreen: View {
    let model: BooksModel
    let actions: BooksActions
    @State private var only: String?

    var body: some View {
        let books = model.logbooks.sorted { laneOrder($0.type) < laneOrder($1.type) }
        let shown = model.entries.filter { only == nil || $0.logbook_id == only }.filter { $0.entry_date != nil }
            .sorted { $0.entry_date! > $1.entry_date! }
        let years = Dictionary(grouping: shown) { String($0.entry_date!.prefix(4)) }.sorted { $0.key > $1.key }
        PhoneBoard(section: .books, title: "Entries", back: "Map") {
            PhoneLeaf {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: Tokens.Space.s2) {
                        chip("All books", nil)
                        ForEach(books) { chip($0.name, $0.id) }
                    }
                }
                ForEach(years, id: \.key) { year, rows in
                    VStack(alignment: .leading, spacing: 0) {
                        GroupHeader(title: year, count: rows.count == 1 ? "1 entry" : "\(rows.count) entries")
                        ForEach(rows) { e in row(e) }
                    }
                }
                if shown.isEmpty { Text("No entries in this book yet.").dFont(.body).foregroundStyle(Tokens.Colors.ink) }
            }
        }
    }

    private func chip(_ title: String, _ id: String?) -> some View {
        let on = only == id
        return Button { only = id } label: {
            Text(title).dFont(.small, weight: 700).padding(.horizontal, Tokens.Space.s3).frame(minHeight: Tokens.Size.phoneTouchMin)
        }
        .buttonStyle(FillButtonStyle(fill: on ? Tokens.Colors.ink : Tokens.Colors.leaf2, content: on ? Tokens.Colors.leaf : Tokens.Colors.ink,
                                     shape: RoundedRectangle(cornerRadius: Tokens.Radius.m)))
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func row(_ e: EntryRow) -> some View {
        let page = e.page_id.flatMap(model.page)
        let p = Day.parts(e.entry_date ?? "1970-01-01")
        let meta = ["\(Day.months[p.m - 1]) \(p.d)", e.tach.map { "tach \(EntryRow.number($0))" }, page.map(model.label)].compactMap { $0 }
        return Button { actions.entry(e.id) } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(e.title).dFont(.bodyStrong).foregroundStyle(Tokens.Colors.ink).multilineTextAlignment(.leading)
                HStack(spacing: Tokens.Space.s2) {
                    Text(meta.joined(separator: " · ")).dFont(.small).foregroundStyle(Tokens.Colors.ink3)
                    if e.trustLevel == .aiRead { TrustMark(level: .aiRead, label: "Read by AI") }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, Tokens.Space.s3)
            .frame(minHeight: Tokens.Size.phoneRowMin)
            .contentShape(Rectangle())
        }
        .buttonStyle(RowButtonStyle())
        .overlay(alignment: .bottom) { Rule() }
    }
}

/// M-SCAN-01's preselected book (nil: the last used).
struct ScanChoice: Identifiable { let logbookId: String?; var id: String { logbookId ?? "" } }

/// Scan pages (editors) and Pages in progress while anything is held or being read (M-SCAN-01, M-SCAN-03), on the
/// phone's Logbooks and the tablet's. Opens M-SCAN-01 when the Add sheet asked for it.
struct ScanRow: View {
    let model: BooksModel
    @Binding var scanBook: ScanChoice?
    @State private var scanning: ScanCameraModel?
    @Environment(TabModel.self) private var tabs
    @Environment(OfflineStore.self) private var offline: OfflineStore?

    var body: some View {
        if let offline {
            let held = offline.heldPages.filter { $0.aircraftId == model.aircraft.id }.count
            let reading = model.readingNow.count
            HStack(spacing: Tokens.Space.s3) {
                if model.canEdit {
                    Button { scanBook = ScanChoice(logbookId: nil) } label: {
                        Label { Text("Scan pages") } icon: { Icon("camera", size: 18) }
                    }
                    .buttonStyle(.secondary)
                }
                if held + reading > 0 {
                    NavigationLink(value: SyncRoute.scanQueue) {
                        Text(held > 0 ? "\(held) on this phone" : "\(reading) being read").dFont(.bodyStrong)
                            .frame(maxWidth: .infinity, minHeight: Tokens.Size.phoneButton)
                            .foregroundStyle(Tokens.Colors.ink)
                            .background(Tokens.Colors.leaf, in: RoundedRectangle(cornerRadius: Tokens.Radius.m))
                    }
                    .accessibilityHint("Opens pages in progress")
                }
            }
            .task(id: tabs.scanPending) {
                guard tabs.scanPending else { return }
                tabs.scanPending = false
                if model.canEdit { scanBook = ScanChoice(logbookId: nil) }
            }
            .sheet(item: $scanBook) { choice in
                ScanBookSheet(books: model, offline: offline, preselect: choice.logbookId) { session in
                    scanning = ScanCameraModel(session: session)
                }
            }
            .fullScreenCover(item: $scanning) { cam in
                ScanCameraScreen(model: cam) {
                    tabs.paths[.books, default: NavigationPath()].append(SyncRoute.scanQueue)
                    ReadingLive.shared.start(aircraftId: model.aircraft.id, tail: model.aircraft.tailNumber, logbook: cam.session.logbook.name,
                                             batchId: cam.session.batchId, offline: offline, books: model)
                }
            }
        }
    }
}
