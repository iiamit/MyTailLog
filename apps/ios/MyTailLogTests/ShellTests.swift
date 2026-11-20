import SwiftUI
import Testing
import UIKit
@testable import MyTailLog

@MainActor
struct TabModelTests {
    @Test func shellTracksAvailableWindowWidth() {
        #expect(ShellLayout.forWindow(width: 466, sizeClass: .compact) == .tabs)
        #expect(ShellLayout.forWindow(width: 678, sizeClass: .compact) == .rail)
        #expect(ShellLayout.forWindow(width: 669, sizeClass: .regular) == .rail)
        #expect(ShellLayout.forWindow(width: 951, sizeClass: .regular) == .binder)
        #expect(ShellLayout.forWindow(width: 800, sizeClass: .regular) == .rail)
    }
    @Test func phoneHasFiveTabsAndTabletSix() {
        #expect(Section.phoneTabs == [.status, .books, .maint, .aircraft, .share])
        #expect(Section.tabletTabs == [.status, .books, .maint, .aircraft, .docs, .share])
        #expect(Section.maint.tabLabel == "Maint.")
    }

    @Test func tappingAnotherTabSwitchesAndKeepsStacks() {
        let model = TabModel()
        model.paths[.status] = NavigationPath(["entry"])
        model.tap(.books)
        #expect(model.selected == .books)
        #expect(model.paths[.status]?.count == 1)
        #expect(model.scrollToTop[.books] == nil)
    }

    @Test func tappingTheOpenTabPopsToRootThenScrollsToTop() {
        let model = TabModel()
        model.paths[.status] = NavigationPath(["entry", "page"])
        model.tap(.status)
        #expect(model.paths[.status]?.isEmpty == true)
        #expect(model.scrollToTop[.status] == nil)
        model.tap(.status)
        #expect(model.scrollToTop[.status] == 1)
        model.tap(.status)
        #expect(model.scrollToTop[.status] == 2)
    }

    @Test func emptyStatesAvoidBannedWords() {
        for section in Section.allCases {
            let line = section.emptyLine.lowercased()
            #expect(!line.contains("coming soon"))
            #expect(!line.contains("airworthy") && !line.contains("compliant") && !line.contains("connection"))
        }
    }
}

struct TokenTests {
    private func rgba(_ color: Color, _ style: UIUserInterfaceStyle) -> [Int] {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        UIColor(color).resolvedColor(with: UITraitCollection(userInterfaceStyle: style)).getRed(&r, green: &g, blue: &b, alpha: &a)
        return [r, g, b, a].map { Int(($0 * 255).rounded()) }
    }

    @Test func sectionColoursResolveForLightAndDark() {
        #expect(rgba(Section.status.board, .light) == [42, 61, 190, 255])
        #expect(rgba(Section.status.board, .dark) == [36, 51, 163, 255])
        #expect(rgba(Section.books.onBoard, .light) == [28, 22, 0, 255])
        #expect(rgba(Section.share.boardInk, .dark) == [185, 160, 240, 255])
    }

    @Test func leafAndInkSwapForTheNightHangar() {
        #expect(rgba(Tokens.Colors.leaf, .light) == [255, 255, 255, 255])
        #expect(rgba(Tokens.Colors.leaf, .dark) == [28, 30, 35, 255])
        #expect(rgba(Tokens.Colors.ink, .dark) == [236, 234, 228, 255])
        #expect(rgba(Tokens.Colors.cover, .dark) == [13, 14, 17, 255])
    }

    @Test func translucentTokensKeepTheirAlpha() {
        #expect(rgba(Tokens.Colors.onSection2Books, .light) == [28, 22, 0, 184])
    }

    @Test func bundledFontsResolveForEveryRole() {
        for type in [DType.boardTitle, .lede, .heading, .body, .bodyStrong, .small, .caption, .paper, .tabLabel] {
            for bold in [false, true] {
                let font = type.uiFont(boldText: bold, traits: UITraitCollection(preferredContentSizeCategory: .large))
                let family = type == .paper ? "Literata" : "Libre Franklin"
                #expect(font.familyName == family, "\(type) → \(font.familyName)")
                // CoreText omits an axis left at its default; only Literata's default (400) is ever requested.
                let wght = (CTFontCopyVariation(font as CTFont) as? [Int: Double])?[0x7767_6874] ?? 400
                #expect(wght == Double(type.weight(boldText: bold)), "\(type) bold=\(bold) wght=\(String(describing: wght))")
            }
        }
        #expect(DType.bodyStrong.weight(boldText: true) > DType.bodyStrong.weight())
        #expect(DType.body.size == 17)
    }
}

struct AuthTests {
    @Test func decodesASupabaseSession() throws {
        let body = Data(#"{"access_token":"a","token_type":"bearer","expires_in":3600,"refresh_token":"r","user":{"email":"dana@example.com"}}"#.utf8)
        let now = Date(timeIntervalSince1970: 1_000)
        let session = try AuthClient.session(from: body, now: now)
        #expect(session == Session(accessToken: "a", refreshToken: "r", expiresAt: Date(timeIntervalSince1970: 4_600), email: "dana@example.com"))
    }

    @Test func mapsAuthErrorsToOwnerCopy() {
        #expect(AuthError.from(status: 403, body: Data(#"{"error_code":"otp_expired"}"#.utf8)) == .wrongCode)
        #expect(AuthError.from(status: 429, body: Data()) == .rateLimited)
        #expect(AuthError.from(status: 400, body: Data(#"{"error_code":"validation_failed"}"#.utf8)) == .rejected)
        #expect(AuthError.from(status: 500, body: Data()) == .server)
        #expect(AuthError.offline.message.contains("signal"))
    }
}
