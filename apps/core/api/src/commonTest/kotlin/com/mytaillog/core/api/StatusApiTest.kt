package com.mytaillog.core.api

import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.request.HttpRequestData
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class StatusApiTest {
    private val requests = mutableListOf<HttpRequestData>()

    private fun api(vararg replies: Pair<String, String>, status: HttpStatusCode = HttpStatusCode.OK) = StatusApi(
        createHttpClient(MockEngine { req ->
            requests += req
            val body = replies.first { req.url.encodedPath.endsWith(it.first) }.second
            respond(body, status, headersOf(HttpHeaders.ContentType, "application/json"))
        }),
        apiBaseUrl = "https://api.example/",
        supabaseUrl = "https://x.supabase.co",
        supabaseKey = "key",
        accessToken = { "tok" },
    )

    @Test
    fun rolesComeFromOwnershipGrantsAndDemo() = runTest {
        val list = api(
            "/aircraft" to """[
              {"id":"a1","tail_number":"N1","owner_id":"me","is_demo":false},
              {"id":"a2","tail_number":"N2","owner_id":"dana","is_demo":false},
              {"id":"a3","tail_number":"N3","owner_id":"dana","is_demo":false},
              {"id":"d","tail_number":"N734DM","owner_id":"x","is_demo":true}]""",
            "/aircraft_share" to """[{"aircraft_id":"a2","role":"editor"},{"aircraft_id":"d","role":"editor"}]""",
        ).aircraft("me", "me@example.com")
        assertEquals(
            listOf(AircraftRole.Owner, AircraftRole.Editor, AircraftRole.Viewer, AircraftRole.Viewer),
            list.map { it.role },
        )
        assertEquals("key", requests.first().headers["apikey"])
        assertEquals("Bearer tok", requests.first().headers[HttpHeaders.Authorization])
        assertEquals("ilike.me@example.com", requests.last().url.parameters["invited_email"])
    }

    @Test
    fun ownerOnlySkipsTheGrantQuery() = runTest {
        api("/aircraft" to """[{"id":"a1","tail_number":"N1","owner_id":"me"}]""").aircraft("me", "me@example.com")
        assertEquals(1, requests.size)
    }

    @Test
    fun statusParsesTheSnapshotAndKeepsComputedAt() = runTest {
        val snap = api("/status" to STATUS).status("a1")
        assertEquals("https://api.example/api/aircraft/a1/status", requests.single().url.toString())
        assertEquals("attention", snap.body.situation)
        assertEquals("2026-11-18T22:54:40.168Z", snap.computedAt)
        assertEquals(9.7, snap.body.items.single().hours!!.remaining)
    }

    @Test
    fun failuresCarryTheStatus() = runTest {
        val e = assertFailsWith<ApiHttpException> { api("/status" to "{}", status = HttpStatusCode.NotFound).status("zz") }
        assertEquals(404, e.status)
    }

    private companion object {
        const val STATUS = """{"aircraftId":"a1","algoVersion":1,"today":"2026-11-18","situation":"attention",
          "verdict":{"text":"Nothing tracked is overdue. Next: oil change in about 9.7 hours.","emphasis":[[0,26]],"lines":[]},
          "meters":{"tach":{"face":4212.4,"stitched":4212.4,"asOf":"2026-07-10","source":"starting","readingId":null}},
          "rate":{"hoursPerDay":0,"hoursPerWeek":0,"basis":"none","meter":"tach","sampleCount":0,"windowStart":null,"windowEnd":null,"confidence":"none"},
          "items":[{"key":"mx:1","source":"maintenance","kind":"oil_change","label":"Oil change","rule":"every 50 h","line":"engine",
            "regulatory":false,"advisory":true,"ifrOnly":false,"status":"due_soon","calendar":null,
            "hours":{"meter":"tach","dueAt":4222.1,"remaining":9.7,"projectedDate":null,"projectionBasis":"none","estimatedMeter":true},
            "first":"hours","firstDate":null,"lastDone":null,"waitingEntryId":null,"providerId":null,"visitId":null,"reminder":{}}],
          "visits":{"suggested":[],"planned":[]},
          "lineAhead":{"from":"2026-11-18","to":"2027-11-18","rings":[],"undated":["mx:1"]},
          "counts":{"overdue":0,"dueSoon":1,"noRecord":0,"pagesToReview":0,"pagesBeingRead":0,"openSquawks":0},
          "computedAt":"2026-11-18T22:54:40.168Z","inputsSeq":7}"""
    }
}
