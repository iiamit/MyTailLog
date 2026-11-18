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

    @Test
    fun pullSendsCursorAndBearer() = runTest {
        val api = HttpSyncApi(client(HttpStatusCode.OK, """{"changes":[],"nextCursor":12,"hasMore":false}"""), "https://mytaillog.com") { "tok" }
        val page = api.pull(cursor = 12)
        assertEquals(12, page.nextCursor)
        val req = requests.single()
        assertEquals("/api/sync/pull", req.url.encodedPath)
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
    }
}
