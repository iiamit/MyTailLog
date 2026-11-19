import SwiftUI
import UserNotifications

/// Notifications or Reminders as a sheet over the shell (06 M-SYS-05): a leaf with its title and Close.
struct AccountSheetView: View {
    let sheet: AccountSheet
    let api: NotifyAPI
    let tails: [String: String]
    let open: (AppLink) -> Void
    @State private var showing: AccountSheet
    @Environment(\.dismiss) private var dismiss

    init(sheet: AccountSheet, api: NotifyAPI, tails: [String: String], open: @escaping (AppLink) -> Void) {
        self.sheet = sheet; self.api = api; self.tails = tails; self.open = open
        _showing = State(initialValue: sheet)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    switch showing {
                    case .inbox: InboxScreen(api: api, tails: tails, settings: { showing = .reminders }) { link in
                        dismiss()
                        if let link { open(link) }
                    }
                    case .reminders: RemindersScreen(api: api)
                    }
                }
                .padding(.horizontal, Tokens.Space.s4)
                .padding(.bottom, Tokens.Space.s6)
                .frame(maxWidth: 640, alignment: .leading)
                .frame(maxWidth: .infinity)
            }
            .background(Tokens.Colors.leaf)
            .navigationTitle(showing == .inbox ? "Notifications" : "Reminders")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Close") { dismiss() } } }
        }
        .presentationBackground(Tokens.Colors.leaf)
    }
}

/// The notification inbox (C-NOTIFY-02, the web's 03 §5.4 on the phone): read state and row actions on the server so
/// it agrees across devices; rows grouped by aircraft. Tapping a row opens its deep link in the app.
struct InboxScreen: View {
    let api: NotifyAPI
    let tails: [String: String]
    let settings: () -> Void
    let open: (AppLink?) -> Void
    @State private var items: [InboxItem]?
    @State private var failed = false
    @State private var reload = 0

    var body: some View {
        Group {
            if let items {
                if items.isEmpty {
                    Lede("Nothing new. Reminders and reading updates appear here for 90 days.").padding(.top, Tokens.Space.s4)
                } else {
                    ForEach(inboxGroups(items, tails: tails), id: \.title) { g in
                        GroupHeader(title: g.title, count: "\(g.items.count)")
                        ForEach(g.items) { n in row(n) }
                    }
                }
            } else if failed {
                Note("Notifications could not be loaded.", alarm: true).padding(.top, Tokens.Space.s4)
                Button("Try again") { reload += 1 }.buttonStyle(.secondary).padding(.top, Tokens.Space.s2)
            } else {
                Note("Loading").padding(.top, Tokens.Space.s4)
            }
            HStack(spacing: Tokens.Space.s2) {
                Button("Mark all as read") {
                    Task {
                        for n in items ?? [] where !n.read { try? await api.markRead(n.id) }
                        reload += 1
                    }
                }
                .buttonStyle(.secondary)
                .disabled(!(items ?? []).contains { !$0.read })
                Button("Notification settings", action: settings).buttonStyle(.quiet)
            }
            .padding(.top, Tokens.Space.s4)
        }
        .task(id: reload) {
            failed = false
            do { items = try await api.inbox() } catch { failed = true }
        }
    }

    private func row(_ n: InboxItem) -> some View {
        let time = inboxWhen(n.createdAt)
        return VStack(alignment: .leading, spacing: Tokens.Space.s2) {
            Button {
                Task {
                    if !n.read { try? await api.markRead(n.id) }
                    open(AppLinks.parse(n.deepLink))
                }
            } label: {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(alignment: .firstTextBaseline, spacing: Tokens.Space.s2) {
                        if !n.read { Circle().fill(Tokens.Colors.ink).frame(width: 8, height: 8) }
                        Text(n.title ?? "").dFont(.bodyStrong).foregroundStyle(Tokens.Colors.ink)
                        Spacer(minLength: Tokens.Space.s2)
                        Text(time).dFont(.caption).foregroundStyle(Tokens.Colors.ink3)
                    }
                    if let body = n.body { Text(body).dFont(.small).foregroundStyle(Tokens.Colors.ink2).lineLimit(3) }
                }
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(RowButtonStyle())
            .accessibilityElement(children: .ignore)
            .accessibilityLabel([n.read ? nil : "Unread", n.title, n.body, time].compactMap { $0 }.joined(separator: ". "))
            .accessibilityAddTraits(.isButton)
            if let actions = n.actions, !actions.isEmpty {
                HStack(spacing: Tokens.Space.s2) {
                    ForEach(actions, id: \.id) { a in
                        Button(a.label ?? a.id) {
                            Task {
                                let next = try? await api.act(n.id, a.id)
                                if let next = next ?? nil, let link = AppLinks.parse(next) { open(link) } else { reload += 1 }
                            }
                        }
                        .buttonStyle(.secondary)
                    }
                }
            }
        }
        .padding(.vertical, Tokens.Space.s2)
        .overlay(alignment: .bottom) { Rule() }
    }
}

/// Reminders (06 M-SYS-05): this phone's switch and registration state, reading progress and phone search, then the
/// account's settings as the web's Settings › Reminders shows them, each saved on its own through PATCH /api/me/preferences.
struct RemindersScreen: View {
    let api: NotifyAPI
    @State private var prefs: [String: Any]?
    @State private var failed = false
    @State private var said: String?
    @State private var test: String?
    @State private var osOff = false
    @AppStorage(Push.onKey) private var phoneOn = true
    @AppStorage(ReadingLive.enabledKey) private var reading = true
    @AppStorage(Spotlight.enabledKey) private var search = true
    @Environment(\.scenePhase) private var scenePhase
    private let push = Push.shared

    /// The alerts keys and which of days and hours each takes (the web's table).
    private static let kinds: [(key: String, label: String, days: Bool, hours: Bool)] = [
        ("annual", "Annual inspection", true, false), ("oil", "Oil change", false, true), ("ad", "ADs and SBs", true, true),
        ("document", "Registration, insurance", true, false), ("visit", "A planned shop visit", true, false),
        ("default", "Everything else", true, true),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SwitchRow(label: "Reminders on this phone", on: $phoneOn)
                .onChange(of: phoneOn) { _, on in Task { if on { await push.start() } else { await push.stop() } } }
            if let line = phoneLine { Note(line, alarm: phoneOn && (osOff || isFailed)).accessibilityAddTraits(.updatesFrequently) }
            if phoneOn && osOff {
                Button("Open Settings") { if let url = URL(string: UIApplication.openNotificationSettingsURLString) { UIApplication.shared.open(url) } }
                    .buttonStyle(.secondary).padding(.vertical, Tokens.Space.s2)
            }
            SwitchRow(label: "Show reading progress on the Lock Screen", on: $reading)
            SwitchRow(label: "Show records in phone search", on: $search)
                .onChange(of: search) { _, on in if !on { Task { await Spotlight.clear() } } }
            if let prefs { account(prefs) } else {
                Note(failed ? "Reminder settings could not be loaded. They need a connection." : "Loading", alarm: failed)
                    .padding(.top, Tokens.Space.s4)
            }
            if let said { Note(said, alarm: said != "Saved.").padding(.top, Tokens.Space.s2) }
            Rule().padding(.vertical, Tokens.Space.s4)
            Button("Send a test") { Task { await sendTest() } }
                .buttonStyle(.secondary)
                .disabled(test == "Sending")
            if let test { Note(test).padding(.top, Tokens.Space.s2) }
        }
        .padding(.top, Tokens.Space.s2)
        .task {
            do { prefs = try await api.preferences() } catch { failed = true }
        }
        .task(id: scenePhase) { osOff = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus == .denied }
    }

    private var isFailed: Bool { if case .failed = push.state { true } else { false } }

    private var phoneLine: String? {
        if !phoneOn { return "Off on this phone. Email reminders still follow the settings below." }
        if osOff { return "Notifications are off for MyTailLog in your phone's settings." }
        switch push.state {
        case .registered: return "On this phone: on"
        case .failed(let why): return "This phone couldn't register for reminders: \(why)"
        default: return nil
        }
    }

    @ViewBuilder private func account(_ p: [String: Any]) -> some View {
        let alerts = p["alerts"] as? [String: Any] ?? [:]
        let on = p["notify_due"] as? Bool ?? false
        GroupHeader(title: "Reminders")
        toggle("Email and phone reminders before items come due", on) { save(["notify_due": $0]) }
        toggle("Weekly while something is lapsed", alerts["weekly_while_lapsed"] as? Bool ?? true, enabled: on) {
            save(["alerts": ["weekly_while_lapsed": $0]])
        }
        ForEach(Self.kinds, id: \.key) { k in
            let a = alerts[k.key] as? [String: Any] ?? [:]
            toggle(k.label, a["enabled"] as? Bool ?? false, enabled: on) { save(["alerts": [k.key: ["enabled": $0]]]) }
            HStack(spacing: Tokens.Space.s2) {
                if k.days { LeadField(label: "Days ahead", value: a["lead_days"] as? Int) { save(["alerts": [k.key: ["lead_days": $0]]]) } }
                if k.hours { LeadField(label: "Hours ahead", value: a["lead_hours"] as? Int) { save(["alerts": [k.key: ["lead_hours": $0]]]) } }
            }
            .disabled(!on)
        }
        GroupHeader(title: "Send them by")
        let channels = alerts["channels"] as? [String: Any] ?? [:]
        toggle("Email", channels["email"] as? Bool ?? false, enabled: on) { save(["alerts": ["channels": ["email": $0]]]) }
        toggle("Phone", channels["push"] as? Bool ?? false, enabled: on) { save(["alerts": ["channels": ["push": $0]]]) }
        GroupHeader(title: "Quiet hours for the phone")
        let quiet = alerts["quiet_hours"] as? [String: Any] ?? [:]
        HStack(spacing: Tokens.Space.s2) {
            QuietField(label: "Quiet from (HH:MM)", value: quiet["start"] as? String ?? "") { save(["alerts": ["quiet_hours": ["start": $0]]]) }
            QuietField(label: "Quiet until (HH:MM)", value: quiet["end"] as? String ?? "") { save(["alerts": ["quiet_hours": ["end": $0]]]) }
        }
        Note("Each item can have its own lead time on its page in Status.").padding(.top, Tokens.Space.s2)
    }

    private func toggle(_ label: String, _ value: Bool, enabled: Bool = true, _ set: @escaping (Bool) -> Void) -> some View {
        SwitchRow(label: label, on: Binding { value } set: { set($0) }).disabled(!enabled)
    }

    private func save(_ patch: [String: Any]) {
        nonisolated(unsafe) let patch = patch
        Task {
            do {
                prefs = try await api.savePreferences(patch)
                said = "Saved."
            } catch {
                said = "That didn't save. Try again."
            }
        }
    }

    private func sendTest() async {
        test = "Sending"
        do {
            test = try await api.test()
        } catch let e as NotifyAPI.Failed {
            test = e.status == 429 ? "That's a few tests already. Try again in an hour." : e.message
        } catch {
            test = "Couldn't reach MyTailLog. Check your connection."
        }
    }
}

/// A whole-number lead time, saved when editing ends with a new value (the web saves on blur too).
private struct LeadField: View {
    let label: String
    let value: Int?
    let save: (Int) -> Void
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        TextBox(label: label, text: $text, number: true)
            .focused($focused)
            .onAppear { text = value.map(String.init) ?? "" }
            .onChange(of: focused) { _, f in
                if !f, let n = Int(text), n >= 0, n != value { save(n) }
            }
    }
}

/// "21:00", saved when editing ends with a valid new value.
private struct QuietField: View {
    let label: String
    let value: String
    let save: (String) -> Void
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        TextBox(label: label, text: $text)
            .focused($focused)
            .onAppear { text = value }
            .onChange(of: focused) { _, f in
                if !f, text != value, text.wholeMatch(of: /([01]\d|2[0-3]):[0-5]\d/) != nil { save(text) }
            }
    }
}
