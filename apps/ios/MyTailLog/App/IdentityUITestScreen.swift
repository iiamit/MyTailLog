#if DEBUG
import SwiftUI

/// Exercises the shipping review screens with synthetic source pages. This transport never calls a service.
struct IdentityUITestScreen: View {
    @State private var model: BooksModel
    init(viewer: Bool = false) {
        IdentityFixtureProtocol.reset()
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [IdentityFixtureProtocol.self]
        let base = URL(string: "https://identity-fixture.test")!
        let api = StatusAPI(supabaseURL: base, apiKey: "fixture", apiURL: base, http: URLSession(configuration: config))
        _model = State(initialValue: BooksModel(aircraft: AircraftAccess(id: "11190000-0000-4000-a000-000000000001", tailNumber: "N119QA", isDemo: false, role: viewer ? .viewer : .owner), api: api, token: { "fixture" }))
    }
    var body: some View {
        Group {
            if model.loading && model.pages.isEmpty { ProgressView("Loading sample reference page") }
            else { ReviewFlow(model: model, start: "11190000-0000-4000-a000-000000000003") }
        }
    }
}

private final class IdentityFixtureProtocol: URLProtocol {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var reviewed = false
    nonisolated(unsafe) private static var decision = "pending"
    static func reset() { lock.lock(); defer { lock.unlock() }; reviewed = false; decision = "pending" }
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "identity-fixture.test" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.lock.lock(); defer { Self.lock.unlock() }
        let path = request.url!.path
        var body: Any = [:]
        var code = 200
        var image: Data?
        if path == "/api/sync/push" {
            var bytes = request.httpBody
            if bytes == nil, let stream = request.httpBodyStream {
                stream.open(); defer { stream.close() }
                var data = Data(); var buffer = [UInt8](repeating: 0, count: 4096)
                while stream.hasBytesAvailable && data.count < 65536 { let n = stream.read(&buffer, maxLength: buffer.count); if n <= 0 { break }; data.append(buffer, count: n) }
                bytes = data
            }
            let payload = bytes.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            let mutations = payload?["mutations"] as? [[String: Any]] ?? []
            body = ["results": mutations.map { m -> [String: Any] in
                let p = m["payload"] as? [String: Any] ?? [:]
                if m["type"] as? String == "page.details", let d = p["decision"] as? [String: Any] {
                    Self.decision = d["action"] as? String == "dismiss" ? "dismissed" : "accepted"
                }
                if m["type"] as? String == "page.review" { Self.reviewed = p["status"] as? String == "confirmed" }
                return ["id": m["id"] ?? "", "status": "ok", "row": ["updated_at": "2026-11-25T12:00:01Z"]]
            }]
        } else if path.hasSuffix("/map") {
            body = ["today": "2026-11-25", "range": ["from": "2000-01-01", "to": "2027-01-01"], "lines": [], "stops": [], "interchanges": [], "gaps": [], "eras": [], "squawks": [], "rings": [], "visits": [], "undatedEntries": 0]
        } else if path == "/rest/v1/logbook" {
            body = [["id": "11190000-0000-4000-a000-000000000002", "type": "airframe", "title": "Airframe"]]
        } else if path == "/rest/v1/page" {
            body = [["id": "11190000-0000-4000-a000-000000000003", "logbook_id": "11190000-0000-4000-a000-000000000002", "page_sequence": 1, "review_status": Self.reviewed ? "confirmed" : "unreviewed", "extraction_status": "extracted", "content_kinds": ["identity"], "identity_suggestions": [["id": "aaaaaaaaaaaaaaaaaaaaaaaa", "subject": "aircraft", "name": "Aircraft identification", "fields": ["serial_number": "000123"], "quote": "Airframe serial number: 000123", "confidence": 0.9, "status": Self.decision]], "updated_at": "2026-11-25T12:00:01Z"]]
        } else if path == "/rest/v1/aircraft" {
            body = [["id": "11190000-0000-4000-a000-000000000001", "tail_number": "N119QA", "serial_number": Self.decision == "accepted" ? "000123" : "", "updated_at": "2026-11-25T12:00:01Z"]]
        } else if path == "/rest/v1/component" || path == "/rest/v1/log_entry" { body = []
        } else if path.hasSuffix("/image") {
            image = UIGraphicsImageRenderer(size: CGSize(width: 800, height: 1100)).image { context in
                UIColor.white.setFill(); context.fill(CGRect(x: 0, y: 0, width: 800, height: 1100))
                let text = "AIRCRAFT LOGBOOK\n\nAircraft identification\n\nRegistration: N119QA\nAirframe serial number: 000123\n\nOriginal equipment record\n\nSynthetic test page"
                (text as NSString).draw(in: CGRect(x: 70, y: 100, width: 660, height: 900), withAttributes: [.font: UIFont.systemFont(ofSize: 30), .foregroundColor: UIColor.black])
            }.pngData()
        } else { code = 404; body = ["error": "Unknown fixture endpoint"] }
        let response = HTTPURLResponse(url: request.url!, statusCode: code, httpVersion: nil, headerFields: ["Content-Type": image == nil ? "application/json" : "image/png"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: image ?? (try! JSONSerialization.data(withJSONObject: body)))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
#endif
