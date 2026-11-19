import AppIntents
import SwiftUI

// Siri, Shortcuts and Spotlight actions (05 §13.2). "What's due" answers from the snapshot on this phone (offline, from
// confirmed data only: the server's Verdict and the widget rows); "Log a flight" opens the app at the tach camera.
// shortcut: Log a flight opens the app instead of asking for the tach in the dialog (05 §13.2 runs it in an
// extension with confirmation); add that once the outbox can be written from an intents extension.

/// The spoken answer and the next three rows for one aircraft. Pure, so it is unit-tested.
func whatsDue(tail: String?, snapshot: StatusSnapshot?, today: String, now: Date) -> (dialog: String, rows: [WidgetRow]) {
    let view = WidgetText.view(tail: tail, snapshot: snapshot, today: today, now: now)
    guard let tail = view.tail, let snapshot else { return (WidgetText.noAircraft, []) }
    let asOf = view.asOf.map { " (\($0))" } ?? ""
    return ("\(tail)\(asOf): \(snapshot.verdict.text)", Array(view.rows.prefix(3)))
}

struct WhatsDueIntent: AppIntent {
    static let title: LocalizedStringResource = "What's due"
    static let description = IntentDescription("Says what comes due next on an aircraft, from the records on this phone.")

    @Parameter(title: "Aircraft")
    var aircraft: AircraftEntity?

    static var parameterSummary: some ParameterSummary { Summary("What's due on \(\.$aircraft)") }

    func perform() async throws -> some IntentResult & ProvidesDialog & ShowsSnippetView {
        let a = SharedSnapshots.pick(aircraft?.id)
        let now = Date()
        let answer = whatsDue(tail: a?.tail, snapshot: a.flatMap { SharedSnapshots.status($0.id) }, today: WidgetText.localDay(now), now: now)
        return .result(dialog: IntentDialog(stringLiteral: answer.dialog)) {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(Array(answer.rows.enumerated()), id: \.offset) { _, r in
                    HStack(spacing: 8) {
                        Canvas { ctx, s in
                            ctx.statusMark(markKind(r.status == "visit" ? "current" : r.status), at: CGPoint(x: s.width / 2, y: s.height / 2),
                                           radius: s.width / 2, ringWidth: 2.5)
                        }
                        .frame(width: 10, height: 10)
                        Text("\(Text(r.lead).bold()) \(r.rest)").font(.subheadline)
                    }
                }
            }
            .padding()
        }
    }
}

struct LogFlightIntent: AppIntent {
    static let title: LocalizedStringResource = "Log a flight"
    static let description = IntentDescription("Opens MyTailLog at the tach camera.")
    static let openAppWhenRun = true

    @Parameter(title: "Aircraft")
    var aircraft: AircraftEntity?

    @MainActor
    func perform() async throws -> some IntentResult {
        LinkInbox.shared.pending = AppLink(aircraftId: aircraft?.id, target: .flight)
        return .result()
    }
}

struct MyTailLogShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: WhatsDueIntent(), phrases: [
            "What's due in \(.applicationName)",
            "What's due on \(\.$aircraft) in \(.applicationName)",
        ], shortTitle: "What's due", systemImageName: "calendar.badge.clock")
        AppShortcut(intent: LogFlightIntent(), phrases: [
            "Log a flight in \(.applicationName)",
            "Log a flight on \(\.$aircraft) in \(.applicationName)",
        ], shortTitle: "Log a flight", systemImageName: "airplane")
    }
    static let shortcutTileColor: ShortcutTileColor = .navy
}
