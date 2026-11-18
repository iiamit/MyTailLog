import Foundation
import Testing
@testable import MyTailLog

struct AuthFlowTests {
    @Test func challengeMatchesRFC7636Example() {
        #expect(AuthFlow.challenge(for: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk") == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
    }

    @Test func verifiersAreURLSafeLongEnoughAndFresh() {
        let a = AuthFlow.randomToken(), b = AuthFlow.randomToken()
        #expect(a != b)
        #expect((43...128).contains(a.count))
        #expect(a.allSatisfy { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" })
    }

    @Test func appleNonceIsSHA256Hex() {
        #expect(AuthFlow.appleNonceHash("abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    }

    @Test func passwordRuleIsEightCharacters() {
        #expect(!AuthFlow.isAcceptablePassword("1234567"))
        #expect(AuthFlow.isAcceptablePassword("12345678"))
        #expect(AuthFlow.isAcceptablePassword("pässwörd"))
    }

    @Test func parsesBothReturnRoutes() {
        #expect(AuthFlow.parseCallback(URL(string: "com.mytaillog.app://auth/callback?code=abc")!) == .code("abc"))
        #expect(AuthFlow.parseCallback(URL(string: "https://mytaillog.com/app/auth/callback?code=xyz")!) == .code("xyz"))
        #expect(AuthFlow.parseCallback(URL(string: "https://www.mytaillog.com/app/auth/callback?code=xyz")!) == .code("xyz"))
    }

    @Test func readsErrorsFromQueryOrFragment() {
        #expect(AuthFlow.parseCallback(URL(string: "com.mytaillog.app://auth/callback?error=access_denied")!) == .failed(code: nil))
        let expired = URL(string: "https://mytaillog.com/app/auth/callback#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid")!
        #expect(AuthFlow.parseCallback(expired) == .failed(code: "otp_expired"))
        #expect(AuthFlow.parseCallback(URL(string: "https://mytaillog.com/app/auth/callback")!) == .failed(code: nil))
    }

    @Test func ignoresOtherURLs() {
        #expect(AuthFlow.parseCallback(URL(string: "https://evil.example/app/auth/callback?code=abc")!) == nil)
        #expect(AuthFlow.parseCallback(URL(string: "https://mytaillog.com/auth/callback?code=abc")!) == nil)
        #expect(AuthFlow.parseCallback(URL(string: "com.mytaillog.app://other/callback?code=abc")!) == nil)
        #expect(AuthFlow.parseCallback(URL(string: "http://mytaillog.com/app/auth/callback?code=abc")!) == nil)
    }

    @Test func mapsAuthServiceErrorsToOwnerCopy() {
        func body(_ code: String) -> Data { Data(#"{"error_code":"\#(code)","msg":"raw"}"#.utf8) }
        #expect(AuthError.from(status: 400, body: body("invalid_credentials")) == .wrongPassword)
        #expect(AuthError.from(status: 422, body: body("user_already_exists")) == .accountExists)
        #expect(AuthError.from(status: 422, body: body("weak_password")) == .weakPassword)
        #expect(AuthError.from(status: 403, body: body("otp_expired")) == .wrongCode)
        #expect(AuthError.providerFailed("Apple").message == "Apple sign-in didn't finish. Try again, or use your email.")
    }

    @Test func authorizeURLCarriesPKCEAndTheAppReturn() throws {
        let client = AuthClient(baseURL: URL(string: "https://ref.supabase.co")!, apiKey: "k")
        let url = client.authorizeURL(provider: "google", challenge: "C")
        let items = try #require(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems)
        #expect(url.path == "/auth/v1/authorize")
        #expect(items.contains(URLQueryItem(name: "provider", value: "google")))
        #expect(items.contains(URLQueryItem(name: "redirect_to", value: "com.mytaillog.app://auth/callback")))
        #expect(items.contains(URLQueryItem(name: "code_challenge", value: "C")))
        #expect(items.contains(URLQueryItem(name: "code_challenge_method", value: "s256")))
    }
}

/// 05 §8.4: a link that this phone cannot complete asks for the code instead of failing.
@MainActor @Suite(.serialized)
struct EmailLinkFallbackTests {
    private func store() -> SessionStore {
        SessionKeychain.delete()
        SessionKeychain.emailVerifier = nil
        // Unroutable host: any request fails fast, and a link with no verifier must not send one.
        return SessionStore(auth: AuthClient(baseURL: URL(string: "https://127.0.0.1:9")!, apiKey: "k"), core: InMemoryCore())
    }

    @Test func linkWithoutVerifierAsksForTheCode() async {
        let s = store()
        await s.open(URL(string: "https://mytaillog.com/app/auth/callback?code=abc")!)
        #expect(s.linkNeedsCode)
        #expect(s.session == nil)
    }

    @Test func expiredLinkAsksForTheCode() async {
        let s = store()
        SessionKeychain.emailVerifier = "v"
        await s.open(URL(string: "https://mytaillog.com/app/auth/callback#error_code=otp_expired&error=access_denied")!)
        #expect(s.linkNeedsCode)
        SessionKeychain.emailVerifier = nil
    }

    @Test func unrelatedURLChangesNothing() async {
        let s = store()
        await s.open(URL(string: "https://mytaillog.com/aircraft/1")!)
        #expect(!s.linkNeedsCode)
    }
}
