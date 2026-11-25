import QuickLook
import SwiftUI
import UniformTypeIdentifiers

let ownerCurrencies = ["USD", "CAD", "EUR", "GBP", "AUD", "NZD", "CHF", "JPY", "CNY", "HKD", "SGD", "INR", "ZAR", "SEK", "NOK", "DKK", "AED", "ILS", "BRL", "MXN", "KWD", "BHD", "OMR"]

struct ExpensesScreen: View {
    let recs: Recs
    @State private var answer: ExpensesAnswer?
    @State private var error: String?
    @State private var busy = false
    @State private var adding = false
    @State private var editing: Rec?
    @State private var importing = false
    @State private var file: URL?
    @State private var from: String?
    @State private var through: String?

    var body: some View {
        RecScreen(section: .aircraft, title: "Ownership costs", back: "Aircraft") {
            if !recs.isOwner {
                Note("Financial records are visible only to the aircraft owner. Maintenance access does not include financial access.")
            } else {
                Note("Recorded spending and reserve estimates are kept separate, in their original currencies. Refunds are negative amounts.")
                DateRow(label: "From", date: $from, clearable: true)
                DateRow(label: "Through", date: $through, clearable: true)
                if busy { ProgressView("Loading costs") }
                if let error { Note(error, alarm: true) }
                if let answer {
                    ForEach(answer.totals) { total in
                        GroupHeader(title: total.currency)
                        RecRow("Recorded spending", lines: [expenseAmount(total.actual_minor, currency: total.currency)])
                        RecRow("Reserve estimates", lines: [expenseAmount(total.reserve_minor, currency: total.currency)])
                        if let rate = total.actual_per_hour_minor, let hours = answer.denominator?.hours, hours > 0 {
                            RecRow("Recorded cost per hour", lines: ["\(expenseRateAmount(rate, currency: total.currency))/h · \(fmt1(hours)) \(answer.denominator?.meter ?? "") hours", answer.denominator?.source].compactMap { $0 })
                        }
                    }
                    Note(answer.denominator?.source ?? "Cost per hour needs reviewed boundary readings for this period. Meter-face subtraction across a replacement is not valid usage.")
                    GroupHeader(title: "Expenses", count: "\(answer.expenses.count)")
                    if answer.expenses.isEmpty { EmptyLine(text: "No expenses for this period. Add a cost, upload an invoice, or import a CSV.") }
                    ForEach(answer.expenses.map { Rec(row: $0) }) { expense in
                        RecRow(expenseAmount(Int64(expense.d("amount_minor") ?? 0), currency: expense.s("currency") ?? "USD"),
                            lines: [expense.s("date"), expense.s("vendor"), expense.s("category")?.capitalized, expense.s("basis") == "reserve" ? "Reserve estimate" : "Recorded spending"].compactMap { $0 }, action: { editing = expense })
                    }
                    if let file { ShareLink(item: file) { Label("Share cost export", systemImage: "square.and.arrow.up") }.buttonStyle(.secondary) }
                    Button("Export selected period as CSV", action: export).buttonStyle(.secondary).disabled(!recs.online || busy)
                    Button("Import CSV") { importing = true }.buttonStyle(.quiet).disabled(!recs.online || busy)
                    Note("Import columns: date, currency, amount_minor, category, cost_type, basis. Optional columns include vendor, payer, notes, document_id and log_entry_id. Exported IDs make repeat imports safe.")
                }
                Button("Refresh costs") { Task { await load() } }.buttonStyle(.quiet).disabled(!recs.online || busy)
                if !recs.online { Note("Financial changes need signal. An unfinished expense is retained on this phone as a draft.") }
            }
        } footer: {
            if recs.isOwner { Button("Add expense") { adding = true }.buttonStyle(.primary) }
        }
        .task(id: "\(recs.id)-\(recs.online)-\(from ?? "")-\(through ?? "")") { await load() }
        .sheet(isPresented: $adding, onDismiss: { Task { await load() } }) { ExpenseForm(recs: recs, expense: nil, documents: answer?.documents ?? [], entries: answer?.entries ?? []) }
        .sheet(item: $editing, onDismiss: { Task { await load() } }) { ExpenseForm(recs: recs, expense: $0, documents: answer?.documents ?? [], entries: answer?.entries ?? []) }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.commaSeparatedText, .plainText], allowsMultipleSelection: false) { result in
            if case .success(let urls) = result, let url = urls.first { importCsv(url) }
            else if case .failure(let error) = result { self.error = error.localizedDescription }
        }
    }

    private var query: [URLQueryItem] {
        [from.map { URLQueryItem(name: "from", value: $0) }, through.map { URLQueryItem(name: "to", value: $0) }].compactMap { $0 }
    }

    private func load() async {
        guard recs.online, recs.isOwner else { return }
        busy = true; error = nil
        do { answer = try JSONDecoder().decode(ExpensesAnswer.self, from: await recs.api.ownerData(aircraftId: recs.id, path: "expenses", query: query)) }
        catch { self.error = error.localizedDescription }
        busy = false
    }

    private func export() {
        busy = true; error = nil
        Task {
            do { file = try ownerFile(await recs.api.ownerData(aircraftId: recs.id, path: "expenses", query: query + [.init(name: "format", value: "csv")]), name: "\(recs.tail) ownership costs.csv") }
            catch { self.error = error.localizedDescription }
            busy = false
        }
    }

    private func importCsv(_ url: URL) {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        do {
            let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            guard size <= 2 * 1024 * 1024 else { throw RecordsAPI.Failure(status: 413, message: "Choose a CSV smaller than 2 MB.") }
            let csv = try String(contentsOf: url, encoding: .utf8)
            busy = true; error = nil
            Task {
                do {
                    _ = try await recs.api.ownerWrite(aircraftId: recs.id, path: "expenses/import", fields: ["csv": csv])
                    await load(); recs.say("Expenses imported. Review the recorded amounts.")
                } catch { self.error = error.localizedDescription }
                busy = false
            }
        } catch { self.error = error.localizedDescription }
    }
}

private struct ExpenseDraft: Codable {
    var id = newId()
    var date: String? = todayISO()
    var currency = "USD"
    var amount = ""
    var category = "maintenance"
    var costType = "variable"
    var basis = "actual"
    var vendor = ""
    var payer = ""
    var notes = ""
    var document = ""
    var entry: String?
    var base: String?
}

private struct ExpenseForm: View {
    let recs: Recs
    let expense: Rec?
    var documents: [Row] = []
    var entries: [Row] = []
    @Environment(\.dismiss) private var dismiss
    @State private var draft = ExpenseDraft()
    @State private var busy = false
    @State private var error: String?
    @State private var saved = false
    @State private var deleting = false
    @State private var reloading = false
    @State private var loaded = false
    @State private var originalInvoice: URL?
    private var draftUrl: URL { recs.offline.dir.appending(path: "expense-drafts/\(recs.id)-\(expense?.id ?? "new").json") }

    var body: some View {
        RecSheet(title: expense == nil ? "Add expense" : "Expense") {
            DateRow(label: "Date", date: $draft.date)
            ChoiceRow(label: "Currency", options: ownerCurrencies.map { ($0, $0) }, selection: $draft.currency)
            TextBox(label: "Amount (negative for refund)", text: $draft.amount, number: true)
            ChoiceRow(label: "Category", options: ["maintenance", "fuel", "oil", "insurance", "hangar", "other"].map { ($0, $0.capitalized) }, selection: $draft.category)
            ChoiceRow(label: "Cost type", options: [("fixed", "Fixed"), ("variable", "Variable")], selection: $draft.costType)
            ChoiceRow(label: "Basis", options: [("actual", "Recorded spending"), ("reserve", "Reserve estimate")], selection: $draft.basis)
            TextBox(label: "Vendor", text: $draft.vendor)
            TextBox(label: "Paid by", text: $draft.payer)
            TextBox(label: "Notes", text: $draft.notes)
            ChoiceRow(label: "Source document", options: [("", "None")] + documents.map { ($0["id"]?.text ?? "", $0["title"]?.text ?? "Document") }, selection: $draft.document)
            ChoiceRow(label: "Related maintenance entry", options: [("", "None")] + entries.map { ($0["id"]?.text ?? "", [$0["date"]?.text, $0["description"]?.text].compactMap { $0 }.joined(separator: " · ")) }, selection: Binding(get: { draft.entry ?? "" }, set: { draft.entry = $0.isEmpty ? nil : $0 }))
            if let inbox = expense?.s("inbox_id") {
                Button("Open original invoice") {
                    busy = true; error = nil
                    Task {
                        do {
                            let list = try JSONDecoder().decode(InboxAnswer.self, from: await recs.api.ownerData(aircraftId: recs.id, path: "inbox"))
                            let name = list.items.first { $0["id"]?.text == inbox }?["file_name"]?.text ?? "Original invoice"
                            originalInvoice = try ownerFile(await recs.api.ownerData(aircraftId: recs.id, path: "inbox/\(inbox)/file"), name: name)
                        }
                        catch { self.error = error.localizedDescription }
                        busy = false
                    }
                }.buttonStyle(.quiet).disabled(!recs.online || busy)
            }
            if !draft.document.isEmpty { OwnerDocumentButton(recs: recs, id: draft.document) }
            if let entry = draft.entry { OwnerSourceButton(recs: recs, entryId: entry) }
            if let error { Note(error, alarm: true) }
            Note("Only the owner can see financial records. Your unfinished form is kept as a protected draft on this phone.")
            Button(busy ? "Saving" : "Save expense", action: save).buttonStyle(.primary).disabled(!recs.online || busy || draft.date == nil)
            if expense != nil { Button("Discard draft and reload saved expense") { reloading = true }.buttonStyle(.quiet).disabled(!recs.online || busy) }
            if expense != nil { Button("Delete expense") { deleting = true }.buttonStyle(.quiet).disabled(!recs.online || busy) }
        }
        .quickLookPreview($originalInvoice)
        .onAppear(perform: loadDraft)
        .onChange(of: draftJson) { persist() }
        .confirmationDialog("Discard the draft and reload the saved expense?", isPresented: $reloading, titleVisibility: .visible) {
            Button("Discard draft and reload", role: .destructive) { reloadSaved() }
        }
        .confirmationDialog("Delete this expense?", isPresented: $deleting, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { remove() }
        } message: { Text("The original document and maintenance entry remain. Only this financial record is removed.") }
    }

    private var draftJson: Data? { try? JSONEncoder().encode(draft) }

    private func loadDraft() {
        guard !loaded else { return }; loaded = true
        if let bytes = try? Data(contentsOf: draftUrl), let restored = try? JSONDecoder().decode(ExpenseDraft.self, from: bytes) { draft = restored; return }
        guard let expense else { return }
        populate(expense)
    }

    private func populate(_ expense: Rec) {
        draft.base = expense.s("updated_at")
        draft.id = expense.id; draft.date = expense.s("date"); draft.currency = expense.s("currency") ?? "USD"
        let digits = draft.currency == "JPY" ? 0 : ["KWD", "BHD", "OMR"].contains(draft.currency) ? 3 : 2
        let amount = Decimal(Int64(expense.d("amount_minor") ?? 0)) / pow(Decimal(10), digits)
        draft.amount = NSDecimalNumber(decimal: amount).stringValue
        draft.category = expense.s("category") ?? "maintenance"; draft.costType = expense.s("cost_type") ?? "variable"
        draft.basis = expense.s("basis") ?? "actual"; draft.vendor = expense.s("vendor") ?? ""; draft.payer = expense.s("payer") ?? ""
        draft.notes = expense.s("notes") ?? ""; draft.document = expense.s("document_id") ?? ""; draft.entry = expense.s("log_entry_id")
    }

    private func persist() {
        guard loaded, !saved else { return }
        do {
            try FileManager.default.createDirectory(at: draftUrl.deletingLastPathComponent(), withIntermediateDirectories: true)
            try draftJson?.write(to: draftUrl, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        } catch { self.error = "The draft could not be kept on this phone. Keep this form open until saved." }
    }

    private func save() {
        guard let minor = expenseMinorUnits(draft.amount, currency: draft.currency), minor != 0, abs(Decimal(minor)) <= 9_000_000_000_000 else {
            error = "Enter a nonzero amount with the correct decimal places for \(draft.currency)."; return
        }
        var body: [String: Any] = ["id": draft.id, "date": draft.date ?? "", "currency": draft.currency, "amount_minor": minor,
            "category": draft.category, "cost_type": draft.costType, "basis": draft.basis,
            "vendor": draft.vendor, "payer": draft.payer, "notes": draft.notes]
        if !draft.document.isEmpty { body["document_id"] = draft.document }
        if let entry = draft.entry { body["log_entry_id"] = entry }
        if expense != nil { body["base"] = draft.base ?? "" }
        guard let encoded = try? JSONSerialization.data(withJSONObject: body) else { error = "The expense could not be prepared."; return }
        busy = true; error = nil
        Task {
            do {
                _ = try await recs.api.ownerWriteEncoded(aircraftId: recs.id, path: expense.map { "expenses/\($0.id)" } ?? "expenses", encoded: encoded, method: expense == nil ? "POST" : "PATCH")
                saved = true; try? FileManager.default.removeItem(at: draftUrl)
                recs.say("Expense saved."); dismiss()
            } catch { self.error = error.localizedDescription }
            busy = false
        }
    }

    private func reloadSaved() {
        guard let expense else { return }
        busy = true; error = nil
        Task {
            do {
                let answer = try JSONDecoder().decode(ExpensesAnswer.self, from: await recs.api.ownerData(aircraftId: recs.id, path: "expenses"))
                guard let row = answer.expenses.first(where: { $0["id"]?.text == expense.id }) else { throw RecordsAPI.Failure(status: 404, message: "The expense is no longer available.") }
                populate(Rec(row: row)); persist()
            } catch { self.error = error.localizedDescription }
            busy = false
        }
    }

    private func remove() {
        guard let expense else { return }
        busy = true; error = nil
        Task {
            do {
                _ = try await recs.api.ownerWrite(aircraftId: recs.id, path: "expenses/\(expense.id)", fields: [:], method: "DELETE", query: [.init(name: "base", value: draft.base ?? "")])
                saved = true; try? FileManager.default.removeItem(at: draftUrl); dismiss()
            } catch { self.error = error.localizedDescription }
            busy = false
        }
    }
}

private struct OwnerDocumentButton: View {
    let recs: Recs
    let id: String
    var body: some View {
        Button("Open source document") { LinkInbox.shared.pending = AppLink(aircraftId: recs.id, target: .doc, arg: id) }.buttonStyle(.quiet)
    }
}
