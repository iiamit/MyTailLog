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
                        CameraPreview(session: model.engine.session)
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

/// M-FLIGHT-03 Confirm the flight (the part phase 3 needs): the value read from the photo as a draft, checked by the
/// owner, saved as `reading.create` through the outbox. Works in airplane mode end to end (07 F07).
/// shortcut: oil presets, the hobbs camera step, the line-ahead preview and M-FLIGHT-04's "what it moved" arrive
/// with the phase 4 flight screens; the meter-replacement path is a line pointing to the web.
struct FlightConfirmScreen: View {
    let aircraftId: String
    let offline: OfflineStore
    let context: TachReader.Context
    /// The value the camera read, or nil when typed.
    let read: Double?
    let cameraDenied: Bool
    let done: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var tach = ""
    @State private var hobbs = ""
    @State private var date = Date()
    @State private var problem: String?
    @FocusState private var focus: Bool

    private var value: Double? { Double(tach.replacingOccurrences(of: ",", with: ".")) }

    var body: some View {
        NavigationStack {
            Form {
                if cameraDenied {
                    Text("Allow the camera in Settings to read the tach from a photo.").dFont(.small)
                }
                SwiftUI.Section {
                    TextField("Tach", text: $tach).keyboardType(.decimalPad).focused($focus)
                        .font(.system(size: 34, weight: .bold).monospacedDigit())
                    if read != nil { Text("Read from your photo. Check it against the meter.").dFont(.small).foregroundStyle(Tokens.Colors.ink3) }
                    if let line = check { Text(line).dFont(.small).foregroundStyle(Tokens.Colors.alarmText) }
                    else if let v = value, let last = context.last, v >= last {
                        Text(String(format: "+%.1f hours this flight", v - last)).dFont(.small).foregroundStyle(Tokens.Colors.ink3)
                    }
                } header: { Text("Tach") }
                SwiftUI.Section { TextField("Not this time", text: $hobbs).keyboardType(.decimalPad) } header: { Text("Hobbs") }
                DatePicker("Date", selection: $date, in: ...Date(), displayedComponents: .date)
                if let problem { Text(problem).foregroundStyle(Tokens.Colors.alarmText) }
            }
            .navigationTitle("Log a flight")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Save flight", action: save).disabled(!canSave) }
            }
        }
        .onAppear {
            if let read { tach = String(format: "%.1f", read) } else { focus = true }
        }
    }

    /// 07 F07 branches: lower than the last reading is not saved here; a jump over 24 hours asks to be checked.
    private var check: String? {
        guard let v = value, let last = context.last else { return nil }
        if v < last { return String(format: "Lower than the last reading (%.1f). Is this a new meter? Record the replacement on the web, or fix the number.", last) }
        if v - last > 24 { return String(format: "That's %.1f hours since the last reading. Check it.", v - last) }
        return nil
    }

    private var canSave: Bool {
        guard let v = value, v > 0 else { return false }
        return context.last.map { v >= $0 } ?? true
    }

    private func save() {
        guard let v = value else { return }
        let id = UUID().uuidString.lowercased()
        var payload: [String: Any] = ["id": id, "date": date.formatted(.iso8601.year().month().day()), "tach": v]
        if let h = Double(hobbs.replacingOccurrences(of: ",", with: ".")) { payload["hobbs"] = h }
        if let read {
            payload["source"] = "tach_photo"
            payload["ocrValue"] = read
            payload["ownerEdited"] = abs(read - v) > 0.01
        }
        let label = context.last.map { String(format: "Flight, tach %.1f to %.1f", $0, v) } ?? String(format: "Flight, tach %.1f", v)
        do {
            try offline.enqueue(id: id, type: "reading.create", aircraftId: aircraftId, payload: payload, label: label)
            let flown = context.last.map { String(format: " Logged %.1f h, tach %.1f.", v - $0, v) } ?? String(format: " Tach %.1f.", v)
            done("Flight saved." + flown + (offline.isOffline ? " On this phone until you have signal." : ""))
            dismiss()
        } catch {
            problem = "That didn't save on this phone. Try again."
        }
    }
}

/// M-FLIGHT-02 then M-FLIGHT-03 as one cover: the camera first, the confirm screen with what it read.
struct LogFlightFlow: View {
    let aircraftId: String
    let offline: OfflineStore
    let context: TachReader.Context
    let done: (String) -> Void
    @State private var step: Step = .camera
    enum Step: Equatable { case camera, confirm(Double?) }

    var body: some View {
        switch step {
        case .camera:
            TachCameraScreen(model: TachCameraModel(context: context), meter: "tach") { step = .confirm($0) }
        case .confirm(let v):
            FlightConfirmScreen(aircraftId: aircraftId, offline: offline, context: context, read: v,
                                cameraDenied: CameraEngine.authorized == .denied, done: done)
        }
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
