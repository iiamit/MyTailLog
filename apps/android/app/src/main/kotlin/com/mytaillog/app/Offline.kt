package com.mytaillog.app

import app.cash.sqldelight.db.QueryResult
import app.cash.sqldelight.db.SqlDriver
import com.mytaillog.core.api.SyncApi
import com.mytaillog.core.api.SyncHttpException
import com.mytaillog.core.db.MirrorStore
import com.mytaillog.core.db.outbox.OutboxDatabase
import com.mytaillog.core.domain.Mutation
import com.mytaillog.core.sync.Resolution
import com.mytaillog.core.sync.RowRef
import com.mytaillog.core.sync.SyncEngine
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.io.File
import java.util.UUID

/** What the SyncLine, OfflineBar and ConflictBar say (06 §1.3). */
data class SyncState(
    val waiting: Long = 0,
    val conflicts: Long = 0,
    val refused: Long = 0,
    /** Page files on this phone that haven't reached storage, and those that gave up (B-UPLOAD). */
    val pages: Int = 0,
    val failedPages: Int = 0,
    /** (done, total) while pages upload. */
    val uploading: Pair<Int, Int>? = null,
    val syncing: Boolean = false,
    val online: Boolean = true,
    val failed: Boolean = false,
    val lastSync: Long? = null,
    /** Bumps on every outbox change, so open screens re-read it. */
    val version: Long = 0,
)

/** One captured page waiting on this phone (a `file_job` of kind page, 05 §7.2). */
data class PageJob(
    val id: String,
    val pageId: String,
    val aircraftId: String,
    val logbookId: String,
    val batchId: String,
    val book: String,
    val tail: String?,
    val file: File,
    val bytes: Long,
    val uploaded: Boolean,
    val attempts: Long,
    val error: String?,
    val capturedAt: String,
    val handwritten: Boolean,
    val phash: String?,
) {
    val gaveUp get() = attempts >= OfflineStore.MAX_TRIES && !uploaded
}

/** Where a page goes, chosen on M-SCAN-01. */
data class ScanTarget(val aircraftId: String, val tail: String, val logbookId: String, val book: String, val handwritten: Boolean)

/**
 * The signed-in user's offline store (05 §6, §7): mirror.db and outbox.db through the KMP core's
 * [SyncEngine], page files under `filesDir/{userId}`, and the upload step that runs before every push.
 * Pages are kept until storage has them; `page.register` is queued once the page is in storage and its
 * scan's `batch.create` is queued, so a kill at any point loses nothing (05 §6.1 rule 3).
 */
class OfflineStore(
    val userId: String,
    val dir: File,
    private val mirrorDriver: SqlDriver,
    private val outboxDriver: SqlDriver,
    api: SyncApi,
    private val uploads: PageUploads,
    /** Squawk photos and documents (phase 4); null in tests that only scan pages. */
    private val records: RecordUploads? = null,
    private val now: () -> Long = System::currentTimeMillis,
) {
    val mirror = MirrorStore(mirrorDriver)
    val outbox = OutboxDatabase(outboxDriver)
    val engine = SyncEngine(api, mirror, outbox, now)
    private val q = outbox.outboxQueries
    private val lock = Mutex()
    private val state = MutableStateFlow(SyncState(lastSync = mirror.db.mirrorQueries.stateValue(LAST_SYNC).executeAsOneOrNull()?.toLongOrNull()))
    val sync: StateFlow<SyncState> = state.asStateFlow()
    val pagesDir = File(dir, "outbox/pages").apply { mkdirs() }
    val thumbsDir = File(dir, "cache/thumbs").apply { mkdirs() }

    init {
        // A scan the app was killed during (or cancelled with "Keep them"): its pages still upload.
        pageJobs().filter { !sessionQueued(it.batchId) }.map { it.batchId }.distinct().forEach(::finishSession)
        refresh()
    }

    @Volatile private var closing = false
    @Volatile private var closed = false
    val isClosing get() = closing
    @Volatile private var syncJob: Job? = null

    /** Stop the running sync before disposing either database. No later worker may restart it. */
    suspend fun close() {
        closing = true
        syncJob?.takeIf { it != currentCoroutineContext()[Job] }?.cancelAndJoin()
        lock.withLock {
            if (!closed) {
                closed = true
                mirrorDriver.close()
                outboxDriver.close()
            }
        }
    }

    fun setOnline(online: Boolean) = state.update { it.copy(online = online) }

    fun refresh() {
        if (closed) return
        val s = engine.summary()
        val jobs = pageJobs()
        state.update {
            it.copy(waiting = s.waiting, conflicts = s.conflicts, refused = s.refused, pages = jobs.count { j -> !j.uploaded }, failedPages = jobs.count { j -> j.gaveUp }, version = it.version + 1)
        }
    }

    // ---------------------------------------------------------------------------------------
    // Sync: upload held pages, then push and pull (07 B-OFFLINE: blobs first, then the outbox)
    // ---------------------------------------------------------------------------------------

    /** One sync run. Returns true when work is left that a retry could finish (no signal, server down). */
    suspend fun syncNow(): Boolean = lock.withLock {
        if (closing) return@withLock false
        syncJob = currentCoroutineContext()[Job]
        state.update { it.copy(syncing = true) }
        var retry = false
        try {
            retry = uploadPages()
            var r = engine.sync()
            // A squawk photo needs its squawk on the server, so files go after the first push; their rows after them.
            if (!r.offline) uploadRecordFiles().let { (sent, left) -> retry = retry || left; if (sent) r = engine.sync() }
            retry = retry || r.offline
            if (!r.offline) {
                val t = now()
                mirror.db.mirrorQueries.setState(LAST_SYNC, t.toString())
                state.update { it.copy(lastSync = t, failed = false) }
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: SyncHttpException) {
            state.update { it.copy(failed = true) }
            retry = e.status >= 500
        } catch (_: Exception) {
            retry = true // no connection
        } finally {
            state.update { it.copy(syncing = false, uploading = null) }
            refresh()
        }
        retry
    }

    /** Uploads every held page; true when some are left for a retry. Stops at the first network failure. */
    private suspend fun uploadPages(): Boolean {
        val jobs = pageJobs().filter { it.uploaded || it.attempts < MAX_TRIES }
        // (done, total) over the pages this run sends, so "Uploading 3 of 5" counts only those.
        val total = jobs.count { !it.uploaded }
        var done = 0
        jobs.forEach { j ->
            if (!j.uploaded) {
                state.update { it.copy(uploading = done to total) }
                try {
                    uploadOne(j)
                    q.setFileStatus(HELD, 1.0, null, 0, j.id)
                    done++
                } catch (e: CancellationException) {
                    throw e
                } catch (e: UploadHttpException) {
                    q.setFileStatus(HELD, 0.0, e.message, if (e.permanent) MAX_TRIES else 1, j.id)
                    refresh()
                    return@forEach
                } catch (_: Exception) {
                    return true
                }
            }
            register(j.id)
        }
        return pageJobs().any { !it.uploaded && it.attempts < MAX_TRIES }
    }

    private suspend fun uploadOne(j: PageJob) {
        // The 400px thumbnail first, so register finds it; best effort (the server makes do without).
        val thumb = File(thumbsDir, "${j.pageId}.jpg")
        if (thumb.exists()) {
            try {
                uploads.target(j.aircraftId, "page_thumb", j.pageId, j.logbookId, thumb.length())?.let { uploads.put(it, thumb.readBytes()) }
            } catch (e: UploadHttpException) {
                // A thumbnail refusal never holds the page.
            }
        }
        uploads.target(j.aircraftId, "page", j.pageId, j.logbookId, j.bytes)?.let { uploads.put(it, j.file.readBytes()) }
    }

    /** In storage and its scan is queued: queue `page.register` and let the file go, in one transaction. */
    private fun register(jobId: String) {
        val j = pageJobs().firstOrNull { it.id == jobId }?.takeIf { it.uploaded && sessionQueued(it.batchId) } ?: return
        outbox.transaction {
            if (q.byId(j.pageId).executeAsOneOrNull() == null) {
                val payload = buildJsonObject {
                    put("id", j.pageId); put("logbookId", j.logbookId); put("storagePath", "${j.aircraftId}/${j.logbookId}/${j.pageId}.jpg")
                    put("capturedAt", j.capturedAt); put("isHandwritten", j.handwritten); put("batchId", j.batchId); j.phash?.let { put("phash", it) }
                }
                // Waits behind its batch.create while that is still on this phone.
                val dep = j.batchId.takeIf { q.byId(it).executeAsOneOrNull() != null }
                engine.enqueue(Mutation(j.pageId, "page.register", j.aircraftId, payload), "${j.book} page", RowRef("page", j.pageId), dependsOn = dep)
            }
            q.removeFile(j.id)
        }
        j.file.delete()
    }

    // ---------------------------------------------------------------------------------------
    // Capture (05 §15): each page on disk before the next is accepted
    // ---------------------------------------------------------------------------------------

    fun newBatchId(): String = UUID.randomUUID().toString()

    /** Writes the page and its thumbnail and records the file job. Returns (file job id, page id). */
    fun addPage(t: ScanTarget, batchId: String, jpeg: ByteArray, thumb: ByteArray?, phash: String?): Pair<String, String> {
        val jobId = UUID.randomUUID().toString()
        val pageId = UUID.randomUUID().toString()
        val file = File(pagesDir, "$jobId.jpg")
        writeAtomically(file, jpeg)
        thumb?.let { writeAtomically(File(thumbsDir, "$pageId.jpg"), it) }
        val meta = buildJsonObject {
            put("pageId", pageId); put("logbookId", t.logbookId); put("batchId", batchId); put("book", t.book); put("tail", t.tail)
            put("capturedAt", java.time.Instant.ofEpochMilli(now()).toString()); put("isHandwritten", t.handwritten); phash?.let { put("phash", it) }
        }
        q.addFile(jobId, "page", t.aircraftId, file.path, jpeg.size.toLong(), null, meta.toString(), now())
        refresh()
        return jobId to pageId
    }

    /** Done (or a recovered scan): queue `batch.create` for the pages this scan holds. */
    fun finishSession(batchId: String) {
        val jobs = pageJobs().filter { it.batchId == batchId }
        val first = jobs.firstOrNull() ?: return
        if (!sessionQueued(batchId)) {
            val payload = buildJsonObject {
                put("id", batchId); put("logbookId", first.logbookId); put("source", "phone_camera"); put("expectedPages", jobs.size); put("isHandwritten", first.handwritten)
            }
            engine.enqueue(Mutation(batchId, "batch.create", first.aircraftId, payload), "${first.book} scan, ${jobs.size} ${if (jobs.size == 1) "page" else "pages"}", RowRef("scan_batch", batchId))
        }
        jobs.filter { it.uploaded }.forEach { register(it.id) }
        refresh()
    }

    private fun sessionQueued(batchId: String) = q.byId(batchId).executeAsOneOrNull() != null || mirror.raw("scan_batch", batchId) != null

    fun discardPage(jobId: String) {
        val j = pageJobs().firstOrNull { it.id == jobId } ?: return
        q.removeFile(jobId)
        j.file.delete()
        File(thumbsDir, "${j.pageId}.jpg").delete()
        refresh()
    }

    /** "Try again" after the page gave up (B-UPLOAD). */
    fun retryPage(jobId: String) {
        val j = pageJobs().firstOrNull { it.id == jobId } ?: return
        q.setFileStatus(HELD, 0.0, null, -j.attempts, jobId)
        refresh()
    }

    fun pageJobs(): List<PageJob> = if (closed) emptyList() else q.filesToUpload().executeAsList().filter { it.kind == "page" }.map { f ->
        val m = Json.parseToJsonElement(f.meta).jsonObject
        fun s(k: String) = m[k]?.jsonPrimitive?.contentOrNull
        PageJob(
            f.id, s("pageId")!!, f.aircraft_id, s("logbookId")!!, s("batchId")!!, s("book") ?: "Logbook", s("tail"), File(f.local_path), f.bytes,
            uploaded = f.progress >= 1.0, attempts = f.attempts, error = f.error, capturedAt = s("capturedAt") ?: "",
            handwritten = m["isHandwritten"]?.jsonPrimitive?.booleanOrNull != false, phash = s("phash"),
        )
    }

    fun thumb(pageId: String) = File(thumbsDir, "$pageId.jpg").takeIf { it.exists() }

    // ---------------------------------------------------------------------------------------
    // Changes (05 §6.4) and conflicts (§6.6)
    // ---------------------------------------------------------------------------------------

    /** Queue a change; the base row for a later three-way diff comes from the mirror. */
    fun enqueue(m: Mutation, label: String, target: RowRef? = null, dependsOn: String? = null) {
        engine.enqueue(m, label, target, target?.let { mirror.raw(it.table, it.id) }, dependsOn)
        refresh()
    }

    // ---------------------------------------------------------------------------------------
    // Squawk photos and documents (05 §7.2 file jobs of kind squawk_photo and document)
    // ---------------------------------------------------------------------------------------

    /** Keeps [bytes] in [file] and records the job; [meta] carries what the upload needs. Returns the job id. */
    fun addFile(kind: String, aircraftId: String, file: File, bytes: ByteArray, meta: JsonObject): String {
        val jobId = UUID.randomUUID().toString()
        file.parentFile?.mkdirs()
        writeAtomically(file, bytes)
        q.addFile(jobId, kind, aircraftId, file.path, bytes.size.toLong(), null, meta.toString(), now())
        refresh()
        return jobId
    }

    fun recordFiles() = q.filesToUpload().executeAsList().filter { it.kind == SQUAWK_PHOTO || it.kind == DOCUMENT }

    /** Uploads held squawk photos (once their squawk is on the server) and documents. (any sent, any left for later) */
    private suspend fun uploadRecordFiles(): Pair<Boolean, Boolean> {
        val api = records ?: return false to false
        var sent = false
        for (f in recordFiles()) {
            if (f.attempts >= MAX_TRIES) continue
            val meta = Json.parseToJsonElement(f.meta).jsonObject
            fun s(k: String) = meta[k]?.jsonPrimitive?.contentOrNull
            try {
                val bytes = File(f.local_path).readBytes()
                if (f.kind == SQUAWK_PHOTO) {
                    val squawkId = s("squawkId") ?: continue
                    if (q.byId(squawkId).executeAsOneOrNull() != null) continue // its squawk.create hasn't landed yet
                    api.squawkPhoto(f.aircraft_id, squawkId, s("photoId")!!, bytes)
                } else {
                    val row = api.document(f.aircraft_id, JsonObject(meta + ("uploadId" to kotlinx.serialization.json.JsonPrimitive(f.id))), bytes)
                    mirror.upsertRow("document", row)
                    // The phone's copy becomes the offline copy under the server's id (documents are never purged).
                    row["id"]?.jsonPrimitive?.contentOrNull?.let { id -> File(f.local_path).renameTo(docFile(id, s("fileName"))) }
                }
                q.removeFile(f.id)
                sent = true
            } catch (e: CancellationException) {
                throw e
            } catch (e: UploadHttpException) {
                q.setFileStatus(HELD, 0.0, e.message, if (e.permanent) MAX_TRIES else 1, f.id)
            } catch (_: Exception) {
                return sent to true
            }
        }
        refresh()
        return sent to recordFiles().any { it.attempts < MAX_TRIES }
    }

    val docsDir get() = File(dir, "docs").apply { mkdirs() }

    /** Where a document's offline copy lives, by its server id and the file's extension. */
    fun docFile(id: String, fileName: String?): File = File(docsDir, id + "." + (fileName?.substringAfterLast('.', "bin")?.lowercase()?.filter { it.isLetterOrDigit() }?.take(8)?.ifBlank { "bin" } ?: "bin"))

    /** Rows of a table the mirror keeps as raw JSON (05 §6.2 unknown_record), for one aircraft. */
    fun unknownRows(table: String, aircraftId: String?): List<JsonObject> =
        mirrorDriver.executeQuery(null, "SELECT raw FROM unknown_record WHERE table_name = ?", { c ->
            val out = mutableListOf<JsonObject>()
            while (c.next().value) out += Json.parseToJsonElement(c.getString(0)!!).jsonObject
            QueryResult.Value(out)
        }, 1) { bindString(0, table) }.value.filter { aircraftId == null || it["aircraft_id"]?.jsonPrimitive?.contentOrNull == aircraftId }

    /** Discard a change that hasn't reached the server (asks first, M-SYS-01). Never one being sent. */
    fun discard(mutationId: String) {
        val m = q.byId(mutationId).executeAsOneOrNull() ?: return
        if (m.status == SyncEngine.SENDING) return
        q.remove(mutationId)
        q.log(now(), "discarded", "Discarded: ${m.label}", mutationId)
        refresh()
    }

    suspend fun resolve(mutationId: String, choice: Resolution) {
        lock.withLock { engine.resolve(mutationId, choice) }
        refresh()
    }

    fun queued() = q.all().executeAsList()

    fun activity(limit: Long = 200) = q.recentActivity(limit).executeAsList()

    // ---------------------------------------------------------------------------------------
    // Reads from the mirror
    // ---------------------------------------------------------------------------------------

    /** Raw server rows of [table] matching [where] (a parameterised SQL condition). */
    fun rows(table: String, where: String, vararg args: String): List<JsonObject> =
        mirrorDriver.executeQuery(null, "SELECT _raw FROM $table WHERE $where", { c ->
            val out = mutableListOf<JsonObject>()
            while (c.next().value) out += Json.parseToJsonElement(c.getString(0)!!).jsonObject
            QueryResult.Value(out)
        }, args.size) { args.forEachIndexed { i, a -> bindString(i, a) } }.value

    /** (page number, latest entry year on it) for a logbook, for "after page 203". */
    fun pageYears(logbookId: String): List<Pair<Int, Int>> =
        mirrorDriver.executeQuery(null, "SELECT p.page_sequence, max(substr(e.entry_date, 1, 4)) FROM page p JOIN log_entry e ON e.page_id = p.id WHERE p.logbook_id = ? AND p.page_sequence IS NOT NULL AND e.entry_date IS NOT NULL GROUP BY p.id", { c ->
            val out = mutableListOf<Pair<Int, Int>>()
            while (c.next().value) { val y = c.getString(1)?.toIntOrNull(); if (y != null) out += c.getLong(0)!!.toInt() to y }
            QueryResult.Value(out)
        }, 1) { bindString(0, logbookId) }.value

    fun gapYears(logbookId: String): List<IntRange> = rows("logbook_gap", "logbook_id = ?", logbookId).mapNotNull { g ->
        val from = g["from_date"]?.jsonPrimitive?.contentOrNull?.take(4)?.toIntOrNull()
        val to = g["to_date"]?.jsonPrimitive?.contentOrNull?.take(4)?.toIntOrNull()
        if (from != null && to != null && g["status"]?.jsonPrimitive?.contentOrNull != "resolved") from..to else null
    }

    fun pageCount(logbookId: String): Long =
        mirrorDriver.executeQuery(null, "SELECT count(*) FROM page WHERE logbook_id = ?", { c -> c.next(); QueryResult.Value(c.getLong(0) ?: 0) }, 1) { bindString(0, logbookId) }.value

    /** Tach readings queued on this phone for [aircraftId], newest last: the "On this phone" values (09 §3.12). */
    fun localTach(aircraftId: String): Double? = queued()
        .filter { it.aircraft_id == aircraftId && it.type == "reading.create" }
        .mapNotNull { Json.parseToJsonElement(it.payload).jsonObject["tach"]?.jsonPrimitive?.contentOrNull?.toDoubleOrNull() }
        .maxOrNull()

    companion object {
        const val MAX_TRIES = 5L
        private const val HELD = "held"
        const val SQUAWK_PHOTO = "squawk_photo"
        const val DOCUMENT = "document"
        private const val LAST_SYNC = "last_sync"

        fun writeAtomically(f: File, bytes: ByteArray) {
            val tmp = File(f.parentFile, f.name + ".tmp")
            java.io.FileOutputStream(tmp).use { it.write(bytes); it.fd.sync() }
            check(tmp.renameTo(f)) { "Could not save ${f.name}" }
        }
    }
}
