import SwiftUI

private let identityLabels = ["make": "Manufacturer", "model": "Model", "serial_number": "Serial number", "part_number": "Part number", "tail_number": "Registration"]

struct PageIdentityReview: View {
    let model: BooksModel
    let page: PageRow
    @State private var busy = false
    @State private var message: String?
    private let kinds = ["identity", "equipment", "maintenance", "reference", "blank"]
    private var disabled: Bool { busy || !model.canEdit || model.detailsPending(page) }

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s3) {
            Text("Page contents").dFont(.bodyStrong).accessibilityAddTraits(.isHeader)
            Text("Identification and reference pages belong here too. No maintenance entry is required.").dFont(.small)
            DisclosureGroup("Page type: \((page.content_kinds ?? []).joined(separator: ", "))") {
                ForEach(kinds, id: \.self) { kind in
                    Toggle(kind == "identity" ? "Identification" : kind.capitalized, isOn: Binding {
                        (page.content_kinds ?? []).contains(kind)
                    } set: { checked in
                        var selected = page.content_kinds ?? []
                        selected.removeAll { $0 == kind }
                        if checked { selected.append(kind) }
                        save(["action": "classify", "kinds": selected])
                    }).disabled(disabled)
                }
            }
            ForEach(page.identity_suggestions ?? []) { suggestion in
                if suggestion.status == "pending" {
                    IdentitySuggestionView(suggestion: suggestion, aircraftId: model.aircraft.id,
                        targets: model.identityTargets, disabled: disabled, save: save)
                } else {
                    Text("\(suggestion.name) · \(suggestion.status == "accepted" ? "Details accepted" : "Suggestion dismissed")").dFont(.small)
                }
            }
            if model.canEdit {
                Button("Find aircraft details in this page") {
                    busy = true
                    Task {
                        message = await model.rereadIdentity(page) ?? "Queued for reading. Confirmed entries and review decisions will be kept."
                        busy = false
                    }
                }.buttonStyle(.quiet).disabled(disabled)
            }
            if let message { Text(message).dFont(.small) }
            Rule()
        }
        .foregroundStyle(Tokens.Colors.ink)
        .onChange(of: message) { _, text in if let text { UIAccessibility.post(notification: .announcement, argument: text) } }
    }

    private func save(_ decision: [String: Any]) {
        busy = true
        Task {
            message = await model.reviewIdentity(page, decision: decision) ?? "Saved with a link to this source page."
            busy = false
        }
    }
}

private struct IdentitySuggestionView: View {
    let suggestion: IdentitySuggestion
    let aircraftId: String
    let targets: [IdentityTarget]
    let disabled: Bool
    let save: ([String: Any]) -> Void
    @State private var fields: [String: String]
    @State private var target: String
    @State private var installed = false

    init(suggestion: IdentitySuggestion, aircraftId: String, targets: [IdentityTarget], disabled: Bool, save: @escaping ([String: Any]) -> Void) {
        self.suggestion = suggestion; self.aircraftId = aircraftId; self.targets = targets; self.disabled = disabled; self.save = save
        _fields = State(initialValue: suggestion.fields)
        _target = State(initialValue: suggestion.subject == "aircraft" ? aircraftId : "new")
    }

    private var current: IdentityTarget? { targets.first { $0.id == target } }
    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s3) {
            Text(suggestion.name).dFont(.bodyStrong)
            Text(suggestion.quote).dFont(.paper)
            Text(suggestion.confidence < 0.8 ? "Uncertain — check every detail against the scan." : "Read by AI. Check against the scan before accepting.").dFont(.small)
            if suggestion.subject != "aircraft" {
                Picker("Apply details to", selection: $target) {
                    Text("New historical equipment record").tag("new")
                    ForEach(targets.filter { $0.id != aircraftId }) { row in
                        Text([row.name, row.serial_number].compactMap { $0 }.joined(separator: " · ")).tag(row.id)
                    }
                }.pickerStyle(.menu)
            }
            ForEach(fields.keys.sorted(), id: \.self) { key in
                VStack(alignment: .leading, spacing: Tokens.Space.s1) {
                    Text(identityLabels[key] ?? key).dFont(.small)
                    Text("Currently: \(current?.value(key) ?? "Not recorded")").dFont(.small).foregroundStyle(Tokens.Colors.ink3)
                    TextField(identityLabels[key] ?? key, text: Binding { fields[key] ?? "" } set: { fields[key] = String($0.prefix(200)) })
                        .textInputAutocapitalization(.never).autocorrectionDisabled().textFieldStyle(.roundedBorder)
                        .accessibilityLabel(identityLabels[key] ?? key)
                }
            }
            if suggestion.subject != "aircraft" && target == "new" {
                Toggle("I have checked that this equipment is installed today. Otherwise keep it as historical equipment.", isOn: $installed).dFont(.small)
            }
            Button("Accept details") {
                var decision: [String: Any] = ["action": "accept", "suggestionId": suggestion.id,
                    "fields": fields.mapValues { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.value.isEmpty },
                    "targetId": current?.id ?? UUID().uuidString.lowercased(), "installed": installed]
                if let current { decision["targetBase"] = current.updated_at }
                save(decision)
            }.buttonStyle(.secondary)
            Button("Dismiss suggestion") { save(["action": "dismiss", "suggestionId": suggestion.id]) }.buttonStyle(.quiet)
        }.disabled(disabled).padding(.vertical, Tokens.Space.s3)
    }
}
