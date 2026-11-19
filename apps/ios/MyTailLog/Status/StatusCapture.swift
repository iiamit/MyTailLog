import SwiftUI

/// Status's capture corner (06 M-STATUS-02 offline with changes, M-FLIGHT-01 "Log a flight"): the flight camera for
/// editors, and up to three changes still on this phone with **See all** to M-SYS-01.
/// shortcut: "Log a flight" sits here until the Add sheet (M-FLIGHT-01) lands with the phase 4 flight screens.
struct StatusCapture: View {
    let model: StatusModel
    @Environment(OfflineStore.self) private var offline: OfflineStore?
    @State private var flying = false
    @State private var saved: String?

    var body: some View {
        if let offline, let aircraft = model.current {
            let mine = offline.waiting.filter { $0.aircraftId == aircraft.id }
            if !mine.isEmpty {
                GroupHeader(title: "Waiting to upload", count: "\(mine.count)")
                ForEach(mine.prefix(3)) { item in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.label).dFont(.bodyStrong)
                        Label { Text("On this phone") } icon: { Icon("cloud-upload", size: 14) }
                            .dFont(.small).foregroundStyle(Tokens.Colors.ink3)
                    }
                    .frame(minHeight: Tokens.Size.phoneRowMin, alignment: .leading)
                }
                NavigationLink("See all", value: SyncRoute.waiting).dFont(.bodyStrong)
            }
            if aircraft.role != .viewer {
                if let saved { Text(saved).dFont(.small, weight: 600).foregroundStyle(Tokens.Colors.ink) }
                Button { flying = true } label: {
                    Label { Text("Log a flight") } icon: { Icon("gauge") }
                }
                .buttonStyle(.secondary)
                .fullScreenCover(isPresented: $flying) {
                    LogFlightFlow(aircraftId: aircraft.id, offline: offline, context: context(aircraft.id, offline)) { saved = $0 }
                }
            }
        }
    }

    /// The last tach reading: the newest of the snapshot's meter and the readings on this phone and in the mirror.
    private func context(_ aircraftId: String, _ offline: OfflineStore) -> TachReader.Context {
        struct Reading: Decodable { let reading_date: String?; let tach: Double? }
        var best: (date: String, value: Double)?
        if let m = model.snapshot?.meters["tach"], let v = m.stitched { best = (m.asOf ?? "", v) }
        for r in offline.rows("hours_reading", aircraftId: aircraftId) as [Reading] {
            if let v = r.tach, let d = r.reading_date, d >= (best?.date ?? ""), v >= (best?.value ?? 0) { best = (d, v) }
        }
        for item in offline.waiting where item.aircraftId == aircraftId && item.type == "reading.create" {
            if case .number(let v)? = item.payload["tach"], v >= (best?.value ?? 0) { best = (item.payload["date"]?.string ?? "", v) }
        }
        let days = best.flatMap { $0.date.count == 10 ? Day.date($0.date) : nil }.map { max(Date().timeIntervalSince($0) / 86_400, 1) } ?? 1
        return TachReader.Context(last: best?.value, daysSinceLast: days)
    }
}
