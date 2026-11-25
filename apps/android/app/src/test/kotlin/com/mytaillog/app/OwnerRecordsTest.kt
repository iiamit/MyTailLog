package com.mytaillog.app

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.request.HttpRequestData
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.http.content.TextContent
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.Rule
import org.junit.rules.TemporaryFolder
import java.io.File
import java.io.ByteArrayInputStream

class OwnerRecordsTest {
    @Test fun reportingPeriodUsesIdenticalDatesForLedgerAndCsvAndRejectsInvalidRanges() {
        assertEquals("expenses?from=2026-01-01&to=2026-02-01", expensePath("2026-01-01", "2026-02-01"))
        assertEquals("expenses?format=csv&from=2026-01-01&to=2026-02-01", expensePath("2026-01-01", "2026-02-01", csv = true))
        assertEquals("expenses?format=csv", expensePath(null, null, csv = true))
        assertFalse(validExpensePeriod("2026-02-01", "2026-01-01"))
        assertFalse(validExpensePeriod("2026-02-30", "2026-03-01"))
        assertFalse(validExpensePeriod(null, "2026-03-01"))
    }

    @get:Rule val tmp = TemporaryFolder()
    @Test fun expenseAmountsUseExactMinorUnitsAndRejectRoundingOrOverflow() {
        assertEquals(12345L, expenseMinor("123.45"))
        assertEquals(-187L, expenseMinor("-1.87"))
        assertEquals(10L, expenseMinor(".10"))
        assertNull(expenseMinor("0"))
        assertNull(expenseMinor("12.345"))
        assertNull(expenseMinor("NaN"))
        assertNull(expenseMinor("999999999999999999999"))
        assertEquals("-1.87", moneyMinor(-187))
        assertEquals(123L, expenseMinor("123", "JPY"))
        assertNull(expenseMinor("123.45", "JPY"))
        assertEquals(1234L, expenseMinor("1.234", "KWD"))
        assertEquals("1.234", moneyMinor(1234L, "KWD"))
        assertNull(expenseMinor("12", "XYZ"))
    }

    @Test fun compressionPreservesDifferentReferencePressuresAndRejectsImpossibleValues() {
        val readings = parseCompressionInput("76/80, 65/70, 0/80")!!
        assertEquals(listOf(80.0, 70.0, 80.0), readings.map { it.d("reference") })
        assertEquals("C1: 76/80 · C2: 65/70 · C3: 0/80", compressionLine(json("readings" to kotlinx.serialization.json.JsonArray(readings))))
        assertNull(parseCompressionInput("81/80"))
        assertNull(parseCompressionInput("76"))
        assertNull(parseCompressionInput("76/20"))
        assertNotNull(parseCompressionInput("19.5/20"))
        assertNull(parseCompressionInput((1..13).joinToString { "76/80" }))
    }

    @Test fun compressionLinesBreakOnlyAcrossAffectedCylinderReplacements() {
        val events = listOf(json("kind" to "cylinder_replacement", "event_date" to "2026-01-02", "cylinders" to kotlinx.serialization.json.JsonArray(listOf(kotlinx.serialization.json.JsonPrimitive(2)))))
        assertFalse(connectsCompression("2026-01-01", "2026-01-03", 2, events))
        assertTrue(connectsCompression("2026-01-01", "2026-01-03", 1, events))
        assertFalse(connectsCompression(null, "2026-01-03", 2, events))
    }

    @Test fun oilConsumptionUsesOverallHoursAndRejectsMeterReversalsOrMixedBases() {
        val additions = listOf(
            json("added_date" to "2026-01-01", "tach" to 100, "quarts" to 1),
            json("added_date" to "2026-01-02", "tach" to 110, "quarts" to 1),
            json("added_date" to "2026-01-03", "tach" to 120, "quarts" to 3),
        )
        assertEquals("tach", engineConsumption(additions)!!.first)
        assertEquals(5.0, engineConsumption(additions)!!.second, 0.0)
        assertNull(engineConsumption(additions + json("added_date" to "2026-01-04", "tach" to 5, "quarts" to 1)))
        assertNull(engineConsumption(listOf(additions[0], json("added_date" to "2026-01-02", "hobbs" to 110, "quarts" to 1))))
    }

    @Test fun unknownSizeDocumentsAreBoundedBeforeBeingQueued() {
        val bytes = ByteArray((MAX_DOC_BYTES + 20).toInt())
        assertEquals(MAX_DOC_BYTES + 1, readBoundedDocument(ByteArrayInputStream(bytes)).size.toLong())
        assertEquals(7, readBoundedDocument(ByteArrayInputStream(ByteArray(7))).size)
    }

    @Test fun ownerRequestsAreAuthenticatedAndRetainStableUploadIdentity() = runTest {
        val calls = mutableListOf<HttpRequestData>()
        val client = HttpClient(MockEngine { request -> calls += request; respond("{\"item\":{\"id\":\"same-id\"}}", headers = headersOf(HttpHeaders.ContentType, "application/json")) })
        val api = RecordsApi(client, "https://test.example/", "https://test.supabase.co", "public") { "token" }
        val meta = json("id" to "same-id", "fileName" to "annual.pdf", "mimeType" to "application/pdf")
        repeat(2) { api.inbox("aircraft", meta, byteArrayOf(1, 2)) }
        assertEquals(2, calls.size)
        calls.forEach {
            assertEquals("Bearer token", it.headers[HttpHeaders.Authorization])
            assertEquals("same-id", it.headers["Idempotency-Key"])
            assertEquals("https://test.example/api/aircraft/aircraft/inbox", it.url.toString())
            val body = Json.parseToJsonElement((it.body as TextContent).text).jsonObject
            assertEquals("AQI=", body.s("file"))
            assertEquals("same-id", body.s("id"))
        }
        client.close()
    }

    @Test fun exportsStreamIntoCacheAndFailuresLeaveThePreviousFileIntact() = runTest {
        val destination = File(tmp.root, "annual.zip").apply { writeText("previous") }
        val errorClient = HttpClient(MockEngine { respond("{\"error\":\"Evidence unavailable\"}", HttpStatusCode.ServiceUnavailable, headersOf(HttpHeaders.ContentType, "application/json")) })
        try {
            RecordsApi(errorClient, "https://test.example", "https://test.supabase.co", "public") { "token" }.ownerFile("aircraft", "annual-packet", destination, json("format" to "zip"))
            fail("Expected export failure")
        } catch (_: UploadHttpException) { assertEquals("previous", destination.readText()) }
        finally { errorClient.close() }
        val payload = ByteArray(128 * 1024) { (it % 251).toByte() }
        val client = HttpClient(MockEngine { request ->
            assertEquals("Bearer token", request.headers[HttpHeaders.Authorization])
            respond(payload, headers = headersOf(HttpHeaders.ContentType, "application/zip"))
        })
        RecordsApi(client, "https://test.example", "https://test.supabase.co", "public") { "token" }.ownerFile("aircraft", "annual-packet", destination, json("format" to "zip"))
        assertArrayEquals(payload, destination.readBytes())
        assertEquals(listOf("annual.zip"), tmp.root.listFiles()!!.map { it.name })
        client.close()
    }

    @Test fun correctionsAndDeletesCarryTheReviewedVersionAndKeepAuthorization() = runTest {
        val calls = mutableListOf<HttpRequestData>()
        val client = HttpClient(MockEngine { request -> calls += request; respond("{}", headers = headersOf(HttpHeaders.ContentType, "application/json")) })
        val api = RecordsApi(client, "https://test.example", "https://test.supabase.co", "public") { "token" }
        api.ownerUpdate("aircraft", "expenses/expense", json("base" to "version-before-edit", "amount_minor" to -100))
        api.ownerDelete("aircraft", "expenses/expense", "version-before-delete")
        assertEquals(listOf("PATCH", "DELETE"), calls.map { it.method.value })
        assertEquals(listOf("version-before-edit", "version-before-delete"), calls.map { Json.parseToJsonElement((it.body as TextContent).text).jsonObject.s("base") })
        assertTrue(calls.all { it.headers[HttpHeaders.Authorization] == "Bearer token" })
        client.close()
    }

    @Test fun cancellationIsNeverPresentedAsACompletedRequest() = runTest {
        val client = HttpClient(MockEngine { throw CancellationException("screen closed") })
        val api = RecordsApi(client, "https://test.example", "https://test.supabase.co", "public") { "token" }
        try { api.ownerData("aircraft", "expenses"); fail("Expected cancellation") }
        catch (_: CancellationException) { /* The caller's lifecycle can cancel safely. */ }
        finally { client.close() }
    }

    @Test fun permissionAndStaleApprovalErrorsAreShownAsRefusals() = runTest {
        for (status in listOf(HttpStatusCode.Forbidden, HttpStatusCode.Conflict)) {
            val client = HttpClient(MockEngine { respond("{\"error\":\"Review changed; reload it\"}", status, headersOf(HttpHeaders.ContentType, "application/json")) })
            val api = RecordsApi(client, "https://test.example", "https://test.supabase.co", "public") { "token" }
            try { api.ownerMutation("aircraft", "inbox/item/approve", json("base" to "old")); fail("Expected server refusal") }
            catch (e: UploadHttpException) { assertEquals(status.value, e.status); assertEquals("Review changed; reload it", e.message) }
            client.close()
        }
    }
}
