import SwiftUI

/// Status's changes corner (06 M-STATUS-02 offline with changes): up to three changes still on this phone with
/// **See all** to M-SYS-01. Logging a flight is the AddButton's (M-FLIGHT-01).
struct StatusCapture: View {
    let model: StatusModel
    @Environment(OfflineStore.self) private var offline: OfflineStore?

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
        }
    }
}
