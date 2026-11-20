package com.mytaillog.app

import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import com.mytaillog.core.api.AuthApi
import com.mytaillog.core.api.HttpSyncApi
import com.mytaillog.core.api.createHttpClient
import com.mytaillog.core.db.mirror.MirrorDatabase
import com.mytaillog.core.db.outbox.OutboxDatabase
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.Properties
import javax.imageio.ImageIO

/**
 * The phone's capture path against the TEST server, end to end: pull, page and thumbnail to storage by
 * signed URL, `batch.create` + `page.register` through sync v2, then the reading queue. Skipped unless
 * MTL_QA_USER names a JSON file with the QA account's email and password; writes only to N734QA.
 */
class LiveCaptureTest {
    @get:Rule val tmp = TemporaryFolder()

    private fun jpeg(w: Int, h: Int): ByteArray {
        val img = BufferedImage(w, h, BufferedImage.TYPE_INT_RGB)
        val g = img.createGraphics()
        g.color = Color.WHITE; g.fillRect(0, 0, w, h)
        g.color = Color.BLACK
        for (i in 0 until 20) g.drawString("6/11/84  Oil changed, tach ${4000 + i}.2  A&P 123456", w / 20, h / 20 + i * h / 22)
        g.dispose()
        return ByteArrayOutputStream().also { ImageIO.write(img, "jpg", it) }.toByteArray()
    }

    @Test
    fun aPageGoesToStorageAndJoinsTheReadingQueue() = runBlocking {
        val path = System.getenv("MTL_QA_USER")?.takeIf { it.isNotBlank() }
        if (System.getenv("MTL_QA_REQUIRED") == "1") require(path != null && File(path).exists()) { "MTL_QA_USER must name the test account JSON" }
        assumeTrue("set MTL_QA_USER to run against the test server", path != null && File(path).exists())
        val creds = Json.parseToJsonElement(File(path!!).readText()).jsonObject
        val http = createHttpClient()
        val session = AuthApi(http, BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_KEY)
            .signInWithPassword(creds["email"]!!.jsonPrimitive.content, creds["password"]!!.jsonPrimitive.content)
        val token: suspend () -> String = { session.accessToken }
        val capture = CaptureApi(http, BuildConfig.API_URL, token)
        Class.forName("org.sqlite.JDBC")
        val store = OfflineStore(
            session.user.id, tmp.root,
            JdbcSqliteDriver("jdbc:sqlite:${File(tmp.root, "m.db")}", Properties(), MirrorDatabase.Schema),
            JdbcSqliteDriver("jdbc:sqlite:${File(tmp.root, "o.db")}", Properties(), OutboxDatabase.Schema),
            HttpSyncApi(http, BuildConfig.API_URL, token), capture,
        )

        assertFalse("first sync pulls", store.syncNow())
        val book = store.rows("logbook", "aircraft_id = ?", QA).first { it["type"]?.jsonPrimitive?.contentOrNull == "airframe" }
        val bookId = book["id"]!!.jsonPrimitive.content
        val before = store.pageCount(bookId)

        val batch = store.newBatchId()
        val phash = (1..16).map { "0123456789abcdef".random() }.joinToString("")
        store.addPage(ScanTarget(QA, "N734QA", bookId, "Airframe", true), batch, jpeg(1500, 2000), jpeg(300, 400), phash)
        store.finishSession(batch)
        assertFalse("everything lands", store.syncNow())
        val s = store.sync.value
        assertEquals(0, s.pages); assertEquals(0L, s.waiting); assertEquals(0L, s.refused); assertEquals(0L, s.conflicts)
        assertEquals("the page is in this phone's copy", before + 1, store.pageCount(bookId))

        val q = capture.readingQueue(QA)
        val mine = q.batches.single { it.id == batch }
        assertEquals(1, mine.expected); assertEquals(1, mine.uploaded)
        println("LIVE batch $batch: queued=${mine.queued} reading=${mine.reading} read=${mine.read} waitingAllowance=${mine.waitingAllowance} allowance=${q.allowance}")
        assertTrue(store.activity().any { it.text.startsWith("Sent: Airframe page") })
    }

    private companion object { const val QA = "d5c25951-f64a-5331-9b60-9ee02b456a25" }
}
