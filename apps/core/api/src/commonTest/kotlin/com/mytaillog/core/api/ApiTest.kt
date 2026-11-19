package com.mytaillog.core.api

import com.mytaillog.core.domain.Mutation
import com.mytaillog.core.domain.PushResult
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.MockRequestHandleScope
import io.ktor.client.engine.mock.respond
import io.ktor.client.request.HttpRequestData
import io.ktor.client.request.HttpResponseData
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.TextContent
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class ApiTest {
    private val requests = mutableListOf<HttpRequestData>()

    private fun client(status: HttpStatusCode, body: String) = createHttpClient(MockEngine { req ->
        requests += req
        json(status, body)
    })

    private fun MockRequestHandleScope.json(status: HttpStatusCode, body: String): HttpResponseData =
        respond(body, status, headersOf(HttpHeaders.ContentType, "application/json"))

    @Test
    fun verifyReturnsTheSession() = runTest {
        val api = AuthApi(client(HttpStatusCode.OK, """{"access_token":"a","refresh_token":"r","expires_at":99,"token_type":"bearer","user":{"id":"u1","email":"dana@example.com"}}"""), "https://x.supabase.co/", "key")
        val session = api.verifyCode("dana@example.com", "123456")
        assertEquals("u1", session.user.id)
        assertEquals("https://x.supabase.co/auth/v1/verify", requests.single().url.toString())
        assertEquals("key", requests.single().headers["apikey"])
        assertEquals("""{"type":"email","email":"dana@example.com","token":"123456"}""", (requests.single().body as TextContent).text)
    }

    @Test
    fun rejectedCodeAndRateLimitAreNamed() = runTest {
        val rejected = assertFailsWith<AuthException> {
            AuthApi(client(HttpStatusCode.Forbidden, """{"error_code":"otp_expired"}"""), "https://x", "k").verifyCode("a@b.c", "000000")
        }
        assertEquals(AuthFailure.CodeRejected, rejected.failure)
        val limited = assertFailsWith<AuthException> {
            AuthApi(client(HttpStatusCode.TooManyRequests, "{}"), "https://x", "k").sendCode("a@b.c")
        }
        assertEquals(AuthFailure.TooManyRequests, limited.failure)
    }

    @Test
    fun noNetworkIsNoSignal() = runTest {
        val http = createHttpClient(MockEngine { throw IllegalStateException("offline") })
        val e = assertFailsWith<AuthException> { AuthApi(http, "https://x", "k").sendCode("a@b.c") }
        assertEquals(AuthFailure.NoSignal, e.failure)
    }

    private val sessionJson = """{"access_token":"a","refresh_token":"r","expires_at":99,"user":{"id":"u1"}}"""

    @Test
    fun emailLinkCarriesThePkceChallengeAndReturn() = runTest {
        AuthApi(client(HttpStatusCode.OK, "{}"), "https://x", "k").sendCode("a@b.c", Pkce("ch", "https://mytaillog.com/app/auth/callback"))
        val req = requests.single()
        assertEquals("https://mytaillog.com/app/auth/callback", req.url.parameters["redirect_to"])
        assertEquals("""{"email":"a@b.c","create_user":true,"code_challenge":"ch","code_challenge_method":"s256"}""", (req.body as TextContent).text)
    }

    @Test
    fun tokenGrantsAndTheirFailures() = runTest {
        val api = AuthApi(client(HttpStatusCode.OK, sessionJson), "https://x", "k")
        api.exchangeCode("c1", "v1")
        api.signInWithIdToken("google", "idt", "raw")
        api.refresh("r")
        assertEquals(listOf("pkce", "id_token", "refresh_token"), requests.map { it.url.parameters["grant_type"] })
        assertEquals("""{"provider":"google","id_token":"idt","nonce":"raw"}""", (requests[1].body as TextContent).text)

        val bad = AuthApi(client(HttpStatusCode.BadRequest, """{"error_code":"invalid_credentials"}"""), "https://x", "k")
        assertEquals(AuthFailure.WrongPassword, assertFailsWith<AuthException> { bad.signInWithPassword("a@b.c", "x") }.failure)
        assertEquals(AuthFailure.SessionEnded, assertFailsWith<AuthException> { bad.refresh("r") }.failure)
    }

    @Test
    fun signUpWithoutSessionMeansConfirmByEmail() = runTest {
        val api = AuthApi(client(HttpStatusCode.OK, """{"id":"u1","email":"a@b.c"}"""), "https://x", "k")
        assertEquals(null, api.signUp("a@b.c", "longenough", "Dana"))
        val withSession = AuthApi(client(HttpStatusCode.OK, sessionJson), "https://x", "k")
        assertEquals("u1", withSession.signUp("a@b.c", "longenough", "Dana")?.user?.id)
    }

    @Test
    fun authorizeUrlNamesProviderReturnAndChallenge() {
        val url = AuthApi(client(HttpStatusCode.OK, "{}"), "https://x.supabase.co/", "k").authorizeUrl("apple", Pkce("ch", "com.mytaillog.app://auth/callback"))
        assertEquals("https://x.supabase.co/auth/v1/authorize?provider=apple&redirect_to=com.mytaillog.app%3A%2F%2Fauth%2Fcallback&code_challenge=ch&code_challenge_method=s256", url)
    }

    @Test
    fun pullSendsCursorAndBearer() = runTest {
        val api = HttpSyncApi(client(HttpStatusCode.OK, """{"changes":[],"nextCursor":12,"hasMore":false}"""), "https://mytaillog.com") { "tok" }
        val page = api.pull(cursor = 12)
        assertEquals(12L, page.nextCursor)
        val req = requests.single()
        assertEquals("/api/sync/v2/pull", req.url.encodedPath)
        assertEquals("12", req.url.parameters["cursor"])
        assertEquals("Bearer tok", req.headers[HttpHeaders.Authorization])
    }

    @Test
    fun pushDecodesResultsAndSurfacesHttpErrors() = runTest {
        val ok = HttpSyncApi(client(HttpStatusCode.OK, """{"results":[{"id":"m1","status":"conflict","row":{"id":"s1"}}]}"""), "https://mytaillog.com") { "tok" }
        val results = ok.push(listOf(Mutation("m1", "squawk.update", "a1", JsonObject(emptyMap()), base = "2026-11-01")))
        assertEquals(PushResult.Status.Conflict, results.single().status)

        val unauthorized = HttpSyncApi(client(HttpStatusCode.Unauthorized, """{"error":"Not signed in."}"""), "https://mytaillog.com") { "tok" }
        assertEquals(401, assertFailsWith<SyncHttpException> { unauthorized.pull(0) }.status)

        val gone = HttpSyncApi(client(HttpStatusCode.Gone, """{"error":"…","code":"resync_required"}"""), "https://mytaillog.com") { "tok" }
        assertEquals(410, assertFailsWith<SyncHttpException> { gone.pull(3) }.status)
    }

    @Test
    fun pushDecodesV2CodesAndResolvePostsToTheConflict() = runTest {
        val api = HttpSyncApi(client(HttpStatusCode.OK, """{"results":[{"id":"m1","status":"error","error":"x","code":"viewer_read_only"},{"id":"m2","status":"ok","replayed":true}]}"""), "https://mytaillog.com") { "tok" }
        val results = api.push(listOf(Mutation("m1", "entry.update", "a1", JsonObject(emptyMap()), base = "t")))
        assertEquals("viewer_read_only", results[0].code)
        assertEquals(true, results[1].replayed)
        requests.clear()
        api.resolveConflict("m9", "take_theirs")
        assertEquals("/api/sync/v2/conflicts/m9", requests.single().url.encodedPath)
        assertEquals("""{"resolution":"take_theirs"}""", (requests.single().body as TextContent).text)
    }
}
