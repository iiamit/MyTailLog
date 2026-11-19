import SwiftUI

/// GET /api/aircraft/{id}/reading-queue (09 §4.8): recent batches' progress and the caller's reading allowance.
struct ReadingQueue: Decodable, Equatable, Sendable {
    struct Batch: Decodable, Equatable, Sendable, Identifiable {
        let id: String
        let logbook: String?
        let logbookId: String
        let createdAt: String
        let expected: Int
        let uploaded: Int
        let queued: Int
        let reading: Int
        let waitingAllowance: Int
        let read: Int
        let failed: Int
        let needsLook: Int
        let waitingDecision: Int
        let completedAt: String?
    }
    struct Allowance: Decodable, Equatable, Sendable {
        let pagesUsedApprox: Int
        let pagesCapApprox: Int
        let nextFreeAt: String?
        let ownKey: Bool
        let globalPaused: Bool
    }
    let batches: [Batch]
    let allowance: Allowance
}

extension ReadingQueue.Allowance {
    /// 12 `allowance.today` and its variants (M-SCAN-01, M-SCAN-03, 07 B-ALLOWANCE).
    func line(batch: Int = 0) -> String {
        if ownKey { return "Reading with your own key." }
        if globalPaused { return "Reading is paused for everyone until tomorrow. Everything else keeps working." }
        let base = "Reading allowance today: \(pagesUsedApprox) of \(pagesCapApprox) pages used, shared by your aircraft."
        return batch > pagesCapApprox - pagesUsedApprox ? base + " Pages past it wait for tomorrow." : base
    }
}

extension StatusAPI {
    func readingQueue(token: String, aircraftId: String) async throws -> ReadingQueue {
        try await get(apiURL.appending(path: "api/aircraft/\(aircraftId)/reading-queue"), token, apiKey: false)
    }
}

/// M-SCAN-01 Choose the logbook: the book, where the pages go, handwritten, the allowance, then the camera.
struct ScanBookSheet: View {
    let books: BooksModel
    let offline: OfflineStore
    var preselect: String?
    let open: (ScanSession) -> Void
    @Environment(\.dismiss) private var dismiss
    @AppStorage("scan.lastLogbook") private var lastLogbook = ""
    @State private var logbookId = ""
    @State private var handwritten = true
    @State private var allowance: ReadingQueue.Allowance?

    private var book: LogbookRow? { books.logbook(logbookId) }
    private var pagesSoFar: Int { books.pages.filter { $0.logbook_id == logbookId }.compactMap(\.page_sequence).max() ?? 0 }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Tokens.Space.s5) {
                    Text("Which logbook?").dFont(.bodyStrong).foregroundStyle(Tokens.Colors.ink)
                    FlowChips(items: books.logbooks.map { ($0.id, $0.name) }, selected: $logbookId)
                    if book != nil {
                        Text("Adds to the end. **\(pagesSoFar) pages so far**, so these start at page \(pagesSoFar + 1). Put them in date order later if you like.")
                            .dFont(.body).foregroundStyle(Tokens.Colors.ink)
                    }
                    Toggle(isOn: $handwritten) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Handwritten entries").dFont(.bodyStrong)
                            Text("Reads cursive as well as typed text. Turn off for printed pages; they come back faster.")
                                .dFont(.small).foregroundStyle(Tokens.Colors.ink3)
                        }
                    }
                    .frame(minHeight: 58)
                    Text(offline.isOffline ? "Pages are read when you have signal." : allowance?.line() ?? " ")
                        .dFont(.small).foregroundStyle(Tokens.Colors.ink3)
                    Button {
                        guard let book else { return }
                        lastLogbook = book.id
                        let session = ScanSession(store: offline, aircraftId: books.aircraft.id, logbook: book, handwritten: handwritten,
                                                  placement: books.placement(logbook: book))
                        dismiss()
                        open(session)
                    } label: {
                        Label { Text("Open the camera") } icon: { Icon("camera") }
                    }
                    .buttonStyle(.primary)
                    .disabled(book == nil)
                }
                .padding(Tokens.Space.s4)
            }
            .background(Tokens.Colors.leaf)
            .navigationTitle("Scan pages")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
        .onAppear {
            let ids = books.logbooks.map(\.id)
            logbookId = [preselect, lastLogbook].compactMap { $0 }.first(where: ids.contains) ?? ids.first ?? ""
        }
        .task { allowance = await books.readingQueue()?.allowance }
    }
}

/// Wrapping 44pt chips (M-SCAN-01's logbook choice).
struct FlowChips: View {
    let items: [(id: String, label: String)]
    @Binding var selected: String

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: Tokens.Space.s2) { chips }
            VStack(alignment: .leading, spacing: Tokens.Space.s2) { chips }
        }
    }

    private var chips: some View {
        ForEach(items, id: \.id) { item in
            let on = item.id == selected
            Button { selected = item.id } label: {
                Text(item.label).dFont(.bodyStrong)
                    .padding(.horizontal, Tokens.Space.s4)
                    .frame(minHeight: 44)
                    .foregroundStyle(on ? Tokens.Colors.leaf : Tokens.Colors.ink)
                    .background(on ? Tokens.Colors.ink : Tokens.Colors.leaf, in: RoundedRectangle(cornerRadius: Tokens.Radius.m))
                    .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.m).strokeBorder(Tokens.Colors.controlBorder, lineWidth: on ? 0 : 1))
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(on ? .isSelected : [])
        }
    }
}

/// M-SCAN-03 Pages in progress: every page has a place, on this phone, being read, waiting for review.
struct ScanQueueScreen: View {
    let books: BooksModel
    let offline: OfflineStore
    var openReview: () -> Void = {}
    @State private var queue: ReadingQueue?
    @State private var asOf: Date?

    private var held: [FileJob] { offline.heldPages.filter { $0.aircraftId == books.aircraft.id } }
    private var uploading: Int { held.filter { $0.status == "uploading" }.count }

    var body: some View {
        PhoneBoard(section: .books, title: "Pages in progress", back: "Logbooks") {
            PhoneLeaf {
                onPhone
                beingRead
                waitingReview
                if let a = queue?.allowance {
                    VStack(alignment: .leading, spacing: Tokens.Space.s1) {
                        Text("\(a.pagesUsedApprox) of \(a.pagesCapApprox) pages read in the last 24 hours").dFont(.bodyStrong)
                        Text("Each page frees up 24 hours after it was read.").dFont(.small).foregroundStyle(Tokens.Colors.ink3)
                    }
                    .padding(Tokens.Space.s4)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Tokens.Colors.leaf2, in: RoundedRectangle(cornerRadius: Tokens.Radius.m))
                }
            }
        }
        // Reading progress (06 M-SCAN-03): polled every 5 s while this screen is open and online.
        .task(id: offline.isOffline) {
            while !Task.isCancelled {
                if !offline.isOffline, let q = await books.readingQueue() {
                    queue = q
                    asOf = Date()
                    if q.batches.contains(where: { $0.completedAt == nil }) { await books.refresh() }
                }
                try? await Task.sleep(for: .seconds(5))
            }
        }
    }

    @ViewBuilder private var onPhone: some View {
        GroupHeader(title: "On this phone", count: "\(held.count)")
        if held.isEmpty {
            Text("Nothing waiting on this phone.").dFont(.small).foregroundStyle(Tokens.Colors.ink3)
        } else {
            VStack(alignment: .leading, spacing: Tokens.Space.s2) {
                Text(offline.isOffline ? "\(held.count) \(held.count == 1 ? "page" : "pages") on this phone. They upload when you have signal."
                     : uploading > 0 ? "Uploading \(uploading) of \(held.count)" : "Waiting to upload \(held.count)")
                    .dFont(.bodyStrong)
                ProgressView(value: held.map(\.progress).reduce(0, +), total: Double(max(held.count, 1)))
                    .tint(Tokens.Colors.ink)
                ScrollView(.horizontal) {
                    HStack(spacing: Tokens.Space.s2) {
                        ForEach(held) { job in
                            LocalThumb(url: offline.pagesDir.appending(path: "\(job.meta.pageId)_thumb.jpg"))
                                .overlay(alignment: .bottom) {
                                    if let e = job.error, job.status != "uploading" {
                                        Text(e).dFont(.caption).foregroundStyle(Tokens.Colors.alarmText).lineLimit(2)
                                    }
                                }
                        }
                    }
                }
                if let line = landsInLine { Label { Text(line).dFont(.small) } icon: { Icon("route", size: 16) } }
                if held.contains(where: { $0.status == "failed" }) {
                    Button("Try again") { for j in held where j.status == "failed" { offline.uploader?.retry(j) } }.buttonStyle(.secondary)
                } else if !offline.isOffline, uploading == 0 {
                    Button("Upload now") { offline.schedule(after: 0) }.buttonStyle(.secondary)
                }
            }
        }
    }

    /// The system scanner and photos show the lands-in line here instead of in the camera (05 §15.2).
    private var landsInLine: String? {
        guard let job = held.last(where: { $0.meta.year != nil }), let book = books.logbook(job.meta.logbookId) else { return nil }
        return books.placement(logbook: book)(job.meta.year)
    }

    @ViewBuilder private var beingRead: some View {
        let active = queue?.batches.filter { $0.completedAt == nil } ?? []
        let total = active.map(\.expected).reduce(0, +), read = active.map { $0.read + $0.failed }.reduce(0, +)
        GroupHeader(title: "Being read", count: "\(max(total - read, 0))")
        if active.isEmpty {
            Text(queue == nil && offline.isOffline ? "Reading starts when you have signal." : "Nothing being read.")
                .dFont(.small).foregroundStyle(Tokens.Colors.ink3)
        } else {
            VStack(alignment: .leading, spacing: Tokens.Space.s2) {
                Text("\(read) of \(total) read").dFont(.bodyStrong)
                ProgressView(value: Double(read), total: Double(max(total, 1))).tint(Tokens.Colors.ink)
                let waitingAllowance = active.map(\.waitingAllowance).reduce(0, +)
                let queued = active.map { $0.queued + $0.reading }.reduce(0, +)
                let decisions = active.map(\.waitingDecision).reduce(0, +)
                let failed = active.map(\.failed).reduce(0, +)
                if queued > 0 { Text("\(queued) waiting their turn · a minute or two").dFont(.small).foregroundStyle(Tokens.Colors.ink3) }
                if waitingAllowance > 0 {
                    Text("Waiting for tomorrow's allowance \(waitingAllowance). Use your own key in Settings to read them now.")
                        .dFont(.small).foregroundStyle(Tokens.Colors.ink3)
                }
                if decisions > 0 { Text("\(decisions) looks like a page already scanned. Decide on the web for now.").dFont(.small) }
                if failed > 0 { Text("\(failed) couldn't be read.").dFont(.small).foregroundStyle(Tokens.Colors.alarmText) }
                if offline.isOffline, let asOf { Text("as of \(asOf.formatted(date: .omitted, time: .shortened))").dFont(.caption).foregroundStyle(Tokens.Colors.ink3) }
            }
        }
    }

    @ViewBuilder private var waitingReview: some View {
        let n = books.queue.count
        GroupHeader(title: "Waiting for your review", count: "\(n)")
        if n == 0 {
            Text("Pages arrive here once they are read. You can put the phone away; we will tell you.")
                .dFont(.small).foregroundStyle(Tokens.Colors.ink3)
        } else {
            Button("Review", action: openReview).buttonStyle(.primary)
        }
    }
}

/// A held page's thumbnail from Outbox/pages.
struct LocalThumb: View {
    let url: URL
    var body: some View {
        Group {
            if let image = UIImage(contentsOfFile: url.path(percentEncoded: false)) {
                Image(uiImage: image).resizable().aspectRatio(contentMode: .fill)
            } else {
                Tokens.Colors.leaf2
            }
        }
        .frame(width: 56, height: 74)
        .clipShape(RoundedRectangle(cornerRadius: Tokens.Radius.s))
        .accessibilityLabel("Page on this phone")
    }
}
