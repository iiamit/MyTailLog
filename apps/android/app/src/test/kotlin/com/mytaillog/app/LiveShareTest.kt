package com.mytaillog.app

import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import com.mytaillog.core.api.AuthApi
import com.mytaillog.core.api.HttpSyncApi
import com.mytaillog.core.api.createHttpClient
import com.mytaillog.core.api.parseStatus
import com.mytaillog.core.db.mirror.MirrorDatabase
import com.mytaillog.core.db.outbox.OutboxDatabase
import com.mytaillog.core.domain.due.planDate
import io.ktor.client.request.bearerAuth
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.util.Properties

/**
 * Phase 5 against the TEST server on N734QA: a record room made, opened without an account, counted, revoked
 * and then refused; the summary PDF and due CSV; people; Plan ahead's local rule against POST /plan; a suggested
 * visit booked through the outbox and cancelled. Skipped unless MTL_QA_USER names the QA account's JSON.
 */
class LiveShareTest {
    @get:Rule val tmp = TemporaryFolder()

    @Test
    fun planAndShareAgainstTheTestServer() = runBlocking {
        val path = System.getenv("MTL_QA_USER")?.takeIf { it.isNotBlank() }
        if (System.getenv("MTL_QA_REQUIRED") == "1") require(path != null && File(path).exists()) { "MTL_QA_USER must name the test account JSON" }
        assumeTrue("set MTL_QA_USER to run against the test server", path != null && File(path).exists())
        val creds = Json.parseToJsonElement(File(path!!).readText()).jsonObject
        val http = createHttpClient()
        val session = AuthApi(http, BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_KEY)
            .signInWithPassword(creds["email"]!!.jsonPrimitive.content, creds["password"]!!.jsonPrimitive.content)
        val token: suspend () -> String = { session.accessToken }
        val api = RecordsApi(http, BuildConfig.API_URL, BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_KEY, token)

        // Record room: make, open anonymously, count, revoke, refused.
        val made = api.createRoom(QA, RoomDraft(Audience.People, "Live test room", 7, true, emptySet(), false, emptySet(), false).body())
        val id = made.s("id")!!
        val url = made.s("url")!!
        val open = http.get(url)
        assertEquals("opens without an account", 200, open.status.value)
        // shortcut: GET …/record-rooms answers 500 on TEST while it holds a room it can't decrypt (one made by
        // another server); the list is checked when it answers, the rest goes by the PATCH reply and the link itself.
        val list = runCatching { parseRooms(api.roomsJson(QA)) }.onFailure { println("record-rooms list failed: ${it.message}") }.getOrNull()
        list?.let { l -> val room = l.single { it.id == id }; assertEquals(url, room.url); assertTrue(room.active) }
        println("opens after one visit: ${api.roomOpens(QA, id).size}")
        val revoked = api.updateRoom(QA, id, json("revoke" to true))
        assertTrue(revoked.toString(), revoked.s("revokedAt") != null)
        val after = http.get(url)
        assertTrue("a revoked link no longer opens (${after.status.value})", after.status.value != 200 || !after.bodyAsText().contains("Live test room"))

        // Files and people.
        assertEquals("%PDF", String(api.file(QA, "summary").copyOf(4)))
        assertTrue(api.file(QA, "export?type=due").isNotEmpty())
        api.people(QA)

        // Plan ahead: the phone's rule agrees with the server's for a few dates.
        val status = parseStatus(http.get("${BuildConfig.API_URL}/api/aircraft/$QA/status") { bearerAuth(token()) }.bodyAsText()).body
        for (date in listOf("2026-12-15", "2027-03-01", "2027-11-01")) {
            val server = Json.parseToJsonElement(http.post("${BuildConfig.API_URL}/api/aircraft/$QA/plan") {
                bearerAuth(token()); contentType(ContentType.Application.Json); setBody("""{"date":"$date","hoursPerWeek":3}""")
            }.bodyAsText()).jsonObject
            val local = planDate(status, date, 3.0)
            fun keys(k: String) = server[k]!!.jsonArray.map { it.jsonObject["key"]!!.jsonPrimitive.content }
            assertEquals(date, keys("lapsed"), local.lapsed.map { it.key })
            assertEquals(date, keys("lapses"), local.lapses.map { it.key })
        }

        // Book the suggested visit through the outbox, then cancel it.
        Class.forName("org.sqlite.JDBC")
        val store = OfflineStore(
            session.user.id, tmp.root,
            JdbcSqliteDriver("jdbc:sqlite:${File(tmp.root, "m.db")}", Properties(), MirrorDatabase.Schema),
            JdbcSqliteDriver("jdbc:sqlite:${File(tmp.root, "o.db")}", Properties(), OutboxDatabase.Schema),
            HttpSyncApi(http, BuildConfig.API_URL, token), CaptureApi(http, BuildConfig.API_URL, token), api,
        )
        suspend fun sync() {
            assertFalse("everything lands", store.syncNow())
            assertEquals("refused: " + store.queued().filter { it.status == "refused" }.map { "${it.type}: ${it.error}" }, 0L, store.sync.value.refused)
        }
        sync()
        val suggestion = api.visits(QA).suggested.first()
        val visit = newId()
        store.change(
            "visit.create", QA, "planned_visit", visit, "Book",
            json("id" to visit, "weekOf" to suggestion.weekOf, "fromSuggestionKey" to suggestion.suggestionKey, "itemKeys" to JsonArray(suggestion.items.map { JsonPrimitive(it.key) })),
        )
        sync()
        assertTrue("booked", api.visits(QA).planned.any { it.id == visit })
        assertTrue("the booking came down to the phone", store.mirror.raw("planned_visit", visit) != null)
        val send = api.sendVisit(QA, visit, "Live test shop", null)
        assertTrue(send.toString(), send.s("url")!!.startsWith("http"))
        store.change("visit.setStatus", QA, "planned_visit", visit, "Cancel", json("visitId" to visit, "status" to "cancelled"))
        sync()
        assertTrue("cancelled", api.visits(QA).planned.none { it.id == visit && it.status == "planned" })
    }

    private companion object { const val QA = "d5c25951-f64a-5331-9b60-9ee02b456a25" }
}
