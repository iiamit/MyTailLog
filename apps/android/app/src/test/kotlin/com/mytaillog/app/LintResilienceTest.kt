package com.mytaillog.app

import android.content.Context
import android.os.storage.StorageManager
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.Implementation
import org.robolectric.annotation.Implements
import org.xmlpull.v1.XmlPullParser
import java.io.File
import java.io.IOException
import java.util.UUID

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "en-rUS", shadows = [ScanStorageShadow::class])
class LintResilienceTest {
    private val context: Context get() = RuntimeEnvironment.getApplication()

    @Test fun backupAndTransfersExcludeEveryStorageDomain() {
        assertEquals(0, context.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_ALLOW_BACKUP)
        val xml = context.resources.getXml(R.xml.data_extraction_rules)
        val excluded = mutableMapOf<String, MutableSet<String>>()
        var section = ""
        xml.use {
            while (xml.next() != XmlPullParser.END_DOCUMENT) {
                if (xml.eventType != XmlPullParser.START_TAG) continue
                when (xml.name) {
                    "cloud-backup", "device-transfer" -> section = xml.name
                    "include" -> fail("No app data should transfer with device-bound keys")
                    "exclude" -> {
                        assertEquals(".", xml.getAttributeValue(null, "path"))
                        excluded.getOrPut(section) { mutableSetOf() }.add(xml.getAttributeValue(null, "domain"))
                    }
                }
            }
        }
        val domains = setOf("root", "file", "database", "sharedpref", "external", "device_root", "device_file", "device_database", "device_sharedpref")
        assertEquals(mapOf("cloud-backup" to domains, "device-transfer" to domains), excluded)
    }

    @Test fun scanSpaceChangesAndServiceFailuresAreHandled() {
        ScanStorageShadow.available = 500L * 1024 * 1024
        ScanStorageShadow.failed = false
        assertFalse(lowScanStorage(context))
        ScanStorageShadow.available = 100L * 1024 * 1024
        assertTrue(lowScanStorage(context))
        ScanStorageShadow.available = 200L * 1024 * 1024
        assertFalse(lowScanStorage(context))
        ScanStorageShadow.failed = true
        try {
            assertEquals(context.filesDir.usableSpace < 200L * 1024 * 1024, lowScanStorage(context))
        } finally { ScanStorageShadow.failed = false }
    }

    @Test fun singularAndPluralMessagesUseTheCorrectCount() {
        val resources = context.resources
        val pageMessages = listOf(R.plurals.books_being_read, R.plurals.books_gap_unconfirmed,
            R.plurals.books_pages_wait, R.plurals.books_confirm_clean, R.plurals.scan_done_spoken,
            R.plurals.scan_review_strip, R.plurals.scan_keep_title, R.plurals.queue_failed)
        for (count in listOf(0, 1, 2)) {
            for (id in pageMessages) {
                val message = resources.getQuantityString(id, count, count)
                assertTrue(message, Regex("\\b$count (?:clean )?${if (count == 1) "page" else "pages"}\\b").containsMatchIn(message))
                if (count == 1) assertFalse(message, message.contains("1 pages"))
            }
            assertTrue(resources.getQuantityString(R.plurals.books_map_more, count, count).contains("$count more ${if (count == 1) "item:" else "items:"}"))
            assertTrue(resources.getQuantityString(R.plurals.books_cluster, count, count, "Mar 1", "Mar 2").contains("$count ${if (count == 1) "entry," else "entries,"}"))
            assertTrue(resources.getQuantityString(R.plurals.books_visit_title, count, "Annual", "Mar 1", count).endsWith("$count ${if (count == 1) "book" else "books"}"))
            assertTrue(resources.getQuantityString(R.plurals.books_tablet_hint, count, count).contains("$count confirmed ${if (count == 1) "entry" else "entries"}"))
            assertTrue(resources.getQuantityString(R.plurals.review_confirmed_toast, count, "Page 1", count).endsWith("$count ${if (count == 1) "entry" else "entries"}"))
            assertTrue(resources.getQuantityString(R.plurals.scan_where, count, count.toLong(), count + 1L).contains("$count ${if (count == 1) "page so" else "pages so"}"))
            assertTrue(resources.getQuantityString(R.plurals.docs_held, count, count).contains("$count ${if (count == 1) "document on" else "documents on"}"))
            // The allowance's noun follows its cap, not the number used.
            assertTrue(resources.getQuantityString(R.plurals.queue_allowance, count, 0, count).startsWith("0 of $count ${if (count == 1) "page read" else "pages read"}"))
        }
        for (pages in listOf(0, 1, 2)) for (entries in listOf(0, 1, 2)) {
            val pageText = resources.getQuantityString(R.plurals.count_pages, pages, pages)
            val entryText = resources.getQuantityString(R.plurals.count_entries, entries, entries)
            assertEquals("$pages ${if (pages == 1) "page" else "pages"} · $entries ${if (entries == 1) "entry" else "entries"}",
                resources.getString(R.string.books_pages_summary, pageText, entryText))
            val done = resources.getQuantityString(R.plurals.review_all_done, pages, pages, entryText)
            assertTrue(done, done.contains(if (pages == 1) "1 page is reviewed." else "$pages pages are reviewed."))
            assertTrue(done, done.endsWith("$entryText confirmed."))
        }
    }
}

@Implements(StorageManager::class)
class ScanStorageShadow {
    @Implementation fun getUuidForPath(path: File): UUID = StorageManager.UUID_DEFAULT
    @Implementation fun getAllocatableBytes(uuid: UUID): Long {
        if (failed) throw IOException("Storage service unavailable")
        return available
    }
    companion object {
        var available = 500L * 1024 * 1024
        var failed = false
    }
}
