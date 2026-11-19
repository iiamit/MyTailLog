import Charts
import SwiftUI

// 06 §8 Aircraft (M-AIRCRAFT-01..06): the aircraft as an object, every value with its source one tap away.
// Port of Android's AircraftScreens.kt.

/// M-AIRCRAFT-01.
struct AircraftHome: View {
    let recs: Recs
    @Environment(\.recNav) private var nav
    @State private var checks: [TimeCheck]?
    @State private var logging = false

    var body: some View {
        let tach = recs.meter("tach"), hobbs = recs.meter("hobbs")
        let components = recs.records("component")
        let wb = recs.records("weight_balance").sorted { ($0.s("revision_date") ?? "") > ($1.s("revision_date") ?? "") }
        let oil = recs.records("oil_addition")
        let samples = recs.records("oil_analysis_sample").sorted { ($0.s("sample_date") ?? "") > ($1.s("sample_date") ?? "") }
        let docs = recs.records("document")
        let plane = recs.offline.rawRow("aircraft", id: recs.id)
        RecLeaf {
            GroupHeader(title: "Hours", count: recs.snapshot?.meters["tach"]?.asOf.map { "read \(dayDate($0))" })
            if tach == nil && hobbs == nil {
                EmptyLine(text: "No hours recorded yet.", action: recs.canEdit ? "Log a flight" : nil) { logging = true }
            } else {
                HStack(spacing: Tokens.Space.s6) {
                    if let tach { MeterFigure(label: "Tach", value: tach) }
                    if let hobbs { MeterFigure(label: "Hobbs", value: hobbs) }
                }
                .padding(.top, Tokens.Space.s3)
                if let e = overhaul("engine_tbo", tach) { Lede("Engine since overhaul · \(hours1(e)) h") }
                if let p = overhaul("prop_overhaul", tach) { Lede("Prop since overhaul · \(hours1(p)) h") }
                RecRow("Readings and meter replacements", action: { nav.open(.hours) })
            }
            if let checks { TimeChecks(recs: recs, checks: checks.filter { !$0.dismissed }) }

            let installed = components.filter { $0.b("is_installed") }
            GroupHeader(title: "Equipment", count: "\(installed.count) installed · \(components.count - installed.count) removed")
            ForEach(installed.prefix(2)) { c in
                RecRow(c.s("name") ?? "", lines: [[c.s("part_number"), c.s("install_date").map { String($0.prefix(4)) }].compactMap { $0 }.joined(separator: " · ")], rec: c)
            }
            RecRow("See all", action: { nav.open(.equipment) })

            let cur = wb.first
            GroupHeader(title: "Weight and balance", count: cur?.s("revision_date").map { String($0.prefix(4)) })
            RecRow(title: cur.map { "\(fmt2($0.d("empty_weight"))) lb · arm \(fmt3($0.d("empty_weight_arm")))" } ?? "No weight and balance on file.",
                   lines: [cur?.d("max_gross_weight").map { "Max gross \(fmtNum($0)) lb" }].compactMap { $0 }, rec: cur, action: { nav.open(.wb) }) {
                EmptyView()
            } below: {
                if let cur, let stale = staleSince(cur, components) { Note("May be stale: \(stale) came after this revision.", alarm: true) }
            }

            GroupHeader(title: "Oil and engine")
            let perQuart = hoursPerQuart(oil.compactMap { o in o.d("tach").map { ($0, o.d("quarts") ?? 0) } })
            let line = [perQuart.map { "Burns about 1 qt in \(fmt1($0)) h" },
                        samples.first.map { s in "last sample \(s.s("sample_date").map { dayDate($0) } ?? "")\(s.s("status").map { ", \($0)" } ?? "")" }]
                .compactMap { $0 }.joined(separator: " · ")
            RecRow(line.isEmpty ? "No oil added or samples on file yet." : line, action: { nav.open(.oil) })

            GroupHeader(title: "Documents")
            let missing = carryAboard.filter { t in !docs.contains { $0.s("type") == t } }
            RecRow(title: "\(docs.count) in the vault", lines: missing.isEmpty ? ["carry-aboard complete"] : [], action: { nav.open(.documents) }) {
                EmptyView()
            } below: {
                if let m = missing.first { Note("\(docTypeName(m)) missing", alarm: true) }
            }

            GroupHeader(title: "Aircraft details")
            let name = [plane?["year"]?.text, plane?["make"]?.text, plane?["model"]?.text].compactMap { $0 }.joined(separator: " ")
            let sub = [plane?["serial_number"]?.text.map { "S/N \($0)" }, plane?["home_base"]?.text].compactMap { $0 }.joined(separator: " · ")
            RecRow(name.isEmpty ? recs.tail : name, lines: sub.isEmpty ? [] : [sub], action: { nav.open(.details) })
            ViewerLine(recs: recs)
            AddButtonRoom()
        }
        .refreshable { await recs.offline.sync() }
        .task(id: "\(recs.online)\(recs.offline.lastSyncAt?.timeIntervalSince1970 ?? 0)") {
            guard recs.online else { return }
            if let c = try? await recs.api.timeChecks(aircraftId: recs.id) { checks = c }
        }
        .fullScreenCover(isPresented: $logging) { LogFlightFlow(recs: recs) }
    }

    /// Time since the last overhaul of the engine or propeller: the meter less the hours its TBO item was last done at.
    private func overhaul(_ kind: String, _ tach: Double?) -> Double? {
        guard let tach, let item = recs.records("maintenance_item").first(where: { $0.s("kind") == kind }),
              let done = recs.due("mx:\(item.id)")?.lastDone?.hours ?? item.d("last_done_hours") else { return nil }
        return tach - done >= 0 ? tach - done : nil
    }
}

private struct MeterFigure: View {
    let label: String
    let value: Double
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Note(label)
            Text(hours1(value)).dFont(.boardTitle).monospacedDigit().foregroundStyle(Tokens.Colors.ink)
        }
        .accessibilityElement(children: .combine)
    }
}

/// Written-versus-calculated time (C-HOURS-06): agreement as a check line, a gap as a soft alarm with the answer.
private struct TimeChecks: View {
    let recs: Recs
    let checks: [TimeCheck]

    var body: some View {
        var seen = Set<String>()
        let latest = checks.filter { seen.insert($0.component).inserted }
        let apart = latest.filter(\.apart)
        if !latest.isEmpty {
            if apart.isEmpty {
                Label { Lede("Written and calculated times agree") } icon: { Icon("circle-check").foregroundStyle(Tokens.Colors.ink) }
                    .padding(.vertical, Tokens.Space.s2)
            }
            ForEach(apart, id: \.entryId) { t in
                Well(alarm: true) {
                    Text("The \(t.component == "prop" ? "propeller" : "engine") log says \(hours1(t.written)) since overhaul; the meters say \(hours1(t.calculated)), \(hours1(t.difference)) h apart."
                         + (t.digitSwap ? " Two digits may be swapped." : "") + " Mention it to your IA; only a new entry can correct the book.")
                        .dFont(.small).fixedSize(horizontal: false, vertical: true)
                    if let p = t.pageLabel { PageCite(label: p) }
                    if recs.canEdit {
                        Button("They agree, dismiss") {
                            let id = newId()
                            recs.change("timeCheck.dismiss", "time_check_dismissal", id, "Time check answered", [
                                "id": id, "component": t.component, "entryId": t.entryId, "written": t.written, "calculated": t.calculated, "action": "agree",
                            ])
                        }
                        .buttonStyle(.secondary)
                    }
                }
            }
        }
    }
}

// MARK: Hours and readings (M-AIRCRAFT-02)

struct HoursScreen: View {
    let recs: Recs
    @State private var correcting: Rec?
    @State private var deleting: Rec?
    @State private var undoing: Rec?
    @State private var replacing = false

    var body: some View {
        let readings = recs.records("hours_reading").sorted { ($0.s("reading_date") ?? "") > ($1.s("reading_date") ?? "") }
        let resets = recs.records("meter_reset").sorted { ($0.s("reset_date") ?? "") > ($1.s("reset_date") ?? "") }
        RecScreen(section: .aircraft, title: "Hours", back: "Aircraft") {
            GroupHeader(title: "Readings", count: "\(readings.count)")
            if readings.isEmpty { EmptyLine(text: "No hours recorded yet.") }
            ForEach(readings.prefix(200)) { r in
                let mine = editableReading(r.s("source")) && recs.canEdit
                RecRow([r.d("tach").map { "Tach \(hours1($0))" }, r.d("hobbs").map { "Hobbs \(hours1($0))" }, r.d("airframe").map { "Airframe \(hours1($0))" }]
                        .compactMap { $0 }.joined(separator: " · "),
                       lines: [[r.s("reading_date").map { dayDate($0) }, readingSource(r.s("source"))].compactMap { $0 }.joined(separator: " · ")],
                       rec: r, action: mine ? { correcting = r } : nil,
                       menu: mine ? [RowAction(title: "Correct this reading") { correcting = r }, RowAction(title: "Delete", role: .destructive) { deleting = r }] : [])
            }
            GroupHeader(title: "Meter replacements")
            if resets.isEmpty { Note("No meter replacements.").padding(.vertical, Tokens.Space.s2) }
            ForEach(resets) { m in
                RecRow(title: "\((m.s("meter") ?? "tach").capitalized) replaced \(m.s("reset_date").map(longDate) ?? ""): \(m.d("prior_value").map(fmt1) ?? "?") → \(fmt1(m.d("new_value")))",
                       rec: m) {
                    EmptyView()
                } below: {
                    if recs.canEdit { Button("Undo this replacement") { undoing = m }.buttonStyle(.quiet) }
                }
            }
            if recs.canEdit { Button("Record a meter replacement") { replacing = true }.buttonStyle(.secondary).padding(.top, Tokens.Space.s3) }
        }
        .sheet(item: $correcting) { CorrectReading(recs: recs, r: $0) }
        .sheet(isPresented: $replacing) { ReplaceMeter(recs: recs) }
        .confirmationDialog("Delete the \(deleting?.s("reading_date").map { dayDate($0) } ?? "") reading?", isPresented: Binding { deleting != nil } set: { if !$0 { deleting = nil } },
                            titleVisibility: .visible, presenting: deleting) { r in
            Button("Delete", role: .destructive) { recs.delete("reading.delete", "hours_reading", r.id, "Delete reading", ["readingId": r.id]) }
        } message: { _ in Text("Items counted from it will move.") }
        .confirmationDialog("Undo this meter replacement?", isPresented: Binding { undoing != nil } set: { if !$0 { undoing = nil } },
                            titleVisibility: .visible, presenting: undoing) { m in
            Button("Undo this replacement", role: .destructive) { recs.delete("meterReset.delete", "meter_reset", m.id, "Undo meter replacement", ["resetId": m.id]) }
        } message: { _ in Text("Readings after it will be counted as if the old meter kept running.") }
    }
}

private struct CorrectReading: View {
    let recs: Recs
    let r: Rec
    @Environment(\.dismiss) private var dismiss
    @State private var date: String?
    @State private var tach = ""
    @State private var hobbs = ""

    var body: some View {
        RecSheet(title: "Correct this reading") {
            DateRow(label: "Date", date: $date)
            TextBox(label: "Tach", text: $tach, number: true, placeholder: "Leave blank")
            TextBox(label: "Hobbs", text: $hobbs, number: true, placeholder: "Leave blank")
            Button("Save correction") {
                recs.change("reading.update", "hours_reading", r.id, "Correct reading", payload(["readingId": r.id, "date": date, "tach": num(tach), "hobbs": num(hobbs)]))
                dismiss()
            }
            .buttonStyle(.primary).padding(.top, Tokens.Space.s3)
            .disabled(date == nil || (num(tach) == nil && num(hobbs) == nil))
        }
        .presentationDetents([.medium, .large])
        .onAppear { date = r.s("reading_date"); tach = fmt1(r.d("tach")); hobbs = fmt1(r.d("hobbs")) }
    }
}

/// "Was the tach replaced?" outside a flight: the meter, the day, the last and first values (meterReset.create).
struct ReplaceMeter: View {
    let recs: Recs
    @Environment(\.dismiss) private var dismiss
    @State private var meter = 0
    @State private var date: String? = todayISO()
    @State private var old = ""
    @State private var new = ""
    @State private var notes = ""

    var body: some View {
        RecSheet(title: "Record a meter replacement") {
            Segments(label: "Meter", options: ["Tach", "Hobbs"], selection: $meter)
            DateRow(label: "New meter from", date: $date)
            TextBox(label: "Old meter's last reading", text: $old, number: true)
            TextBox(label: "New meter's first reading", text: $new, number: true)
            TextBox(label: "Notes", text: $notes)
            Button("Save") {
                let id = newId(), n = notes.trimmingCharacters(in: .whitespacesAndNewlines)
                recs.change("meterReset.create", "meter_reset", id, "Meter replaced", payload([
                    "id": id, "meter": meter == 1 ? "hobbs" : "tach", "date": date, "prior": num(old), "next": num(new) ?? 0, "notes": n.isEmpty ? nil : n,
                ]))
                dismiss()
            }
            .buttonStyle(.primary).padding(.top, Tokens.Space.s3)
            .disabled(date == nil || num(new) == nil)
        }
        .presentationDetents([.medium, .large])
        .onAppear { old = fmt1(recs.meter("tach")); new = "0.0" }
        .onChange(of: meter) { _, m in old = fmt1(recs.meter(m == 1 ? "hobbs" : "tach")) }
    }
}

// MARK: Equipment (M-AIRCRAFT-03)

struct EquipmentScreen: View {
    let recs: Recs
    @Environment(\.recNav) private var nav
    @State private var scanning = false

    var body: some View {
        let all = recs.records("component")
        let proposals = recs.records("equipment_proposal")
        let ads = recs.records("ad_compliance")
        let installed = all.filter { $0.b("is_installed") }.sorted { ($0.s("name") ?? "") < ($1.s("name") ?? "") }
        let removed = all.filter { !$0.b("is_installed") }.sorted { ($0.s("removal_date") ?? "") > ($1.s("removal_date") ?? "") }
        RecScreen(section: .aircraft, title: "Equipment", back: "Aircraft") {
            if !proposals.isEmpty {
                GroupHeader(title: "Found in your logbooks", count: "\(proposals.count)")
                ForEach(proposals) { p in
                    RecRow(title: p.s("name") ?? "", lines: [[p.s("make"), p.s("part_number"), p.s("install_date").map { String($0.prefix(4)) }].compactMap { $0 }.joined(separator: " · ")],
                           rec: p) {
                        EmptyView()
                    } below: {
                        TrustMark(level: .aiRead, label: "Read by AI")
                        if recs.canEdit {
                            HStack(spacing: Tokens.Space.s2) {
                                Button("Not on this aircraft") {
                                    recs.change("proposals.dismiss", "equipment_proposal", p.id, "Not on this aircraft: \(p.s("name") ?? "")", ["proposalIds": [p.id]])
                                }.buttonStyle(.secondary)
                                Button("Add to equipment") {
                                    recs.change("proposals.confirm", "equipment_proposal", p.id, "Add to equipment: \(p.s("name") ?? "")", ["proposalIds": [p.id]])
                                }.buttonStyle(.primary)
                            }
                        }
                    }
                }
            }
            GroupHeader(title: "Installed", count: "\(installed.count)")
            if installed.isEmpty { Note("No equipment recorded yet.").padding(.vertical, Tokens.Space.s2) }
            ForEach(installed) { c in
                let linked = ads.filter { $0.s("component_id") == c.id }.count
                RecRow(c.s("name") ?? "", lines: [[c.s("part_number"), c.s("install_date").map { String($0.prefix(4)) }, linked > 0 ? "\(linked) AD\(linked > 1 ? "s" : "")" : nil]
                                                    .compactMap { $0 }.joined(separator: " · ")],
                       rec: c, action: recs.canEdit ? { nav.open(.component(c.id)) } : nil)
            }
            if !removed.isEmpty {
                GroupHeader(title: "Removed", count: "\(removed.count)")
                ForEach(removed) { c in
                    RecRow(title: c.s("name") ?? "", lines: ["removed \(c.s("removal_date").map { String($0.prefix(4)) } ?? "")"], rec: c) {
                        EmptyView()
                    } below: {
                        if recs.canEdit {
                            Button("Reinstalled") { recs.change("component.reinstall", "component", c.id, "Reinstalled \(c.s("name") ?? "")", ["componentId": c.id]) }
                                .buttonStyle(.quiet)
                        }
                    }
                }
            }
            if recs.canEdit {
                Button("Record an installation") { nav.open(.component("new")) }.buttonStyle(.secondary).padding(.top, Tokens.Space.s4)
                Button(scanning ? "Reading your logbooks" : "Find equipment in the logbooks") { scan() }.buttonStyle(.quiet).disabled(!recs.online || scanning)
                if !recs.online { Note("Reading your logbooks needs signal.") }
            }
        }
    }

    private func scan() {
        scanning = true
        Task {
            do {
                let n = try await recs.api.scanEquipment(aircraftId: recs.id)
                await recs.offline.sync()
                recs.say("Found \(n) to check under Found in your logbooks.")
            } catch {
                recs.say((error as? RecordsAPI.Failure)?.message ?? "Reading your logbooks needs signal.")
            }
            scanning = false
        }
    }
}

struct ComponentEditor: View {
    let recs: Recs
    let id: String
    @Environment(\.recNav) private var nav
    @State private var loaded = false
    @State private var name = ""
    @State private var make = ""
    @State private var category = ""
    @State private var pn = ""
    @State private var sn = ""
    @State private var installed: String?
    @State private var entry: String?
    @State private var life = ""
    @State private var unit = "hours"
    @State private var notes = ""
    @State private var removing = false
    @State private var deleting = false

    private var c0: Rec? { id == "new" ? nil : recs.rec("component", id) }

    var body: some View {
        RecScreen(section: .aircraft, title: c0?.s("name") ?? "Record an installation", back: "Equipment") {
            TextBox(label: "Name", text: $name)
            TextBox(label: "Manufacturer", text: $make)
            TextBox(label: "Type", text: $category)
            TextBox(label: "Part number", text: $pn)
            TextBox(label: "Serial number", text: $sn)
            DateRow(label: "Installed on", date: $installed, clearable: true)
            EntryChoice(recs: recs, label: "Entry that records it", selected: $entry)
            HStack(alignment: .bottom, spacing: Tokens.Space.s2) {
                TextBox(label: "Life limit", text: $life, number: true)
                ChoiceRow(label: "Unit", options: [("hours", "Hours"), ("months", "Months"), ("cycles", "Cycles")], selection: $unit)
            }
            TextBox(label: "Notes", text: $notes, lines: 2)
            if let c0, c0.b("is_installed") {
                Button("Removed from the aircraft") { removing = true }.buttonStyle(.secondary).padding(.top, Tokens.Space.s3)
            }
            if c0 != nil { Button("Delete: it was never on this aircraft") { deleting = true }.buttonStyle(.quiet) }
        } footer: {
            Button("Save", action: save).buttonStyle(.primary).disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .onAppear(perform: load)
        .sheet(isPresented: $removing) { RemoveComponent(recs: recs, id: id, name: c0?.s("name") ?? "") { nav.back() } }
        .confirmationDialog("Delete \(c0?.s("name") ?? "")?", isPresented: $deleting, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                recs.delete("component.delete", "component", id, "Delete \(c0?.s("name") ?? "")", ["componentId": id])
                nav.back()
            }
        } message: { Text("Use this only for a mistake. If it was taken off, mark it removed instead so its history stays.") }
    }

    private func load() {
        guard !loaded else { return }
        loaded = true
        guard let c = c0 else { return }
        name = c.s("name") ?? ""; make = c.s("make") ?? ""; category = c.s("category") ?? ""; pn = c.s("part_number") ?? ""
        sn = c.s("serial_number") ?? ""; installed = c.s("install_date"); entry = c.s("install_entry_id")
        life = fmtNum(c.d("life_limit_value")); unit = c.s("life_limit_unit") ?? "hours"; notes = c.s("notes") ?? ""
    }

    private func save() {
        func t(_ s: String) -> String? { let v = s.trimmingCharacters(in: .whitespacesAndNewlines); return v.isEmpty ? nil : v }
        let comp = payload([
            "name": name.trimmingCharacters(in: .whitespaces), "make": t(make), "category": t(category), "part_number": t(pn), "serial_number": t(sn),
            "install_date": installed, "install_entry_id": entry, "life_limit_value": num(life), "life_limit_unit": num(life) != nil ? unit : nil, "notes": t(notes),
        ])
        let rowId = c0?.id ?? newId()
        recs.change("component.upsert", "component", rowId, name.trimmingCharacters(in: .whitespaces),
                    c0 != nil && recs.onServer("component", rowId) ? ["id": rowId, "component": comp] : ["component": comp])
        recs.say(recs.savedWord)
        nav.back()
    }
}

private struct RemoveComponent: View {
    let recs: Recs
    let id: String
    let name: String
    let done: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var date: String? = todayISO()
    @State private var entry: String?

    var body: some View {
        RecSheet(title: "Removed from the aircraft") {
            DateRow(label: "Date", date: $date)
            EntryChoice(recs: recs, label: "Entry that records it", selected: $entry)
            Note("Its ADs stop applying from that date.").padding(.vertical, Tokens.Space.s2)
            Button("Mark removed") {
                recs.change("component.remove", "component", id, "Removed \(name)", payload(["componentId": id, "date": date, "entryId": entry]))
                dismiss()
                done()
            }
            .buttonStyle(.primary).disabled(date == nil)
        }
        .presentationDetents([.medium])
    }
}

// MARK: Weight and balance (M-AIRCRAFT-04)

struct WeightBalanceScreen: View {
    let recs: Recs
    @State private var editing: Rec?
    @State private var adding = false

    var body: some View {
        let revs = recs.records("weight_balance").sorted { ($0.s("revision_date") ?? "") > ($1.s("revision_date") ?? "") }
        let components = recs.records("component")
        RecScreen(section: .aircraft, title: "Weight and balance", back: "Aircraft") {
            if let r = revs.first {
                GroupHeader(title: "Current weighing", count: r.s("revision_date").map(longDate))
                WbLine(label: "Empty weight", value: "\(fmt2(r.d("empty_weight"))) lb")
                WbLine(label: "Arm", value: "\(fmt3(r.d("empty_weight_arm"))) in")
                WbLine(label: "Moment", value: fmt2(moment(r.d("empty_weight"), r.d("empty_weight_arm"), given: r.d("empty_weight_moment"))))
                WbLine(label: "Max gross", value: r.d("max_gross_weight").map { "\(fmtNum($0)) lb" } ?? "—")
                WbLine(label: "Useful load", value: r.d("max_gross_weight").flatMap { g in r.d("empty_weight").map { "\(fmt2(g - $0)) lb" } } ?? "—")
                Note([r.s("method"), r.s("reference"), r.s("reason")].compactMap { $0 }.joined(separator: " · ")).padding(.top, Tokens.Space.s2)
                PendingCaption(rec: r)
                if let pid = r.s("source_page_id"), let seq = recs.offline.rawRow("page", id: pid)?["page_sequence"]?.text {
                    PageCite(label: "p. \(seq)").padding(.top, Tokens.Space.s2)
                }
                if let stale = staleSince(r, components) { Well(alarm: true) { Text("Equipment changed since this weighing: \(stale).").dFont(.small) } }
                if recs.canEdit { Button("Edit") { editing = r }.buttonStyle(.quiet) }
            } else {
                EmptyLine(text: "No weight and balance on file.", action: recs.canEdit ? "Add a revision" : nil) { adding = true }
            }
            if revs.count > 1 {
                GroupHeader(title: "Earlier revisions")
                ForEach(revs.dropFirst()) { r in
                    RecRow("\((r.s("revision_date") ?? "").prefix(4)) \(r.s("method") ?? "") \(fmt2(r.d("empty_weight"))) lb", lines: [r.s("reason")].compactMap { $0 },
                           rec: r, action: recs.canEdit ? { editing = r } : nil)
                }
            }
            if recs.canEdit && !revs.isEmpty { Button("Add a revision") { adding = true }.buttonStyle(.secondary).padding(.top, Tokens.Space.s4) }
        }
        .sheet(isPresented: $adding) { WbForm(recs: recs, r: nil) }
        .sheet(item: $editing) { WbForm(recs: recs, r: $0) }
    }
}

private struct WbLine: View {
    let label: String
    let value: String
    var body: some View {
        HStack {
            Text(label).dFont(.body).foregroundStyle(Tokens.Colors.ink)
            Spacer()
            Text(value).dFont(.bodyStrong).monospacedDigit().foregroundStyle(Tokens.Colors.ink)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

private struct WbForm: View {
    let recs: Recs
    let r: Rec?
    @Environment(\.dismiss) private var dismiss
    @State private var date: String? = todayISO()
    @State private var weight = ""
    @State private var arm = ""
    @State private var gross = ""
    @State private var method = 0
    @State private var reason = ""
    @State private var deleting = false

    var body: some View {
        RecSheet(title: r == nil ? "Add a revision" : "Revision") {
            DateRow(label: "Date", date: $date)
            TextBox(label: "Empty weight (lb)", text: $weight, number: true)
            TextBox(label: "Arm (in)", text: $arm, number: true)
            Note("Moment, computed: \(fmt2(moment(num(weight), num(arm))))")
            TextBox(label: "Max gross (lb)", text: $gross, number: true)
            Segments(label: "Method", options: ["Weighed", "Computed"], selection: $method)
            TextBox(label: "Reason", text: $reason)
            Button("Save", action: save).buttonStyle(.primary).padding(.top, Tokens.Space.s2).disabled(num(weight) == nil)
            if r != nil { Button("Delete") { deleting = true }.buttonStyle(.quiet) }
        }
        .onAppear {
            guard let r else { return }
            date = r.s("revision_date") ?? todayISO(); weight = fmtNum(r.d("empty_weight")); arm = fmtNum(r.d("empty_weight_arm"))
            gross = fmtNum(r.d("max_gross_weight")); method = r.s("method") == "computed" ? 1 : 0; reason = r.s("reason") ?? ""
        }
        .confirmationDialog("Delete this revision?", isPresented: $deleting, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                if let r { recs.delete("wb.delete", "weight_balance", r.id, "Delete W&B revision", ["wbId": r.id]) }
                dismiss()
            }
        }
    }

    private func save() {
        let why = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        let fields = payload([
            "revision_date": date ?? todayISO(), "empty_weight": num(weight), "empty_weight_arm": num(arm), "empty_weight_moment": moment(num(weight), num(arm)),
            "max_gross_weight": num(gross), "method": method == 1 ? "computed" : "weighed", "reason": why.isEmpty ? nil : why,
            "reference": r?.s("reference"), "notes": r?.s("notes"), "source_page_id": r?.s("source_page_id"),
        ])
        let rowId = r?.id ?? newId()
        recs.change("wb.upsert", "weight_balance", rowId, "Weight and balance \(date ?? "")",
                    r != nil && recs.onServer("weight_balance", rowId) ? ["id": rowId, "fields": fields] : ["fields": fields])
        dismiss()
    }
}

// MARK: Oil and engine (M-AIRCRAFT-05)

private let labElements = ["Fe", "Cu", "Al", "Cr", "Ni", "Pb", "Si"]

struct OilScreen: View {
    let recs: Recs
    @State private var deleting: Rec?
    @State private var adding = false

    var body: some View {
        let adds = recs.records("oil_addition").sorted { ($0.s("added_date") ?? "") > ($1.s("added_date") ?? "") }
        let samples = recs.records("oil_analysis_sample").sorted { ($0.s("sample_date") ?? "") > ($1.s("sample_date") ?? "") }
        let pts = adds.compactMap { o in o.d("tach").map { (tach: $0, quarts: o.d("quarts") ?? 0) } }
        RecScreen(section: .aircraft, title: "Oil and engine", back: "Aircraft") {
            GroupHeader(title: "How much it drinks")
            if let perQuart = hoursPerQuart(pts) {
                HStack(alignment: .firstTextBaseline, spacing: Tokens.Space.s2) {
                    Text(fmt1(perQuart)).dFont(.boardTitle).monospacedDigit().foregroundStyle(Tokens.Colors.ink)
                    Lede("hours per quart")
                }
                .accessibilityElement(children: .combine)
                .padding(.top, Tokens.Space.s2)
                let bars = burnIntervals(pts)
                if bars.count >= 2 { BurnChart(bars: bars) }
            } else {
                Note("Two top-offs with a tach reading show how much it drinks.").padding(.vertical, Tokens.Space.s2)
            }
            if recs.canEdit {
                Button { adding = true } label: { Label { Text("Add oil") } icon: { Icon("droplet", size: 18) } }
                    .buttonStyle(.secondary).padding(.top, Tokens.Space.s2)
            }
            GroupHeader(title: "Oil added", count: "\(adds.count)")
            ForEach(adds) { o in
                RecRow("\(fmtNum(o.d("quarts"))) qt", lines: [[o.s("added_date").map(longDate), o.d("tach").map { "tach \(fmt1($0))" }, o.s("notes")].compactMap { $0 }.joined(separator: " · ")],
                       rec: o, menu: recs.canEdit ? [RowAction(title: "Delete", role: .destructive) { deleting = o }] : [])
            }
            GroupHeader(title: "What the lab found")
            if samples.isEmpty {
                Note("No oil analysis on file. Scan a lab report into Documents and it is read here.").padding(.vertical, Tokens.Space.s2)
            } else {
                LabTable(samples: Array(samples.prefix(4)))
            }
        }
        .sheet(isPresented: $adding) { AddOilSheet(recs: recs) }
        .confirmationDialog("Delete the \(fmtNum(deleting?.d("quarts"))) qt added \(deleting?.s("added_date").map { dayDate($0) } ?? "")?",
                            isPresented: Binding { deleting != nil } set: { if !$0 { deleting = nil } }, titleVisibility: .visible, presenting: deleting) { o in
            Button("Delete", role: .destructive) { recs.delete("oil.delete", "oil_addition", o.id, "Delete oil top-off", ["additionId": o.id]) }
        }
    }
}

/// Hours per quart over the last intervals: ink bars, labelled ends (one series, no legend).
private struct BurnChart: View {
    let bars: [Double]
    var body: some View {
        Chart(Array(bars.enumerated()), id: \.offset) { i, v in
            BarMark(x: .value("Top-off", i), y: .value("Hours per quart", v)).foregroundStyle(Tokens.Colors.ink)
        }
        .chartXAxis {
            AxisMarks(values: [0, bars.count - 1]) { v in
                AxisValueLabel { Text(v.as(Int.self) == 0 ? "older" : "latest").dFont(.caption).foregroundStyle(Tokens.Colors.ink3) }
            }
        }
        .chartYAxis { AxisMarks(position: .leading, values: .automatic(desiredCount: 2)) { AxisValueLabel().foregroundStyle(Tokens.Colors.ink3) } }
        .frame(height: 96)
        .padding(.vertical, Tokens.Space.s2)
        .accessibilityElement()
        .accessibilityLabel("Hours per quart over the last \(bars.count) top-offs, from \(fmt1(bars.first)) to \(fmt1(bars.last))")
    }
}

private struct LabTable: View {
    let samples: [Rec]
    var body: some View {
        Grid(alignment: .trailing, horizontalSpacing: Tokens.Space.s2, verticalSpacing: 4) {
            GridRow {
                Text("").gridColumnAlignment(.leading)
                ForEach(samples) { Text($0.s("sample_date").map { dayDate($0) } ?? "").dFont(.caption).foregroundStyle(Tokens.Colors.ink3) }
            }
            ForEach(labElements, id: \.self) { el in
                GridRow {
                    Text(el).dFont(.bodyStrong)
                    ForEach(samples) { s in
                        let v: String? = if case .object(let o)? = s.row["elements_ppm"] { o[el]?.text } else { nil }
                        Text(v ?? "—").dFont(.body).monospacedDigit()
                    }
                }
                .foregroundStyle(Tokens.Colors.ink)
            }
        }
        .padding(.top, Tokens.Space.s2)
        if let c = samples.first?.s("lab_comments") { Note(c).padding(.top, Tokens.Space.s2) }
    }
}

/// M-FLIGHT-05 Add oil: quarts, date, an optional tach, notes. Saves without creating a reading.
struct AddOilSheet: View {
    let recs: Recs
    @Environment(\.dismiss) private var dismiss
    @State private var q = 1
    @State private var other = ""
    @State private var date: String? = todayISO()
    @State private var withTach = false
    @State private var tach = ""
    @State private var notes = ""

    private var quarts: Double? { [0.5, 1, 2][safe: q] ?? num(other) }

    var body: some View {
        RecSheet(title: "Add oil") {
            Note("Quarts").padding(.top, Tokens.Space.s2)
            Segments(label: "Quarts", options: ["½", "1", "2", "Other"], selection: $q)
            if q == 3 { TextBox(label: "Quarts", text: $other, number: true, placeholder: "0.5") }
            DateRow(label: "Date", date: $date)
            if withTach { TextBox(label: "Tach", text: $tach, number: true) }
            else { Button("Add the tach reading") { withTach = true; tach = fmt1(recs.meter("tach")) }.buttonStyle(.quiet) }
            TextBox(label: "Notes", text: $notes, placeholder: "Phillips XC 20W-50")
            Button { save() } label: { Label { Text("Add oil") } icon: { Icon("droplet", size: 18) } }
                .buttonStyle(.primary).padding(.top, Tokens.Space.s2)
                .disabled((quarts ?? 0) <= 0 || date == nil)
        }
        .presentationDetents([.medium, .large])
    }

    private func save() {
        guard let quarts else { return }
        let id = newId(), n = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        guard recs.change("oil.create", "oil_addition", id, "Oil, \(fmtNum(quarts)) qt", payload([
            "id": id, "date": date, "quarts": quarts, "tach": withTach ? num(tach) : nil, "notes": n.isEmpty ? nil : n,
        ])) != nil else { return }
        recs.say("\(fmtNum(quarts)) qt added. \(recs.savedWord)")
        dismiss()
    }
}

extension Array {
    subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}

// MARK: Details (M-AIRCRAFT-06)

struct DetailsScreen: View {
    let recs: Recs
    @State private var loaded = false
    @State private var make = ""
    @State private var model = ""
    @State private var year = ""
    @State private var serial = ""
    @State private var engines = ""
    @State private var props = ""
    @State private var base = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        let editable = recs.isOwner
        RecScreen(section: .aircraft, title: "Aircraft details", back: "Aircraft") {
            TextBox(label: "Make", text: $make, disabled: !editable)
            TextBox(label: "Model", text: $model, disabled: !editable)
            TextBox(label: "Year", text: $year, number: true, disabled: !editable)
            TextBox(label: "Serial number", text: $serial, disabled: !editable)
            TextBox(label: "Engine serials", text: $engines, disabled: !editable)
            TextBox(label: "Propeller serials", text: $props, disabled: !editable)
            TextBox(label: "Home base", text: $base, disabled: !editable)
            if let error { Note(error, alarm: true) }
            if !editable { Note("Only the owner can change these details.") }
            Note("Transfer, delete and backups are on the web for now, under Aircraft details.").padding(.top, Tokens.Space.s4)
        } footer: {
            if editable {
                Button(busy ? "Saving" : "Save", action: save).buttonStyle(.primary)
                    .disabled(!recs.online || busy || (!year.isEmpty && Int(year) == nil))
                if !recs.online { Note("Saving details needs signal.") }
            }
        }
        .onAppear {
            guard !loaded else { return }
            loaded = true
            let a = recs.offline.rawRow("aircraft", id: recs.id)
            func list(_ k: String) -> String { if case .array(let v)? = a?[k] { v.compactMap(\.text).joined(separator: ", ") } else { "" } }
            make = a?["make"]?.text ?? ""; model = a?["model"]?.text ?? ""; year = a?["year"]?.text ?? ""; serial = a?["serial_number"]?.text ?? ""
            engines = list("engine_serials"); props = list("prop_serials"); base = a?["home_base"]?.text ?? ""
        }
    }

    private func save() {
        func t(_ s: String) -> String? { let v = s.trimmingCharacters(in: .whitespaces); return v.isEmpty ? nil : v }
        func arr(_ s: String) -> [String] { s.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty } }
        busy = true
        error = nil
        Task {
            do {
                try await recs.api.saveDetails(aircraftId: recs.id, fields: payload([
                    "make": t(make), "model": t(model), "year": Int(year), "serial_number": t(serial),
                    "engine_serials": arr(engines), "prop_serials": arr(props), "home_base": t(base),
                ]))
                await recs.offline.sync()
                recs.say("Saved.")
            } catch {
                self.error = (error as? RecordsAPI.Failure)?.message ?? "Saving details needs signal."
            }
            busy = false
        }
    }
}
