import PDFKit
import SwiftUI
import UniformTypeIdentifiers

// 06 §8 Documents (M-DOCS-01..03): the vault with the carry-aboard four first. Adding works offline (a file job of kind
// document, uploaded by the sync run); metadata edits go through the outbox. Port of Android's DocsScreens.kt.

let maxDocBytes = 25 * 1024 * 1024

/// A document waiting on this phone (not uploaded yet).
struct HeldDoc: Identifiable {
    let id: String
    let type: String
    let title: String
    let failed: String?
}

@MainActor func heldDocs(_ recs: Recs) -> [HeldDoc] {
    recs.offline.recordFiles.filter { $0.kind == OfflineStore.document && $0.aircraftId == recs.id }
        .map { HeldDoc(id: $0.id, type: $0.meta.type ?? "other", title: $0.meta.title ?? $0.meta.fileName ?? "Document", failed: $0.status == "failed" ? $0.error : nil) }
}

/// The offline copy of a document, when this phone has it.
@MainActor func localDoc(_ recs: Recs, _ d: Rec) -> URL? {
    let url = recs.offline.docURL(d.id, fileName: d.s("file_name"))
    return FileManager.default.fileExists(atPath: url.path()) ? url : nil
}

@MainActor func fetchDoc(_ recs: Recs, _ d: Rec) async throws -> URL {
    let data = try await recs.api.documentFile(d.id)
    let url = recs.offline.docURL(d.id, fileName: d.s("file_name"))
    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    return url
}

/// M-DOCS-01 Documents and carry-aboard.
struct DocumentsScreen: View {
    let recs: Recs
    /// The phone pushes Documents from Aircraft; the tablet shows it as its own tab.
    var pushed = true
    @Environment(\.recNav) private var nav
    @State private var query = ""
    @State private var adding: AddStart?
    @State private var removing: Rec?

    struct AddStart: Identifiable { let type: String?; var id: String { type ?? "" } }

    var body: some View {
        let docs = recs.records("document")
        let held = heldDocs(recs)
        Group {
            if pushed {
                RecScreen(section: .docs, title: "Documents", back: "Aircraft") { list(docs, held) } footer: { addButton }
            } else {
                RecLeaf { list(docs, held) } footer: { addButton }
            }
        }
        .sheet(item: $adding) { AddDocSheet(recs: recs, startType: $0.type) }
        .modifier(RemoveDoc(recs: recs, doc: $removing))
        .task(id: "\(recs.online)\(docs.count)") {
            // The carry-aboard four open offline once added (C-DOCS-02): fetch their files while there is signal.
            guard recs.online else { return }
            for d in docs where carryAboard.contains(d.s("type") ?? "") && !d.pending && localDoc(recs, d) == nil { _ = try? await fetchDoc(recs, d) }
        }
    }

    @ViewBuilder private var addButton: some View {
        if recs.canEdit {
            Button { adding = AddStart(type: nil) } label: { Label { Text("Add a document") } icon: { Icon("file-plus-2", size: 18) } }.buttonStyle(.primary)
        }
    }

    @ViewBuilder private func list(_ docs: [Rec], _ held: [HeldDoc]) -> some View {
        if docs.isEmpty && held.isEmpty {
            EmptyLine(text: "Nothing in Documents yet. Add the registration and airworthiness certificate and they travel with you.")
        }
        TextBox(label: "Search", text: $query)
        if !held.isEmpty {
            Well {
                Lede(held.count == 1 ? "1 document on this phone. It uploads when you have signal." : "\(held.count) documents on this phone. They upload when you have signal.")
                ForEach(held) { h in Note("\(docTypeName(h.type)) · \(h.title)" + (h.failed.map { " · \($0)" } ?? ""), alarm: h.failed != nil) }
            }
        }
        let latest: (String) -> Rec? = { t in docs.filter { $0.s("type") == t }.max { ($0.s("document_date") ?? $0.s("created_at") ?? "") < ($1.s("document_date") ?? $1.s("created_at") ?? "") } }
        let missing = carryAboard.filter { latest($0) == nil }.count
        GroupHeader(title: "Carry aboard", count: missing == 0 ? "All 4 here" : "\(missing) missing")
        ForEach(carryAboard, id: \.self) { t in
            if let d = latest(t) {
                if matches(d) { DocRow(recs: recs, d: d, remove: { removing = d }) }
            } else {
                RecRow(title: docTypeName(t), lines: ["Not in Documents yet"]) {
                    EmptyView()
                } below: {
                    if recs.canEdit { Button("Add it") { adding = AddStart(type: t) }.buttonStyle(.secondary) }
                }
            }
        }
        let shown = Set(carryAboard.compactMap { latest($0)?.id })
        let rest = docs.filter { !shown.contains($0.id) && matches($0) }.sorted { ($0.s("created_at") ?? "") > ($1.s("created_at") ?? "") }
        GroupHeader(title: "Everything else", count: "\(rest.count)")
        ForEach(rest) { d in DocRow(recs: recs, d: d, remove: { removing = d }) }
        ViewerLine(recs: recs)
    }

    private func matches(_ d: Rec) -> Bool {
        query.isEmpty || [d.s("title"), docTypeName(d.s("type")), d.s("reference"), d.s("file_name")].compactMap { $0 }.contains { $0.localizedCaseInsensitiveContains(query) }
    }
}

private struct DocRow: View {
    let recs: Recs
    let d: Rec
    let remove: () -> Void
    @Environment(\.recNav) private var nav

    var body: some View {
        let local = localDoc(recs, d)
        let type = docTypeName(d.s("type"))
        let expiry = d.s("expires_on").map { "Expires \(longDate($0))" } ?? (expiringTypes.contains(d.s("type") ?? "") || d.b("track_expiry") ? "No expiry date" : nil)
        let meta = [type != d.s("title") ? type : nil, docMeta(mime: d.s("mime_type"), createdAt: d.s("created_at"))].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
        var menu: [RowAction] = []
        if recs.canEdit { menu.append(RowAction(title: "Remove from Documents", role: .destructive, run: remove)) }
        return RecRow(d.s("title") ?? type,
                      lines: [meta.isEmpty ? nil : meta, d.s("log_entry_id").flatMap { recs.entryLine($0) }.map { "linked to \($0)" }, expiry,
                              local == nil && !recs.online ? "Not on this phone yet" : nil].compactMap { $0 },
                      rec: d, action: { nav.open(.doc(d.id)) }, menu: menu)
    }
}

private struct RemoveDoc: ViewModifier {
    let recs: Recs
    @Binding var doc: Rec?
    var then: () -> Void = {}

    func body(content: Content) -> some View {
        content.confirmationDialog("Remove \(doc?.s("title") ?? docTypeName(doc?.s("type")))?", isPresented: Binding { doc != nil } set: { if !$0 { doc = nil } },
                                   titleVisibility: .visible, presenting: doc) { d in
            Button("Remove from Documents", role: .destructive) {
                recs.delete("document.delete", "document", d.id, "Remove \(d.s("title") ?? "document")", ["documentId": d.id])
                try? FileManager.default.removeItem(at: recs.offline.docURL(d.id, fileName: d.s("file_name")))
                then()
            }
        } message: { _ in Text("The file and its details leave Documents. Linked logbook entries stay.") }
    }
}

// MARK: Viewer (M-DOCS-02)

struct DocViewer: View {
    let recs: Recs
    let id: String
    @State private var file: URL?
    @State private var failed = false
    @State private var details = false

    var body: some View {
        if let d = recs.rec("document", id) {
            let isPDF = d.s("mime_type")?.contains("pdf") == true
            RecScreen(section: .docs, title: d.s("title") ?? docTypeName(d.s("type")), back: "Documents") {
                if let file {
                    if isPDF { PDFPages(url: file).frame(minHeight: 520) }
                    else if let image = UIImage(contentsOfFile: file.path()) { Image(uiImage: image).resizable().scaledToFit().accessibilityLabel(d.s("title") ?? "Document") }
                    else { EmptyLine(text: "This file couldn't be opened. Share it to another app to read it.") }
                } else if failed {
                    EmptyLine(text: "This file couldn't be opened. Share it to another app to read it.")
                } else {
                    EmptyLine(text: "This document isn't on this phone yet. It downloads when you have signal.")
                }
            } footer: {
                HStack(spacing: Tokens.Space.s2) {
                    if let file { ShareLink(item: file) { Text("Share") }.buttonStyle(.secondary) }
                    else { Button("Share") {}.buttonStyle(.secondary).disabled(true) }
                    Button { if let file { print(file, d.s("title") ?? "Document") } } label: { Label { Text("Print") } icon: { Icon("printer", size: 18) } }
                        .buttonStyle(.secondary).disabled(file == nil || !isPDF)
                    if recs.canEdit { Button("Details") { details = true }.buttonStyle(.secondary) }
                }
            }
            .task(id: "\(id)\(recs.online)") {
                file = localDoc(recs, d)
                guard file == nil, recs.online, !d.pending else { return }
                do { file = try await fetchDoc(recs, d) } catch { failed = true }
            }
            .sheet(isPresented: $details) { DocDetailsSheet(recs: recs, d: d) }
        } else {
            RecScreen(section: .docs, title: "Documents", back: "Documents") { EmptyLine(text: "This record is no longer on this phone.") }
        }
    }

    /// Print a PDF through the system print sheet (M-DOCS-02).
    private func print(_ url: URL, _ name: String) {
        let c = UIPrintInteractionController.shared
        let info = UIPrintInfo(dictionary: nil)
        info.jobName = name
        info.outputType = .general
        c.printInfo = info
        c.printingItem = url
        c.present(animated: true)
    }
}

/// A PDF, paged and pinch-zoomable (PDFKit; 06 §1.7).
struct PDFPages: UIViewRepresentable {
    let url: URL
    func makeUIView(context: Context) -> PDFView {
        let v = PDFView()
        v.autoScales = true
        v.displayMode = .singlePageContinuous
        v.minScaleFactor = v.scaleFactorForSizeToFit
        v.maxScaleFactor = 5
        v.backgroundColor = UIColor(Tokens.Colors.leaf2)
        v.document = PDFDocument(url: url)
        return v
    }
    func updateUIView(_ v: PDFView, context: Context) { if v.document?.documentURL != url { v.document = PDFDocument(url: url) } }
}

/// Details (M-DOCS-02): title, type, date, expiry, reference, linked entry, notes; remove. Works offline.
private struct DocDetailsSheet: View {
    let recs: Recs
    let d: Rec
    @Environment(\.dismiss) private var dismiss
    @Environment(\.recNav) private var nav
    @State private var loaded = false
    @State private var title = ""
    @State private var type = "other"
    @State private var date: String?
    @State private var track = false
    @State private var expires: String?
    @State private var reference = ""
    @State private var entry: String?
    @State private var notes = ""
    @State private var removing: Rec?

    var body: some View {
        RecSheet(title: "Details") {
            TextBox(label: "Title", text: $title)
            ChoiceRow(label: "What is it?", options: docTypes, selection: $type)
            DateRow(label: "Date", date: $date, clearable: true)
            SwitchRow(label: "Track its expiry", on: $track)
            if track { DateRow(label: "Expires", date: $expires, pastOnly: false, clearable: true) }
            TextBox(label: "Reference", text: $reference)
            EntryChoice(recs: recs, label: "Linked entry", selected: $entry, allowNone: "Not linked")
            TextBox(label: "Notes", text: $notes, lines: 2)
            Button("Save", action: save).buttonStyle(.primary).padding(.top, Tokens.Space.s2)
            Button("Remove from Documents") { removing = d }.buttonStyle(.quiet)
        }
        .onAppear {
            guard !loaded else { return }
            loaded = true
            title = d.s("title") ?? ""; type = d.s("type") ?? "other"; date = d.s("document_date"); track = d.b("track_expiry")
            expires = d.s("expires_on"); reference = d.s("reference") ?? ""; entry = d.s("log_entry_id"); notes = d.s("notes") ?? ""
        }
        .modifier(RemoveDoc(recs: recs, doc: $removing, then: { dismiss(); nav.back() }))
    }

    private func save() {
        func t(_ s: String) -> String? { let v = s.trimmingCharacters(in: .whitespacesAndNewlines); return v.isEmpty ? nil : v }
        recs.change("document.update", "document", d.id, "Document details", ["documentId": d.id, "fields": payload([
            "title": t(title), "type": type, "document_date": date, "reference": t(reference), "notes": t(notes),
        ])])
        if track != d.b("track_expiry") || expires != d.s("expires_on") {
            recs.change("document.setExpiry", "document", d.id, "Document expiry", payload(["documentId": d.id, "trackExpiry": track, "expiresOn": expires]))
        }
        if entry != d.s("log_entry_id") {
            recs.change("document.setEntry", "document", d.id, "Attach document", payload(["documentId": d.id, "entryId": entry]))
        }
        dismiss()
    }
}

// MARK: Add a document (M-DOCS-03)

/// A file chosen in the add sheet, read into memory (25 MB each at most).
struct PickedDoc: Identifiable {
    let id = UUID()
    let name: String
    let mime: String
    let bytes: Data
    var tooBig: Bool { bytes.count > maxDocBytes }
    var mb: String { ByteCountFormatter.string(fromByteCount: Int64(bytes.count), countStyle: .file) }
}

/// Pages from the document camera as one PDF.
func pdfData(_ pages: [CGImage]) -> Data? {
    let doc = PDFDocument()
    for (i, cg) in pages.enumerated() { if let p = PDFPage(image: UIImage(cgImage: cg)) { doc.insert(p, at: i) } }
    return doc.pageCount > 0 ? doc.dataRepresentation() : nil
}

struct AddDocSheet: View {
    let recs: Recs
    let startType: String?
    @Environment(\.dismiss) private var dismiss
    @State private var ready: [PickedDoc] = []
    @State private var type: String = ""
    @State private var name = ""
    @State private var expires: String?
    @State private var error: String?
    @State private var scanning = false
    @State private var importing = false

    var body: some View {
        let ok = ready.filter { !$0.tooBig && !$0.bytes.isEmpty }
        RecSheet(title: "Add a document", dirty: !ready.isEmpty, discardWhat: "document") {
            HStack(spacing: Tokens.Space.s2) {
                SourceTile(icon: "camera", title: "Use the camera", sub: "Finds the page edges") {
                    if SystemScanner.isSupported { scanning = true } else { error = "The document camera isn't available on this device. Choose a file instead." }
                }
                SourceTile(icon: "file-text", title: "Choose a file", sub: "Files or photos") { importing = true }
            }
            .padding(.top, Tokens.Space.s3)
            if !ready.isEmpty {
                GroupHeader(title: "Ready to add")
                ForEach(ready) { p in
                    RecRow(p.name, lines: [p.mb + (p.tooBig ? " · over 25 MB, can't be added" : "")]) {
                        Button { ready.removeAll { $0.id == p.id } } label: { Icon("x").frame(width: 44, height: 44) }
                            .foregroundStyle(Tokens.Colors.ink).accessibilityLabel("Remove \(p.name)")
                    }
                }
            }
            ChoiceRow(label: "What is it?", options: [("", "Choose")] + docTypes, selection: $type)
            TextBox(label: "Name it (optional)", text: $name)
            if expiringTypes.contains(type) { DateRow(label: "Expires", date: $expires, pastOnly: false, clearable: true) }
            if let error { Note(error, alarm: true) }
            Note("PDF or a photo, up to 25 MB each.").padding(.top, Tokens.Space.s2)
            Button("Add to Documents") { add(ok) }.buttonStyle(.primary).padding(.top, Tokens.Space.s3).disabled(ok.isEmpty || type.isEmpty)
        }
        .onAppear { if type.isEmpty { type = startType ?? "" } }
        .fullScreenCover(isPresented: $scanning) {
            SystemScanner { pages in
                scanning = false
                if let pdf = pdfData(pages) { ready.append(PickedDoc(name: "Scan \(todayISO()).pdf", mime: "application/pdf", bytes: pdf)) }
            }
            .ignoresSafeArea()
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.pdf, .image], allowsMultipleSelection: true) { result in
            guard case .success(let urls) = result else { return }
            for url in urls {
                let scoped = url.startAccessingSecurityScopedResource()
                defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                guard let data = try? Data(contentsOf: url) else { continue }
                let mime = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? (url.pathExtension.lowercased() == "pdf" ? "application/pdf" : "image/jpeg")
                ready.append(PickedDoc(name: url.lastPathComponent, mime: mime, bytes: data))
            }
        }
    }

    private func add(_ ok: [PickedDoc]) {
        let typed = name.trimmingCharacters(in: .whitespaces)
        for (i, p) in ok.enumerated() {
            let title = typed.isEmpty ? (p.name as NSString).deletingPathExtension : ok.count > 1 ? "\(typed) \(i + 1)" : typed
            let meta = FileMeta(type: type, title: title, fileName: p.name, mimeType: p.mime, trackExpiry: expiringTypes.contains(type), expiresOn: expires)
            do {
                try recs.offline.addRecordFile(kind: OfflineStore.document, aircraftId: recs.id,
                                               url: recs.offline.dir.appending(path: "Outbox/docs/\(newId())"), bytes: p.bytes, meta: meta)
            } catch {
                self.error = "Not saved: that file didn't save on this phone."
                return
            }
        }
        recs.offline.schedule(after: 0)
        recs.say(recs.online ? "Added to Documents." : "Saved on this phone. It uploads when you have signal.")
        dismiss()
    }
}

private struct SourceTile: View {
    let icon: String
    let title: String
    let sub: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 4) {
                Icon(icon, size: 22)
                Text(title).dFont(.bodyStrong)
                Note(sub)
            }
            .foregroundStyle(Tokens.Colors.ink)
            .frame(maxWidth: .infinity, minHeight: 96, alignment: .topLeading)
            .padding(Tokens.Space.s3)
            .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.m).strokeBorder(Tokens.Colors.controlBorder, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
