import SwiftUI
import Vision

/// The hour-meter camera's state (05 §16): frames inside the guide are read on the phone; a value is found when it
/// wins three frames in a row. Frames stay in memory; nothing is written or uploaded.
@MainActor @Observable
final class TachCameraModel {
    enum Phase: Equatable { case starting, running, unavailable, denied }
    private(set) var phase: Phase = .starting
    private(set) var found: Double?
    private(set) var slow = false
    private(set) var bufferSize = CGSize(width: 3, height: 4)
    var torch = false { didSet { engine.setTorch(torch) } }
    let engine = CameraEngine()
    let context: TachReader.Context
    /// The guide's rectangle in the preview, set by the view (points).
    var guide: CGRect = .zero { didSet { updateRegion() } }
    var previewSize: CGSize = .zero { didSet { updateRegion() } }
    private let region = Locked(CGRect(x: 0, y: 0, width: 1, height: 1))
    private var consensus = TachConsensus()
    private var started = Date()

    init(context: TachReader.Context) { self.context = context }

    func start() async {
        switch CameraEngine.authorized {
        case .notDetermined:
            guard await CameraEngine.requestAccess() else { phase = .denied; return }
        case .authorized: break
        default: phase = .denied; return
        }
        engine.framesPerSecond = 4
        let ctx = context, shared = region
        // Vision runs on the camera queue (one frame at a time, late frames dropped); the result hops to the main actor.
        engine.onFrame = { [weak self] buffer, _ in
            let size = CGSize(width: CVPixelBufferGetWidth(buffer), height: CVPixelBufferGetHeight(buffer))
            let value = TachReader.best(TachReader.recognize(VNImageRequestHandler(cvPixelBuffer: buffer, orientation: .up), region: shared.value), ctx)
            Task { @MainActor in self?.frame(value, size: size) }
        }
        started = Date()
        phase = engine.start() ? .running : .unavailable
    }

    func stop() { engine.stop() }

    private func updateRegion() { region.value = Self.visionRegion(guide: guide, preview: previewSize, buffer: bufferSize) }

    /// The guide in Vision's normalized buffer space (origin bottom left), through the preview's aspect fill.
    nonisolated static func visionRegion(guide: CGRect, preview: CGSize, buffer: CGSize) -> CGRect {
        let fill = aspectFillRect(content: buffer, in: preview)
        guard fill.width > 0, guide.width > 0 else { return CGRect(x: 0, y: 0, width: 1, height: 1) }
        let x = (guide.minX - fill.minX) / fill.width, y = (guide.minY - fill.minY) / fill.height
        let r = CGRect(x: x, y: 1 - y - guide.height / fill.height, width: guide.width / fill.width, height: guide.height / fill.height)
        return r.intersection(CGRect(x: 0, y: 0, width: 1, height: 1))
    }

    private func frame(_ value: Double?, size: CGSize) {
        if size != bufferSize { bufferSize = size; updateRegion() }
        guard found == nil else { return }
        if let v = consensus.feed(value) { found = v; UIImpactFeedbackGenerator(style: .light).impactOccurred(); return }
        slow = Date().timeIntervalSince(started) > 8
    }
}

/// M-FLIGHT-02 Photograph the tach: the camera finds the hour meter and reads it before the shutter.
struct TachCameraScreen: View {
    @State var model: TachCameraModel
    let meter: String
    let next: (Double?) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button { dismiss() } label: { Icon("x").frame(width: 44, height: 44) }.accessibilityLabel("Cancel")
                Spacer()
                Text(meter == "hobbs" ? "Hobbs" : "Tach").dFont(.bodyStrong)
                Spacer()
                Color.clear.frame(width: 44, height: 44)
            }
            .foregroundStyle(Tokens.Colors.onCover)
            .padding(.horizontal, Tokens.Space.s2)
            .frame(height: 56)
            GeometryReader { g in
                let guide = CGRect(x: (g.size.width - 280) / 2, y: (g.size.height - 120) / 2 - 40, width: 280, height: 120)
                ZStack {
                    if model.phase == .running || model.phase == .starting {
                        CameraPreview(engine: model.engine)
                    } else {
                        Tokens.Colors.cover2
                    }
                    RoundedRectangle(cornerRadius: 8).strokeBorder(Tokens.Colors.onCover, lineWidth: 2)
                        .frame(width: guide.width, height: guide.height).position(x: guide.midX, y: guide.midY)
                    VStack(spacing: Tokens.Space.s2) {
                        if let v = model.found {
                            Label { Text(String(format: "%.1f", v)).font(.system(size: 34, weight: .bold).monospacedDigit()) }
                                icon: { Icon("scan-line") }
                                .padding(.horizontal, Tokens.Space.s4).frame(minHeight: 72)
                                .background(Tokens.Colors.cover, in: Capsule())
                        }
                        Text(caption).dFont(.body).multilineTextAlignment(.center).accessibilityAddTraits(.updatesFrequently)
                    }
                    .foregroundStyle(Tokens.Colors.onCover)
                    .position(x: g.size.width / 2, y: guide.maxY + 70)
                }
                .onAppear { model.guide = guide; model.previewSize = g.size }
                .onChange(of: g.size) { _, s in model.guide = guide; model.previewSize = s }
            }
            .clipped()
            HStack {
                Button { next(nil) } label: { Label { Text("Type it") } icon: { Icon("keyboard") } }
                    .dFont(.bodyStrong).foregroundStyle(Tokens.Colors.onCover).frame(minHeight: 44)
                    .scaleEffect(model.slow && !reduceMotion ? 1.06 : 1)
                    .animation(reduceMotion ? nil : .easeInOut(duration: Tokens.Motion.durationSlow), value: model.slow)
                Spacer()
                if model.engine.hasTorch {
                    Button { model.torch.toggle() } label: { Icon("flashlight").frame(width: 44, height: 44) }
                        .foregroundStyle(Tokens.Colors.onCover)
                        .accessibilityLabel(model.torch ? "Turn off the torch" : "Turn on the torch")
                }
            }
            .padding(.horizontal, Tokens.Space.s5)
            .frame(height: 96)
        }
        .background(Tokens.Colors.cover.ignoresSafeArea())
        .task { await model.start() }
        .onDisappear { model.stop() }
        .onChange(of: model.found) { _, v in
            guard let v else { return }
            UIAccessibility.post(notification: .announcement, argument: "Hour meter found, \(String(format: "%.1f", v))")
            Task { try? await Task.sleep(for: .milliseconds(800)); next(v) }
        }
        .onChange(of: model.phase) { _, p in if p == .denied || p == .unavailable { next(nil) } }
    }

    private var caption: String {
        if model.found != nil { return model.context.last.map { "Hour meter found. Last reading was \(String(format: "%.1f", $0))." } ?? "Hour meter found." }
        return model.slow ? "Can't read it yet. Move closer, or type it." : "Looking for the hour meter"
    }
}

/// A value shared with the camera queue.
final class Locked<T>: @unchecked Sendable {
    private let lock = NSLock()
    private var v: T
    init(_ v: T) { self.v = v }
    var value: T {
        get { lock.withLock { v } }
        set { lock.withLock { v = newValue } }
    }
}
