import PhotosUI
import SwiftUI

// M-MAINT-03 New squawk: a photo first (skippable), then words, then a plain severity. Works offline: squawk.create,
// then per photo a file job and squawkPhoto.create waiting on it (C-SQ-02). Port of Android's SquawkCapture.kt.

let maxSquawkPhotos = 4

/// A squawk photo as uploaded: upright, long edge 2048, JPEG (the blob route takes up to 6 MB).
func squawkJPEG(_ image: CGImage) -> Data? {
    PageImaging.cgImage(PageImaging.scaled(CIImage(cgImage: image), longEdge: 2048)).flatMap { PageImaging.jpeg($0, quality: 0.8) }
}

/// Keep the photo on this phone and queue its row behind the upload.
@MainActor func addSquawkPhoto(_ recs: Recs, squawkId: String, jpeg: Data) {
    let photoId = newId()
    do {
        let job = try recs.offline.addRecordFile(kind: OfflineStore.squawkPhoto, aircraftId: recs.id, url: recs.offline.squawkPhotoURL("\(photoId).jpg"),
                                                 bytes: jpeg, meta: FileMeta(squawkId: squawkId, photoId: photoId))
        recs.change("squawkPhoto.create", "squawk_photo", photoId, "Squawk photo", [
            "id": photoId, "squawkId": squawkId, "blobId": photoId, "takenAt": Date().formatted(.iso8601),
        ], dependsOn: job)
    } catch {
        recs.say("Not saved: that photo didn't save on this phone.")
    }
}

/// The system photo picker (no permission), the picks upright and re-encoded as squawk photos.
struct PickPhotos: ViewModifier {
    @Binding var isPresented: Bool
    let max: Int
    let picked: ([Data]) -> Void
    @State private var items: [PhotosPickerItem] = []

    func body(content: Content) -> some View {
        content
            .photosPicker(isPresented: $isPresented, selection: $items, maxSelectionCount: Swift.max(max, 1), matching: .images)
            .onChange(of: items) { _, chosen in
                guard !chosen.isEmpty else { return }
                items = []
                Task {
                    var out: [Data] = []
                    for item in chosen.prefix(max) { if let cg = await item.uprightImage(), let jpeg = squawkJPEG(cg) { out.append(jpeg) } }
                    picked(out)
                }
            }
    }
}

/// A photo from a file, scaled down for a thumbnail.
private func thumbnail(_ url: URL, _ height: CGFloat) -> UIImage? {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
    let opts: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceThumbnailMaxPixelSize: height * 4,
                                 kCGImageSourceCreateThumbnailWithTransform: true]
    return CGImageSourceCreateThumbnailAtIndex(source, 0, opts as CFDictionary).map(UIImage.init(cgImage:))
}

private struct Thumb: View {
    let image: UIImage?
    let height: CGFloat
    var body: some View {
        ZStack {
            Tokens.Colors.leaf2
            if let image { Image(uiImage: image).resizable().scaledToFill() } else { Icon("image", size: 22).foregroundStyle(Tokens.Colors.ink3) }
        }
        .frame(width: height * 4 / 3, height: height)
        .clipShape(RoundedRectangle(cornerRadius: Tokens.Radius.m))
        .accessibilityElement()
        .accessibilityLabel("Squawk photo")
    }
}

/// A dashed **Add a photo** tile (camera icon).
private struct AddPhotoTile: View {
    let height: CGFloat
    var width: CGFloat?
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Icon("camera", size: 22)
                if height > 80 { Text("Add a photo").dFont(.small) }
            }
            .foregroundStyle(Tokens.Colors.ink)
            .frame(width: width ?? height * 4 / 3, height: height)
            .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.m).strokeBorder(Tokens.Colors.controlBorder, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Add a photo")
    }
}

/// Photos in a strip; those on this phone show, the others as a tile; a dashed Add tile when allowed. Tap opens full screen.
struct PhotoStrip: View {
    let recs: Recs
    let photoIds: [String]
    let add: (() -> Void)?
    var height: CGFloat = 120
    @State private var open: String?

    var body: some View {
        if !photoIds.isEmpty || add != nil {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Tokens.Space.s2) {
                    ForEach(photoIds, id: \.self) { pid in
                        let url = recs.offline.squawkPhotoURL("\(pid).jpg")
                        Button { open = pid } label: { Thumb(image: thumbnail(url, height), height: height) }
                            .buttonStyle(.plain)
                            .disabled(!FileManager.default.fileExists(atPath: url.path()))
                    }
                    if let add { AddPhotoTile(height: height, action: add) }
                }
                .padding(.vertical, Tokens.Space.s2)
            }
            .fullScreenCover(item: Binding { open.map { PhotoID(id: $0) } } set: { open = $0?.id }) { p in
                ZoomPhoto(image: UIImage(contentsOfFile: recs.offline.squawkPhotoURL("\(p.id).jpg").path()))
            }
        }
    }

    private struct PhotoID: Identifiable { let id: String }
}

/// A photo full screen with pinch zoom 1–5× (06 §1.7).
struct ZoomPhoto: View {
    let image: UIImage?
    @Environment(\.dismiss) private var dismiss
    @State private var scale: CGFloat = 1
    @GestureState private var pinch: CGFloat = 1

    var body: some View {
        ZStack(alignment: .topLeading) {
            Tokens.Colors.cover.ignoresSafeArea()
            if let image {
                Image(uiImage: image).resizable().scaledToFit()
                    .scaleEffect(min(max(scale * pinch, 1), 5))
                    .gesture(MagnifyGesture().updating($pinch) { v, s, _ in s = v.magnification }.onEnded { scale = min(max(scale * $0.magnification, 1), 5) })
                    .onTapGesture(count: 2) { scale = scale > 1 ? 1 : 2.5 }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .accessibilityLabel("Squawk photo")
            }
            Button { dismiss() } label: { Icon("x").frame(width: 44, height: 44) }
                .foregroundStyle(Tokens.Colors.onCover).padding(Tokens.Space.s2).accessibilityLabel("Close")
        }
    }
}

/// The full-screen cover: camera, then words (06 M-MAINT-03).
struct NewSquawk: View {
    let recs: Recs
    @Environment(\.dismiss) private var dismiss
    @State private var photos: [Data] = []
    @State private var words = false
    @State private var picking = false
    @State private var engine = CameraEngine()
    @State private var phase: Phase = .starting
    @State private var busy = false

    enum Phase { case starting, running, denied, unavailable }

    var body: some View {
        Group {
            if words {
                SquawkWords(recs: recs, photos: $photos, back: { words = false }, addPhoto: { picking = true })
            } else {
                camera
            }
        }
        .modifier(PickPhotos(isPresented: $picking, max: maxSquawkPhotos - photos.count) { picked in
            photos += picked.prefix(maxSquawkPhotos - photos.count)
            if !photos.isEmpty { words = true }
        })
    }

    private var camera: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Button { dismiss() } label: { Icon("x").frame(width: 44, height: 44) }.accessibilityLabel("Cancel")
                Text("New squawk").dFont(.bodyStrong)
                Spacer()
            }
            .padding(.horizontal, Tokens.Space.s2)
            .frame(height: 56)
            Text("Photograph it first. You can skip this.").dFont(.body).padding(.horizontal, Tokens.Space.s4)
            ZStack {
                switch phase {
                case .running, .starting: CameraPreview(session: engine.session)
                case .denied, .unavailable:
                    Tokens.Colors.cover2
                    VStack(alignment: .leading, spacing: Tokens.Space.s3) {
                        Text(phase == .denied ? "MyTailLog needs the camera to photograph the squawk." : "The camera isn't available. Choose from Library, or skip the photo.")
                            .dFont(.body)
                        if phase == .denied, let url = URL(string: UIApplication.openSettingsURLString) {
                            Link("Open Settings", destination: url).dFont(.bodyStrong)
                        }
                    }
                    .padding(Tokens.Space.s4)
                }
                if phase == .running {
                    VStack {
                        Spacer()
                        Button(action: shoot) {
                            Circle().fill(busy || photos.count >= maxSquawkPhotos ? Tokens.Colors.onCover2 : Tokens.Colors.onCover)
                                .overlay(Circle().strokeBorder(Tokens.Colors.cover2, lineWidth: 4))
                                .frame(width: 72, height: 72)
                        }
                        .buttonStyle(.plain)
                        .disabled(busy || photos.count >= maxSquawkPhotos)
                        .accessibilityLabel("Take photo")
                        .padding(.bottom, Tokens.Space.s4)
                    }
                }
            }
            .clipped()
            .padding(.vertical, Tokens.Space.s2)
            if !photos.isEmpty {
                HStack(spacing: Tokens.Space.s2) {
                    ForEach(Array(photos.enumerated()), id: \.offset) { _, d in Thumb(image: UIImage(data: d), height: 48) }
                    Text("\(photos.count) / \(maxSquawkPhotos)").dFont(.small)
                }
                .padding(.horizontal, Tokens.Space.s4)
            }
            HStack {
                Button { picking = true } label: { Label { Text("Library") } icon: { Icon("image", size: 18) } }
                Spacer()
                Button { words = true } label: {
                    Label { Text(photos.isEmpty ? "Skip photo" : "Next") } icon: { Icon(photos.isEmpty ? "pencil" : "chevron-right", size: 18) }
                }
            }
            .dFont(.bodyStrong)
            .frame(minHeight: 44)
            .padding(.horizontal, Tokens.Space.s4)
            .frame(height: 96)
        }
        .foregroundStyle(Tokens.Colors.onCover)
        .background(Tokens.Colors.cover.ignoresSafeArea())
        .task {
            switch CameraEngine.authorized {
            case .notDetermined: if !(await CameraEngine.requestAccess()) { phase = .denied; return }
            case .authorized: break
            default: phase = .denied; return
            }
            phase = engine.start() ? .running : .unavailable
        }
        .onDisappear { engine.stop() }
    }

    private func shoot() {
        busy = true
        engine.capture { image in
            let jpeg = image.flatMap(squawkJPEG)
            Task { @MainActor in
                if let jpeg, photos.count < maxSquawkPhotos { photos.append(jpeg); UIImpactFeedbackGenerator(style: .light).impactOccurred() }
                busy = false
            }
        }
    }
}

/// Step 2: the words (typed or dictated with the keyboard's mic) and the severity; **Add squawk** once there is text
/// or a photo, and a severity.
private struct SquawkWords: View {
    let recs: Recs
    @Binding var photos: [Data]
    let back: () -> Void
    let addPhoto: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var severity: Int?
    @State private var asking = false
    @FocusState private var focused: Bool

    private var dirty: Bool { !text.trimmingCharacters(in: .whitespaces).isEmpty || !photos.isEmpty }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .center) {
                        HStack(spacing: Tokens.Space.s2) {
                            ForEach(Array(photos.enumerated()), id: \.offset) { _, d in Thumb(image: UIImage(data: d), height: 70) }
                            if photos.count < maxSquawkPhotos { AddPhotoTile(height: 70, width: 70, action: addPhoto) }
                        }
                        Spacer()
                        Text(recs.tail).dFont(.caption, weight: 700).foregroundStyle(Tokens.Colors.ink)
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.s).strokeBorder(Tokens.Colors.ink, lineWidth: 1))
                    }
                    .padding(.vertical, Tokens.Space.s3)
                    TextBox(label: "What did you notice?", text: $text, lines: 4, placeholder: "e.g. Left wingtip nav light lens is cracked")
                        .focused($focused)
                    Note("Tap the keyboard's microphone to speak.").padding(.bottom, Tokens.Space.s3)
                    Text("How serious is it?").dFont(.small, weight: 700).foregroundStyle(Tokens.Colors.ink2).padding(.top, Tokens.Space.s2)
                    RadioRows(label: "How serious is it?", options: severityMeanings, selection: $severity)
                }
                .padding(.horizontal, Tokens.Space.s4)
            }
            .background(Tokens.Colors.leaf)
            .safeAreaInset(edge: .bottom) {
                Button("Add squawk", action: save).buttonStyle(.primary)
                    .disabled(!dirty || severity == nil)
                    .padding(Tokens.Space.s4).background(Tokens.Colors.leaf)
            }
            .navigationTitle("New squawk")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { if dirty { asking = true } else { back() } } label: {
                        HStack(spacing: 2) { Icon("chevron-left"); Text("Photo") }
                    }
                    .accessibilityLabel("Back to Photo")
                }
            }
            .confirmationDialog("Discard this squawk?", isPresented: $asking, titleVisibility: .visible) {
                Button("Discard", role: .destructive) { dismiss() }
                Button("Keep editing", role: .cancel) {}
            }
        }
        .environment(\.section, .maint)
        .onAppear { if photos.isEmpty { focused = true } }
    }

    private func save() {
        guard let severity else { return }
        let id = newId()
        let words = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard recs.change("squawk.create", "squawk", id, "Squawk: \((words.isEmpty ? "photo" : words).prefix(40))", [
            "id": id, "description": words.isEmpty ? "See the photo." : words, "severity": severities[severity], "reportedAt": Date().formatted(.iso8601),
        ]) != nil else { return }
        photos.forEach { addSquawkPhoto(recs, squawkId: id, jpeg: $0) }
        recs.say("Squawk added to \(recs.tail)." + (recs.online ? "" : " Saved on this phone."))
        dismiss()
    }
}
