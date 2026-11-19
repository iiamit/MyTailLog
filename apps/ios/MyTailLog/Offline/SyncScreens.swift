import SwiftUI

/// Routes every aircraft stack can push (06 §2: M-SYS-01 is pushed from any tab).
enum SyncRoute: Hashable { case waiting, scanQueue }

/// M-SYS-01 and M-SCAN-03 pushed onto whichever stack the owner is in.
struct SyncDestinations: ViewModifier {
    @Environment(OfflineStore.self) private var offline: OfflineStore?
    @Environment(BooksModel.self) private var books: BooksModel?
    @Environment(TabModel.self) private var tabs

    func body(content: Content) -> some View {
        content.navigationDestination(for: SyncRoute.self) { route in
            switch route {
            case .waiting:
                if let offline { WaitingScreen(offline: offline).environment(\.section, tabs.selected) }
            case .scanQueue:
                if let offline, let books {
                    ScanQueueScreen(books: books, offline: offline) {
                        tabs.paths[.books] = NavigationPath()
                        tabs.selected = .books
                    }
                }
            }
        }
    }
}

/// OfflineBar and ConflictBar (06 §1.3) under the PhoneHeader of top-level screens: shown when offline or when anything
/// waits; a conflict replaces it. Tap opens M-SYS-01.
struct SyncBars: View {
    @Environment(OfflineStore.self) private var offline: OfflineStore?

    var body: some View {
        if let offline, let text = Self.text(offline) {
            let conflict = !offline.conflicts.isEmpty
            NavigationLink(value: SyncRoute.waiting) {
                HStack(spacing: Tokens.Space.s2) {
                    if !conflict { Icon(offline.isOffline ? "wifi-off" : "cloud-upload", size: 16) }
                    Text(text).dFont(.small, weight: 600).lineLimit(2)
                    Spacer(minLength: 0)
                    if conflict { Text("Compare").dFont(.small, weight: 700).underline() }
                }
                .foregroundStyle(conflict ? Tokens.Colors.onAlarmBg : Tokens.Colors.onCover)
                .padding(.horizontal, Tokens.Space.s4)
                .frame(minHeight: 36)
                .background(conflict ? Tokens.Colors.alarmBg : Tokens.Colors.cover)
            }
            .buttonStyle(.plain)
        }
    }

    /// 06 §1.3 copy; nil when online with nothing waiting.
    static func text(_ s: OfflineStore) -> String? {
        let c = s.conflicts.count
        if c > 0 { return c == 1 ? "1 change needs you to decide." : "\(c) changes need you to decide." }
        let changes = s.waiting.filter { $0.type != "page.register" && $0.type != "batch.create" }.count + s.heldDocuments.count
        let pages = s.heldPages.count
        if s.isOffline {
            if pages > 0 && changes == 0 { return "\(plural(pages, "page")) on this phone. They upload when you have signal." }
            if changes + pages > 0 { return "\(plural(changes + pages, "change")) on this phone. They upload when you have signal." }
            return "Offline. Everything here works except reading pages and Ask."
        }
        if changes + pages > 0 { return "Uploading \(plural(changes + pages, "change"))" }
        return nil
    }

    static func plural(_ n: Int, _ word: String) -> String { n == 1 ? "1 \(word)" : "\(n) \(word)s" }
}

/// M-SYS-01 Waiting to upload, with conflicts: everything not yet on the server, refusals with their reason, and
/// conflicts as yours beside theirs. Nothing is overwritten silently; a conflict can wait forever.
struct WaitingScreen: View {
    let offline: OfflineStore
    @Environment(\.section) private var section
    @State private var toast: String?
    @State private var discarding: OutboxItem?
    @State private var showActivity = false

    var body: some View {
        PhoneBoard(section: section, title: "Waiting to upload", back: "Back") {
            PhoneLeaf {
                summary
                if !offline.conflicts.isEmpty {
                    GroupHeader(title: "Changed in two places", count: "\(offline.conflicts.count)")
                    ForEach(offline.conflicts) { ConflictCard(offline: offline, item: $0, toast: $toast) }
                }
                if !offline.refused.isEmpty {
                    GroupHeader(title: "Not saved", count: "\(offline.refused.count)")
                    ForEach(offline.refused) { item in
                        VStack(alignment: .leading, spacing: Tokens.Space.s1) {
                            Text(item.label).dFont(.bodyStrong)
                            Text(item.error ?? "Refused by the server.").dFont(.small).foregroundStyle(Tokens.Colors.alarmText)
                            Button("Discard this change") { discarding = item }.buttonStyle(.quiet)
                        }
                    }
                }
                waitingGroup
                DisclosureGroup("What sync did", isExpanded: $showActivity) {
                    VStack(alignment: .leading, spacing: Tokens.Space.s1) {
                        ForEach(offline.activity) { a in
                            Text("\(Date(timeIntervalSince1970: Double(a.at) / 1000).formatted(date: .omitted, time: .shortened)) · \(a.text)")
                                .dFont(.small).foregroundStyle(Tokens.Colors.ink2)
                        }
                    }
                }
                .dFont(.bodyStrong)
                #if DEBUG
                Toggle("Work offline (test transport)", isOn: Bindable(offline).forcedOffline).dFont(.small)
                #endif
            }
        }
        .overlay(alignment: .bottom) {
            if let toast {
                Text(toast).dFont(.small, weight: 600).foregroundStyle(Tokens.Colors.leaf)
                    .padding(Tokens.Space.s3).background(Tokens.Colors.ink, in: RoundedRectangle(cornerRadius: Tokens.Radius.m))
                    .padding(.bottom, Tokens.Space.s6)
                    .task { try? await Task.sleep(for: .seconds(3)); self.toast = nil }
            }
        }
        .confirmationDialog("Discard this change? It hasn't reached the server and can't be recovered.",
                            isPresented: Binding(get: { discarding != nil }, set: { if !$0 { discarding = nil } }), titleVisibility: .visible) {
            Button("Discard", role: .destructive) { if let d = discarding { offline.discard(d.id) }; discarding = nil }
            Button("Keep it", role: .cancel) { discarding = nil }
        }
        .refreshable { await offline.sync() }
    }

    private var summary: some View {
        let changes = offline.waiting.count + offline.heldDocuments.count, pages = offline.heldPages.count
        return VStack(alignment: .leading, spacing: Tokens.Space.s2) {
            Text(changes + pages == 0
                 ? (offline.conflicts.isEmpty && offline.refused.isEmpty ? "Everything you've recorded has reached the server." : "Nothing else is waiting.")
                 : [changes > 0 ? SyncBars.plural(changes, "change") : nil, pages > 0 ? SyncBars.plural(pages, "page") : nil]
                    .compactMap { $0 }.joined(separator: " and ") + " on this phone.")
                .dFont(.lede)
            Button {
                Task { await offline.sync() }
            } label: {
                Label { Text(offline.syncing ? "Syncing" : "Sync now") } icon: { Icon("refresh-cw") }
            }
            .buttonStyle(.secondary)
            .disabled(offline.isOffline || offline.syncing)
            if offline.isOffline { Text("Offline. Changes upload when you have signal.").dFont(.small).foregroundStyle(Tokens.Colors.ink3) }
        }
    }

    @ViewBuilder private var waitingGroup: some View {
        let rows = offline.waiting
        let pages = offline.heldPages
        let docs = offline.heldDocuments
        if !rows.isEmpty || !pages.isEmpty || !docs.isEmpty {
            GroupHeader(title: "Waiting", count: "\(rows.count + pages.count + docs.count)")
            ForEach(docs) { job in
                VStack(alignment: .leading, spacing: 2) {
                    Text(job.meta.title ?? job.meta.fileName ?? "Document").dFont(.bodyStrong)
                    if job.status == "failed" {
                        Text(job.error ?? "This document didn't upload.").dFont(.small).foregroundStyle(Tokens.Colors.alarmText)
                        HStack {
                            Button("Try again") { offline.uploader?.retry(job) }.buttonStyle(.secondary)
                            Button("Remove from this phone", role: .destructive) { offline.removeFileJob(job); offline.reload() }.buttonStyle(.quiet)
                        }
                    } else {
                        Text(job.status == "uploading" ? "Document · Uploading" : "Document · On this phone").dFont(.small).foregroundStyle(Tokens.Colors.ink3)
                    }
                }
                .frame(minHeight: Tokens.Size.phoneRowMin, alignment: .leading)
            }
            if !pages.isEmpty {
                VStack(alignment: .leading, spacing: Tokens.Space.s1) {
                    Text(SyncBars.plural(pages.count, "page")).dFont(.bodyStrong)
                    ScrollView(.horizontal) {
                        HStack { ForEach(pages) { LocalThumb(url: offline.pagesDir.appending(path: "\($0.meta.pageId)_thumb.jpg")) } }
                    }
                    let failed = pages.filter { $0.status == "failed" || $0.error != nil }
                    if let e = failed.first?.error { Text(e).dFont(.small).foregroundStyle(Tokens.Colors.alarmText) }
                    if pages.contains(where: { $0.status == "failed" }) {
                        HStack {
                            Button("Try again") { for j in pages where j.status == "failed" { offline.uploader?.retry(j) } }.buttonStyle(.secondary)
                            Button("Remove from this phone", role: .destructive) {
                                for j in pages where j.status == "failed" { offline.removeFileJob(j) }
                                offline.reload()
                            }.buttonStyle(.quiet)
                        }
                    }
                }
            }
            ForEach(rows) { item in
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.label).dFont(.bodyStrong)
                        Text(state(item)).dFont(.small).foregroundStyle(Tokens.Colors.ink3)
                    }
                    Spacer()
                    Text(Date(timeIntervalSince1970: Double(item.createdAt) / 1000).formatted(date: .omitted, time: .shortened))
                        .dFont(.small).foregroundStyle(Tokens.Colors.ink3)
                }
                .frame(minHeight: Tokens.Size.phoneRowMin)
                .contextMenu { Button("Discard", role: .destructive) { discarding = item } }
                .accessibilityAction(named: "Discard") { discarding = item }
            }
        }
    }

    private func state(_ item: OutboxItem) -> String {
        switch item.status {
        case "sending": return "Uploading"
        case "blocked": return "Waits for the change in two places above"
        default:
            if let t = item.nextTryAt, item.attempts > 0, !offline.isOffline {
                return "Trying again at \(Date(timeIntervalSince1970: Double(t) / 1000).formatted(date: .omitted, time: .shortened))"
            }
            if item.dependsOn != nil, item.type == "page.register" { return "Waiting for the page to upload" }
            return "On this phone"
        }
    }
}

/// One conflict (05 §6.6, 06 M-SYS-01): Field · Yours · Theirs stacked per field at phone width, the differing rows
/// marked by an alarm fill, bar and the word "Different"; the buttons by case.
private struct ConflictCard: View {
    let offline: OfflineStore
    let item: OutboxItem
    @Binding var toast: String?
    @State private var working = false

    var body: some View {
        let diffs = offline.diff(item.id)
        let theirsDeleted = diffs.allSatisfy { $0.theirs == .null } && !diffs.isEmpty
        let disjoint = !diffs.contains(where: \.clash) && diffs.contains(where: \.changedByThem)
        VStack(alignment: .leading, spacing: Tokens.Space.s3) {
            Text(item.label).dFont(.bodyStrong)
            Text(theirsDeleted ? "Someone deleted this while your phone was offline. Your change can't be added to it."
                 : disjoint ? "You and someone else changed different things. Both can be kept."
                 : "Someone changed this on the web while your phone was offline.")
                .dFont(.small).foregroundStyle(Tokens.Colors.ink2)
            ForEach(diffs) { d in
                let different = d.mine != d.theirs
                VStack(alignment: .leading, spacing: 2) {
                    Text(d.label).dFont(.small, weight: 700)
                    Text("Yours: \(d.mine.display)").dFont(.small)
                    Text("Theirs: \(d.theirs.display)").dFont(.small)
                }
                .padding(.vertical, Tokens.Space.s1)
                .padding(.leading, Tokens.Space.s3)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(different ? Tokens.Colors.alarmBg : .clear)
                .overlay(alignment: .leading) { if different { Rectangle().fill(Tokens.Colors.alarm).frame(width: 3) } }
                .accessibilityElement(children: .combine)
                .accessibilityValue(different ? "Different" : "")
            }
            if theirsDeleted {
                Button("Discard my change") { decide("discard", "Discarded.") }.buttonStyle(.primary)
            } else {
                if disjoint { Button("Keep both changes") { decide("keep_both", "Kept both changes. Uploading.") }.buttonStyle(.primary) }
                Button("Keep mine") { decide("keep_mine", "Kept yours. Uploading.") }.buttonStyle(disjoint ? .secondary : .primary)
                Button("Take theirs") { decide("take_theirs", "Took theirs.") }.buttonStyle(.secondary)
            }
            Text("Or decide later: it waits here and nothing else changes on this row.").dFont(.small).foregroundStyle(Tokens.Colors.ink3)
        }
        .disabled(working)
        .padding(.vertical, Tokens.Space.s2)
    }

    private func decide(_ choice: String, _ done: String) {
        working = true
        Task {
            let problem = await offline.resolve(item.id, choice)
            toast = problem ?? done
            working = false
        }
    }
}
