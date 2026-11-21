@preconcurrency import AVFoundation
import CoreImage
import CoreMotion
import UIKit

/// The camera both capture screens share (05 §15.1, §16): back wide camera, `.photo` preset, continuous autofocus,
/// torch, video frames for analysis (about 12 a second, the latest only) and full-resolution stills.
/// AVFoundation runs on its own queue; results reach the main actor through the closures.
final class CameraEngine: NSObject, @unchecked Sendable, AVCaptureVideoDataOutputSampleBufferDelegate, AVCapturePhotoCaptureDelegate {
    let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "com.mytaillog.camera")
    private let video = AVCaptureVideoDataOutput()
    private let photo = AVCapturePhotoOutput()
    private var device: AVCaptureDevice?
    var captureDevice: AVCaptureDevice? { device }
    private var captureAngle: CGFloat = 90
    private var lastFrame: TimeInterval = 0
    private let motion = CMMotionManager()
    private var photoDone: (@Sendable (CGImage?) -> Void)?

    /// Each analysed frame, upright, with the time it was taken. Called on the camera queue.
    var onFrame: ((CVPixelBuffer, TimeInterval) -> Void)?
    var framesPerSecond: Double = 12

    /// Whether the phone is still enough for a steady shot (05 §15.1: device motion below threshold).
    var deviceStill: Bool {
        guard let r = motion.deviceMotion?.rotationRate else { return true }
        return abs(r.x) + abs(r.y) + abs(r.z) < 0.35
    }

    static var authorized: AVAuthorizationStatus { AVCaptureDevice.authorizationStatus(for: .video) }
    static func requestAccess() async -> Bool { await AVCaptureDevice.requestAccess(for: .video) }

    /// False when there is no camera (the simulator) or it can't start: the caller offers the fallbacks (05 §15.2).
    func start() -> Bool {
        if !session.inputs.isEmpty {
            assert(session.outputs.count == 2)
            queue.async { self.session.startRunning() }
            return true
        }
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let input = try? AVCaptureDeviceInput(device: device) else { return false }
        self.device = device
        session.beginConfiguration()
        session.sessionPreset = .photo
        guard session.canAddInput(input), session.canAddOutput(video), session.canAddOutput(photo) else {
            session.commitConfiguration()
            return false
        }
        session.addInput(input)
        video.alwaysDiscardsLateVideoFrames = true
        video.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
        video.setSampleBufferDelegate(self, queue: queue)
        session.addOutput(video)
        session.addOutput(photo)
        photo.maxPhotoQualityPrioritization = .quality
        if let c = video.connection(with: .video), c.isVideoRotationAngleSupported(90) { c.videoRotationAngle = 90 }
        session.commitConfiguration()
        try? device.lockForConfiguration()
        if device.isFocusModeSupported(.continuousAutoFocus) { device.focusMode = .continuousAutoFocus }
        device.unlockForConfiguration()
        if motion.isDeviceMotionAvailable { motion.startDeviceMotionUpdates() }
        queue.async { self.session.startRunning() }
        return true
    }

    func stop() {
        motion.stopDeviceMotionUpdates()
        queue.async { self.session.stopRunning() }
    }

    func setCaptureAngle(_ angle: CGFloat) {
        queue.async {
            self.captureAngle = angle
            if let c = self.video.connection(with: .video), c.isVideoRotationAngleSupported(angle) { c.videoRotationAngle = angle }
        }
    }

    var hasTorch: Bool { device?.hasTorch ?? false }

    func setTorch(_ on: Bool) {
        guard let device, device.hasTorch, (try? device.lockForConfiguration()) != nil else { return }
        device.torchMode = on ? .on : .off
        device.unlockForConfiguration()
    }

    /// A full-resolution still, upright.
    func capture(_ done: @escaping @Sendable (CGImage?) -> Void) {
        queue.async {
            self.photoDone = done
            let settings = AVCapturePhotoSettings()
            settings.photoQualityPrioritization = .quality
            let angle = self.captureAngle
            if let c = self.photo.connection(with: .video), c.isVideoRotationAngleSupported(angle) { c.videoRotationAngle = angle }
            self.photo.capturePhoto(with: settings, delegate: self)
        }
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        let t = CMSampleBufferGetPresentationTimeStamp(sampleBuffer).seconds
        guard t - lastFrame >= 1 / framesPerSecond, let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        lastFrame = t
        onFrame?(buffer, t)
    }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        // The still carries its rotation as metadata; apply it so the page is upright in pixels.
        let image = photo.fileDataRepresentation()
            .flatMap { CIImage(data: $0, options: [.applyOrientationProperty: true]) }
            .flatMap(PageImaging.cgImage)
        let done = photoDone
        photoDone = nil
        done?(image)
    }
}
