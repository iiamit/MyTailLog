package com.mytaillog.app

import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import com.mytaillog.core.api.AuthApi
import com.mytaillog.core.api.HttpSyncApi
import com.mytaillog.core.api.createHttpClient
import com.mytaillog.core.db.mirror.MirrorDatabase
import com.mytaillog.core.db.outbox.OutboxDatabase
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
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
 * Phase 4's writes against the TEST server through the same outbox the phone uses: a squawk with a
 * photo, resolve, a mechanic link, oil, a document (upload, rename, remove), an AD tracked and
 * dropped, equipment installed, removed and deleted, and the time checks. Skipped unless MTL_QA_USER
 * names the QA account's JSON; writes only to N734QA and removes what it made.
 */
class LiveRecordsTest {
    @get:Rule val tmp = TemporaryFolder()

    private fun jpeg(): ByteArray {
        val img = BufferedImage(800, 600, BufferedImage.TYPE_INT_RGB)
        img.createGraphics().apply { color = Color.DARK_GRAY; fillRect(0, 0, 800, 600); color = Color.WHITE; drawString("Nav light lens", 300, 300); dispose() }
        return ByteArrayOutputStream().also { ImageIO.write(img, "jpg", it) }.toByteArray()
    }

    @Test
    fun phase4WritesLandThroughTheOutbox() = runBlocking {
        val path = System.getenv("MTL_QA_USER")?.takeIf { it.isNotBlank() }
        assumeTrue("set MTL_QA_USER to run against the test server", path != null && File(path).exists())
        val creds = Json.parseToJsonElement(File(path!!).readText()).jsonObject
        val http = createHttpClient()
        val session = AuthApi(http, BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_KEY)
            .signInWithPassword(creds["email"]!!.jsonPrimitive.content, creds["password"]!!.jsonPrimitive.content)
        val token: suspend () -> String = { session.accessToken }
        val api = RecordsApi(http, BuildConfig.API_URL, BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_KEY, token)
        Class.forName("org.sqlite.JDBC")
        val store = OfflineStore(
            session.user.id, tmp.root,
            JdbcSqliteDriver("jdbc:sqlite:${File(tmp.root, "m.db")}", Properties(), MirrorDatabase.Schema),
            JdbcSqliteDriver("jdbc:sqlite:${File(tmp.root, "o.db")}", Properties(), OutboxDatabase.Schema),
            HttpSyncApi(http, BuildConfig.API_URL, token), CaptureApi(http, BuildConfig.API_URL, token), api,
        )
        suspend fun sync() {
            assertFalse("everything lands", store.syncNow())
            val s = store.sync.value
            assertEquals("refused: " + store.queued().filter { it.status == "refused" }.map { "${it.type}: ${it.error}" }, 0L, s.refused)
            assertEquals(0L, s.waiting); assertEquals(0L, s.conflicts)
        }
        sync()

        // Squawk with a photo, resolved, sent to a mechanic.
        val sq = newId()
        store.change("squawk.create", QA, "squawk", sq, "Squawk", json("id" to sq, "description" to "Live test: nav light lens cracked", "severity" to "medium", "reportedAt" to java.time.Instant.now().toString()))
        val photo = newId()
        val job = store.addFile(OfflineStore.SQUAWK_PHOTO, QA, File(store.dir, "squawk_photos/$photo.jpg"), jpeg(), json("squawkId" to sq, "photoId" to photo))
        store.change("squawkPhoto.create", QA, "squawk_photo", photo, "Squawk photo", json("id" to photo, "squawkId" to sq, "blobId" to photo), dependsOn = job)
        sync()
        assertFalse(store.records("squawk", QA).single { it.id == sq }.pending)
        assertTrue("the photo row came back", store.records("squawk_photo", QA).any { it.id == photo && it.s("squawk_id") == sq })
        val link = api.mechanicLink(QA, sq, "Live test", 7, true)
        assertTrue(link.url, link.url.startsWith("http"))
        store.change("squawk.resolve", QA, "squawk", sq, "Resolve", json("squawkId" to sq, "resolvedAt" to java.time.LocalDate.now().toString(), "resolutionNotes" to "Replaced lens"))
        sync()
        assertEquals("resolved", store.records("squawk", QA).single { it.id == sq }.s("status"))

        // Oil added, then removed.
        val oil = newId()
        store.change("oil.create", QA, "oil_addition", oil, "Oil", json("id" to oil, "date" to java.time.LocalDate.now().toString(), "quarts" to 1.0))
        sync()
        val oilRow = store.records("oil_addition", QA).firstOrNull { it.id == oil }
        assertNotNull("oil row mirrored", oilRow)
        store.delete("oil.delete", QA, "oil_addition", oil, "Delete oil", json("additionId" to oil))
        sync()

        // A document: uploaded, renamed, removed.
        store.addFile(OfflineStore.DOCUMENT, QA, File(store.dir, "outbox/docs/live"), jpeg(), json("type" to "other", "title" to "Live test photo", "fileName" to "live.jpg", "mimeType" to "image/jpeg"))
        sync()
        val doc = store.records("document", QA).single { it.s("title") == "Live test photo" }
        assertTrue("the file comes back", api.documentFile(doc.id).isNotEmpty())
        store.change("document.update", QA, "document", doc.id, "Rename", json("documentId" to doc.id, "fields" to json("title" to "Live test renamed")))
        sync()
        assertEquals("Live test renamed", store.records("document", QA).single { it.id == doc.id }.s("title"))
        store.delete("document.delete", QA, "document", doc.id, "Remove", json("documentId" to doc.id))
        sync()

        // An AD tracked and dropped; equipment installed, removed, deleted.
        val ad = newId()
        store.change("ad.track", QA, "ad_compliance", ad, "Track", json("id" to ad, "kind" to "ad", "reference" to "2099-01-01", "title" to "Live test AD"))
        sync()
        val adRow = store.records("ad_compliance", QA).first { it.s("reference") == "2099-01-01" }
        store.delete("ad.delete", QA, "ad_compliance", adRow.id, "Drop", json("recordId" to adRow.id))
        sync()
        store.change("component.upsert", QA, "component", newId(), "Install", json("component" to json("name" to "Live test radio", "install_date" to "2026-01-02")))
        sync()
        val comp = store.records("component", QA).first { it.s("name") == "Live test radio" }
        store.change("component.remove", QA, "component", comp.id, "Remove", json("componentId" to comp.id, "date" to "2026-11-01"))
        sync()
        assertFalse(store.records("component", QA).single { it.id == comp.id }.b("is_installed"))
        store.delete("component.delete", QA, "component", comp.id, "Delete", json("componentId" to comp.id))
        store.delete("squawk.delete", QA, "squawk", sq, "Delete squawk", json("squawkId" to sq))
        sync()

        val checks = api.timeChecks(QA)
        println("LIVE phase 4: squawk $sq photo $photo link ${link.url} doc ${doc.id} time checks ${checks.size}")
        val found = runCatching { api.findAds("Cessna 172") }
        println("LIVE Federal Register: ${found.map { it.size }.getOrElse { "failed: ${it.message}" }}")
    }

    private companion object { const val QA = "d5c25951-f64a-5331-9b60-9ee02b456a25" }
}
