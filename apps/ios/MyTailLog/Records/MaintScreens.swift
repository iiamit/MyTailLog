import SwiftUI

// 06 §5 Maintenance: Items · ADs · Squawks (M-MAINT-01..07), from this phone's copy, every write through the outbox.
// Port of Android's MaintScreens.kt.

enum MaintView: Int { case items, ads, squawks }

/// The Maint. tab: the three views under a segmented control (06 §5). The first visit opens on Squawks if any is open.
struct MaintHome: View {
    let recs: Recs
    @State private var view: MaintView?

    var body: some View {
        let open = recs.records("squawk").filter { $0.s("status") != "resolved" }.count
        let shown = view ?? (open > 0 ? .squawks : .items)
        VStack(spacing: Tokens.Space.s2) {
            Picker("Maintenance views", selection: Binding { shown } set: { view = $0 }) {
                Text("Items").tag(MaintView.items)
                Text("ADs").tag(MaintView.ads)
                Text(open > 0 ? "Squawks \(open)" : "Squawks").tag(MaintView.squawks)
                    .accessibilityLabel(open > 0 ? "Squawks, \(open) open" : "Squawks")
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, Tokens.Space.s4)
            RecLeaf {
                switch shown {
                case .items: ItemsView(recs: recs)
                case .ads: AdsView(recs: recs)
                case .squawks: SquawksView(recs: recs)
                }
                ViewerLine(recs: recs)
                AddButtonRoom()
            }
            .refreshable { await recs.offline.sync() }
        }
    }
}

/// 06 §1.5: the line at the end of each top-level leaf for viewers and the demo.
struct ViewerLine: View {
    let recs: Recs
    var body: some View {
        if !recs.canEdit {
            Note(recs.aircraft.isDemo ? "This is the demo aircraft. Add your own from the hangar." : "You can view \(recs.tail). The owner can make changes.")
                .padding(.top, Tokens.Space.s4)
        }
    }
}

// MARK: Squawks (M-MAINT-05)

private struct SquawksView: View {
    let recs: Recs
    @Environment(\.recNav) private var nav
    @State private var showResolved = false

    var body: some View {
        let squawks = recs.records("squawk")
        let photos = recs.records("squawk_photo")
        let waiting = squawks.filter { $0.pending && !recs.onServer("squawk", $0.id) }
        let waitingIds = Set(waiting.map(\.id))
        let open = squawks.filter { $0.s("status") != "resolved" && !waitingIds.contains($0.id) }
            .sorted { a, b in
                let sa = severities.firstIndex(of: a.s("severity") ?? "") ?? -1, sb = severities.firstIndex(of: b.s("severity") ?? "") ?? -1
                return sa != sb ? sa > sb : (a.s("reported_at") ?? "") > (b.s("reported_at") ?? "")
            }
        let resolved = squawks.filter { $0.s("status") == "resolved" && !waitingIds.contains($0.id) }.sorted { ($0.s("resolved_at") ?? "") > ($1.s("resolved_at") ?? "") }
        if squawks.isEmpty {
            EmptyLine(text: "Nothing open. Report one with the add button when you notice something.")
        } else {
            if !waiting.isEmpty {
                GroupHeader(title: "Waiting to upload", count: "\(waiting.count)")
                ForEach(waiting) { SquawkRow(recs: recs, s: $0, photos: photos) }
            }
            GroupHeader(title: "Open", count: "\(open.count)")
            if open.isEmpty { Note("Nothing open. Report one with the add button when you notice something.").padding(.vertical, Tokens.Space.s3) }
            ForEach(open) { SquawkRow(recs: recs, s: $0, photos: photos) }
            if !resolved.isEmpty {
                RecRow("Resolved \(resolved.count)", action: { showResolved.toggle() }) {
                    Icon(showResolved ? "chevron-up" : "chevron-down").foregroundStyle(Tokens.Colors.ink)
                }
                .accessibilityHint(showResolved ? "Hides resolved squawks" : "Shows resolved squawks")
                if showResolved { ForEach(resolved) { SquawkRow(recs: recs, s: $0, photos: photos) } }
            }
        }
    }
}

private struct SquawkRow: View {
    let recs: Recs
    let s: Rec
    let photos: [Rec]
    @Environment(\.recNav) private var nav
    @State private var resolving = false
    @State private var deleting = false

    var body: some View {
        let lines = (s.s("description") ?? "").split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        let rest = lines.dropFirst().joined(separator: " ").trimmingCharacters(in: .whitespaces)
        var menu: [RowAction] = []
        if recs.canEdit && s.s("status") != "resolved" { menu.append(RowAction(title: "Resolve") { resolving = true }) }
        menu.append(RowAction(title: "Copy") { copyText(s.s("description") ?? "", recs) })
        if recs.canEdit { menu.append(RowAction(title: "Delete", role: .destructive) { deleting = true }) }
        return RecRow(lines.first ?? "", lines: [rest.isEmpty ? nil : String(rest.prefix(160)),
                                                 squawkMeta(severity: s.s("severity"), reportedAt: s.s("reported_at"), reporter: s.s("reporter_name"),
                                                            photos: photos.filter { $0.s("squawk_id") == s.id }.count)].compactMap { $0 },
                      rec: s, action: { nav.open(.squawk(s.id)) }, menu: menu) {
            StatusMark(kind: severityMark(s.s("severity")), label: severityWord(s.s("severity")), compact: true)
        }
        .sheet(isPresented: $resolving) { ResolveSheet(recs: recs, s: s) }
        .modifier(DeleteSquawk(recs: recs, s: s, asking: $deleting))
    }
}

private struct DeleteSquawk: ViewModifier {
    let recs: Recs
    let s: Rec
    @Binding var asking: Bool
    var then: () -> Void = {}

    func body(content: Content) -> some View {
        content.confirmationDialog("Delete this squawk?", isPresented: $asking, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                recs.delete("squawk.delete", "squawk", s.id, "Delete squawk", ["squawkId": s.id])
                recs.say("Squawk deleted.")
                then()
            }
            Button("Cancel", role: .cancel) {}
        } message: { Text("Resolving keeps its history; deleting removes it.") }
    }
}

/// Mark resolved (M-MAINT-02): date, the clearing entry, what was done. Never resolves silently.
struct ResolveSheet: View {
    let recs: Recs
    let s: Rec
    @Environment(\.dismiss) private var dismiss
    @State private var date: String? = todayISO()
    @State private var entry: String?
    @State private var notes = ""

    var body: some View {
        RecSheet(title: "Mark resolved", dirty: !notes.trimmingCharacters(in: .whitespaces).isEmpty, discardWhat: "resolution") {
            DateRow(label: "When was it fixed?", date: $date)
            EntryChoice(recs: recs, label: "Which entry cleared it?", selected: $entry)
            TextBox(label: "What was done (optional)", text: $notes, lines: 3)
            Button("Resolve") {
                let note = notes.trimmingCharacters(in: .whitespacesAndNewlines)
                recs.change("squawk.resolve", "squawk", s.id, "Resolve squawk", payload([
                    "squawkId": s.id, "resolvedAt": date ?? todayISO(), "resolvedEntryId": entry, "resolutionNotes": note.isEmpty ? nil : note,
                ]))
                recs.say("Resolved.", action: "Undo") { [recs, s] in
                    recs.change("squawk.reopen", "squawk", s.id, "Reopen squawk", ["squawkId": s.id])
                }
                dismiss()
            }
            .buttonStyle(.primary)
            .padding(.top, Tokens.Space.s3)
        }
        .presentationDetents([.medium, .large])
    }
}

// MARK: Squawk detail (M-MAINT-02)

struct SquawkDetail: View {
    let recs: Recs
    let id: String
    @Environment(\.recNav) private var nav
    @State private var resolving = false
    @State private var sending = false
    @State private var editing = false
    @State private var deleting = false
    @State private var adding = false

    var body: some View {
        if let s = recs.rec("squawk", id) {
            let photos = recs.records("squawk_photo").filter { $0.s("squawk_id") == id }
            let resolved = s.s("status") == "resolved"
            let text = s.s("description") ?? ""
            RecScreen(section: .maint, title: text.split(separator: "\n").first.map(String.init) ?? "Squawk", back: "Squawks") {
                Note("\(resolved ? "Resolved" : "Open") · \(severityWord(s.s("severity")))")
                Note(squawkReported(reportedAt: s.s("reported_at"), reporter: s.s("reporter_name"), photos: photos.count)).padding(.top, 2)
                PendingCaption(rec: s)
                PhotoStrip(recs: recs, photoIds: photos.map(\.id),
                           add: recs.canEdit || s.s("reported_by") == recs.offline.userId ? { adding = true } : nil)
                Text(text).dFont(.body).foregroundStyle(Tokens.Colors.ink).textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true).padding(.vertical, Tokens.Space.s3)
                if resolved {
                    GroupHeader(title: "Resolution")
                    Lede([s.s("resolved_at").map { "Resolved \(dayDate($0))" }, s.s("resolution_notes")].compactMap { $0 }.joined(separator: ". "))
                        .padding(.top, Tokens.Space.s2)
                    if let cite = recs.pageLabel(s.s("resolved_log_entry_id")) {
                        HStack(spacing: Tokens.Space.s1) { Note("cleared by"); PageCite(label: cite) }.padding(.top, Tokens.Space.s2)
                    }
                } else if recs.canEdit {
                    GroupHeader(title: "When it is fixed")
                    RecRow("Link the entry that cleared it", lines: ["Pick it from the logbook, or add it later"], action: { resolving = true })
                    Note("Sending makes a link with the photos and these words. Your mechanic can open it without an account; it expires.")
                        .padding(.top, Tokens.Space.s3)
                }
                if recs.canEdit {
                    Button("Delete this squawk") { deleting = true }.buttonStyle(.quiet).padding(.top, Tokens.Space.s4)
                }
            } footer: {
                if recs.canEdit {
                    HStack(spacing: Tokens.Space.s2) {
                        if resolved {
                            Button("Edit") { editing = true }.buttonStyle(.secondary)
                            Button("Reopen") { recs.change("squawk.reopen", "squawk", id, "Reopen squawk", ["squawkId": id]) }.buttonStyle(.primary)
                        } else {
                            Button { sending = true } label: { Label { Text("Send to mechanic") } icon: { Icon("send", size: 18) } }.buttonStyle(.secondary)
                            Button("Mark resolved") { resolving = true }.buttonStyle(.primary)
                        }
                    }
                }
            }
            .sheet(isPresented: $resolving) { ResolveSheet(recs: recs, s: s) }
            .sheet(isPresented: $sending) { SendSheet(recs: recs, s: s) }
            .sheet(isPresented: $editing) { EditSquawkSheet(recs: recs, s: s) }
            .modifier(PickPhotos(isPresented: $adding, max: 4) { jpegs in
                jpegs.forEach { addSquawkPhoto(recs, squawkId: id, jpeg: $0) }
                if !jpegs.isEmpty { recs.say("Photo added. It uploads with the next sync.") }
            })
            .modifier(DeleteSquawk(recs: recs, s: s, asking: $deleting, then: { nav.back() }))
        } else {
            RecScreen(section: .maint, title: "Squawk", back: "Squawks") { EmptyLine(text: "This record is no longer on this phone.") }
        }
    }
}

private struct EditSquawkSheet: View {
    let recs: Recs
    let s: Rec
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var severity: Int?

    var body: some View {
        RecSheet(title: "Edit squawk", dirty: text != (s.s("description") ?? "")) {
            TextBox(label: "What did you notice?", text: $text, lines: 4)
            RadioRows(label: "How serious is it?", options: severityMeanings, selection: $severity)
            Button("Save") {
                recs.change("squawk.update", "squawk", s.id, "Edit squawk", [
                    "squawkId": s.id, "description": text.trimmingCharacters(in: .whitespacesAndNewlines), "severity": severities[severity ?? 0],
                ])
                dismiss()
            }
            .buttonStyle(.primary).padding(.top, Tokens.Space.s3)
            .disabled(text.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .onAppear { text = s.s("description") ?? ""; severity = severities.firstIndex(of: s.s("severity") ?? "low") ?? 0 }
    }
}

/// Send to mechanic (C-SQ-03): online only; offline the button says why and the choices are kept.
private struct SendSheet: View {
    let recs: Recs
    let s: Rec
    @State private var who = ""
    @State private var days = 1
    @State private var photos = true
    @State private var busy = false
    @State private var link: String?
    @State private var error: String?

    var body: some View {
        RecSheet(title: "Send to mechanic") {
            if let link {
                Lede("The link is ready. Anyone with it can read this squawk until it expires.")
                Text(link).dFont(.bodyStrong).foregroundStyle(Tokens.Colors.ink).textSelection(.enabled).padding(.vertical, Tokens.Space.s3)
                HStack(spacing: Tokens.Space.s2) {
                    Button("Copy") { copyText(link, recs) }.buttonStyle(.secondary)
                    ShareLink(item: link) { Text("Share") }.buttonStyle(.primary)
                }
            } else {
                TextBox(label: "Who is it for", text: $who, placeholder: "M. Torres")
                Note("The link expires in").padding(.top, Tokens.Space.s2)
                Segments(label: "Expires in", options: ["7 days", "30 days", "90 days"], selection: $days)
                SwitchRow(label: "Include the photos", on: $photos)
                Note("Sending makes a link with the photos and these words. Your mechanic can open it without an account; it expires.")
                if let error { Note(error, alarm: true).padding(.top, Tokens.Space.s2) }
                let uploaded = recs.onServer("squawk", s.id)
                Button { make() } label: {
                    Label { Text(busy ? "Saving" : "Make the link") } icon: { Icon("send", size: 18) }
                }
                .buttonStyle(.primary).padding(.top, Tokens.Space.s3)
                .disabled(!recs.online || busy || !uploaded)
                if !recs.online { Note("Making a link needs signal.").padding(.top, Tokens.Space.s2) }
                else if !uploaded { Note("It can be sent once the squawk has uploaded.").padding(.top, Tokens.Space.s2) }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func make() {
        busy = true
        error = nil
        let name = who.trimmingCharacters(in: .whitespaces)
        Task {
            do {
                link = try await recs.api.mechanicLink(aircraftId: recs.id, squawkId: s.id, recipient: name.isEmpty ? "Mechanic" : name,
                                                       days: [7, 30, 90][days], photos: photos)
            } catch {
                self.error = (error as? RecordsAPI.Failure)?.message ?? "Making a link needs signal."
            }
            busy = false
        }
    }
}

// MARK: Tracked items (M-MAINT-04)

private struct ItemsView: View {
    let recs: Recs
    @Environment(\.recNav) private var nav
    @State private var filter = 0
    @State private var scanning = false

    var body: some View {
        let items = recs.records("maintenance_item")
        if items.isEmpty {
            EmptyLine(text: "Nothing is tracked yet.", action: recs.canEdit ? "Set up the standard inspections" : nil) {
                recs.change("mx.seedStandard", "maintenance_item", newId(), "Set up the standard inspections", [:])
            }
        } else {
            let req = items.filter { $0.b("regulatory") }.count
            Segments(label: "Show", options: ["All \(items.count)", "Required \(req)", "Advisory \(items.count - req)"], selection: $filter)
            ForEach(items.filter { filter == 0 || $0.b("regulatory") == (filter == 1) }.sorted(by: order)) { i in
                let due = recs.due("mx:\(i.id)")
                RecRow(due?.label ?? i.s("label") ?? "",
                       lines: [itemRule(regulatory: i.b("regulatory"), months: i.d("interval_months").map { Int($0) }, hours: i.d("interval_hours"),
                                        calendarMonth: calendarMonthKinds.contains(i.s("kind") ?? ""))],
                       rec: i, action: recs.canEdit ? { nav.open(.item(i.id)) } : nil) {
                    VStack(alignment: .trailing, spacing: 2) {
                        if let due { StatusMark(kind: markKind(due.status), label: statusWord(due.status), compact: true) }
                        Note([i.s("next_due_date").map { dayDate($0) }, i.d("next_due_hours").map { "\(i.s("meter") ?? "tach") \(fmt1($0))" }]
                            .compactMap { $0 }.joined(separator: " · "))
                    }
                }
            }
        }
        if recs.canEdit {
            Button("Add an item") { nav.open(.item("new")) }.buttonStyle(.secondary).padding(.top, Tokens.Space.s4)
            Button(scanning ? "Reading your logbooks" : "Find completions in the logbooks") { scan() }
                .buttonStyle(.quiet).disabled(!recs.online || scanning)
            if !recs.online { Note("Reading your logbooks needs signal.") }
        }
    }

    private func order(_ a: Rec, _ b: Rec) -> Bool {
        let da = recs.due("mx:\(a.id)")?.calendar?.dueDate ?? a.s("next_due_date") ?? "9999"
        let db = recs.due("mx:\(b.id)")?.calendar?.dueDate ?? b.s("next_due_date") ?? "9999"
        return da != db ? da < db : (a.s("label") ?? "") < (b.s("label") ?? "")
    }

    private func scan() {
        scanning = true
        Task {
            do {
                try await recs.api.scanCompletions(aircraftId: recs.id)
                await recs.offline.sync()
                recs.say("Done. Items were updated from your logbooks.")
            } catch {
                recs.say((error as? RecordsAPI.Failure)?.message ?? "Reading your logbooks needs signal.")
            }
            scanning = false
        }
    }
}

/// Item editor (M-MAINT-04): both limits, the meter, last done, a live preview of the next due.
struct ItemEditor: View {
    let recs: Recs
    let id: String
    @Environment(\.recNav) private var nav
    @State private var loaded = false
    @State private var kind = "annual"
    @State private var label = ""
    @State private var regulatory = 0
    @State private var months = ""
    @State private var hours = ""
    @State private var meter = 0
    @State private var lastDate: String?
    @State private var lastHours = ""
    @State private var notes = ""
    @State private var deleting = false

    private var existing: Rec? { id == "new" ? nil : recs.rec("maintenance_item", id) }
    private var name: String { label.trimmingCharacters(in: .whitespaces).isEmpty ? itemKinds.first { $0.0 == kind }?.1 ?? "" : label.trimmingCharacters(in: .whitespaces) }
    private var valid: Bool { !name.isEmpty && (Int(months) != nil || num(hours) != nil) }

    var body: some View {
        RecScreen(section: .maint, title: existing?.s("label") ?? "New item", back: "Items") {
            ChoiceRow(label: "What", options: itemKinds, selection: $kind)
            TextBox(label: "Name", text: $label, placeholder: itemKinds.first { $0.0 == kind }?.1)
            Segments(label: "Kind", options: ["Required by regulation", "Advisory"], selection: $regulatory)
            HStack(spacing: Tokens.Space.s2) {
                TextBox(label: "Every … months", text: $months, number: true)
                TextBox(label: "Every … hours", text: $hours, number: true)
            }
            Note("Counts hours on").padding(.top, Tokens.Space.s2)
            Segments(label: "Counts hours on", options: ["Tach", "Hobbs"], selection: $meter)
            DateRow(label: "Last done", date: $lastDate, clearable: true)
            TextBox(label: "At … hours", text: $lastHours, number: true)
            TextBox(label: "Notes", text: $notes, lines: 2)
            let m = meter == 1 ? "hobbs" : "tach"
            if let preview = nextDuePreview(kind: kind, lastDate: lastDate, lastHours: num(lastHours), months: Int(months), hours: num(hours),
                                            meter: m, now: recs.meter(m), hoursPerDay: recs.snapshot.map { $0.rate.hoursPerWeek / 7 }) {
                Well { Lede(preview) }
            }
            if existing != nil { Button("Delete this item") { deleting = true }.buttonStyle(.quiet) }
        } footer: {
            Button(existing == nil ? "Add item" : "Save changes", action: save).buttonStyle(.primary).disabled(!valid)
        }
        .onAppear(perform: load)
        .confirmationDialog("Delete the \(name.lowercased())?", isPresented: $deleting, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                recs.delete("mx.delete", "maintenance_item", id, "Delete \(name)", ["itemId": id])
                nav.back()
            }
        } message: { Text("Its history in the logbooks stays.") }
    }

    private func load() {
        guard !loaded else { return }
        loaded = true
        guard let e = existing else { return }
        kind = e.s("kind") ?? "annual"; label = e.s("label") ?? ""; regulatory = e.b("regulatory") ? 0 : 1
        months = e.d("interval_months").map { String(Int($0)) } ?? ""; hours = fmtNum(e.d("interval_hours"))
        meter = e.s("meter") == "hobbs" ? 1 : 0; lastDate = e.s("last_done_date"); lastHours = fmtNum(e.d("last_done_hours")); notes = e.s("notes") ?? ""
    }

    private func save() {
        let trimmed = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        let item = payload([
            "kind": kind, "label": name, "regulatory": regulatory == 0, "interval_months": Int(months), "interval_hours": num(hours),
            "meter": meter == 1 ? "hobbs" : "tach", "last_done_date": lastDate, "last_done_hours": num(lastHours), "notes": trimmed.isEmpty ? nil : trimmed,
        ])
        let rowId = existing?.id ?? newId()
        let body: [String: Any] = existing != nil && recs.onServer("maintenance_item", rowId) ? ["id": rowId, "item": item] : ["item": item]
        recs.change("mx.upsert", "maintenance_item", rowId, name, body)
        recs.say(recs.savedWord)
        nav.back()
    }
}

// MARK: ADs (M-MAINT-01, -06, -07)

private struct AdsView: View {
    let recs: Recs
    @Environment(\.recNav) private var nav

    var body: some View {
        let ads = recs.records("ad_compliance")
        let tach = recs.meter("tach")
        if ads.isEmpty {
            EmptyLine(text: "No ADs are tracked yet.", action: "Find ADs for this aircraft") { nav.open(.findAds) }
        }
        let ranked = ads.map { ($0, adStatus($0.s("status"), recurring: $0.b("recurring"), due: recs.due("ad:\($0.id)"))) }
            .sorted { a, b in adRank(a.1.1) != adRank(b.1.1) ? adRank(a.1.1) < adRank(b.1.1) : (a.0.s("reference") ?? "") < (b.0.s("reference") ?? "") }
        ForEach(ranked, id: \.0.id) { a, st in
            let title = "\((a.s("kind") ?? "ad").uppercased()) \(a.s("reference") ?? "")" + (a.s("title").map { " · \($0.prefix(60))" } ?? "")
            var menu: [RowAction] = []
            if recs.canEdit { menu.append(RowAction(title: "Record compliance") { nav.open(.ad(a.id, record: true)) }) }
            menu.append(RowAction(title: "Copy the AD number") { copyText(a.s("reference") ?? "", recs) })
            return RecRow(title: title, lines: [adSentence(a, tach: tach)], rec: a, action: { nav.open(.ad(a.id)) }, menu: menu) {
                StatusMark(kind: st.0, label: st.1, compact: true)
            } below: {
                let cite = recs.pageLabel(a.s("reference_entry_id"))
                if cite != nil || (a.b("recurring") && recs.canEdit) {
                    HStack(spacing: Tokens.Space.s3) {
                        if let cite { PageCite(label: cite) }
                        Spacer(minLength: 0)
                        if a.b("recurring") && recs.canEdit {
                            Button("Record compliance") { nav.open(.ad(a.id, record: true)) }.buttonStyle(.quiet)
                        }
                    }
                }
            }
        }
        RecRow("Find ADs for this aircraft", lines: ["The FAA list for your make, model and equipment"], action: { nav.open(.findAds) })
    }
}

func adSentence(_ a: Rec, tach: Double?) -> String {
    adSentence(status: a.s("status"), recurring: a.b("recurring"), intervalHours: a.d("interval_hours"), intervalMonths: a.d("interval_months").map { Int($0) },
               compliedDate: a.s("complied_date"), compliedHours: a.d("complied_hours"), nextDate: a.s("next_due_date"), nextHours: a.d("next_due_hours"),
               reason: a.s("reason"), tach: tach)
}

private let complianceMethods = [("inspection", "Inspection"), ("replacement", "Replacement"), ("modification", "Modification"),
                                 ("not_applicable", "Not applicable"), ("other", "Other")]

/// AD detail and compliance (M-MAINT-06).
struct AdDetail: View {
    let recs: Recs
    let id: String
    var record = false
    @Environment(\.recNav) private var nav
    @State private var recording: Bool?
    @State private var stopping = false

    var body: some View {
        if let a = recs.rec("ad_compliance", id) {
            let st = adStatus(a.s("status"), recurring: a.b("recurring"), due: recs.due("ad:\(id)"))
            let ref = a.s("ad_reference_id").flatMap { recs.offline.rawRow("ad_reference", id: $0) }
            let history = recs.records("item_completion").filter { $0.s("ad_compliance_id") == id }.sorted { ($0.s("done_date") ?? "") > ($1.s("done_date") ?? "") }
            RecScreen(section: .maint, title: "\((a.s("kind") ?? "ad").uppercased()) \(a.s("reference") ?? "")", back: "ADs") {
                if let t = a.s("title") { Note(t) }
                StatusMark(kind: st.0, label: st.1).padding(.vertical, Tokens.Space.s2)
                Lede(adSentence(a, tach: recs.meter("tach")))
                PendingCaption(rec: a)
                if ref != nil || a.s("applicability") != nil {
                    GroupHeader(title: "Official text")
                    if let t = ref?["title"]?.text { Lede(t).padding(.top, Tokens.Space.s2) }
                    if let abs = ref?["abstract"]?.text ?? a.s("applicability") {
                        Text(abs).dFont(.small).foregroundStyle(Tokens.Colors.ink3).textSelection(.enabled).padding(.top, Tokens.Space.s2)
                    }
                    if let url = ref?["fr_html_url"]?.text.flatMap(URL.init(string:)) { Link("Read the full AD", destination: url).buttonStyle(.quiet) }
                }
                GroupHeader(title: "Compliance history")
                if history.isEmpty { Note("No compliance recorded yet.").padding(.vertical, Tokens.Space.s2) }
                ForEach(history) { h in
                    RecRow(title: [h.s("done_date").map(longDate), h.d("done_hours").map { "tach \(fmt1($0))" }].compactMap { $0 }.joined(separator: " · "), rec: h) {
                        EmptyView()
                    } below: {
                        if let cite = recs.pageLabel(h.s("log_entry_id")) { PageCite(label: cite) }
                    }
                }
                if recs.canEdit {
                    if recording ?? record {
                        ComplianceForm(recs: recs, a: a) { patch in
                            save(a, patch, label: "AD \(a.s("reference") ?? "") compliance")
                            recording = false
                        }
                    } else {
                        Button("Record compliance") { recording = true }.buttonStyle(.secondary).padding(.top, Tokens.Space.s3)
                    }
                    AdSettings(a: a) { save(a, $0, label: "AD \(a.s("reference") ?? "")") }
                    Button("Stop tracking this AD") { stopping = true }.buttonStyle(.quiet).padding(.top, Tokens.Space.s4)
                }
            }
            .confirmationDialog("Stop tracking AD \(a.s("reference") ?? "")?", isPresented: $stopping, titleVisibility: .visible) {
                Button("Stop tracking this AD", role: .destructive) {
                    recs.delete("ad.delete", "ad_compliance", id, "Stop tracking AD \(a.s("reference") ?? "")", ["recordId": id])
                    nav.back()
                }
            } message: { Text("It leaves the register and its compliance history here. Logbook entries are not changed.") }
        } else {
            RecScreen(section: .maint, title: "ADs", back: "ADs") { EmptyLine(text: "This record is no longer on this phone.") }
        }
    }

    /// ad.upsert carries the whole record with the change applied.
    private func save(_ a: Rec, _ patch: [String: Any], label: String) {
        var full: [String: Any] = [:]
        for (k, v) in a.row where !["id", "aircraft_id", "created_at", "updated_at"].contains(k) {
            if let data = try? JSONEncoder().encode(v), let o = try? JSONSerialization.jsonObject(with: data, options: .fragmentsAllowed) { full[k] = o }
        }
        for (k, v) in patch { full[k] = v }
        recs.change("ad.upsert", "ad_compliance", id, label, recs.onServer("ad_compliance", id) ? ["id": id, "record": full] : ["record": full])
        recs.say(recs.savedWord)
    }
}

private struct ComplianceForm: View {
    let recs: Recs
    let a: Rec
    let save: ([String: Any]) -> Void
    @State private var date: String? = todayISO()
    @State private var tach = ""
    @State private var method = "inspection"
    @State private var entry: String?
    @State private var component = ""
    @State private var notes = ""

    var body: some View {
        let components = recs.records("component").filter { $0.b("is_installed") }.map { ($0.id, $0.s("name") ?? "") }
        let note = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        let na = method == "not_applicable"
        GroupHeader(title: "Record compliance")
        DateRow(label: "Complied on", date: $date)
        TextBox(label: "At tach", text: $tach, number: true)
        ChoiceRow(label: "How it was complied with", options: complianceMethods, selection: $method)
        EntryChoice(recs: recs, label: "Logbook entry that records it", selected: $entry)
        if !components.isEmpty { ChoiceRow(label: "Related equipment", options: [("", "None")] + components, selection: $component) }
        TextBox(label: "Notes", text: $notes, lines: 2)
        Button("Save compliance") {
            save(payload([
                "status": na ? "not_applicable" : "complied", "complied_date": date, "complied_hours": num(tach),
                "method": complianceMethods.first { $0.0 == method }?.1, "reference_entry_id": entry, "component_id": component.isEmpty ? nil : component,
                "notes": note.isEmpty ? a.s("notes") : note, "reason": na ? (note.isEmpty ? nil : note) : a.s("reason"),
            ]))
        }
        .buttonStyle(.primary).padding(.top, Tokens.Space.s2)
        .disabled(date == nil || (na && note.isEmpty))
        .onAppear { tach = fmt1(recs.meter("tach")); component = a.s("component_id") ?? "" }
        if na && note.isEmpty { Note("Not applicable needs a reason.") }
    }
}

private struct AdSettings: View {
    let a: Rec
    let save: ([String: Any]) -> Void
    @State private var recurring = 0
    @State private var hours = ""
    @State private var months = ""
    @State private var na = 0
    @State private var why = ""

    var body: some View {
        let reason = why.trimmingCharacters(in: .whitespacesAndNewlines)
        GroupHeader(title: "Settings")
        Segments(label: "Recurring", options: ["One-time", "Recurring"], selection: $recurring)
        if recurring == 1 {
            HStack(spacing: Tokens.Space.s2) {
                TextBox(label: "Every … hours", text: $hours, number: true)
                TextBox(label: "Every … months", text: $months, number: true)
            }
        }
        Segments(label: "Applies", options: ["Applies", "Not applicable"], selection: $na)
        if na == 1 { TextBox(label: "Why it does not apply", text: $why, lines: 2) }
        Button("Save") {
            save(payload([
                "recurring": recurring == 1, "interval_hours": recurring == 1 ? num(hours) : nil, "interval_months": recurring == 1 ? Int(months) : nil,
                "status": na == 1 ? "not_applicable" : a.s("status") == "not_applicable" ? "open" : a.s("status"), "reason": na == 1 ? reason : nil,
            ]))
        }
        .buttonStyle(.secondary).padding(.top, Tokens.Space.s2)
        .disabled(na == 1 && reason.isEmpty)
        .onAppear {
            recurring = a.b("recurring") ? 1 : 0; hours = fmtNum(a.d("interval_hours")); months = a.d("interval_months").map { String(Int($0)) } ?? ""
            na = a.s("status") == "not_applicable" ? 1 : 0; why = a.s("reason") ?? ""
        }
        if na == 1 && reason.isEmpty { Note("Not applicable needs a reason.") }
    }
}

/// Find ADs (M-MAINT-07): the FAA list by make and model, online only; tracking opens the new record.
struct FindAds: View {
    let recs: Recs
    @Environment(\.recNav) private var nav
    @State private var q = ""
    @State private var results: [FoundAd]?
    @State private var busy = false
    @State private var error: String?
    @State private var preview: FoundAd?

    private var terms: [String] {
        let plane = recs.offline.rawRow("aircraft", id: recs.id)
        let first = [plane?["make"]?.text, plane?["model"]?.text].compactMap { $0 }.joined(separator: " ")
        let comps = recs.records("component").filter { $0.b("is_installed") }
            .map { [$0.s("make"), $0.s("name")].compactMap { $0 }.joined(separator: " ") }.filter { !$0.isEmpty }.prefix(4)
        return (first.isEmpty ? [] : [first]) + comps
    }

    var body: some View {
        let tracked = Set(recs.records("ad_compliance").compactMap { $0.s("reference") })
        RecScreen(section: .maint, title: "Find ADs", back: "ADs") {
            if !recs.online {
                EmptyLine(text: "Finding ADs needs signal. Your tracked ADs are under ADs.")
            } else {
                TextBox(label: "Search", text: $q)
                if terms.count > 1 {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: Tokens.Space.s2) {
                            ForEach(terms, id: \.self) { t in
                                Button(String(t.prefix(24))) { q = t; search() }.buttonStyle(.secondary).fixedSize()
                            }
                        }
                    }
                }
                Button { search() } label: { Label { Text(busy ? "Searching" : "Search the FAA list") } icon: { Icon("search", size: 18) } }
                    .buttonStyle(.primary).padding(.top, Tokens.Space.s2)
                    .disabled(busy || q.trimmingCharacters(in: .whitespaces).isEmpty)
                Note("Each result is a lead to check with your A&P.").padding(.top, Tokens.Space.s2)
                if let error { Note(error, alarm: true) }
                if let results {
                    if results.isEmpty { EmptyLine(text: "No ADs found for that search. Try the engine or propeller model.") }
                    ForEach(results) { ad in
                        let isTracked = ad.adNumber.map(tracked.contains) ?? false
                        RecRow("AD \(ad.adNumber ?? "—")", lines: [String(ad.title.prefix(120)), ad.effectiveOn.map { "Effective \(longDate($0))" },
                                                                    isTracked ? "Tracked" : nil].compactMap { $0 }, action: { preview = ad })
                    }
                }
            }
        }
        .onAppear { if q.isEmpty { q = terms.first ?? "" } }
        .sheet(item: $preview) { ad in
            RecSheet(title: "AD \(ad.adNumber ?? "")") {
                Lede(ad.title)
                if let abs = ad.abstract { Text(abs).dFont(.small).foregroundStyle(Tokens.Colors.ink3).textSelection(.enabled).padding(.vertical, Tokens.Space.s2) }
                if let url = URL(string: ad.htmlUrl), !ad.htmlUrl.isEmpty { Link("Read the full AD", destination: url).buttonStyle(.quiet) }
                if recs.canEdit, let number = ad.adNumber, !tracked.contains(number) {
                    HStack(spacing: Tokens.Space.s2) {
                        Button("Track with an interval") { track(ad, number) }.buttonStyle(.secondary)
                        Button("Track this AD") { track(ad, number) }.buttonStyle(.primary)
                    }
                    .padding(.top, Tokens.Space.s3)
                }
            }
            .presentationDetents([.medium, .large])
        }
    }

    private func search() {
        let term = q.trimmingCharacters(in: .whitespaces)
        guard !term.isEmpty else { return }
        busy = true
        error = nil
        Task {
            do { results = try await recs.api.findAds(term) } catch { self.error = (error as? RecordsAPI.Failure)?.message ?? "The FAA list didn't answer." }
            busy = false
        }
    }

    private func track(_ ad: FoundAd, _ number: String) {
        let id = newId()
        recs.change("ad.track", "ad_compliance", id, "Track AD \(number)", payload([
            "id": id, "kind": "ad", "reference": number, "title": String(ad.title.prefix(500)), "applicability": ad.abstract,
        ]))
        preview = nil
        nav.open(.ad(id))
    }
}
