import Charts
import QuickLook
import SwiftUI

struct EngineHistoryScreen: View {
    let recs: Recs
    @State private var history: EngineHistoryAnswer?
    @State private var segment = ""
    @State private var error: String?
    @State private var busy = false
    @State private var adding = false
    @State private var position = false
    @State private var editing: Rec?

    private var group: Row? { history?.groups.first { $0["segmentId"]?.text == segment } }
    private var component: String? { group?["componentId"]?.text }
    private var cache: URL { recs.offline.dir.appending(path: "engine-history/\(recs.id).json") }

    var body: some View {
        RecScreen(section: .aircraft, title: "Engine history", back: "Aircraft") {
            Note("Compression, oil and maintenance tied to the engine and its overhaul period. Different reference pressures stay separate. Verify observations against their source; this is not a diagnosis or sign-off.")
            if let error { Note(error, alarm: true) }
            if busy { ProgressView("Loading engine history") }
            if let history {
                if history.groups.isEmpty { EmptyLine(text: "No engine components are identified yet. Add an engine in Equipment, then review unassigned observations here.") }
                if !history.groups.isEmpty {
                    VStack(alignment: .leading, spacing: Tokens.Space.s2) {
                        Text("Engine and period").dFont(.bodyStrong)
                        Picker("Engine and period", selection: $segment) {
                            ForEach(Array(history.groups.enumerated()), id: \.offset) { _, row in
                                Text([row["name"]?.text, row["position"]?.text, row["start"]?.text, row["end"]?.text].compactMap { $0 }.joined(separator: " · "))
                                    .tag(row["segmentId"]?.text ?? "")
                            }
                        }
                        .pickerStyle(.menu).tint(Tokens.Colors.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    }.padding(.vertical, Tokens.Space.s2)
                }
                if let group {
                    if recs.canEdit {
                        Button("Record compression or engine event") { adding = true }.buttonStyle(.secondary).disabled(!recs.online)
                        Button("Set engine position") { position = true }.buttonStyle(.quiet).disabled(!recs.online)
                    }
                    EngineGroupDetails(recs: recs, group: group)
                    GroupHeader(title: "Component events")
                    let events = history.events.filter { $0["component_id"]?.text == component }
                    if events.isEmpty { Note("No overhaul or cylinder-replacement events recorded.") }
                    ForEach(events.map { Rec(row: $0) }) { event in
                        RecRow(event.s("kind")?.replacingOccurrences(of: "_", with: " ").capitalized ?? "Event", lines: [event.s("event_date"), event.s("notes")].compactMap { $0 }, action: recs.canEdit ? { editing = event } : nil)
                        if let source = event.s("source_entry_id") { OwnerSourceButton(recs: recs, entryId: source) }
                    }
                }
                let unassigned = history.unassigned
                if !unassigned.ownerRows("compression").isEmpty || !unassigned.ownerRows("samples").isEmpty || !unassigned.ownerRows("oilChanges").isEmpty || !unassigned.ownerRows("additions").isEmpty {
                    GroupHeader(title: "Unassigned observations")
                    Note("These are not attributed to an engine. Review the source and equipment dates before using them in a trend.")
                    EngineGroupDetails(recs: recs, group: unassigned)
                }
                if !history.needsReview.isEmpty {
                    GroupHeader(title: "Needs review")
                    ForEach(Array(history.needsReview.enumerated()), id: \.offset) { _, row in
                        Note(row["reason"]?.text ?? "Review the source observation", alarm: true)
                        if let source = row["entryId"]?.text { OwnerSourceButton(recs: recs, entryId: source) }
                    }
                }
            }
            Button("Refresh engine history") { Task { await load() } }.buttonStyle(.quiet).disabled(!recs.online || busy)
            if !recs.online { Note("Saved engine history remains available offline. Refresh and new observations need signal.") }
        }
        .task(id: "\(recs.id)-\(recs.online)") { await load() }
        .sheet(isPresented: $adding, onDismiss: { Task { await load() } }) {
            if let component { EngineEventSheet(recs: recs, componentId: component) }
        }
        .sheet(item: $editing, onDismiss: { Task { await load() } }) { event in
            EngineEventSheet(recs: recs, componentId: event.s("component_id") ?? "", observation: event)
        }
        .sheet(isPresented: $position, onDismiss: { Task { await load() } }) {
            if let component { EnginePositionSheet(recs: recs, componentId: component, initial: group?["position"]?.text ?? "", base: history?.components.first { $0["id"]?.text == component }?["updated_at"]?.text ?? "") }
        }
    }

    private func load() async {
        if history == nil, let data = try? Data(contentsOf: cache), let cached = try? JSONDecoder().decode(EngineHistoryAnswer.self, from: data) {
            history = cached; segment = cached.groups.first?["segmentId"]?.text ?? ""
        }
        guard recs.online else { return }
        busy = true; error = nil
        do {
            let data = try await recs.api.ownerData(aircraftId: recs.id, path: "engine-history")
            let loaded = try JSONDecoder().decode(EngineHistoryAnswer.self, from: data)
            try FileManager.default.createDirectory(at: cache.deletingLastPathComponent(), withIntermediateDirectories: true)
            try data.write(to: cache, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            history = loaded
            if !loaded.groups.contains(where: { $0["segmentId"]?.text == segment }) { segment = loaded.groups.first?["segmentId"]?.text ?? "" }
        } catch { self.error = error.localizedDescription }
        busy = false
    }
}

struct OwnerSourceButton: View {
    let recs: Recs
    let entryId: String
    var body: some View {
        Button("Open source entry") { LinkInbox.shared.pending = AppLink(aircraftId: recs.id, target: .entry, arg: entryId) }
            .buttonStyle(.quiet)
    }
}

private struct EngineGroupDetails: View {
    let recs: Recs
    let group: Row

    var body: some View {
        GroupHeader(title: "Compression")
        let tests = group.ownerRows("compression")
        if tests.isEmpty { Note("No cylinder readings in this period.") }
        CompressionHistoryChart(tests: tests)
        ForEach(Array(tests.enumerated()), id: \.offset) { _, test in
            let readings = test.ownerRows("readings").map(compressionLabel).joined(separator: " · ")
            RecRow(test["date"]?.text ?? "Undated observation", lines: [readings, test["confirmed"]?.flag == true ? "Confirmed source" : "Unverified source — review before use"])
            if let entry = test["sourceEntryId"]?.text ?? (test["observationId"]?.text == nil ? test["entryId"]?.text : nil) { OwnerSourceButton(recs: recs, entryId: entry) }
            else if test["observationId"]?.text != nil { Note("Manually recorded observation · no source entry attached") }
        }
        GroupHeader(title: "Oil service intervals")
        let intervals = group.ownerRows("oilIntervals")
        if intervals.isEmpty { Note("No comparable confirmed service interval in this engine period. Meter replacements and overhaul boundaries are excluded.") }
        ForEach(Array(intervals.enumerated()), id: \.offset) { _, interval in
            RecRow("\(interval["hours"]?.text ?? "—") hours · \(interval["meter"]?.text ?? "")", lines: [interval.ownerObject("from")["date"]?.text, interval.ownerObject("to")["date"]?.text].compactMap { $0 })
        }
        let changes = group.ownerRows("oilChanges")
        ForEach(Array(changes.enumerated()), id: \.offset) { _, change in
            RecRow("Oil service · \(change["date"]?.text ?? "undated")", lines: [change["confirmed"]?.flag == true ? "Confirmed source" : "Unverified source"])
            if let entry = change["entryId"]?.text { OwnerSourceButton(recs: recs, entryId: entry) }
        }
        GroupHeader(title: "Oil analysis")
        let samples = group.ownerRows("samples")
        if samples.isEmpty { Note("No oil samples assigned to this engine period. Upload a report to the document inbox.") }
        ForEach(Array(samples.enumerated()), id: \.offset) { _, sample in
            let elements = sample.ownerObject("elements_ppm")
            RecRow(sample["sample_date"]?.text ?? "Oil sample", lines: [sample["lab"]?.text, elements.keys.sorted().map { "\($0) \(elements[$0]?.text ?? "—") ppm" }.joined(separator: " · "), sample["lab_comments"]?.text].compactMap { $0 })
            OwnerEngineEvidenceButton(recs: recs, inboxId: sample["source_inbox_id"]?.text, pageId: sample["source_page_id"]?.text)
        }
        GroupHeader(title: "Oil added")
        let additions = group.ownerRows("additions")
        if additions.isEmpty { Note("No top-offs assigned to this engine period.") }
        if group["componentId"]?.text != nil, let consumption = engineHoursPerQuart(additions) {
            RecRow("\(fmt1(consumption.value)) hours per quart", lines: ["\(consumption.meter) · this engine and service period only · total hours divided by oil added after the first reading"])
        } else if group["componentId"]?.text != nil && additions.count >= 2 { Note("Consumption needs complete, increasing readings on the same meter within this engine period.") }
        ForEach(Array(additions.enumerated()), id: \.offset) { _, addition in
            RecRow("\(addition["quarts"]?.text ?? "—") qt", lines: [addition["added_date"]?.text, addition["notes"]?.text].compactMap { $0 })
        }
    }
}

private struct CompressionHistoryChart: View {
    struct Point: Identifiable {
        let id: String
        let date: Date
        let psi: Double
        let reference: String
        let cylinder: String
    }
    let tests: [Row]
    private var points: [Point] {
        tests.enumerated().flatMap { index, test -> [Point] in
            guard test["confirmed"]?.flag == true, let raw = test["date"]?.text,
                  let date = ISO8601DateFormatter().date(from: raw + "T12:00:00Z") else { return [] }
            return test.ownerRows("readings").compactMap { reading in
                guard let psi = reading["psi"]?.number, let reference = reading["reference"]?.text, let cylinder = reading["cylinder"]?.text else { return nil }
                return Point(id: "\(index)-\(cylinder)", date: date, psi: psi, reference: reference, cylinder: cylinder)
            }
        }
    }
    var body: some View {
        let refs = Set(points.map(\.reference)).sorted()
        ForEach(refs, id: \.self) { reference in
            Text("Reference pressure \(reference) psi").dFont(.caption).foregroundStyle(Tokens.Colors.ink3)
            Chart(points.filter { $0.reference == reference }) { point in
                PointMark(x: .value("Date", point.date), y: .value("Pressure", point.psi))
                    .symbol(by: .value("Cylinder", "C\(point.cylinder)"))
                    .foregroundStyle(Tokens.Colors.ink)
            }
            .chartYAxisLabel("psi").frame(height: 150).padding(.vertical, Tokens.Space.s2)
            .accessibilityLabel("Confirmed compression readings over \(reference) psi. Full cylinder values follow in the history list.")
        }
    }
}

private struct EngineEventSheet: View {
    let recs: Recs
    let componentId: String
    var observation: Rec? = nil
    @Environment(\.dismiss) private var dismiss
    @State private var id = newId()
    @State private var kind = "compression"
    @State private var date: String? = todayISO()
    @State private var notes = ""
    @State private var source: String?
    @State private var cylinderCount = "4"
    @State private var readings = Array(repeating: "", count: 12)
    @State private var reference = "80"
    @State private var referenceReadings = Array(repeating: "80", count: 12)
    @State private var cylinders = ""
    @State private var deleting = false
    @State private var loaded = false
    @State private var meter = ""
    @State private var hours = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        RecSheet(title: "Record engine observation", dirty: !notes.isEmpty || readings.contains(where: { !$0.isEmpty }), discardWhat: "observation") {
            ChoiceRow(label: "Observation", options: [("compression", "Compression test"), ("overhaul", "Overhaul boundary"), ("cylinder_replacement", "Cylinder replacement")], selection: $kind)
            DateRow(label: "Date", date: $date)
            if kind == "compression" {
                TextBox(label: "Cylinder count (1–12)", text: $cylinderCount, number: true)
                if observation == nil { TextBox(label: "Reference pressure (psi)", text: $reference, number: true) }
                ForEach(0..<min(12, max(1, Int(cylinderCount) ?? 4)), id: \.self) { index in
                    TextBox(label: "Cylinder \(index + 1) pressure (psi)", text: $readings[index], number: true)
                    if observation != nil { TextBox(label: "Cylinder \(index + 1) reference (psi)", text: $referenceReadings[index], number: true) }
                }
            }
            if kind == "cylinder_replacement" { TextBox(label: "Cylinder numbers, separated by commas", text: $cylinders) }
            ChoiceRow(label: "Meter basis", options: [("", "Not recorded"), ("tach", "Tach"), ("hobbs", "Hobbs")], selection: $meter)
            if !meter.isEmpty { TextBox(label: "Recorded meter reading", text: $hours, number: true) }
            EntryChoice(recs: recs, label: "Source entry", selected: $source)
            TextBox(label: "Notes", text: $notes)
            Note("Record what the source says. This observation does not certify maintenance or alter a compliance item.")
            if let error { Note(error, alarm: true) }
            Button(busy ? "Saving" : "Save observation", action: save).buttonStyle(.primary).disabled(!recs.online || busy || date == nil)
            if observation != nil { Button("Delete observation") { deleting = true }.buttonStyle(.quiet).disabled(!recs.online || busy) }
        }
        .onAppear {
            guard !loaded else { return }; loaded = true
            guard let observation else { return }
            id = observation.id; kind = observation.s("kind") ?? "compression"; date = observation.s("event_date"); notes = observation.s("notes") ?? ""
            source = observation.s("source_entry_id"); meter = observation.s("meter_basis") ?? ""; hours = observation.s("meter_reading") ?? ""
            let points = observation.row.ownerRows("readings")
            cylinderCount = String(points.compactMap { $0["cylinder"]?.number.map(Int.init) }.max() ?? 4)
            reference = points.first?["reference"]?.text ?? "80"
            for point in points { if let cylinder = point["cylinder"]?.number.map(Int.init), (1...12).contains(cylinder) { readings[cylinder - 1] = point["psi"]?.text ?? ""; referenceReadings[cylinder - 1] = point["reference"]?.text ?? "80" } }
            if case .array(let values)? = observation.row["cylinders"] { cylinders = values.compactMap(\.text).joined(separator: ", ") }
        }
        .confirmationDialog("Delete this observation?", isPresented: $deleting, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                guard let observation else { return }
                busy = true
                Task {
                    do { _ = try await recs.api.ownerWrite(aircraftId: recs.id, path: "engine-history/\(observation.id)", fields: [:], method: "DELETE", query: [.init(name: "base", value: observation.s("updated_at") ?? "")]); dismiss() }
                    catch { self.error = error.localizedDescription }
                    busy = false
                }
            }
        }
    }

    private func save() {
        var body: [String: Any] = ["id": id, "component_id": componentId, "kind": kind, "event_date": date ?? "", "notes": notes]
        if let source { body["source_entry_id"] = source }
        if !meter.isEmpty {
            guard let value = Double(hours), value.isFinite, value >= 0 else { error = "Enter a valid recorded meter reading."; return }
            body["meter_basis"] = meter; body["meter_reading"] = value
        }
        if kind == "compression" {
            guard let count = Int(cylinderCount), (1...12).contains(count) else { error = "Use 1–12 cylinders."; return }
            var values: [[String: Any]] = []
            for index in 0..<count {
                if observation != nil && readings[index].isEmpty { continue }
                guard let ref = Double(observation == nil ? reference : referenceReadings[index]), ref.isFinite, ref > 0, ref <= 120,
                      let value = Double(readings[index]), value.isFinite, value >= 0, value <= ref else {
                    error = "Enter cylinder \(index + 1)'s pressure and its original reference pressure (up to 120 psi)."; return
                }
                values.append(["cylinder": index + 1, "psi": value, "reference": ref])
            }
            guard !values.isEmpty else { error = "Enter at least one cylinder reading."; return }
            body["readings"] = values
        }
        if kind == "cylinder_replacement" {
            let values = cylinders.split(separator: ",").compactMap { Int($0.trimmingCharacters(in: .whitespaces)) }
            guard !values.isEmpty, values.count == cylinders.split(separator: ",").count, values.allSatisfy({ (1...12).contains($0) }), Set(values).count == values.count else { error = "Enter distinct cylinder numbers from 1 to 12."; return }
            body["cylinders"] = values
        }
        if let observation { body["base"] = observation.s("updated_at") ?? "" }
        guard let encoded = try? JSONSerialization.data(withJSONObject: body) else { error = "The observation could not be prepared."; return }
        busy = true; error = nil
        Task {
            do { _ = try await recs.api.ownerWriteEncoded(aircraftId: recs.id, path: observation.map { "engine-history/\($0.id)" } ?? "engine-history", encoded: encoded, method: observation == nil ? "POST" : "PATCH"); dismiss() }
            catch { self.error = error.localizedDescription }
            busy = false
        }
    }
}

private struct EnginePositionSheet: View {
    let recs: Recs
    let componentId: String
    let initial: String
    let base: String
    @Environment(\.dismiss) private var dismiss
    @State private var position = ""
    @State private var busy = false
    @State private var error: String?
    var body: some View {
        RecSheet(title: "Engine position", dirty: position != initial) {
            ChoiceRow(label: "Position", options: [("", "Unspecified"), ("single", "Single"), ("left", "Left"), ("right", "Right"), ("center", "Center")], selection: $position)
            if let error { Note(error, alarm: true) }
            Button(busy ? "Saving" : "Save position") {
                busy = true
                Task {
                    do { _ = try await recs.api.ownerWrite(aircraftId: recs.id, path: "engine-history/components/\(componentId)/position", fields: ["position": position, "base": base]); dismiss() }
                    catch { self.error = error.localizedDescription }
                    busy = false
                }
            }.buttonStyle(.primary).disabled(busy || !recs.online)
        }.onAppear { position = initial }
    }
}

private struct OwnerEngineEvidenceButton: View {
    let recs: Recs
    let inboxId: String?
    let pageId: String?
    @Environment(BooksModel.self) private var books: BooksModel?
    @State private var file: URL?
    @State private var showingPage = false
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        if inboxId != nil || pageId != nil {
            Button(busy ? "Opening source" : "Open source report") {
                if let pageId, books?.page(pageId) != nil { showingPage = true }
                else if let inboxId {
                    busy = true
                    Task {
                        do {
                            let inbox = try JSONDecoder().decode(InboxAnswer.self, from: await recs.api.ownerData(aircraftId: recs.id, path: "inbox"))
                            let name = inbox.items.first { $0["id"]?.text == inboxId }?["file_name"]?.text ?? "Oil report.pdf"
                            file = try ownerFile(await recs.api.ownerData(aircraftId: recs.id, path: "inbox/\(inboxId)/file"), name: name)
                        }
                        catch { self.error = error.localizedDescription }
                        busy = false
                    }
                } else { error = "This page is not on the phone yet. Sync Logbooks, then try again." }
            }.buttonStyle(.quiet).disabled(busy || (inboxId != nil && !recs.online))
                .quickLookPreview($file)
                .sheet(isPresented: $showingPage) {
                    if let books, let pageId { ScanViewerScreen(model: books, pageIds: [pageId], current: pageId) }
                }
            if let error { Note(error, alarm: true) }
        }
    }
}
