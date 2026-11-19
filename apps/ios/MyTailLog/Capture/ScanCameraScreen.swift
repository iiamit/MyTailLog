import PhotosUI
import SwiftUI

/// What the page camera sees, frame by frame: the outline, the hint and when to take the shot (05 §15.1).
@MainActor @Observable
final class ScanCameraModel {
    enum Phase: Equatable { case starting, running, unavailable, denied }
    private(set) var phase: Phase = .starting
    private(set) var quad: Quad?
    private(set) var hint: CoachHint = .looking
    private(set) var bufferSize = CGSize(width: 3, height: 4)
    private(set) var busy = false
    private(set) var pulse = 0
    var torch = false { didSet { engine.setTorch(torch) } }
    let engine = CameraEngine()
    private var steady = Steadiness()
    let session: ScanSession

    init(session: ScanSession) { self.session = session }

    var hasTorch: Bool { engine.hasTorch }

    func start() async {
        switch CameraEngine.authorized {
        case .notDetermined:
            guard await CameraEngine.requestAccess() else { phase = .denied; return }
        case .authorized: break
        default: phase = .denied; return
        }
        engine.onFrame = { [weak self] buffer, time in
            let quad = PageFinder.find(in: buffer, orientation: .up)
            let light = PageImaging.brightness(CIImage(cvPixelBuffer: buffer).transformed(by: CGAffineTransform(scaleX: 0.1, y: 0.1)))
            let size = CGSize(width: CVPixelBufferGetWidth(buffer), height: CVPixelBufferGetHeight(buffer))
            Task { @MainActor in self?.frame(quad, light: light, size: size, time: time) }
        }
        phase = engine.start() ? .running : .unavailable
    }

    func stop() { engine.stop() }

    private func frame(_ q: Quad?, light: Double, size: CGSize, time: TimeInterval) {
        quad = q
        bufferSize = size
        hint = CoachHint.hint(quad: q, brightness: light)
        guard hint == .holdStill, !busy, session.pages.count < 50 || limitAccepted else { steady.reset(); return }
        if steady.feed(q, at: time, deviceStill: engine.deviceStill) { shoot() }
    }

    var limitAccepted = false

    /// Auto-capture and the shutter. The next capture waits until this page is on disk.
    func shoot() {
        guard !busy, phase == .running else { return }
        busy = true
        let quad = self.quad
        engine.capture { [weak self] image in
            let page = image.flatMap { PageProcessor.process($0, quad: quad) }
            Task { @MainActor in
                guard let self else { return }
                if let page, self.session.hold(page) { self.pulse += 1 }
                self.steady.reset()
                self.busy = false
            }
        }
    }

    /// Photos chosen instead (05 §15.3) or the system scanner's flattened pages (05 §15.2).
    func hold(images: [CGImage], flat: Bool) async {
        busy = true
        for cg in images {
            let page = await Task.detached { PageProcessor.process(cg, alreadyFlat: flat) }.value
            if let page { session.hold(page) }
        }
        busy = false
    }
}

extension ScanCameraModel: Identifiable {}

/// M-SCAN-02 Camera: edges found, steady shot taken automatically, running count, the last page, where it lands.
struct ScanCameraScreen: View {
    @State var model: ScanCameraModel
    let onDone: () -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.openURL) private var openURL
    @State private var confirmCancel = false
    @State private var strip = false
    @State private var systemScanner = false
    @State private var picks: [PhotosPickerItem] = []
    @State private var flash = false

    private var session: ScanSession { model.session }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            ZStack(alignment: .top) {
                preview
                if let line = session.landsIn {
                    Label { Text(line).dFont(.small, weight: 600) } icon: { Icon("route", size: 16) }
                        .foregroundStyle(Tokens.Colors.onCover)
                        .padding(.horizontal, Tokens.Space.s3)
                        .frame(minHeight: 36)
                        .background(Tokens.Colors.cover2, in: Capsule())
                        .padding(.top, Tokens.Space.s3)
                        .accessibilityLabel(line)
                }
            }
            bottomBar
        }
        .background(Tokens.Colors.cover.ignoresSafeArea())
        .statusBarHidden()
        .task { await model.start() }
        .onDisappear { model.stop() }
        .onChange(of: model.pulse) {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            UIAccessibility.post(notification: .announcement, argument: "Page \(session.pages.count) taken" + (session.landsIn.map { ". \($0)" } ?? ""))
            guard !reduceMotion else { return }
            flash = true
            Task { try? await Task.sleep(for: .milliseconds(120)); flash = false }
        }
        .onChange(of: model.hint) { _, h in if h == .holdStill { UIAccessibility.post(notification: .announcement, argument: "Page found") } }
        .confirmationDialog("Keep the \(session.pages.count) pages you took?", isPresented: $confirmCancel, titleVisibility: .visible) {
            Button("Keep them") { session.finish(); dismiss() }
            Button("Delete them", role: .destructive) { session.discardAll(); dismiss() }
        }
        .alert("That's 50 pages. Upload these before shooting more?", isPresented: Binding(
            get: { session.pages.count >= 50 && !model.limitAccepted }, set: { _ in })) {
            Button("Continue") { model.limitAccepted = true }
            Button("Done") { done() }
        }
        .sheet(isPresented: $strip) { ScanStrip(session: session) }
        .fullScreenCover(isPresented: $systemScanner) {
            SystemScanner { images in
                systemScanner = false
                Task { await model.hold(images: images, flat: true) }
            }
            .ignoresSafeArea()
        }
        .onChange(of: picks) { _, items in
            guard !items.isEmpty else { return }
            Task {
                var images: [CGImage] = []
                for item in items { if let cg = await item.uprightImage() { images.append(cg) } }
                picks = []
                await model.hold(images: images, flat: false)
            }
        }
    }

    private var topBar: some View {
        HStack {
            Button {
                if session.pages.isEmpty { session.discardAll(); dismiss() } else { confirmCancel = true }
            } label: {
                Icon("x").frame(width: 44, height: 44)
            }
            .accessibilityLabel("Cancel")
            Spacer()
            Text(session.title).dFont(.bodyStrong)
            Spacer()
            Menu {
                if SystemScanner.isSupported { Button("Use the system scanner") { systemScanner = true } }
                PhotosPicker("Choose photos", selection: $picks, matching: .images)
            } label: { Icon("images").frame(width: 44, height: 44) }
            .accessibilityLabel("More ways to add pages")
        }
        .foregroundStyle(Tokens.Colors.onCover)
        .padding(.horizontal, Tokens.Space.s2)
        .frame(height: 56)
    }

    @ViewBuilder private var preview: some View {
        switch model.phase {
        case .running, .starting:
            GeometryReader { g in
                ZStack(alignment: .bottom) {
                    CameraPreview(session: model.engine.session)
                    QuadOverlay(quad: model.quad, frame: aspectFillRect(content: model.bufferSize, in: g.size), pulse: flash || model.busy)
                    if flash { Tokens.Colors.onCover.opacity(0.85).allowsHitTesting(false) }
                    Label { Text(model.hint.text).dFont(.small, weight: 600) } icon: { Icon("scan-line", size: 16) }
                        .foregroundStyle(Tokens.Colors.onCover)
                        .padding(.horizontal, Tokens.Space.s4)
                        .frame(minHeight: 40)
                        .background(Tokens.Colors.cover.opacity(0.85), in: Capsule())
                        .padding(.bottom, Tokens.Space.s4)
                        .accessibilityAddTraits(.updatesFrequently)
                }
                .overlay(alignment: .topTrailing) {
                    if model.hasTorch {
                        Button { model.torch.toggle() } label: {
                            Icon("flashlight").frame(width: 44, height: 44).foregroundStyle(Tokens.Colors.onCover)
                        }
                        .accessibilityLabel(model.torch ? "Turn off the torch" : "Turn on the torch")
                        .padding(.top, 52)
                    }
                }
            }
            .clipped()
        case .denied:
            fallback("MyTailLog needs the camera to photograph pages. You can allow it in Settings.", settings: true)
        case .unavailable:
            fallback("The camera can't start on this device. Use the system scanner or choose photos instead.", settings: false)
        }
    }

    private func fallback(_ line: String, settings: Bool) -> some View {
        VStack(spacing: Tokens.Space.s4) {
            Spacer()
            Text(line).dFont(.body).foregroundStyle(Tokens.Colors.onCover).multilineTextAlignment(.center)
            if settings {
                Button("Open Settings") { if let u = URL(string: UIApplication.openSettingsURLString) { openURL(u) } }
                    .buttonStyle(.primary)
            } else if SystemScanner.isSupported {
                Button("Use the system scanner") { systemScanner = true }.buttonStyle(.primary)
            }
            PhotosPicker("Choose photos instead", selection: $picks, matching: .images).buttonStyle(.secondary)
            if model.busy { ProgressView().tint(Tokens.Colors.onCover) }
            Spacer()
        }
        .padding(Tokens.Space.s6)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Tokens.Colors.cover2)
    }

    private var bottomBar: some View {
        HStack {
            Button { strip = true } label: {
                if let last = session.pages.last {
                    Image(uiImage: last.thumb).resizable().aspectRatio(contentMode: .fill)
                        .frame(width: 56, height: 74).clipShape(RoundedRectangle(cornerRadius: Tokens.Radius.s))
                        .overlay(alignment: .topTrailing) {
                            Text("\(session.pages.count)").dFont(.tabLabel).foregroundStyle(Tokens.Colors.ink)
                                .padding(.horizontal, 5).frame(minWidth: 20, minHeight: 20)
                                .background(Tokens.Colors.leaf, in: Capsule()).offset(x: 6, y: -6)
                        }
                } else {
                    Color.clear.frame(width: 56, height: 74)
                }
            }
            .disabled(session.pages.isEmpty)
            .accessibilityLabel(session.pages.isEmpty ? "No pages yet" : "\(session.pages.count) pages taken. Review them")
            Spacer()
            Button { model.shoot() } label: {
                Circle().strokeBorder(Tokens.Colors.onCover, lineWidth: 4)
                    .background(Circle().fill(Tokens.Colors.onCover).padding(7))
                    .frame(width: 72, height: 72)
            }
            .disabled(model.phase != .running || model.busy)
            .accessibilityLabel("Take photo")
            Spacer()
            Button("Done", action: done)
                .dFont(.bodyStrong).foregroundStyle(Tokens.Colors.onCover)
                .frame(minWidth: 56, minHeight: 44)
                .accessibilityLabel("Done, \(session.pages.count) pages")
        }
        .padding(.horizontal, Tokens.Space.s5)
        .frame(height: 120)
        .overlay(alignment: .top) {
            if let p = session.problem { Text(p).dFont(.small).foregroundStyle(Tokens.Colors.onCover).padding(.top, Tokens.Space.s1) }
        }
    }

    private func done() {
        session.finish()
        dismiss()
        if !session.pages.isEmpty { onDone() }
    }
}

/// This session's pages (the thumbnail's review strip) with Delete per page.
/// shortcut: "Adjust corners" and "Retake" per page are not here yet; delete and shoot again does the job.
private struct ScanStrip: View {
    let session: ScanSession
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView(.horizontal) {
                HStack(spacing: Tokens.Space.s3) {
                    ForEach(Array(session.pages.enumerated()), id: \.element.id) { i, p in
                        VStack(spacing: Tokens.Space.s2) {
                            Image(uiImage: p.thumb).resizable().aspectRatio(contentMode: .fit).frame(height: 260)
                                .accessibilityLabel("Page \(i + 1)")
                            Button("Delete", role: .destructive) { session.delete(p.id) }.buttonStyle(.quiet)
                        }
                    }
                }
                .padding(Tokens.Space.s4)
            }
            .navigationTitle("\(session.pages.count) taken")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Close") { dismiss() } } }
        }
        .presentationDetents([.medium])
    }
}
