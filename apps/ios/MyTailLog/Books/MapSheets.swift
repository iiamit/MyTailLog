import SwiftUI

/// What the map's sheets ask the screen to do.
struct BooksActions {
    var stop: (MapData.Stop) -> Void = { _ in }
    var entry: (String) -> Void = { _ in }
    var page: (_ pageId: String, _ box: FieldBox?) -> Void = { _, _ in }
    var review: (_ pageId: String?) -> Void = { _ in }
    /// M-SCAN-01 with a logbook preselected (a gap's "Scan these pages"); nil where scanning isn't offered.
    var scan: ((_ logbookId: String?) -> Void)?
}

/// Title row of a map sheet: 18/800 and Close (44).
struct SheetTitle: View {
    let title: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).dFont(.heading).foregroundStyle(Tokens.Colors.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityAddTraits(.isHeader)
            Button { dismiss() } label: {
                Icon("x").foregroundStyle(Tokens.Colors.ink2).frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close")
        }
    }
}

private func metaLine(_ e: EntryRow) -> String {
    [e.entry_date.map(Day.format), e.tach.map { "tach \(EntryRow.number($0))" }, e.signature_name].compactMap { $0 }.joined(separator: " · ")
}

/// M-BOOKS-02: the entry behind a stop, in the paper's voice, with its trust mark and a crop of its page.
struct StopSheet: View {
    let model: BooksModel
    let stop: MapData.Stop
    let actions: BooksActions

    private var entries: [EntryRow] { stop.entryIds.compactMap(model.entry) }
    /// The next stop up the same line (newer), one tap away.
    private var nextUp: MapData.Stop? {
        model.map?.stops.filter { $0.lineId == stop.lineId && $0.date > stop.date }.min { $0.date < $1.date }
    }

    var body: some View {
        let first = entries.first
        let unconfirmed = stop.trust == "ai_read"
        ScrollView {
            VStack(alignment: .leading, spacing: Tokens.Space.s3) {
                SheetTitle(title: first?.title ?? stop.label ?? "Entry")
                FlowLayout {
                    LineChip(line: stop.logbook, label: bookName(stop.logbook) ?? "")
                    if let first { Text("· \(metaLine(first))").dFont(.small).foregroundStyle(Tokens.Colors.ink3) }
                }
                if let pageId = stop.pageIds.first {
                    Button { actions.page(pageId, first?.entryBox) } label: {
                        PageCrop(model: model, pageId: pageId, box: first?.entryBox)
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Opens the whole page")
                }
                ForEach(entries) { e in
                    if entries.count > 1 { Text(e.title).dFont(.bodyStrong).foregroundStyle(Tokens.Colors.ink) }
                    Text(e.work_performed ?? e.description ?? "").dFont(.paper).foregroundStyle(Tokens.Colors.ink)
                        .textSelection(.enabled)
                        .fixedSize(horizontal: false, vertical: true)
                }
                FlowLayout(spacing: Tokens.Space.s3) {
                    if let pageId = stop.pageIds.first, let page = model.page(pageId) { PageCite(label: model.label(page)) }
                    TrustMark(level: first?.trustLevel ?? .confirmed, label: trustLabel(first?.trustLevel ?? .confirmed))
                }
                if unconfirmed {
                    Text("Not confirmed yet. It doesn't count toward what's due.").dFont(.small).foregroundStyle(Tokens.Colors.ink2)
                }
                HStack(spacing: Tokens.Space.s3) {
                    if let next = nextUp {
                        Button { actions.stop(next) } label: {
                            HStack(spacing: 4) { Icon("chevron-up", size: 18); Text(String(next.date.prefix(4))) }
                        }
                        .buttonStyle(.secondary)
                        .frame(maxWidth: 120)
                        .accessibilityLabel("Next on this line, \(Day.format(next.date))")
                    }
                    if unconfirmed {
                        Button { actions.review(stop.pageIds.first) } label: { Text("Review this page") }.buttonStyle(.primary)
                    } else if let pageId = stop.pageIds.first {
                        Button { actions.page(pageId, first?.entryBox) } label: {
                            HStack(spacing: 6) { Icon("book-open", size: 18); Text("Open page") }
                        }
                        .buttonStyle(.primary)
                    }
                }
                if let first { PhoneRow(title: "Open entry") { actions.entry(first.id) } }
            }
            .padding(Tokens.Space.s4)
        }
        .background(Tokens.Colors.leaf)
        .environment(\.section, .books)
    }
}

/// M-BOOKS-03: a visit that signed several books, one card per book, each with its own trust mark.
struct VisitSheet: View {
    let model: BooksModel
    let visit: MapData.Interchange
    let actions: BooksActions
    @State private var index = 0

    private var stops: [MapData.Stop] {
        let all = model.map?.stops ?? []
        return visit.stopIds.compactMap { id in all.first { $0.id == id } }.sorted { laneOrder($0.logbook) < laneOrder($1.logbook) }
    }

    var body: some View {
        let stops = stops
        let books = stops.compactMap { bookName($0.logbook) }
        let firstEntry = stops.first?.entryIds.first.flatMap(model.entry)
        ScrollView {
            VStack(alignment: .leading, spacing: Tokens.Space.s3) {
                SheetTitle(title: "\(Day.format(visit.date)) \((visit.label ?? "visit").lowercased()), \(books.count) books")
                if let e = firstEntry {
                    Text([e.signature_name, e.mechanic_cert_number, e.tach.map { "tach \(EntryRow.number($0))" }].compactMap { $0 }.joined(separator: " · "))
                        .dFont(.small).foregroundStyle(Tokens.Colors.ink3)
                }
                TabView(selection: $index) {
                    ForEach(Array(stops.enumerated()), id: \.offset) { i, stop in
                        ScrollView { card(stop).padding(.trailing, Tokens.Space.s6) }.tag(i)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .frame(height: 280)
                .accessibilityElement(children: .contain)
                .accessibilityValue("Card \(index + 1) of \(stops.count)")
                .accessibilityAdjustableAction { d in
                    index = d == .increment ? min(index + 1, stops.count - 1) : max(index - 1, 0)
                }
                if stops.count > 1 {
                    let rest = stops.enumerated().filter { $0.offset != index }.map { pageName($0.element) }
                    Text("Swipe for \(rest.joined(separator: " and ")) · \(index + 1) of \(stops.count)")
                        .dFont(.caption).foregroundStyle(Tokens.Colors.ink3)
                }
                if stops.indices.contains(index), let pageId = stops[index].pageIds.first {
                    let e = stops[index].entryIds.first.flatMap(model.entry)
                    Button("Open \(pageName(stops[index]))") { actions.page(pageId, e?.entryBox) }.buttonStyle(.primary)
                }
            }
            .padding(Tokens.Space.s4)
        }
        .background(Tokens.Colors.leaf)
        .environment(\.section, .books)
    }

    private func pageName(_ stop: MapData.Stop) -> String {
        stop.pageIds.first.flatMap(model.page).map(model.label) ?? (bookName(stop.logbook) ?? "")
    }

    private func card(_ stop: MapData.Stop) -> some View {
        let e = stop.entryIds.first.flatMap(model.entry)
        let level = e?.trustLevel ?? (stop.trust == "ai_read" ? .aiRead : .confirmed)
        return VStack(alignment: .leading, spacing: Tokens.Space.s2) {
            FlowLayout(spacing: Tokens.Space.s3) {
                LineChip(line: stop.logbook, label: bookName(stop.logbook) ?? "")
                Text(pageName(stop)).dFont(.small).foregroundStyle(Tokens.Colors.ink3)
                TrustMark(level: level, label: trustLabel(level))
            }
            if let pageId = stop.pageIds.first { PageCrop(model: model, pageId: pageId, box: e?.entryBox, height: 100) }
            Text(e?.work_performed ?? e?.description ?? "").dFont(.paper).foregroundStyle(Tokens.Colors.ink)
                .textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }
}

/// M-BOOKS-04: a gap explains itself from the other books, counts pages already waiting, and takes the owner's answer.
struct GapSheet: View {
    let model: BooksModel
    let gap: MapData.Gap
    let actions: BooksActions
    @State private var evidence: GapEvidence?
    @State private var asking: GapAnswer?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Tokens.Space.s3) {
                SheetTitle(title: gapTitle(gap))
                if gap.status != "open" {
                    let answer = GapAnswer(rawValue: gap.status)
                    Text(answer == .noPagesExist ? "You marked that no pages exist." : "You asked the previous owner.")
                        .dFont(.bodyStrong).foregroundStyle(Tokens.Colors.ink)
                    if let note = evidence?.gap.note { Text(note).dFont(.body).foregroundStyle(Tokens.Colors.ink2) }
                }
                if let ev = evidence {
                    Text(explanation(ev)).dFont(.body).foregroundStyle(Tokens.Colors.ink).fixedSize(horizontal: false, vertical: true)
                    GroupHeader(title: "What the other books show")
                    ForEach(ev.otherBooks, id: \.logbook) { book in row(book) }
                    if ev.unconfirmedPagesInGap > 0 { unconfirmedRow(ev.unconfirmedPagesInGap) }
                } else {
                    Skeleton(fraction: 0.9, height: 40)
                    ForEach(0..<3) { _ in Skeleton(fraction: 1, height: 44) }
                }
                if model.canEdit, let scan = actions.scan, gap.status == "open" {
                    // M-BOOKS-04 primary: one tap from a gap to the scan sheet with its book chosen.
                    Button { scan(model.map?.lines.first { $0.lineId == gap.lineId }?.logbookId) } label: {
                        Label { Text("Scan these pages") } icon: { Icon("camera") }
                    }
                    .buttonStyle(.primary)
                }
                if model.canEdit {
                    HStack(spacing: Tokens.Space.s3) {
                        ForEach(GapAnswer.allCases) { a in
                            Button(a.button) { asking = a }.buttonStyle(.quiet).disabled(gap.status == a.rawValue)
                        }
                    }
                }
            }
            .padding(Tokens.Space.s4)
        }
        .background(Tokens.Colors.leaf)
        .environment(\.section, .books)
        .task { evidence = await model.evidence(gap.id) }
        .sheet(item: $asking) { a in GapAnswerSheet(model: model, gap: gap, answer: a, note: evidence?.gap.note ?? "") }
    }

    /// The server's verdict, plus the hours when the other books show them (M-BOOKS-04 explanation).
    private func explanation(_ ev: GapEvidence) -> String {
        guard let h = ev.hoursFlownApprox, h > 0 else { return ev.verdict }
        let book = (bookName(gap.logbook) ?? "").lowercased()
        return "The other books say the aircraft flew about \(Int(h.rounded())) hours in those years, so the \(book) pages were kept somewhere."
    }

    private func row(_ b: GapEvidence.Book) -> some View {
        let detail: String = {
            if let a = b.tachFrom, let z = b.tachTo { return "tach \(EntryRow.number(a)) to \(EntryRow.number(z))" }
            return b.entries == 0 ? "nothing in those years" : ""
        }()
        return HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                LineChip(line: b.logbook, label: bookName(b.logbook) ?? b.logbook)
                Text(b.entries == 1 ? "1 entry" : "\(b.entries) entries").dFont(.bodyStrong).foregroundStyle(Tokens.Colors.ink)
                if !detail.isEmpty { Text(detail).dFont(.small).foregroundStyle(Tokens.Colors.ink3) }
            }
            Spacer()
            if let range = b.pageRange { PageCite(label: range) }
        }
        .padding(.vertical, Tokens.Space.s2)
        .frame(minHeight: Tokens.Size.phoneRowMin)
        .overlay(alignment: .bottom) { Rule() }
        .accessibilityElement(children: .combine)
    }

    private func unconfirmedRow(_ n: Int) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                LineChip(line: gap.logbook, label: bookName(gap.logbook) ?? "")
                Text(n == 1 ? "1 page read" : "\(n) pages read").dFont(.bodyStrong).foregroundStyle(Tokens.Colors.ink)
                Text("not yet confirmed").dFont(.small).foregroundStyle(Tokens.Colors.ink3)
            }
            Spacer()
            Button("Review \(n)") { actions.review(nil) }.buttonStyle(.quiet)
        }
        .frame(minHeight: Tokens.Size.phoneRowMin)
        .overlay(alignment: .bottom) { Rule() }
    }
}

/// The confirmation for a gap answer, with an optional note, then Save (`gap.setStatus`).
struct GapAnswerSheet: View {
    let model: BooksModel
    let gap: MapData.Gap
    let answer: GapAnswer
    @State var note: String
    @State private var saving = false
    @State private var problem: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s3) {
            SheetTitle(title: answer.button)
            Text(answer == .noPagesExist
                 ? "The map keeps the gap and labels it. Record rooms and dossiers say no pages exist for these years."
                 : "The map keeps the gap and notes that you asked.")
                .dFont(.body).foregroundStyle(Tokens.Colors.ink2).fixedSize(horizontal: false, vertical: true)
            Text("Note (optional)").dFont(.small, weight: 700).foregroundStyle(Tokens.Colors.ink3)
            TextField("Previous owner says the book was lost in a move.", text: $note, axis: .vertical)
                .dFont(.body)
                .lineLimit(2...5)
                .padding(Tokens.Space.s3)
                .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.m).strokeBorder(Tokens.Colors.controlBorder))
            if let problem { Text(problem).dFont(.small).foregroundStyle(Tokens.Colors.alarmText) }
            Button("Save") {
                saving = true
                Task {
                    problem = await model.answer(gap: gap, answer, note: note)
                    saving = false
                    if problem == nil { dismiss() }
                }
            }
            .buttonStyle(.primary)
            .disabled(saving)
            Spacer(minLength: 0)
        }
        .padding(Tokens.Space.s4)
        .background(Tokens.Colors.leaf)
        .presentationDetents([.medium])
        .environment(\.section, .books)
    }
}
