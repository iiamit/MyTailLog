import PDFKit
import QuickLook
import SwiftUI
import UniformTypeIdentifiers

struct DocumentInboxScreen: View {
    let recs: Recs
    @State private var answer: InboxAnswer?
    @State private var selected: Rec?
    @State private var adding = false
    @State private var error: String?
    @State private var busy = false

    private var waiting: [FileJob] { recs.offline.recordFiles.filter { $0.kind == OfflineStore.inboxDocument && $0.aircraftId == recs.id } }

    var body: some View {
        RecScreen(section: .docs, title: "Document inbox", back: "Aircraft") {
            Note("Upload logs, maintenance invoices and oil reports. Review the proposed destination and details before anything is added to your records.")
            if let error { Note(error, alarm: true) }
            if busy { ProgressView("Loading inbox").padding(.vertical, Tokens.Space.s3) }
            ForEach(waiting) { job in
                RecRow(job.meta.fileName ?? "Document", lines: [job.error ?? (job.status == "uploading" ? "Uploading original" : "Saved on this phone · waiting to upload")])
                if job.status == "failed" {
                    Button("Retry \(job.meta.fileName ?? "upload")") { recs.offline.uploader?.retry(job) }.buttonStyle(.secondary)
                }
            }
            if let answer {
                if answer.items.isEmpty && waiting.isEmpty { EmptyLine(text: "No documents waiting for review.") }
                ForEach(answer.items.map { Rec(row: $0) }) { item in
                    RecRow(item.s("file_name") ?? "Document", lines: [item.s("state")?.capitalized ?? "Uploaded", item.s("error")].compactMap { $0 }, action: { selected = item })
                }
            }
            Button("Refresh inbox") { Task { await load() } }.buttonStyle(.quiet).disabled(!recs.online || busy)
        } footer: {
            if recs.canEdit { Button("Upload documents") { adding = true }.buttonStyle(.primary) }
            if !recs.online { Note("Files are saved on this phone and upload when signal returns. Reviewing server proposals needs signal.") }
        }
        .task(id: "\(recs.id)-\(recs.online)-\(waiting.count)") { await load() }
        .sheet(isPresented: $adding, onDismiss: { Task { await load() } }) { InboxUploadSheet(recs: recs) }
        .sheet(item: $selected, onDismiss: { Task { await load() } }) { item in
            InboxReviewSheet(recs: recs, item: item, logbooks: answer?.logbooks ?? [])
        }
    }

    private func load() async {
        guard recs.online else { return }
        busy = true; error = nil
        do { answer = try JSONDecoder().decode(InboxAnswer.self, from: await recs.api.ownerData(aircraftId: recs.id, path: "inbox")) }
        catch { self.error = error.localizedDescription }
        busy = false
    }
}

struct InboxUploadSheet: View {
    let recs: Recs
    @Environment(\.dismiss) private var dismiss
    @State private var importing = false
    @State private var scanning = false
    @State private var ready: [PickedDoc] = []
    @State private var error: String?

    var body: some View {
        RecSheet(title: "Upload documents", dirty: !ready.isEmpty, discardWhat: "upload") {
            Note("Keep the original file, then review suggested logbook, invoice or oil-report details in the inbox.")
            Button("Choose files") { importing = true }.buttonStyle(.secondary).padding(.vertical, Tokens.Space.s3)
            Button("Scan a document") {
                if SystemScanner.isSupported { scanning = true } else { error = "The document camera is unavailable. Choose a file instead." }
            }.buttonStyle(.secondary)
            ForEach(ready) { file in
                RecRow(file.name, lines: [file.mb, file.tooBig ? "Over 25 MB; remove or split this file." : "Original retained"])
                Button("Remove \(file.name)") { ready.removeAll { $0.id == file.id } }.buttonStyle(.quiet)
            }
            if let error { Note(error, alarm: true) }
            Note("PDF, JPEG, PNG or WebP, up to 25 MB each. Files remain on this phone until uploaded successfully.")
            Button("Save to inbox", action: save).buttonStyle(.primary).padding(.top, Tokens.Space.s3)
                .disabled(ready.isEmpty || ready.contains(where: \.tooBig))
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.pdf, .jpeg, .png, .webP], allowsMultipleSelection: true) { result in
            switch result {
            case .failure(let failure): error = failure.localizedDescription
            case .success(let urls):
                for url in urls {
                    let scoped = url.startAccessingSecurityScopedResource()
                    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                    do {
                        let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
                        guard size <= maxDocBytes else { throw RecordsAPI.Failure(status: 413, message: "\(url.lastPathComponent) exceeds 25 MB.") }
                        let bytes = try Data(contentsOf: url)
                        guard bytes.count <= maxDocBytes else { throw RecordsAPI.Failure(status: 413, message: "This file exceeds 25 MB.") }
                        ready.append(PickedDoc(name: url.lastPathComponent, mime: UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream", bytes: bytes))
                    } catch { self.error = error.localizedDescription }
                }
            }
        }
        .fullScreenCover(isPresented: $scanning) {
            SystemScanner { pages in
                scanning = false
                if let pdf = pdfData(pages) { ready.append(PickedDoc(name: "Scan \(todayISO()).pdf", mime: "application/pdf", bytes: pdf)) }
            }.ignoresSafeArea()
        }
    }

    private func save() {
        while let file = ready.first {
            do {
                try recs.offline.addRecordFile(kind: OfflineStore.inboxDocument, aircraftId: recs.id,
                    url: recs.offline.dir.appending(path: "Outbox/inbox/\(newId())"), bytes: file.bytes,
                    meta: FileMeta(fileName: file.name, mimeType: file.mime))
                ready.removeFirst()
            } catch { self.error = "This file could not be saved on the phone. Your remaining selections are retained."; return }
        }
        recs.offline.schedule(after: 0)
        recs.say("Saved to the inbox. Review after upload.")
        dismiss()
    }
}

private struct InboxReviewSheet: View {
    let recs: Recs
    let item: Rec
    let logbooks: [Row]
    @Environment(\.dismiss) private var dismiss
    @State private var kind = "unclassified"
    @State private var logbook = ""
    @State private var component = ""
    @State private var proposal: Row = [:]
    @State private var busy = false
    @State private var error: String?
    @State private var preview: URL?
    @State private var current: Rec?

    private var row: Rec { current ?? item }
    private var approved: Bool { row.s("state") == "approved" }

    var body: some View {
        RecSheet(title: "Review document", dirty: !approved, discardWhat: "review") {
            Text(row.s("file_name") ?? "Document").dFont(.heading).foregroundStyle(Tokens.Colors.ink)
            Note("Original retained · \(row.s("state") ?? "uploaded")")
            Button("Open original") { original() }.buttonStyle(.secondary).disabled(!recs.online || busy)
            if let error { Note(error, alarm: true) }
            if let failure = row.s("error") { Note(failure, alarm: true) }
            if !approved && recs.canEdit {
                ChoiceRow(label: "File as", options: [("unclassified", "Leave unclassified"), ("logbook", "Logbook pages"), ("invoice", "Maintenance invoice"), ("oil_report", "Oil report")], selection: $kind)
                if kind == "logbook" {
                    ChoiceRow(label: "Logbook", options: [("", "Choose a logbook")] + logbooks.map { ($0["id"]?.text ?? "", bookName($0["type"]?.text) ?? "Logbook") }, selection: $logbook)
                }
                if kind == "oil_report" {
                    ChoiceRow(label: "Engine", options: [("", "Unassigned — review later")] + recs.records("component").filter(isCompleteEngine).map { ($0.id, $0.s("name") ?? "Engine") }, selection: $component)
                }
                Button("Read suggested details") { analyze() }.buttonStyle(.secondary).disabled(!recs.online || busy)
                Note("Reading uses the account's AI allowance. Nothing is accepted automatically. Check the original, currency, amounts, dates and component before approval.")
                InboxProposalEditor(kind: kind, proposal: $proposal)
                Note("Correct uncertain details against the original. Leave the document unclassified if you are unsure. Duplicate checks run again before acceptance.")
                Button(busy ? "Working" : "Approve destination and details") { approve() }.buttonStyle(.primary)
                    .disabled(!recs.online || busy || kind == "unclassified" || (kind == "logbook" && logbook.isEmpty))
            } else if approved {
                Note("Accepted. The original is linked to its records; repeating approval will not add duplicates.")
            }
            if busy { ProgressView("Working on document").padding(.vertical, Tokens.Space.s3) }
        }
        .onAppear { populate(item) }
        .quickLookPreview($preview)
    }

    private func populate(_ rec: Rec) {
        current = rec
        kind = rec.s("kind") ?? "unclassified"
        proposal = rec.row.ownerObject("proposal")
    }

    private func original() {
        busy = true; error = nil
        Task {
            do { preview = try ownerFile(await recs.api.ownerData(aircraftId: recs.id, path: "inbox/\(row.id)/file"), name: row.s("file_name") ?? "original.pdf") }
            catch { self.error = error.localizedDescription }
            busy = false
        }
    }

    private func analyze() {
        busy = true; error = nil
        Task {
            do {
                _ = try await recs.api.ownerWrite(aircraftId: recs.id, path: "inbox/\(row.id)/analyze", fields: [:])
                let answer = try JSONDecoder().decode(InboxAnswer.self, from: await recs.api.ownerData(aircraftId: recs.id, path: "inbox"))
                if let updated = answer.items.first(where: { $0["id"]?.text == row.id }) { populate(Rec(row: updated)) }
            } catch { self.error = error.localizedDescription }
            busy = false
        }
    }

    private func approve() {
        let fields = proposal.mapValues { $0.foundationValue }
        busy = true; error = nil
        Task {
            do {
                var body: [String: Any] = ["base": row.s("updated_at") ?? "", "kind": kind, "proposal": fields]
                if !component.isEmpty { body["componentId"] = component }
                if kind == "logbook" {
                    body["logbookId"] = logbook
                    if row.s("mime_type") == "application/pdf" {
                        let data = try await recs.api.ownerData(aircraftId: recs.id, path: "inbox/\(row.id)/file")
                        guard let pdf = PDFDocument(data: data), pdf.pageCount > 0, pdf.pageCount <= 100 else {
                            throw RecordsAPI.Failure(status: 400, message: "Choose a readable PDF with at most 100 pages.")
                        }
                        let staged = Set(row.row.ownerRows("rendered_pages").compactMap { $0["index"]?.number.map(Int.init) })
                        for index in 0..<pdf.pageCount where !staged.contains(index + 1) {
                            guard let page = pdf.page(at: index) else { throw RecordsAPI.Failure(status: 400, message: "A PDF page could not be read.") }
                            let image = page.thumbnail(of: CGSize(width: 1800, height: 2400), for: .mediaBox)
                            guard let jpeg = image.jpegData(compressionQuality: 0.86) else { throw RecordsAPI.Failure(status: 400, message: "A PDF page could not be prepared.") }
                            _ = try await recs.api.ownerWrite(aircraftId: recs.id, path: "inbox/\(row.id)/pages", fields: ["index": index + 1, "image": jpeg.base64EncodedString()])
                        }
                        body["pageCount"] = pdf.pageCount
                        let latest = try JSONDecoder().decode(InboxAnswer.self, from: await recs.api.ownerData(aircraftId: recs.id, path: "inbox"))
                        guard let refreshed = latest.items.first(where: { $0["id"]?.text == row.id }) else { throw RecordsAPI.Failure(status: 404, message: "This inbox item is no longer available.") }
                        body["base"] = refreshed["updated_at"]?.text ?? ""
                        current = Rec(row: refreshed)
                    } else { body["pageCount"] = 1 }
                }
                _ = try await recs.api.ownerWrite(aircraftId: recs.id, path: "inbox/\(row.id)/approve", fields: body)
                await recs.offline.sync()
                recs.say("Destination approved. Logbook extraction still needs entry review.")
                dismiss()
            } catch { self.error = error.localizedDescription }
            busy = false
        }
    }
}

private struct InboxProposalEditor: View {
    let kind: String
    @Binding var proposal: Row

    var body: some View {
        GroupHeader(title: "Proposed details")
        if kind == "invoice" {
            ProposalField(label: "Date (YYYY-MM-DD)", key: "date", fields: $proposal)
            ProposalField(label: "Currency", key: "currency", fields: $proposal)
            InvoiceAmountField(fields: $proposal).id(proposal["currency"]?.text ?? "USD")
            ProposalField(label: "Category", key: "category", fields: $proposal)
            ProposalField(label: "Vendor", key: "vendor", fields: $proposal)
            ProposalField(label: "Notes", key: "notes", fields: $proposal)
            Note("Invoices create financial records visible only to the owner. Credits use a negative amount.")
        } else if kind == "oil_report" {
            ProposalField(label: "Lab", key: "lab", fields: $proposal)
            ProposalField(label: "Report date (YYYY-MM-DD)", key: "report_date", fields: $proposal)
            ProposalField(label: "Oil type", key: "oil_type", fields: $proposal)
            ProposalField(label: "Lab comments", key: "lab_comments", fields: $proposal)
            let samples = proposal.ownerRows("samples")
            ForEach(Array(samples.indices), id: \.self) { index in
                GroupHeader(title: "Sample \(index + 1)")
                let binding = Binding<Row>(get: { proposal.ownerRows("samples")[safe: index] ?? [:] }, set: { row in
                    var all = proposal.ownerRows("samples"); guard all.indices.contains(index) else { return }; all[index] = row
                    proposal["samples"] = .array(all.map(AnyJSON.object))
                })
                ProposalField(label: "Sample date (YYYY-MM-DD)", key: "sample_date", fields: binding)
                ProposalField(label: "Hours on oil", key: "oil_hours", fields: binding, numeric: true)
                ProposalField(label: "Engine hours", key: "engine_hours", fields: binding, numeric: true)
                ForEach(samples[index].ownerObject("elements_ppm").keys.sorted(), id: \.self) { element in
                    let elements = Binding<Row>(get: { binding.wrappedValue.ownerObject("elements_ppm") }, set: { binding.wrappedValue["elements_ppm"] = .object($0) })
                    ProposalField(label: "\(element) (ppm)", key: element, fields: elements, numeric: true)
                }
            }
            if samples.isEmpty { Note("No dated samples have been proposed. Read the report first or leave it unclassified.") }
        } else if kind == "logbook" {
            Note("The selected logbook receives these pages. Extracted entries will wait for your usual side-by-side review; approving this destination does not confirm maintenance compliance.")
        } else {
            Note("Choose a destination or keep the original unclassified.")
        }
    }
}

private struct ProposalField: View {
    let label: String
    let key: String
    @Binding var fields: Row
    var numeric = false
    var body: some View {
        TextBox(label: label, text: Binding(get: { fields[key]?.text ?? "" }, set: { value in
            fields[key] = value.isEmpty ? .null : numeric && Double(value) != nil ? .number(Double(value)!) : .string(value)
        }), number: numeric)
    }
}

private struct InvoiceAmountField: View {
    @Binding var fields: Row
    @State private var amount = ""
    var body: some View {
        TextBox(label: "Amount (\(fields["currency"]?.text ?? "USD"))", text: $amount, number: true)
            .onAppear { amount = fields["amount_minor"]?.number.map { expenseMajorUnits(Int64($0), currency: fields["currency"]?.text ?? "USD") } ?? "" }
            .onChange(of: amount) { _, value in
                if let minor = expenseMinorUnits(value, currency: fields["currency"]?.text ?? "USD") { fields["amount_minor"] = .number(Double(minor)) }
                else { fields["amount_minor"] = .string(value) }
            }
    }
}
