import SwiftUI

struct AnnualPacketScreen: View {
    let recs: Recs
    @State private var manifest: AnnualManifest?
    @State private var selected = Set<String>()
    @State private var cutoff: String? = todayISO()
    @State private var busy = false
    @State private var error: String?
    @State private var file: URL?

    var body: some View {
        RecScreen(section: .share, title: "Prepare annual packet", back: "Share") {
            Note("A dated maintenance summary for your IA, with the evidence you choose. This is an index, not an airworthiness determination or maintenance sign-off.")
            Note("Records through \(cutoff ?? todayISO()). This packet reflects the current records and their source dates.")
            if busy { ProgressView("Preparing packet").padding(.vertical, Tokens.Space.s3) }
            if let error { Note(error, alarm: true) }
            if let manifest {
                GroupHeader(title: "Review before sharing")
                Note("Generated \(manifest.generatedAt.prefix(10)) · records through \(manifest.cutoff)")
                ForEach(Array(manifest.warnings.enumerated()), id: \.offset) { _, warning in
                    Well(alarm: true) { Note(warning, alarm: true) }
                }
                GroupHeader(title: "Include supporting records", count: "\(selected.count) selected")
                Note("Choose up to 100 files. The packet includes only the files selected here; a printed link does not include its evidence.")
                if manifest.evidence.isEmpty { EmptyLine(text: "No eligible evidence is linked yet. The summary still includes missing-record warnings.") }
                ForEach(manifest.evidence) { evidence in
                    Button {
                        if selected.contains(evidence.id) { selected.remove(evidence.id) }
                        else if selected.count < 100 { selected.insert(evidence.id) }
                    } label: {
                        HStack {
                            Image(systemName: selected.contains(evidence.id) ? "checkmark.square.fill" : "square")
                            Text(evidence.label).dFont(.body)
                            Spacer(minLength: 0)
                            if !evidence.available { Text("Unavailable").dFont(.caption) }
                        }
                        .foregroundStyle(Tokens.Colors.ink)
                        .frame(minHeight: 52)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(!evidence.available || busy)
                    .accessibilityAddTraits(selected.contains(evidence.id) ? [.isSelected] : [])
                }
            }
            Button("Refresh packet") { Task { await load() } }.buttonStyle(.quiet).disabled(!recs.online || busy)
            if let file {
                ShareLink(item: file) { Label("Share prepared packet", systemImage: "square.and.arrow.up") }.buttonStyle(.secondary)
            }
        } footer: {
            Button("Make PDF summary") { export(zip: false) }.buttonStyle(.primary).disabled(!recs.online || busy || manifest == nil)
            if recs.canEdit {
                Button("Make evidence ZIP") { export(zip: true) }.buttonStyle(.secondary).disabled(!recs.online || busy || manifest == nil)
            }
            if !recs.online { Note("Preparing a new packet needs signal. A previously saved file remains shareable.") }
        }
        .task(id: "\(recs.id)-\(recs.online)") { await load() }
    }

    private func load() async {
        guard recs.online else { return }
        busy = true; error = nil; file = nil
        do {
            let data = try await recs.api.ownerData(aircraftId: recs.id, path: "annual-packet", query: [.init(name: "format", value: "json")])
            let loaded = try JSONDecoder().decode(AnnualManifest.self, from: data)
            manifest = loaded
            cutoff = loaded.cutoff
            selected.formIntersection(Set(loaded.evidence.filter(\.available).map(\.id)))
        } catch { self.error = error.localizedDescription }
        busy = false
    }

    private func export(zip: Bool) {
        guard let manifest else { return }
        busy = true; error = nil
        Task {
            do {
                let data: Data
                if zip {
                    data = try await recs.api.ownerWrite(aircraftId: recs.id, path: "annual-packet", fields: [
                        "format": "zip", "cutoff": manifest.cutoff,
                        "pageIds": manifest.evidence.filter { $0.kind == "page" && selected.contains($0.id) }.map(\.id),
                        "documentIds": manifest.evidence.filter { $0.kind == "document" && selected.contains($0.id) }.map(\.id),
                    ])
                } else {
                    data = try await recs.api.ownerData(aircraftId: recs.id, path: "annual-packet", query: [.init(name: "format", value: "pdf"), .init(name: "cutoff", value: manifest.cutoff)])
                }
                file = try ownerFile(data, name: "\(recs.tail) annual packet \(manifest.cutoff).\(zip ? "zip" : "pdf")")
            } catch { self.error = error.localizedDescription }
            busy = false
        }
    }
}
