import QuickLook
import SwiftUI

// Share (06 M-SHARE-01..03; on the tablet the Share board's two leaves): start from who receives it, make a read-only
// record room link, show its QR, follow its opens, revoke it; people with access; the summary, dossier and due list
// files. Links and files are made on the server, so they need signal (14 D1); the last list stays on the phone so a
// link's QR and copy still work offline. Port of Android's ShareScreens.kt.

/// The record room links of the open aircraft: this phone's copy at once, the server's when there is signal.
@MainActor @Observable
final class RoomsStore {
    private(set) var rooms: [Room]
    private let recs: Recs
    private let file: URL

    private init(recs: Recs) {
        self.recs = recs
        file = recs.offline.dir.appending(path: "rooms/\(recs.id).json")
        rooms = (try? Data(contentsOf: file)).map(parseRooms) ?? []
    }

    private static var open: [String: RoomsStore] = [:]
    /// One list per aircraft for every Share screen.
    static func of(_ recs: Recs) -> RoomsStore {
        let key = "\(recs.offline.userId)/\(recs.id)"
        if let s = open[key] { return s }
        let s = RoomsStore(recs: recs)
        open[key] = s
        return s
    }

    func refresh() async {
        guard recs.online, recs.isOwner, let data = try? await recs.api.rooms(aircraftId: recs.id), isRoomList(data) else { return }
        try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        rooms = parseRooms(data)
    }

    /// What a create or a change answered, laid over the list, so the screens follow even when the list can't be re-read.
    func put(_ room: Room) { rooms = [room] + rooms.filter { $0.id != room.id } }

    func changed(_ o: [String: Any]) {
        guard var r = rooms.first(where: { $0.id == o["id"] as? String }) else { return }
        r.expiresAt = o["expiresAt"] as? String ?? r.expiresAt
        r.revokedAt = o["revokedAt"] as? String
        r.active = r.revokedAt == nil && (instant(r.expiresAt) ?? .distantPast) > .now
        put(r)
    }
}

/// M-SHARE-01 Who is it for: four people to pick from; for the first three, a preview of what the room opens on, what
/// it holds (changeable), and **Make the link**. The fourth invites a co-owner or mechanic instead. Viewers see only
/// "Share a summary" (06 §1.5).
struct ShareHome: View {
    let recs: Recs
    @State private var draft: RoomDraft?
    @State private var options = false
    @State private var inviting = false
    @State private var busy = false
    @State private var error: String?
    @Environment(\.recNav) private var nav
    @Environment(TabModel.self) private var tabs

    private var rooms: RoomsStore { RoomsStore.of(recs) }
    private var logbooks: [Rec] { recs.records("logbook").filter { $0.s("deleted_at") == nil } }
    private var documents: [Rec] { recs.records("document").filter { !$0.pending } }
    private var reader: Bool { !recs.canEdit }

    var body: some View {
        RecLeaf {
            if !reader {
                Text("Who is it for?").dFont(.heading).foregroundStyle(Tokens.Colors.ink).accessibilityAddTraits(.isHeader)
                    .padding(.bottom, Tokens.Space.s2)
                pick(.ia, "clipboard-check", "My IA, for the annual", "What falls due, ADs, squawks, gaps")
                pick(.buyer, "scale", "A buyer, for a pre-buy", "Every book and document, a dossier")
                pick(.insurer, "shield-check", "My insurer", "Hours, inspections, equipment")
                pick(.people, "users", "A co-owner or mechanic", "Invite them to edit or view")
            }
            if let d = draft, !reader { chosen(d) }
            if recs.isOwner {
                let live = rooms.rooms.filter(\.active)
                PhoneRow(title: "Live links \(live.count)") { nav.open(.links) }
                if let first = live.first { Note("\(first.label) · \(roomLine(first))") }
            }
            if recs.canEdit { PhoneRow(title: "Prepare annual packet") { nav.open(.annualPacket) } }
            FileButtons(recs: recs)
            if reader {
                Note(recs.aircraft.isDemo ? "This is the demo aircraft. Add your own from the hangar."
                     : "You can view \(recs.tail). The owner can make links and invite people.").padding(.top, Tokens.Space.s3)
            }
        } footer: {
            if let d = draft, !reader, recs.isOwner {
                Button { make(d) } label: {
                    Label { Text(busy ? "Making it" : "Make the link") } icon: { Icon("link", size: 18) }
                }
                .buttonStyle(.primary)
                .disabled(!recs.online || busy || d.label.trimmingCharacters(in: .whitespaces).isEmpty || !d.holdsSomething)
                if !recs.online { Note("Making a link needs signal, so it works the moment you send it.") }
            }
        }
        .task(id: recs.online) { await rooms.refresh() }
        .sheet(isPresented: $inviting) { InviteSheet(recs: recs) }
    }

    private func pick(_ a: Audience, _ icon: String, _ title: String, _ sub: String) -> some View {
        let selected = draft?.audience == a
        return Button {
            if a == .people { inviting = true } else {
                draft = .of(a, tail: recs.tail, logbooks: logbooks.map(\.id), documents: documents.map(\.id))
            }
        } label: {
            HStack(spacing: Tokens.Space.s3) {
                Icon(icon, size: 20).foregroundStyle(Tokens.Colors.ink)
                    .frame(width: 40, height: 40).background(Tokens.Colors.leaf2, in: RoundedRectangle(cornerRadius: Tokens.Radius.m))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).dFont(.bodyStrong).foregroundStyle(Tokens.Colors.ink)
                    Text(sub).dFont(.small).foregroundStyle(Tokens.Colors.ink2)
                }
                Spacer(minLength: 0)
                if selected { Icon("check", size: 20).foregroundStyle(Tokens.Colors.ink) }
            }
            .frame(minHeight: 64)
            .contentShape(Rectangle())
        }
        .buttonStyle(RowButtonStyle(selected: selected))
        .accessibilityLabel("\(title), \(sub)")
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }

    @ViewBuilder private func chosen(_ d: RoomDraft) -> some View {
        let set = Binding { draft ?? d } set: { draft = $0 }
        if !recs.isOwner { Note("Only the owner can make links or invite people.").padding(.top, Tokens.Space.s3) }
        RoomPreview(recs: recs, draft: d)
        if let n = recs.snapshot?.counts.pagesToReview, n > 0 {
            Well {
                Note(n == 1 ? "1 page isn't confirmed yet. It won't be in the room until you confirm it."
                     : "\(n) pages aren't confirmed yet. They won't be in the room until you confirm them.")
                Button("Review") { tabs.selected = .books }.buttonStyle(.secondary)
            }
        }
        PhoneRow(title: options ? "Done changing" : "Change what it holds") { options.toggle() }
        if options {
            TextBox(label: "Name it", text: Binding { set.wrappedValue.label } set: { set.wrappedValue.label = String($0.prefix(80)) })
            SwitchRow(label: "The maintenance summary", on: set.summary)
            if !logbooks.isEmpty {
                Note("Logbooks").padding(.top, Tokens.Space.s2)
                FlowLayout(spacing: Tokens.Space.s2, lineSpacing: Tokens.Space.s2) {
                    ForEach(logbooks) { b in
                        Chip(label: b.s("title") ?? bookName(b.s("type")) ?? "Logbook", on: d.logbookIds.contains(b.id)) {
                            set.wrappedValue.logbookIds.formSymmetricDifference([b.id])
                        }
                    }
                }
                SwitchRow(label: "With the page scans", on: set.scans)
            }
            if !documents.isEmpty {
                Note("Documents").padding(.top, Tokens.Space.s2)
                FlowLayout(spacing: Tokens.Space.s2, lineSpacing: Tokens.Space.s2) {
                    ForEach(documents) { doc in
                        Chip(label: doc.s("title") ?? docTypeName(doc.s("type")), on: d.documentIds.contains(doc.id)) {
                            set.wrappedValue.documentIds.formSymmetricDifference([doc.id])
                        }
                    }
                }
            }
            SwitchRow(label: "Open squawks", on: set.squawks)
            Segments(label: "Expires after", options: roomDays.map { "\($0) d" },
                     selection: Binding { roomDays.firstIndex(of: d.days) ?? 2 } set: { set.wrappedValue.days = roomDays[$0] })
        }
        if !d.holdsSomething { Note("Include at least one thing to share.", alarm: true) }
        if let error { Note(error, alarm: true).padding(.top, Tokens.Space.s2) }
    }

    private func make(_ d: RoomDraft) {
        busy = true
        error = nil
        Task {
            do {
                let made = try await recs.api.createRoom(aircraftId: recs.id, d.body)
                guard let id = made["id"] as? String, let expires = made["expiresAt"] as? String else {
                    throw RecordsAPI.Failure(status: 500, message: "No link came back.")
                }
                rooms.put(Room(id: id, label: d.label.trimmingCharacters(in: .whitespaces), audience: d.audience.key, url: made["url"] as? String,
                               createdAt: ISO8601DateFormatter().string(from: .now), expiresAt: expires, revokedAt: nil, active: true, opens: 0,
                               lastOpenedAt: nil, logbooks: d.logbookIds.count, documents: d.documentIds.count, scans: d.scans,
                               summary: d.summary, squawks: d.squawks, mapWindow: d.audience.mapWindow))
                await rooms.refresh()
                nav.open(.link(id, made: true))
            } catch {
                self.error = (error as? RecordsAPI.Failure)?.message ?? "Making a link needs signal, so it works the moment you send it."
            }
            busy = false
        }
    }
}

/// A toggle chip: ink when on, with a check.
private struct Chip: View {
    let label: String
    let on: Bool
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                if on { Icon("check", size: 14) }
                Text(label).dFont(.small, weight: 700).lineLimit(1)
            }
            .foregroundStyle(on ? Tokens.Colors.leaf : Tokens.Colors.ink)
            .padding(.horizontal, Tokens.Space.s3)
            .frame(minHeight: Tokens.Size.phoneTouchMin)
            .background(on ? Tokens.Colors.ink : Tokens.Colors.leaf, in: Capsule())
            .overlay(Capsule().strokeBorder(Tokens.Colors.controlBorder, lineWidth: on ? 0 : 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? [.isSelected] : [])
    }
}

/// What the recipient opens first (M-SHARE-01 preview): the records as of today, a whole-life strip with the marked
/// gap, the room's tabs, and that it is read only.
private struct RoomPreview: View {
    let recs: Recs
    let draft: RoomDraft
    @Environment(BooksModel.self) private var books: BooksModel?

    var body: some View {
        let today = todayISO()
        let map = books?.aircraft.id == recs.id ? books?.map : nil
        let gap = map?.gaps.filter { $0.status != "explained" }.max { Day.between($0.from, $0.to) < Day.between($1.from, $1.to) }
        let start = draft.audience == .insurer ? Day.adding(-5 * 365, to: today) : map.map { String($0.range.from.prefix(10)) }
        Note("What \(draft.audience.recipient) opens first").padding(.top, Tokens.Space.s4)
        Well {
            Text("\(recs.tail) records as of \(longDate(today))").dFont(.bodyStrong)
            if draft.audience == .ia {
                Note("The line ahead: what falls due, and what rides along with the annual.")
            } else if let start {
                Canvas { ctx, size in
                    let span = Double(max(Day.between(start, today), 1)), y: CGFloat = 12
                    func x(_ d: String) -> CGFloat { CGFloat(min(max(Double(Day.between(start, String(d.prefix(10)))), 0), span) / span) * size.width }
                    var l = Path(); l.move(to: CGPoint(x: 0, y: y)); l.addLine(to: CGPoint(x: size.width, y: y))
                    ctx.stroke(l, with: .color(Tokens.Colors.line("airframe")), lineWidth: Tokens.Map.lineStroke)
                    if let g = gap {
                        var p = Path(); p.move(to: CGPoint(x: x(g.from), y: y)); p.addLine(to: CGPoint(x: x(g.to), y: y))
                        ctx.stroke(p, with: .color(Tokens.Colors.leaf2), lineWidth: Tokens.Map.lineStroke + 2)
                        ctx.stroke(p, with: .color(Tokens.Colors.ink3), style: StrokeStyle(lineWidth: Tokens.Map.gapStroke, dash: [4, 4]))
                    }
                }
                .frame(height: 24)
                .accessibilityLabel("Whole-life map, \(start.prefix(4)) to today" + (gap.map { ", gap \($0.from.prefix(4)) to \($0.to.prefix(4))" } ?? ""))
                HStack { Note(String(start.prefix(4))); Spacer(); Note("Today") }.accessibilityHidden(true)
            }
            Note("Status · Logbooks · Maint. · Documents")
            Note(gap.map { "The \($0.from.prefix(4)) to \($0.to.prefix(4)) gap is marked. Read only." } ?? "Read only.")
        }
    }
}

/// Share a summary (PDF), the pre-buy dossier (PDF) and the due list (CSV): made by the server, so online only. A PDF
/// opens in Quick Look (print and share from there); viewers get only the summary (06 §1.5).
private struct FileButtons: View {
    let recs: Recs
    @State private var busy: ShareFile?
    @State private var preview: URL?

    var body: some View {
        GroupHeader(title: "Files")
        ForEach(recs.canEdit ? ShareFile.allCases : [.summary]) { f in
            Button { fetch(f) } label: {
                Label { Text(busy == f ? "Making it" : f.title) } icon: { Icon("download", size: 18) }
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.quiet)
            .disabled(!recs.online || busy != nil)
        }
        if !recs.online { Note("These are made on the server, so they need signal.") }
        Color.clear.frame(height: 0).quickLookPreview($preview)
    }

    private func fetch(_ f: ShareFile) {
        busy = f
        Task {
            do {
                let data = try await recs.api.file(aircraftId: recs.id, f)
                let dir = FileManager.default.temporaryDirectory.appending(path: "share", directoryHint: .isDirectory)
                try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
                let url = dir.appending(path: f.fileName(recs.tail))
                try data.write(to: url, options: .atomic)
                preview = url
            } catch {
                recs.say((error as? RecordsAPI.Failure)?.message ?? "That file couldn't be made. Try again.")
            }
            busy = nil
        }
    }
}

// MARK: Link made, and one link (M-SHARE-02, M-SHARE-03 link detail)

/// One link: its QR (white in dark mode too), the link to copy, when it ends, what it opens on and holds, and **Send the
/// link**. Opened from the list it also shows the open log, **Keep it open 30 more days** and **Revoke link**.
struct LinkScreen: View {
    let recs: Recs
    let roomId: String
    let made: Bool
    @State private var opens: [RoomOpen]?
    @State private var busy = false
    @State private var revoking = false
    @State private var big = false

    private var rooms: RoomsStore { RoomsStore.of(recs) }

    var body: some View {
        let room = rooms.rooms.first { $0.id == roomId }
        RecScreen(section: .share, title: made ? "Link made" : room?.label ?? "Link", back: "Share") {
            if let room { content(room) } else { EmptyLine(text: "This link isn't on this phone. Open Share with signal to load it.") }
        } footer: {
            if let room, room.active, let url = room.url {
                ShareLink(item: url, subject: Text(room.label), message: Text("The records of \(recs.tail), read only")) {
                    Label { Text("Send the link") } icon: { Icon("send", size: 18) }
                }
                .buttonStyle(.primary)
            }
        }
        .task(id: recs.online) {
            if recs.online, !made, let o = try? await recs.api.roomOpens(aircraftId: recs.id, roomId: roomId) { opens = o }
        }
        .confirmationDialog("Revoke this link?", isPresented: $revoking, titleVisibility: .visible) {
            Button("Revoke link", role: .destructive) { patch(revoke: true, done: "Link revoked.") }
            Button("Keep it", role: .cancel) {}
        } message: { Text("Whoever has it won't be able to open it again.") }
        .fullScreenCover(isPresented: $big) { if let url = room?.url { BigQR(url: url) } }
    }

    @ViewBuilder private func content(_ room: Room) -> some View {
        if made { Text(room.label).dFont(.heading).foregroundStyle(Tokens.Colors.ink).accessibilityAddTraits(.isHeader) }
        Note("A read-only record room. No account needed.").padding(.bottom, Tokens.Space.s3)
        if let url = room.url, room.active {
            Button { big = true } label: { QRCard(url: url) }
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity)
                .accessibilityHint("Shows it full screen")
            HStack(spacing: Tokens.Space.s2) {
                Text(shortUrl(url)).dFont(.body).foregroundStyle(Tokens.Colors.ink).monospacedDigit()
                    .lineLimit(1).truncationMode(.middle).frame(maxWidth: .infinity, alignment: .leading)
                Button {
                    UIPasteboard.general.string = url
                    recs.say("Link copied.")
                } label: { Label { Text("Copy") } icon: { Icon("copy", size: 18) } }
                .buttonStyle(.secondary)
                .fixedSize()
            }
            .frame(minHeight: 52)
            .padding(.top, Tokens.Space.s3)
        }
        Kv(key: "Expires", value: roomExpiry(room))
        if room.active {
            Button("Keep it open 30 more days") { patch(revoke: false, done: "Open 30 more days.") }
                .buttonStyle(.quiet).disabled(!recs.online || busy)
        }
        Kv(key: "Opens on", value: roomOpensOn(room.mapWindow))
        Kv(key: "Holds", value: roomHolds(room))
        if made {
            Note("Opens are logged in Share. Revoke it there any time.").padding(.top, Tokens.Space.s3)
        } else {
            GroupHeader(title: "Opens", count: "\(room.opens)")
            if opens == nil && !recs.online { Note("The open log loads when you have signal.") }
            else if opens?.isEmpty ?? true { Note("Not opened yet.") }
            else { ForEach(Array((opens ?? []).enumerated()), id: \.offset) { Note(openLine($0.element)).padding(.vertical, Tokens.Space.s1) } }
            if room.active {
                Button("Revoke link") { revoking = true }
                    .buttonStyle(.quiet).disabled(!recs.online || busy).padding(.top, Tokens.Space.s4)
                if !recs.online { Note("Revoking needs signal, so it takes effect the moment you do it.") }
            }
        }
    }

    private func patch(revoke: Bool, done: String) {
        busy = true
        Task {
            do {
                rooms.changed(try await recs.api.updateRoom(aircraftId: recs.id, roomId: roomId, revoke ? ["revoke": true] : ["extendDays": 30]))
                await rooms.refresh()
                recs.say(done)
            } catch {
                recs.say((error as? RecordsAPI.Failure)?.message ?? "That needs signal.")
            }
            busy = false
        }
    }
}

/// KeyValueList row (02 §5): key ink-3 at a fixed width, the value in ink; stacked at accessibility sizes.
private struct Kv: View {
    let key: String
    let value: String
    @Environment(\.dynamicTypeSize) private var typeSize
    @ScaledMetric private var keyWidth: CGFloat = 88

    var body: some View {
        let stacked = typeSize.isAccessibilitySize
        let layout = stacked ? AnyLayout(VStackLayout(alignment: .leading, spacing: 2)) : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: Tokens.Space.s3))
        layout {
            Text(key).dFont(.small).foregroundStyle(Tokens.Colors.ink3).frame(width: stacked ? nil : keyWidth, alignment: .leading)
            Text(value).dFont(.body).foregroundStyle(Tokens.Colors.ink).fixedSize(horizontal: false, vertical: true)
        }
        .frame(minHeight: 32, alignment: .leading)
        .padding(.vertical, Tokens.Space.s1)
        .accessibilityElement(children: .combine)
    }
}

/// QRCard (M-SHARE-02): 220 square with a 16 quiet zone on the light leaf, light in dark mode too so any camera reads it.
private struct QRCard: View {
    let url: String
    var side: CGFloat = 220

    var body: some View {
        Group {
            if let img = qrImage(url) {
                Image(uiImage: img).interpolation(.none).resizable().frame(width: side, height: side)
            }
        }
        .padding(16)
        .background(Tokens.Colors.leaf, in: RoundedRectangle(cornerRadius: Tokens.Radius.m))
        .environment(\.colorScheme, .light)
        .accessibilityElement()
        .accessibilityLabel("QR code for \(shortUrl(url))")
    }
}

/// The QR full screen at full brightness, for showing a buyer in person. Tap anywhere to close.
private struct BigQR: View {
    let url: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Tokens.Colors.leaf.ignoresSafeArea()
            QRCard(url: url, side: 300)
        }
        .environment(\.colorScheme, .light)
        .contentShape(Rectangle())
        .background(BrightScreen())
        .onTapGesture { dismiss() }
        .accessibilityAction(named: "Close") { dismiss() }
    }
}

/// Brighten the display carrying this window, then restore that display when the QR closes.
private struct BrightScreen: UIViewRepresentable {
    final class View: UIView {
        private var original: (screen: UIScreen, brightness: CGFloat)?
        override func didMoveToWindow() {
            super.didMoveToWindow()
            if let original { original.screen.brightness = original.brightness; self.original = nil }
            if let screen = window?.screen {
                original = (screen, screen.brightness)
                screen.brightness = 1
            }
        }
        func restore() {
            if let original { original.screen.brightness = original.brightness; self.original = nil }
        }
    }
    func makeUIView(context: Context) -> View { View() }
    func updateUIView(_ view: View, context: Context) {}
    static func dismantleUIView(_ view: View, coordinator: ()) { view.restore() }
}

// MARK: Links and people (M-SHARE-03)

/// Live links with expiry and opens, the expired and revoked ones folded, and the people with access and their roles.
struct LinksScreen: View {
    let recs: Recs
    @State private var people: [Person]?
    @State private var peopleError: String?
    @State private var showEnded = false
    @State private var inviting = false
    @State private var removing: Person?
    @State private var version = 0
    @Environment(\.recNav) private var nav

    private var rooms: RoomsStore { RoomsStore.of(recs) }

    var body: some View {
        let live = rooms.rooms.filter(\.active), ended = rooms.rooms.filter { !$0.active }
        RecScreen(section: .share, title: "Links and people", back: "Share") {
            GroupHeader(title: "Live links", count: "\(live.count)")
            if live.isEmpty { Note("No live links.") }
            ForEach(live) { r in RecRow(r.label, lines: [roomLine(r)], action: { nav.open(.link(r.id)) }) }
            if !ended.isEmpty {
                PhoneRow(title: showEnded ? "Hide expired and revoked (\(ended.count))" : "Expired and revoked (\(ended.count))") { showEnded.toggle() }
                if showEnded { ForEach(ended) { r in RecRow(r.label, lines: [roomLine(r)], action: { nav.open(.link(r.id)) }) } }
            }
            if !recs.online { Note("This is the list as of your last signal.").padding(.top, Tokens.Space.s2) }
            GroupHeader(title: "People", count: people.map { "\($0.count + 1)" })
            RecRow("You", lines: ["Owner"])
            ForEach(people ?? []) { p in
                let other = p.role == "editor" ? "viewer" : "editor"
                RecRow(p.email, lines: [roleWord(p.role)], menu: recs.online ? [
                    RowAction(title: "Make \(roleWord(other))") { act({ try await recs.api.setPerson(aircraftId: recs.id, ownerId: recs.offline.userId, email: p.email, role: other) }, "Role changed.") },
                    RowAction(title: "Remove access", role: .destructive) { removing = p },
                ] : [])
            }
            if !recs.online { Note("People load when you have signal.") } else if let peopleError { Note(peopleError, alarm: true) }
            Button { inviting = true } label: { Label { Text("Invite someone") } icon: { Icon("users", size: 18) } }
                .buttonStyle(.secondary).disabled(!recs.online).padding(.top, Tokens.Space.s4)
        }
        .task(id: "\(recs.online)|\(version)") {
            await rooms.refresh()
            guard recs.online, recs.isOwner else { return }
            do { people = try await recs.api.people(aircraftId: recs.id); peopleError = nil }
            catch { peopleError = (error as? RecordsAPI.Failure)?.message ?? "People couldn't be loaded." }
        }
        .sheet(isPresented: $inviting, onDismiss: { version += 1 }) { InviteSheet(recs: recs) }
        .confirmationDialog("Remove \(removing?.email ?? "")?", isPresented: Binding { removing != nil } set: { if !$0 { removing = nil } }, titleVisibility: .visible) {
            Button("Remove access", role: .destructive) {
                if let p = removing { act({ try await recs.api.removePerson(aircraftId: recs.id, email: p.email) }, "Access removed.") }
            }
            Button("Keep", role: .cancel) {}
        } message: { Text("They won't see \(recs.tail) any more.") }
    }

    private func act(_ block: @escaping () async throws -> Void, _ done: String) {
        Task {
            do { try await block(); version += 1; recs.say(done) }
            catch { recs.say((error as? RecordsAPI.Failure)?.message ?? "That needs signal.") }
        }
    }
}

/// Invite a co-owner or mechanic (M-SHARE-01): email and role, then access is granted on the server. The phone can't
/// send the invitation email itself, so it offers the share sheet with a note to send them.
private struct InviteSheet: View {
    let recs: Recs
    @State private var email = ""
    @State private var role: Int? = 0
    @State private var busy = false
    @State private var error: String?
    @State private var invited: String?

    private var valid: Bool { email.trimmingCharacters(in: .whitespaces).range(of: #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#, options: .regularExpression) != nil }

    var body: some View {
        RecSheet(title: "Invite someone", dirty: !email.isEmpty && invited == nil) {
            if !recs.isOwner {
                Note("Only the owner can make links or invite people.")
            } else if let invited {
                Lede("They have access. Signing in with that email shows the aircraft.")
                ShareLink(item: "I've shared \(recs.tail) with you on MyTailLog. Sign in with \(invited) to see it: \(recs.api.apiURL.absoluteString)",
                          subject: Text("\(recs.tail) on MyTailLog")) {
                    Label { Text("Tell them") } icon: { Icon("mail", size: 18) }
                }
                .buttonStyle(.primary)
                .padding(.top, Tokens.Space.s4)
            } else {
                TextBox(label: "Email", text: $email)
                    .textInputAutocapitalization(.never).keyboardType(.emailAddress).autocorrectionDisabled()
                RadioRows(label: "Role", options: [("Editor", "Can add and change records"), ("Viewer", "Can read and report squawks")], selection: $role)
                if let error { Note(error, alarm: true) }
                Button { invite() } label: {
                    Label { Text(busy ? "Saving" : "Send invitation") } icon: { Icon("mail", size: 18) }
                }
                .buttonStyle(.primary)
                .disabled(!recs.online || !valid || busy)
                .padding(.top, Tokens.Space.s4)
                if !recs.online { Note("Inviting needs signal.") }
            }
        }
    }

    private func invite() {
        busy = true
        error = nil
        let e = email.trimmingCharacters(in: .whitespaces)
        Task {
            do {
                try await recs.api.setPerson(aircraftId: recs.id, ownerId: recs.offline.userId, email: e, role: role == 1 ? "viewer" : "editor")
                invited = e
            } catch {
                self.error = (error as? RecordsAPI.Failure)?.message ?? "Inviting needs signal."
            }
            busy = false
        }
    }
}
