import GameController
import SwiftUI

/// Logbooks › Review: what waits for the owner and what is still being read (QueueRow, 02 §6.6), and the way in.
struct ReviewQueueContent: View {
    let model: BooksModel
    let start: (String?) -> Void

    var body: some View {
        let queue = model.queue, reading = model.readingNow
        if queue.isEmpty && reading.isEmpty {
            Text(model.loading ? "" : "Nothing waiting for review.")
                .dFont(.body).foregroundStyle(Tokens.Colors.ink)
        }
        if !queue.isEmpty {
            let doubtful = queue.filter { p in model.entries(on: p).contains { $0.reviewFields.contains(where: \.doubtful) } }.count
            VStack(alignment: .leading, spacing: 0) {
                GroupHeader(title: "Waiting for you", count: "\(queue.count)")
                ForEach(queue) { page in row(page) }
            }
            Text(summary(queue.count, doubtful)).dFont(.small).foregroundStyle(Tokens.Colors.ink3)
            Button(queue.count == 1 ? "Review 1 page" : "Review \(queue.count) pages") { start(nil) }.buttonStyle(.primary)
            if !model.canEdit {
                Text("You can view \(model.aircraft.tailNumber). The owner confirms these pages.")
                    .dFont(.small).foregroundStyle(Tokens.Colors.ink3)
            }
        }
        if !reading.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                GroupHeader(title: "Being read", count: "\(reading.count)")
                ForEach(reading) { page in
                    HStack(spacing: Tokens.Space.s3) {
                        thumb(page).opacity(0.5)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(model.label(page)).dFont(.bodyStrong).foregroundStyle(Tokens.Colors.ink)
                            Text(page.extraction_status == "waiting_allowance" ? "Waits for tomorrow's reading allowance" : "Being read now")
                                .dFont(.small).foregroundStyle(Tokens.Colors.ink3)
                        }
                    }
                    .padding(.vertical, 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .overlay(alignment: .bottom) { Rule() }
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }

    private func summary(_ n: Int, _ doubtful: Int) -> String {
        let clean = n - doubtful
        return [clean > 0 ? "\(clean) read cleanly" : nil, doubtful > 0 ? "\(doubtful) \(doubtful == 1 ? "has" : "have") a field to check" : nil]
            .compactMap { $0 }.joined(separator: ", ") + "."
    }

    private func thumb(_ page: PageRow) -> some View {
        PageImage(model: model, pageId: page.id, thumb: true) { Image(uiImage: $0).resizable().aspectRatio(contentMode: .fill) }
            .frame(width: 42, height: 56).clipped()
            .background(Tokens.Colors.mat)
            .clipShape(RoundedRectangle(cornerRadius: Tokens.Radius.s))
            .accessibilityHidden(true)
    }

    private func row(_ page: PageRow) -> some View {
        let es = model.entries(on: page)
        let doubts = es.flatMap { $0.reviewFields.filter(\.doubtful) }
        let detail = (es.count == 1 ? "1 entry" : "\(es.count) entries")
            + (doubts.isEmpty ? " · reads cleanly" : " · check the \(Set(doubts.map { $0.label.lowercased() }).sorted().joined(separator: " and "))")
        return Button { start(page.id) } label: {
            HStack(spacing: Tokens.Space.s3) {
                thumb(page)
                VStack(alignment: .leading, spacing: 2) {
                    Text(model.label(page)).dFont(.bodyStrong).foregroundStyle(Tokens.Colors.ink)
                    Text(detail).dFont(.small).foregroundStyle(Tokens.Colors.ink3)
                }
                Spacer()
                Icon("chevron-right").foregroundStyle(Tokens.Colors.ink3)
            }
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(RowButtonStyle())
        .overlay(alignment: .bottom) { Rule() }
    }
}

/// The review state shared by the phone drawer and the tablet desk (M-REVIEW-01/02/03, T-REVIEW-01).
@MainActor @Observable
final class ReviewSession {
    let model: BooksModel
    let ids: [String]
    var index = 0
    var outcomes: [String: [String: [String: FieldOutcome]]] = [:]
    /// The selected field: (entry id, field key). Selecting one lights its ink.
    var selected: (entry: String, key: String)?
    var showFields = false
    /// The doubtful-field panel (M-REVIEW-02) is open; selection alone only lights the ink.
    var opened = false
    var busy = false
    var problem: String?
    var toast: BooksModel.Confirmation?
    var confirmedPages = 0
    var confirmedEntries = 0

    init(model: BooksModel, start: String?) {
        self.model = model
        var ids = model.queue.map(\.id)
        if let start, !ids.contains(start) { ids.insert(start, at: 0) }
        self.ids = ids
        index = start.flatMap { ids.firstIndex(of: $0) } ?? 0
        selectFirstDoubt()
    }

    var done: Bool { index >= ids.count }
    var page: PageRow? { done ? nil : model.page(ids[index]) }
    var entries: [EntryRow] { page.map(model.entries(on:)) ?? [] }
    var pageOutcomes: [String: [String: FieldOutcome]] { page.flatMap { outcomes[$0.id] } ?? [:] }
    var clean: Bool { !entries.contains { $0.reviewFields.contains(where: \.doubtful) } }
    var canConfirm: Bool { model.canEdit && !entries.isEmpty && MyTailLog.canConfirm(entries, outcomes: pageOutcomes) && !busy }

    func outcome(_ entry: String, _ key: String) -> FieldOutcome? { pageOutcomes[entry]?[key] }

    var selectedField: (EntryRow, ReviewField)? {
        guard let s = selected, let e = entries.first(where: { $0.id == s.entry }),
              let f = e.reviewFields.first(where: { $0.key == s.key }) else { return nil }
        return (e, f)
    }

    func select(_ entry: String, _ key: String) { selected = (entry, key); opened = true }

    /// Records an outcome and moves to the next doubtful field still open (M-REVIEW-02 "After an outcome").
    func decide(_ outcome: FieldOutcome) {
        guard let page, let s = selected else { return }
        outcomes[page.id, default: [:]][s.entry, default: [:]][s.key] = outcome
        selectFirstDoubt()
        opened = false
    }

    func selectFirstDoubt() {
        let open = entries.flatMap { e in e.reviewFields.filter { $0.doubtful && outcome(e.id, $0.key) == nil }.map { (e.id, $0.key) } }
        selected = open.first.map { (entry: $0.0, key: $0.1) }
    }

    /// ↑/↓ on the tablet desk: the previous or next field in the drawer's order.
    func step(_ by: Int) {
        let all = entries.flatMap { e in e.reviewFields.map { (e.id, $0.key) } }
        guard !all.isEmpty else { return }
        let i = selected.flatMap { s in all.firstIndex { $0.0 == s.entry && $0.1 == s.key } } ?? -1
        let next = all[min(max(i + by, 0), all.count - 1)]
        selected = (next.0, next.1)
        opened = true
    }

    func go(_ i: Int) {
        index = min(max(i, 0), ids.count)
        showFields = false
        opened = false
        problem = nil
        selectFirstDoubt()
    }

    func confirm() async {
        guard let page, canConfirm else { return }
        busy = true
        let n = entries.filter { !$0.owner_confirmed }.count
        switch await model.confirm(page, outcomes: pageOutcomes) {
        case .success(let c):
            toast = c
            confirmedPages += 1
            confirmedEntries += n
            go(index + 1)
            let shown = c.page.id
            Task { [weak self] in
                try? await Task.sleep(for: .seconds(6))
                if self?.toast?.page.id == shown { self?.toast = nil }
            }
        case .failure(let p):
            problem = p.text
        }
        busy = false
    }

    func undo() async {
        guard let c = toast else { return }
        toast = nil
        busy = true
        problem = await model.undo(c)
        if problem == nil {
            confirmedPages -= 1
            confirmedEntries -= c.before.filter { !$0.owner_confirmed }.count
            go(ids.firstIndex(of: c.page.id) ?? index)
        }
        busy = false
    }

    /// "Something's wrong with this page": marks it disputed so it leaves the clean path.
    func dispute() async {
        guard let page else { return }
        busy = true
        problem = await model.push([pageReview(aircraftId: model.aircraft.id, page: page, status: "disputed")]).problem
        if problem == nil { await model.refresh(); go(index + 1) }
        busy = false
    }

    func delete(_ e: EntryRow) async {
        busy = true
        problem = await model.push([Mutation(type: "entry.delete", aircraftId: model.aircraft.id,
                                             payload: ["entryId": .value(.string(e.id))], base: e.updated_at)]).problem
        if problem == nil { await model.refresh(); selectFirstDoubt() }
        busy = false
    }

    /// "Jun 11, 1984 fills 1984 in the airframe gap" (M-REVIEW-01 spine strip).
    var landing: String {
        guard let page, let date = page.landing_date else { return "Not dated yet" }
        let book = model.logbook(page.logbook_id)
        let name = (book?.name ?? "logbook").lowercased()
        if model.map?.gaps.contains(where: { $0.lineId == page.logbook_id && $0.from <= date && date <= $0.to && $0.status != "no_pages_exist" }) == true {
            return "\(Day.format(date)) fills \(date.prefix(4)) in the \(name) gap"
        }
        return "\(Day.format(date)) on the \(name) line"
    }
}

/// M-REVIEW-01: the page fills the screen; the drawer holds the entries, least certain field first.
/// T-REVIEW-01 at regular width: page list, scan and fields side by side with keys for every action.
struct ReviewFlow: View {
    @State private var session: ReviewSession
    @State private var detent: PresentationDetent = .fraction(0.34)
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(model: BooksModel, start: String?) {
        _session = State(initialValue: ReviewSession(model: model, start: start))
    }

    var body: some View {
        GeometryReader { window in
            Group {
                if window.size.width >= 900 {
                    ReviewDesk(session: session, close: { dismiss() })
                } else {
                    phone
                }
            }
        }
        .environment(\.section, .books)
        .sensoryFeedback(.success, trigger: session.confirmedPages)
    }

    private var phone: some View {
        VStack(spacing: 0) {
            ReviewHeader(session: session, close: { dismiss() })
            ReviewPage(session: session)
                .id(session.index)
                .transition(reduceMotion ? .opacity : .asymmetric(insertion: .move(edge: .trailing), removal: .move(edge: .leading)))
                .animation(reduceMotion ? nil : .easeInOut(duration: Tokens.Motion.durationSlow), value: session.index)
        }
        .background(Tokens.Colors.cover.ignoresSafeArea())
        .sheet(isPresented: .constant(true)) {
            NavigationStack {
                ReviewDrawer(session: session, close: { dismiss() })
                    .toolbar(.hidden, for: .navigationBar)
            }
            .presentationDetents([.fraction(0.34), .fraction(0.5), .fraction(0.6), .large], selection: $detent)
            .presentationBackgroundInteraction(.enabled)
            .presentationBackground(Tokens.Colors.leaf)
            .interactiveDismissDisabled()
            .environment(\.section, .books)
        }
        .onChange(of: session.opened) { _, open in
            // The doubtful field opens at half height so the zoomed ink stays above it (M-REVIEW-02).
            if open, detent == .fraction(0.34) { detent = .fraction(0.5) }
        }
    }
}

/// The cover header: back to the queue; the page and where it is in the queue.
struct ReviewHeader: View {
    let session: ReviewSession
    let close: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button(action: close) {
                    HStack(spacing: 2) { Icon("chevron-left"); Text("Queue").dFont(.bodyStrong) }.frame(minHeight: Tokens.Size.phoneTouchMin)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Back to the queue")
                Spacer()
                if let page = session.page {
                    VStack(alignment: .trailing, spacing: 0) {
                        Text(session.model.label(page)).dFont(.bodyStrong)
                        Text("\(session.index + 1) of \(session.ids.count) to check").dFont(.caption).foregroundStyle(Tokens.Colors.onCover2)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            .foregroundStyle(Tokens.Colors.onCover)
            .padding(.horizontal, Tokens.Space.s4)
            .frame(minHeight: 56)
            if session.page != nil {
                Text(session.landing).dFont(.caption).foregroundStyle(Tokens.Colors.onCover2)
                    .frame(maxWidth: .infinity, minHeight: 32, alignment: .leading)
                    .padding(.horizontal, Tokens.Space.s4)
                    .background(Tokens.Colors.cover2)
            }
        }
        .background(Tokens.Colors.cover)
    }
}

/// The scan with the current entry outlined and the selected field's ink lit; doubt in the alarm tint on the phone.
struct ReviewPage: View {
    let session: ReviewSession
    var doubtStyle: ScanHighlight.Style = .doubt

    var body: some View {
        if let page = session.page {
            PageImage(model: session.model, pageId: page.id) { image in
                ZoomableScan(image: image, highlights: highlights, focus: session.opened ? session.selectedField?.1.box : nil,
                             focusLift: doubtStyle == .doubt ? 0.25 : 0)
            }
            .padding(Tokens.Space.s2)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Tokens.Colors.mat)
            .overlay(alignment: .leading) {
                if session.index > 0 {
                    Button { session.go(session.index - 1) } label: {
                        Icon("chevron-left").foregroundStyle(Tokens.Colors.onCover).frame(width: 44, height: 64)
                            .background(Tokens.Colors.cover.opacity(0.7), in: RoundedRectangle(cornerRadius: Tokens.Radius.m))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Previous page")
                }
            }
        } else {
            Tokens.Colors.mat
        }
    }

    private var highlights: [ScanHighlight] {
        var out: [ScanHighlight] = []
        let sel = session.selectedField
        for e in session.entries where e.id == sel?.0.id || sel == nil {
            if let b = e.entryBox { out.append(ScanHighlight(box: b, style: .quiet)) }
        }
        if let (_, f) = sel, let b = f.box { out.append(ScanHighlight(box: b, style: f.doubtful ? doubtStyle : .selected)) }
        return out
    }
}

/// The drawer (M-REVIEW-01) and, pushed inside it, the doubtful field (M-REVIEW-02).
struct ReviewDrawer: View {
    let session: ReviewSession
    let close: () -> Void
    var desk = false
    @State private var deleting: EntryRow?

    var body: some View {
        VStack(spacing: 0) {
            if let toast = session.toast { toastRow(toast) }
            if session.done {
                endOfQueue
            } else if let page = session.page {
                if session.opened, let (e, f) = session.selectedField, !desk {
                    FieldPanel(session: session, entry: e, field: f)
                } else {
                    ScrollView { fields(page).padding(Tokens.Space.s4) }
                    footer
                }
            }
        }
        .background(Tokens.Colors.leaf)
        .confirmationDialog("Delete this entry? The page stays.", isPresented: Binding { deleting != nil } set: { if !$0 { deleting = nil } },
                            titleVisibility: .visible) {
            Button("Delete entry", role: .destructive) { if let e = deleting { Task { await session.delete(e) } } }
        }
    }

    @ViewBuilder private func fields(_ page: PageRow) -> some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s3) {
            if !beingRead.contains(page.extraction_status) && page.extraction_status != "extracted" {
                Text("Reading this page didn't work last time.").dFont(.body).foregroundStyle(Tokens.Colors.ink)
            } else if beingRead.contains(page.extraction_status) {
                Text("Being read now. Entries appear here when it's done.").dFont(.body).foregroundStyle(Tokens.Colors.ink)
            } else if session.entries.isEmpty {
                Text("This page hasn't been read yet.").dFont(.body).foregroundStyle(Tokens.Colors.ink)
            }
            if page.unread_rotated_content == true {
                Text("Some writing on this page runs sideways. Check it against the page.")
                    .dFont(.small).foregroundStyle(Tokens.Colors.ink)
                    .padding(Tokens.Space.s3).frame(maxWidth: .infinity, alignment: .leading)
                    .background(Tokens.Colors.leaf2, in: RoundedRectangle(cornerRadius: Tokens.Radius.s))
            }
            if session.clean && !session.showFields && !session.entries.isEmpty {
                cleanSummary
            } else {
                let es = session.entries
                ForEach(Array(es.enumerated()), id: \.element.id) { i, e in
                    HStack {
                        Text("Entry \(i + 1) of \(es.count) · \(e.title)").dFont(.bodyStrong).foregroundStyle(Tokens.Colors.ink).lineLimit(2)
                        Spacer()
                        TrustMark(level: e.trustLevel, label: trustLabel(e.trustLevel))
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(.isHeader)
                    VStack(spacing: 0) {
                        ForEach(e.reviewFields) { f in FieldRow(session: session, entry: e, field: f) }
                    }
                    if session.model.canEdit && !desk {
                        Button("Delete this entry") { deleting = e }.buttonStyle(.quiet)
                    }
                }
                if session.model.canEdit {
                    Button("Something's wrong with this page") { Task { await session.dispute() } }.buttonStyle(.quiet)
                }
            }
            if let p = session.problem { Text(p).dFont(.small).foregroundStyle(Tokens.Colors.alarmText) }
        }
    }

    /// M-REVIEW-03: a clean page confirms from here without opening a field.
    private var cleanSummary: some View {
        let es = session.entries
        let dates = es.compactMap(\.entry_date).sorted(), tachs = es.compactMap(\.tach).sorted()
        let span = [dates.first.map { a in dates.count > 1 && dates.last != a ? "\(Day.format(a)) to \(Day.format(dates.last!))" : Day.format(a) },
                    tachs.first.map { a in tachs.count > 1 ? "tach \(EntryRow.number(a)) to \(EntryRow.number(tachs.last!))" : "tach \(EntryRow.number(a))" }]
            .compactMap { $0 }.joined(separator: " · ")
        return VStack(alignment: .leading, spacing: Tokens.Space.s2) {
            HStack {
                Text("Reads cleanly · \(es.count == 1 ? "1 entry" : "\(es.count) entries")").dFont(.bodyStrong).foregroundStyle(Tokens.Colors.ink)
                Spacer()
                TrustMark(level: .aiRead, label: "Read by AI")
            }
            Text(span).dFont(.small).foregroundStyle(Tokens.Colors.ink3)
            Button("Look at fields") { session.showFields = true }.buttonStyle(.secondary)
        }
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder private var footer: some View {
        VStack(spacing: Tokens.Space.s2) {
            if session.model.canEdit {
                Button { Task { await session.confirm() } } label: {
                    HStack { Text("Confirm page and next"); if desk { KeyHint("Return") } }
                }
                .buttonStyle(.primary)
                .disabled(!session.canConfirm)
                .keyboardShortcut(.return, modifiers: [])
            } else {
                Text("You can view \(session.model.aircraft.tailNumber). The owner confirms its pages.")
                    .dFont(.small).foregroundStyle(Tokens.Colors.ink3).frame(maxWidth: .infinity, alignment: .leading)
                Button("Next page") { session.go(session.index + 1) }.buttonStyle(.secondary)
            }
        }
        .padding(.horizontal, Tokens.Space.s4)
        .padding(.vertical, Tokens.Space.s3)
        .background(Tokens.Colors.leaf)
        .overlay(alignment: .top) { Rule() }
    }

    private func toastRow(_ c: BooksModel.Confirmation) -> some View {
        let n = c.before.filter { !$0.owner_confirmed }.count
        return HStack {
            Text("\(session.model.label(c.page)) confirmed, \(n == 1 ? "1 entry" : "\(n) entries")")
                .dFont(.small, weight: 700).foregroundStyle(Tokens.Colors.leaf)
            Spacer()
            Button("Undo") { Task { await session.undo() } }
                .dFont(.small, weight: 700).foregroundStyle(Tokens.Colors.leaf)
                .frame(minHeight: 44)
                .keyboardShortcut("z", modifiers: .command)
        }
        .padding(.horizontal, Tokens.Space.s4)
        .background(Tokens.Colors.ink)
        .accessibilityElement(children: .contain)
    }

    private var endOfQueue: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s3) {
            let p = session.confirmedPages, e = session.confirmedEntries
            Text(p == 0 ? "That's every page waiting." :
                    "All \(p == 1 ? "1 page is" : "\(p) pages are") reviewed. \(e == 1 ? "1 entry" : "\(e) entries") confirmed.")
                .dFont(.lede).foregroundStyle(Tokens.Colors.ink).fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Button("Done", action: close).buttonStyle(.primary)
            Spacer(minLength: 0)
        }
        .padding(Tokens.Space.s4)
    }
}

/// ReviewField row (02 §6.7): label, value, and a check, the outcome, or the doubt chip on the right.
struct FieldRow: View {
    let session: ReviewSession
    let entry: EntryRow
    let field: ReviewField

    var body: some View {
        let outcome = session.outcome(entry.id, field.key)
        let isSel = session.selected?.entry == entry.id && session.selected?.key == field.key
        Button { session.select(entry.id, field.key) } label: {
            HStack(alignment: .firstTextBaseline, spacing: Tokens.Space.s3) {
                Text(field.label).dFont(.small, weight: 700).foregroundStyle(Tokens.Colors.ink3).frame(width: 64, alignment: .leading)
                value(outcome).frame(maxWidth: .infinity, alignment: .leading)
                right(outcome)
            }
            .padding(.vertical, Tokens.Space.s3)
            .padding(.horizontal, isSel ? Tokens.Space.s2 : 0)
            .frame(minHeight: Tokens.Size.phoneRowMin)
            .contentShape(Rectangle())
        }
        .buttonStyle(RowButtonStyle(selected: isSel))
        .overlay(alignment: .leading) { if isSel { Rectangle().fill(Tokens.Colors.ink).frame(width: 4) } }
        .overlay(alignment: .bottom) { Rule() }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(isSel ? [.isButton, .isSelected] : .isButton)
    }

    @ViewBuilder private func value(_ o: FieldOutcome?) -> some View {
        switch o {
        case .notOnPage:
            Text(field.value ?? "—").strikethrough().dFont(field.kind == .paper ? .paper : .body).foregroundStyle(Tokens.Colors.ink3)
        case .edited(let v):
            Text(v).dFont(field.kind == .paper ? .paper : .body).foregroundStyle(Tokens.Colors.ink)
        default:
            Text(field.kind == .date ? field.value.map(Day.format) ?? "Not read" : field.value ?? "Not read")
                .dFont(field.kind == .paper ? .paper : .body)
                .foregroundStyle(field.value == nil ? Tokens.Colors.ink3 : Tokens.Colors.ink)
                .lineLimit(field.kind == .paper ? 3 : 1)
        }
    }

    @ViewBuilder private func right(_ o: FieldOutcome?) -> some View {
        switch o {
        case .looksRight: Mark(icon: "check", text: "Accepted", color: Tokens.Colors.ink2)
        case .edited: Mark(icon: "pencil", text: "Edited", color: Tokens.Colors.ink2)
        case .notOnPage: Mark(icon: nil, text: "Not on this page", color: Tokens.Colors.ink3)
        case nil:
            if field.doubtful { Mark(icon: "circle-help", text: "Check", color: Tokens.Colors.alarmText) } else { Mark(icon: "check", text: "Clear", color: Tokens.Colors.ink2) }
        }
    }

    private struct Mark: View {
        let icon: String?
        let text: String
        let color: Color
        var body: some View {
            HStack(spacing: 4) {
                if let icon { Icon(icon, size: 16) }
                Text(text).dFont(.caption, weight: 700)
            }
            .foregroundStyle(color)
        }
    }
}

/// M-REVIEW-02: the field zoomed on the page above; here its value, why it was doubted, and the three outcomes.
/// shortcut: the reader stores no alternative reading or reason yet, so the panel says what the reader saw and asks
/// the owner to check the lit ink; upgrade when extraction returns its doubt.
struct FieldPanel: View {
    let session: ReviewSession
    let entry: EntryRow
    let field: ReviewField
    var desk = false
    @State private var text = ""
    @State private var date = Date()
    @FocusState private var focused: Bool

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Tokens.Space.s3) {
                if !desk {
                    Button { session.opened = false } label: {
                        HStack(spacing: 2) { Icon("chevron-left"); Text("Entry").dFont(.bodyStrong) }.frame(minHeight: 44)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Tokens.Colors.ink)
                    .accessibilityLabel("Back to the entry")
                }
                HStack(spacing: Tokens.Space.s2) {
                    Text(field.label).dFont(.small, weight: 700).foregroundStyle(Tokens.Colors.ink2)
                    if field.doubtful {
                        Text("Read with doubt").dFont(.caption, weight: 700).foregroundStyle(Tokens.Colors.alarmText)
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.s).strokeBorder(Tokens.Colors.alarm, style: StrokeStyle(lineWidth: 1, dash: [3, 2])))
                    }
                }
                editor
                Text(field.doubtful ? "The reader wasn't sure of this one. Check it against the lit ink on the page."
                     : "The reader read this clearly. Change it if the page says otherwise.")
                    .dFont(.body).foregroundStyle(Tokens.Colors.ink).fixedSize(horizontal: false, vertical: true)
                DisclosureGroup("What the reader saw") {
                    Text(field.value ?? "Nothing").dFont(field.kind == .paper ? .paper : .body).foregroundStyle(Tokens.Colors.ink2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .dFont(.small, weight: 700).tint(Tokens.Colors.ink2)
                if session.model.canEdit { outcomes } else {
                    Text("You can view this aircraft. The owner confirms its pages.").dFont(.small).foregroundStyle(Tokens.Colors.ink3)
                }
            }
            .padding(Tokens.Space.s4)
        }
        .onAppear(perform: reset)
        .onChange(of: field.key) { reset() }
        .onChange(of: entry.id) { reset() }
    }

    private var current: String {
        field.kind == .date ? Day.string(date) : text.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    private var original: String { field.value ?? "" }
    private var changed: Bool { current != original && !(field.kind == .date && field.value == nil && !focused) }

    private func reset() {
        let o = session.outcome(entry.id, field.key)
        if case .edited(let v) = o { text = v } else { text = field.value ?? "" }
        if field.kind == .date { date = Day.date(text.isEmpty ? Day.string(Date()) : text) }
    }

    @ViewBuilder private var editor: some View {
        switch field.kind {
        case .date:
            DatePicker("Date", selection: $date, displayedComponents: .date)
                .labelsHidden().datePickerStyle(.compact).environment(\.timeZone, TimeZone(identifier: "UTC")!)
                .disabled(!session.model.canEdit)
        case .number:
            TextField("", text: $text).keyboardType(.decimalPad).dFont(.boardTitle, weight: 700).focused($focused)
                .disabled(!session.model.canEdit).accessibilityLabel(field.label)
        case .text, .paper:
            TextField("", text: $text, axis: .vertical).dFont(field.kind == .paper ? .paper : .body).focused($focused)
                .lineLimit(1...8).disabled(!session.model.canEdit).accessibilityLabel(field.label)
                .padding(Tokens.Space.s2)
                .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.m).strokeBorder(Tokens.Colors.controlBorder))
        }
    }

    private var invalid: Bool { changed && columnValue(field, .edited(current)) == nil }

    private var outcomes: some View {
        VStack(spacing: Tokens.Space.s2) {
            Button { session.decide(changed ? .edited(current) : .looksRight) } label: {
                HStack(spacing: 6) { Icon("check", size: 18); Text(changed ? "Save \(current)" : "Looks right").lineLimit(1); if desk { KeyHint("A") } }
            }
            .buttonStyle(.primary)
            .disabled(invalid)
            .keyboardShortcut("a", modifiers: [])
            Button { focused = true } label: {
                HStack(spacing: 6) { Icon("pencil", size: 18); Text("Edit"); if desk { KeyHint("E") } }
            }
            .buttonStyle(.secondary)
            .keyboardShortcut("e", modifiers: [])
            Button { session.decide(.notOnPage) } label: {
                HStack(spacing: 6) { Text("Not on this page"); if desk { KeyHint("X") } }
            }
            .buttonStyle(.quiet)
            .keyboardShortcut("x", modifiers: [])
            if invalid {
                Text(field.kind == .number ? "Enter a number, like 4205.8." : "Enter it as the page shows it.")
                    .dFont(.small).foregroundStyle(Tokens.Colors.alarmText)
            }
        }
    }
}

/// KeyHint (02): the key beside a button, only when a hardware keyboard is attached (T-REVIEW-01).
struct KeyHint: View {
    let key: String
    init(_ key: String) { self.key = key }
    var body: some View {
        if GCKeyboard.coalesced != nil {
            Text(key).dFont(.caption, weight: 700).padding(.horizontal, 5)
                .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.s).strokeBorder(Tokens.Colors.controlBorder))
                .accessibilityHidden(true)
        }
    }
}

/// T-REVIEW-01: page list | scan | fields. Below 1000 wide the page list leaves; ⌘← ⌘→ still move between pages.
struct ReviewDesk: View {
    let session: ReviewSession
    let close: () -> Void
    @State private var width: CGFloat = 0

    var body: some View {
        VStack(spacing: 0) {
            ReviewHeader(session: session, close: close)
            HStack(spacing: 0) {
                if width >= 1000 { pageList.frame(width: 120) }
                ReviewPage(session: session, doubtStyle: .selected)
                VStack(spacing: 0) {
                    if let (e, f) = session.selectedField, !session.done {
                        FieldPanel(session: session, entry: e, field: f, desk: true).frame(maxHeight: 360)
                        Rule()
                    }
                    ReviewDrawer(session: session, close: close, desk: true)
                }
                .frame(width: 340)
                .background(Tokens.Colors.leaf)
            }
        }
        .background(Tokens.Colors.cover.ignoresSafeArea())
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
        .background {
            // Keys with no button of their own.
            Group {
                Button("Previous field") { session.step(-1) }.keyboardShortcut(.upArrow, modifiers: [])
                Button("Next field") { session.step(1) }.keyboardShortcut(.downArrow, modifiers: [])
                Button("Previous page") { session.go(session.index - 1) }.keyboardShortcut(.leftArrow, modifiers: .command)
                Button("Next page") { session.go(session.index + 1) }.keyboardShortcut(.rightArrow, modifiers: .command)
            }
            .opacity(0)
            .accessibilityHidden(true)
        }
    }

    private var pageList: some View {
        ScrollView {
            VStack(spacing: Tokens.Space.s2) {
                ForEach(Array(session.ids.enumerated()), id: \.element) { i, id in
                    Button { session.go(i) } label: {
                        PageImage(model: session.model, pageId: id, thumb: true) { Image(uiImage: $0).resizable().aspectRatio(contentMode: .fit) }
                            .frame(height: 120)
                            .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.s)
                                .strokeBorder(i == session.index ? Tokens.Colors.onCover : .clear, lineWidth: 2))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(session.model.page(id).map(session.model.label) ?? "Page")
                    .accessibilityAddTraits(i == session.index ? .isSelected : [])
                }
            }
            .padding(Tokens.Space.s2)
        }
        .background(Tokens.Colors.cover2)
    }
}
