package com.mytaillog.core.api

import com.mytaillog.core.domain.Mutations
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.request.HttpRequestData
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class BooksApiTest {
    private val requests = mutableListOf<HttpRequestData>()

    private val map = """{"today":"2026-11-19","range":{"from":"1978-06-02","to":"2027-11-19","scaleBreak":"2025-11-19"},
      "lines":[{"lineId":"L1","logbook":"airframe","logbookId":"L1","name":"Airframe","volumes":[{"id":"L1","label":"Airframe","from":"1978-06-02","to":"2026-07-18"}]}],
      "stops":[{"id":"s1","lineId":"L1","logbook":"airframe","date":"1978-06-02","entryIds":["e1"],"trust":"confirmed","pageIds":["p1"],"label":"First entry","major":true}],
      "interchanges":[],"gaps":[],"eras":[],"squawks":[],"rings":[],"visits":[],"undatedEntries":0}"""

    private fun api(status: HttpStatusCode = HttpStatusCode.OK) = BooksApi(
        createHttpClient(MockEngine { req ->
            requests += req
            val p = req.url.encodedPath
            val body = when {
                p.endsWith("/map") -> map
                p.endsWith("/log_entry") -> """[{"id":"e1","page_id":"p1","logbook_id":"L1","entry_date":"1978-06-02","tach":9.1,"trust":"ai_read",
                    "field_confidence":{"tach":0.6,"hobbs":null},"field_boxes":{"tach":{"x":0.1,"y":0.2,"w":0.1,"h":0.02},"hobbs":null},"updated_at":"2026-11-19T00:00:00Z"}]"""
                p.endsWith("/page") -> """[{"id":"p1","logbook_id":"L1","page_sequence":1,"review_status":"unreviewed","needs_look":null,"updated_at":"2026-11-19T00:00:00Z"}]"""
                p.endsWith("/logbook") -> """[{"id":"L1","type":"airframe","title":null}]"""
                else -> """[]"""
            }
            respond(body, status, headersOf(HttpHeaders.ContentType, "application/json"))
        }),
        apiBaseUrl = "https://api.example/",
        supabaseUrl = "https://x.supabase.co",
        supabaseKey = "key",
        accessToken = { "tok" },
    )

    @Test
    fun loadsTheMapAndTheRowsBehindIt() = runTest {
        val books = api().load("a1")
        assertEquals("First entry", books.map.stops.single().label)
        assertEquals(0.6, books.entries.single().fieldConfidence?.get("tach"))
        assertEquals(0.02, books.entries.single().fieldBoxes?.get("tach")?.h)
        assertEquals(1, books.pages.single().pageSequence)
        assertEquals(null, books.pages.single().needsLook)
        assertTrue(requests.first { it.url.encodedPath.endsWith("/page") }.url.parameters["select"]!!.contains("needs_look"))
        val rest = requests.filter { it.url.host == "x.supabase.co" }
        assertEquals(6, rest.size)
        assertTrue(rest.all { (if (it.url.encodedPath.endsWith("/aircraft")) it.url.parameters["id"] == "eq.a1" else it.url.parameters["aircraft_id"] == "eq.a1") && it.headers["apikey"] == "key" })
        assertEquals("Bearer tok", requests.first { it.url.encodedPath.endsWith("/map") }.headers[HttpHeaders.Authorization])
    }

    @Test
    fun anAircraftPastOnePageOfEntriesGetsThemAll() = runTest {
        val total = REST_PAGE + 5
        val paged = BooksApi(
            createHttpClient(MockEngine { req ->
                requests += req
                val p = req.url.encodedPath
                val body = when {
                    p.endsWith("/map") -> map
                    p.endsWith("/log_entry") -> {
                        val from = req.url.parameters["offset"]!!.toInt()
                        val to = minOf(total, from + req.url.parameters["limit"]!!.toInt())
                        (from until to).joinToString(",", "[", "]") { """{"id":"e$it","logbook_id":"L1","trust":"ai_read","updated_at":"2026-11-19T00:00:00Z"}""" }
                    }
                    else -> "[]"
                }
                respond(body, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
            }),
            apiBaseUrl = "https://api.example/", supabaseUrl = "https://x.supabase.co", supabaseKey = "key", accessToken = { "tok" },
        )
        val books = paged.load("a1")
        assertEquals(total, books.entries.map { it.id }.toSet().size)
        val entryReads = requests.filter { it.url.encodedPath.endsWith("/log_entry") }
        assertEquals(listOf("0", "$REST_PAGE"), entryReads.map { it.url.parameters["offset"] })
        assertTrue(entryReads.all { it.url.parameters["order"]!!.endsWith(",id") })
    }

    @Test
    fun aViewerOrMissingAircraftThrowsWithTheStatus() = runTest {
        assertEquals(404, assertFailsWith<ApiHttpException> { api(HttpStatusCode.NotFound).load("a1") }.status)
    }

    @Test
    fun writesCarryTheirBaseAndShape() {
        val e = EntryRow(id = "e1", logbookId = "L1", trust = "ai_read", updatedAt = "2026-11-19T00:00:00Z")
        val upd = BookWrites.update("a1", e, mapOf("tach" to 1874.6, "entry_date" to null, "signature_name" to "M. Torres"))
        assertEquals("entry.update", upd.type)
        assertEquals(e.updatedAt, upd.base)
        val fields = upd.payload["fields"]!!.jsonObject
        assertEquals("1874.6", fields["tach"]!!.jsonPrimitive.content)
        assertEquals(JsonNull, fields["entry_date"])
        val gap = BookWrites.gapStatus("a1", GapRow("g1", "open", null, "t0"), "no_pages_exist", " ")
        assertEquals(JsonNull, gap.payload["note"])
        // Every write here is one the server knows, with the base it demands.
        listOf(upd, gap, BookWrites.confirm("a1", e), BookWrites.reviewPage("a1", "p1", "confirmed", "t0"), BookWrites.confirmClean("a1"), BookWrites.delete("a1", e))
            .forEach { m ->
                assertTrue(Mutations.isKnown(m.type), m.type)
                assertEquals(Mutations.needsBase(m.type, m.payload), m.base != null, m.type)
            }
    }
}
