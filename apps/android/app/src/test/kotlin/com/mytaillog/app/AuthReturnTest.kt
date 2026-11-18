package com.mytaillog.app

import com.mytaillog.core.api.AuthApi
import com.mytaillog.core.api.AuthFailure
import com.mytaillog.core.api.Session
import com.mytaillog.core.api.createHttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

const val SESSION_JSON = """{"access_token":"a2","refresh_token":"r2","expires_at":5000,"user":{"id":"u1","email":"dana@example.com"}}"""

fun authApi(status: HttpStatusCode, body: String = SESSION_JSON, seen: MutableList<String> = mutableListOf()) =
    AuthApi(createHttpClient(MockEngine { req ->
        seen += req.url.toString()
        respond(body, status, headersOf(HttpHeaders.ContentType, "application/json"))
    }), "https://x.supabase.co", "k")

class AuthReturnTest {
    @Test
    fun acceptsOnlyTheTwoReturnRoutes() {
        assertEquals(AuthReturn(AuthFlow.OAuth, "c1"), parseAuthReturn("com.mytaillog.app://auth/callback?code=c1"))
        assertEquals(AuthReturn(AuthFlow.Email, "c2"), parseAuthReturn("https://mytaillog.com/app/auth/callback?code=c2"))
        assertNull(parseAuthReturn("https://evil.example/app/auth/callback?code=c"))
        assertNull(parseAuthReturn("https://mytaillog.com/auth/callback?code=c"))
        assertNull(parseAuthReturn("http://mytaillog.com/app/auth/callback?code=c"))
        assertNull(parseAuthReturn("not a url"))
    }

    @Test
    fun errorsInQueryOrFragmentMeanNoCode() {
        assertEquals(AuthReturn(AuthFlow.OAuth, null), parseAuthReturn("com.mytaillog.app://auth/callback?error=access_denied&error_description=No"))
        assertEquals(
            AuthReturn(AuthFlow.Email, null),
            parseAuthReturn("https://mytaillog.com/app/auth/callback#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid"),
        )
    }

    @Test
    fun emailLinkWithoutVerifierAsksForTheCode() = runTest {
        val seen = mutableListOf<String>()
        val api = authApi(HttpStatusCode.OK, seen = seen)
        assertEquals(ReturnOutcome.EnterCode, completeAuthReturn(AuthReturn(AuthFlow.Email, "c"), null, api))
        assertEquals(ReturnOutcome.EnterCode, completeAuthReturn(AuthReturn(AuthFlow.Email, null), "v", api))
        assertTrue("no exchange is attempted without a verifier", seen.isEmpty())
        // A verifier from a different sign-in (the server refuses it) also falls back to the code.
        assertEquals(ReturnOutcome.EnterCode, completeAuthReturn(AuthReturn(AuthFlow.Email, "c"), "other", authApi(HttpStatusCode.BadRequest, "{}")))
    }

    @Test
    fun oauthReturnExchangesOrNamesTheProviderFailure() = runTest {
        val seen = mutableListOf<String>()
        val outcome = completeAuthReturn(AuthReturn(AuthFlow.OAuth, "c"), "v", authApi(HttpStatusCode.OK, seen = seen))
        assertEquals("u1", (outcome as ReturnOutcome.SignedIn).session.user.id)
        assertTrue(seen.single().endsWith("/auth/v1/token?grant_type=pkce"))
        assertEquals(ReturnOutcome.Failed(AuthFailure.ProviderFailed), completeAuthReturn(AuthReturn(AuthFlow.OAuth, null), "v", authApi(HttpStatusCode.OK)))
        assertEquals(ReturnOutcome.Failed(AuthFailure.ProviderFailed), completeAuthReturn(AuthReturn(AuthFlow.OAuth, "c"), "v", authApi(HttpStatusCode.BadRequest, "{}")))
    }

    @Test
    fun pkceAndNonceHashes() {
        // RFC 7636 appendix B.
        assertEquals("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", Crypto.challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"))
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", Crypto.sha256Hex("abc"))
        val a = Crypto.randomToken()
        assertEquals(43, a.length) // 32 bytes, base64url without padding: a valid PKCE verifier length
        assertFalse(a == Crypto.randomToken())
    }

    @Test
    fun formRules() {
        assertTrue(isValidPassword("12345678"))
        assertFalse(isValidPassword("1234567"))
        assertTrue(isValidEmail(" dana@example.com "))
        assertFalse(isValidEmail("@example.com"))
        assertFalse(isValidEmail("dana@"))
        val s = Session("a", "r", 1000, com.mytaillog.core.api.AuthUser("u"))
        assertTrue(expiresSoon(s, 950))
        assertFalse(expiresSoon(s, 900))
        assertFalse(expiresSoon(s.copy(expiresAt = null), 5000))
    }
}
