#if DEBUG
import SwiftUI

/// Deterministic simulator coverage of real owner screens, without changing a user's records or calling a service.
struct OwnerWorkspaceUITestScreen: View {
    let mode: String
    @State private var tabs = TabModel()
    private let recs: Recs
    @Environment(\.horizontalSizeClass) private var sizeClass

    init(mode: String) {
        self.mode = mode
        let base = URL(string: "https://owner-workspace.test")!
        let offline = OfflineStore(userId: "owner-workspace-ui", apiURL: base, root: FileManager.default.temporaryDirectory)
        offline.forcedOffline = false
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [OwnerWorkspaceFixtureProtocol.self]
        recs = Recs(offline: offline, api: RecordsAPI(apiURL: base, token: { "ui-fixture" }, http: URLSession(configuration: config)),
                    aircraft: AircraftAccess(id: "00000000-0000-4000-8000-000000000001", tailNumber: "N123AB", isDemo: false, role: mode == "viewer" ? .viewer : .owner), status: nil)
    }

    private var route: RecRoute {
        switch mode {
        case "annual": .annualPacket
        case "engine": .engineHistory
        case "expenses", "viewer": .expenses
        default: .documentInbox
        }
    }

    var body: some View {
        GeometryReader { window in
            let tablet = window.size.width >= 700 && window.size.height >= 500
            VStack(spacing: 0) {
                Text("Sample records · UI test").dFont(.caption).foregroundStyle(Tokens.Colors.ink3).padding(8).frame(maxWidth: .infinity).background(Tokens.Colors.leaf)
                RecordScreen(recs: recs, route: route)
                    .environment(\.recNav, RecNav(tablet: tablet))
                    .padding(tablet ? Tokens.Space.s4 : 0)
            }
            .background(Section.aircraft.board)
        }
        .environment(tabs)
        .environment(recs as Recs?)
        .environment(\.aircraftLine, AircraftLine(tail: "N123AB", lastSync: .now))
    }
}

final class OwnerWorkspaceFixtureProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "owner-workspace.test" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let path = request.url?.path ?? ""
        let body: String
        if path.hasSuffix("annual-packet") {
            body = #"{"tail":"N123AB","generatedAt":"2026-11-25T12:00:00Z","cutoff":"2026-11-25","summary":{},"warnings":["Two extracted entries still need verification."],"evidence":[{"id":"00000000-0000-4000-8000-000000000002","kind":"page","label":"Airframe p. 53 — annual inspection","available":true},{"id":"00000000-0000-4000-8000-000000000003","kind":"document","label":"Equipment list — missing original","available":false}]}"#
        } else if path.hasSuffix("engine-history") {
            body = #"{"components":[{"id":"engine-1","name":"Lycoming O-360","category":"engine","position":"single","updated_at":"2026-11-25T12:00:00Z"}],"events":[{"id":"overhaul-1","component_id":"engine-1","event_date":"2024-02-12","kind":"overhaul","notes":"Overhaul documented in engine book","updated_at":"2026-11-25T12:00:00Z"}],"groups":[{"componentId":"engine-1","name":"Lycoming O-360","position":"single","start":"2024-02-12","end":null,"segmentId":"engine-1:2024-02-12","compression":[{"entryId":"entry-1","pageId":null,"date":"2025-03-18","confirmed":true,"readings":[{"cylinder":1,"psi":76,"reference":80},{"cylinder":2,"psi":74,"reference":80},{"cylinder":3,"psi":77,"reference":80},{"cylinder":4,"psi":75,"reference":80}],"source":"Annual compression test"},{"entryId":"entry-2","pageId":null,"date":"2026-03-18","confirmed":true,"readings":[{"cylinder":1,"psi":75,"reference":80},{"cylinder":2,"psi":76,"reference":80}],"source":"Annual compression test"}],"oilChanges":[{"entryId":"entry-3","date":"2026-09-29","confirmed":true}],"oilIntervals":[],"samples":[{"id":"sample-1","sample_date":"2026-09-29","lab":"Blackstone","elements_ppm":{"Fe":12,"Cu":3,"Al":4},"lab_comments":"Compare with the prior sample from this engine."}],"additions":[{"id":"oil-1","added_date":"2026-10-08","quarts":1,"notes":"Phillips XC 20W-50"}]}],"unassigned":{"compression":[],"oilChanges":[],"samples":[],"additions":[]},"needsReview":[],"canEdit":true}"#
        } else if path.hasSuffix("expenses") {
            body = #"{"expenses":[{"id":"cost-1","date":"2026-09-29","currency":"USD","amount_minor":23545,"category":"maintenance","cost_type":"variable","basis":"actual","vendor":"Airport maintenance","payer":"Owner","notes":"Oil and filter service","updated_at":"2026-11-25T12:00:00Z"},{"id":"cost-2","date":"2026-11-01","currency":"USD","amount_minor":7500,"category":"maintenance","cost_type":"variable","basis":"reserve","notes":"Engine reserve","updated_at":"2026-11-25T12:00:00Z"}],"totals":[{"currency":"USD","actual_minor":23545,"reserve_minor":7500}],"canManage":true}"#
        } else if path.hasSuffix("inbox") {
            body = #"{"items":[{"id":"inbox-1","file_name":"Oil and filter invoice.pdf","mime_type":"application/pdf","kind":"invoice","state":"review","size_bytes":12000,"updated_at":"2026-11-25T12:00:00Z","proposal":{"date":"2026-09-29","currency":"USD","amount_minor":23545,"category":"maintenance","vendor":"Airport maintenance","notes":"Oil and filter service"},"rendered_pages":[]},{"id":"inbox-2","file_name":"Engine annual pages.pdf","mime_type":"application/pdf","kind":"logbook","state":"uploaded","size_bytes":24000,"updated_at":"2026-11-25T12:00:00Z","proposal":{},"rendered_pages":[]}],"logbooks":[{"id":"book-1","type":"engine"}],"canEdit":true}"#
        } else { body = "{}" }
        let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
#endif
