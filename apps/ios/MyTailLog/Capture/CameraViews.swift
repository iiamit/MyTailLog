import AVFoundation
import PhotosUI
import SwiftUI
import VisionKit

/// The live preview, filling its frame (aspect fill).
struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession

    final class PreviewView: UIView {
        override static var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var preview: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }

    func makeUIView(context: Context) -> PreviewView {
        let v = PreviewView()
        v.preview.session = session
        v.preview.videoGravity = .resizeAspectFill
        if let c = v.preview.connection, c.isVideoRotationAngleSupported(90) { c.videoRotationAngle = 90 }
        return v
    }

    func updateUIView(_ uiView: PreviewView, context: Context) {}
}

/// Where content of `content` size lands when aspect-filled into `bounds` (the preview's crop).
func aspectFillRect(content: CGSize, in bounds: CGSize) -> CGRect {
    guard content.width > 0, content.height > 0 else { return CGRect(origin: .zero, size: bounds) }
    let s = max(bounds.width / content.width, bounds.height / content.height)
    let w = content.width * s, h = content.height * s
    return CGRect(x: (bounds.width - w) / 2, y: (bounds.height - h) / 2, width: w, height: h)
}

/// The detected page outline in 3pt on-cover, with a 40% cover tint outside the page (06 M-SCAN-02).
struct QuadOverlay: View {
    let quad: Quad?
    let frame: CGRect
    var pulse = false

    var body: some View {
        Canvas { ctx, size in
            guard let quad else { return }
            var page = Path()
            let pts = quad.corners.map { CGPoint(x: frame.minX + $0.x * frame.width, y: frame.minY + $0.y * frame.height) }
            page.addLines(pts)
            page.closeSubpath()
            var outside = Path(CGRect(origin: .zero, size: size))
            outside.addPath(page)
            ctx.fill(outside, with: .color(Tokens.Colors.cover.opacity(0.4)), style: FillStyle(eoFill: true))
            ctx.stroke(page, with: .color(Tokens.Colors.onCover), style: StrokeStyle(lineWidth: pulse ? 6 : 3, lineJoin: .round))
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// VisionKit's document camera (05 §15.2): the fallback when ScanCamera can't run. Pages come back flattened.
struct SystemScanner: UIViewControllerRepresentable {
    let done: ([CGImage]) -> Void

    static var isSupported: Bool { VNDocumentCameraViewController.isSupported }

    func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
        let vc = VNDocumentCameraViewController()
        vc.delegate = context.coordinator
        return vc
    }

    func updateUIViewController(_ vc: VNDocumentCameraViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(done: done) }

    final class Coordinator: NSObject, VNDocumentCameraViewControllerDelegate {
        let done: ([CGImage]) -> Void
        init(done: @escaping ([CGImage]) -> Void) { self.done = done }

        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
            done((0..<scan.pageCount).compactMap { scan.imageOfPage(at: $0).cgImage })
        }
        func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) { done([]) }
        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) { done([]) }
    }
}

extension PhotosPickerItem {
    /// The picked photo as an upright CGImage.
    func uprightImage() async -> CGImage? {
        guard let data = try? await loadTransferable(type: Data.self) else { return nil }
        return CIImage(data: data, options: [.applyOrientationProperty: true]).flatMap(PageImaging.cgImage)
    }
}
