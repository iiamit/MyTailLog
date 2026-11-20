package com.mytaillog.app

import io.ktor.client.HttpClient
import io.ktor.client.request.bearerAuth
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.content.ByteArrayContent
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/** The server's refusal of an upload, with its words (07 B-UPLOAD: "Not uploaded: <reason>"). */
class UploadHttpException(val status: Int, message: String) : Exception(message) {
    /** 4xx other than timeouts and rate limits: retrying the same file won't help. */
    val permanent get() = status in 400..499 && status != 408 && status != 429
}

const val UPLOAD_RETRY = "Couldn't prepare the upload. It will try again."
const val STORAGE_REFUSED = "Not uploaded yet. It will try again."

/**
 * The upload log's words for a refused upload (07 B-UPLOAD), from the status alone: the server's text can carry a
 * backend's raw error, so it is never shown.
 */
fun uploadRefusal(status: Int): String = when (status) {
    401 -> "Not uploaded: sign in again."
    403 -> "Not uploaded: you can't add pages to this aircraft."
    404 -> "Not uploaded: that logbook is no longer on this aircraft."
    413 -> "Too large to upload. Retake at a lower size or upload from a computer."
    in 400..499 -> if (status == 408 || status == 429) UPLOAD_RETRY else "Not uploaded: the server refused this page."
    else -> UPLOAD_RETRY
}

/** Where to PUT one file (05 §7.2). */
data class UploadTarget(val url: String, val headers: Map<String, String>, val storagePath: String)

/** The upload half of 05 §7.2, behind an interface so the store's tests run without a server. */
interface PageUploads {
    /** A signed URL for a page or its thumbnail, or null when the object is already in storage (a retry). */
    suspend fun target(aircraftId: String, kind: String, pageId: String, logbookId: String, bytes: Long): UploadTarget?
    suspend fun put(target: UploadTarget, bytes: ByteArray)
}

/** One scanning session as the reading queue reports it (09 §4.8). */
data class BatchProgress(
    val id: String,
    val logbook: String?,
    val expected: Int,
    val uploaded: Int,
    val queued: Int,
    val reading: Int,
    val waitingAllowance: Int,
    val read: Int,
    val failed: Int,
    val needsLook: Int,
    val waitingDecision: Int,
)

/** The caller's AI reading allowance over the last 24 hours (07 B-ALLOWANCE). */
data class Allowance(val pagesUsed: Int, val pagesCap: Int, val ownKey: Boolean, val paused: Boolean)

data class ReadingQueue(val batches: List<BatchProgress>, val allowance: Allowance?)

/**
 * Phone-only routes of phase 3: POST /api/aircraft/{id}/uploads, the signed PUT, and
 * GET /api/aircraft/{id}/reading-queue. shortcut: lives in the app, not :core:api, while the iOS
 * client is built in parallel; move it to the core when both platforms use the same shape.
 */
class CaptureApi(
    private val http: HttpClient,
    private val baseUrl: String,
    private val accessToken: suspend () -> String,
) : PageUploads {
    private val root get() = baseUrl.trimEnd('/')

    override suspend fun target(aircraftId: String, kind: String, pageId: String, logbookId: String, bytes: Long): UploadTarget? {
        val body = buildJsonObject {
            put("kind", kind); put("pageId", pageId); put("logbookId", logbookId); put("bytes", bytes); put("contentType", "image/jpeg")
        }
        val o = http.post("$root/api/aircraft/$aircraftId/uploads") {
            bearerAuth(accessToken())
            contentType(ContentType.Application.Json)
            setBody(body.toString())
        }.json()
        val path = o["storagePath"]?.jsonPrimitive?.contentOrNull ?: error("No storage path")
        if (o["alreadyUploaded"]?.jsonPrimitive?.booleanOrNull == true) return null
        val headers = o["headers"]?.jsonObject?.mapValues { it.value.jsonPrimitive.content }.orEmpty()
        return UploadTarget(o["uploadUrl"]!!.jsonPrimitive.content, headers, path)
    }

    override suspend fun put(target: UploadTarget, bytes: ByteArray) {
        val type = target.headers.entries.firstOrNull { it.key.equals("content-type", true) }?.value ?: "image/jpeg"
        val r = http.put(target.url) {
            target.headers.forEach { (k, v) -> if (!k.equals("content-type", true)) header(k, v) }
            setBody(ByteArrayContent(bytes, ContentType.parse(type)))
        }
        // GCS's if-generation-match refuses a second write of the same object: it is already there.
        // Storage's own answer (XML, links) is never shown: house copy only.
        if (!r.status.isSuccess() && r.status.value != 412) throw UploadHttpException(r.status.value, STORAGE_REFUSED)
    }

    suspend fun readingQueue(aircraftId: String): ReadingQueue {
        val o = http.get("$root/api/aircraft/$aircraftId/reading-queue") { bearerAuth(accessToken()) }.json()
        return parseReadingQueue(o)
    }

    private suspend fun HttpResponse.json(): JsonObject {
        val text = bodyAsText()
        val o = runCatching { Json.parseToJsonElement(text).jsonObject }.getOrNull()
        if (!status.isSuccess()) throw UploadHttpException(status.value, uploadRefusal(status.value))
        return o ?: error("Not JSON")
    }
}

fun parseReadingQueue(o: JsonObject): ReadingQueue {
    fun JsonObject.int(k: String) = this[k]?.jsonPrimitive?.intOrNull ?: 0
    val batches = o["batches"]?.jsonArray.orEmpty().map { e ->
        val b = e.jsonObject
        BatchProgress(
            b["id"]!!.jsonPrimitive.content, b["logbook"]?.jsonPrimitive?.contentOrNull, b.int("expected"), b.int("uploaded"),
            b.int("queued"), b.int("reading"), b.int("waitingAllowance"), b.int("read"), b.int("failed"), b.int("needsLook"), b.int("waitingDecision"),
        )
    }
    val a = o["allowance"] as? JsonObject
    val allowance = a?.let {
        Allowance(it.int("pagesUsedApprox"), it.int("pagesCapApprox"), it["ownKey"]?.jsonPrimitive?.booleanOrNull == true, it["globalPaused"]?.jsonPrimitive?.booleanOrNull == true)
    }
    return ReadingQueue(batches, allowance)
}

/** The same counts from this phone's copy of the pages (09 §4.8 batchProgress), for the queue offline. */
fun batchProgress(id: String, logbook: String?, expected: Int, pages: List<Triple<String?, Boolean, Boolean>>): BatchProgress {
    fun n(vararg s: String) = pages.count { it.first in s }
    return BatchProgress(
        id, logbook, expected, pages.size, n("queued", "pending"), n("processing"), n("waiting_allowance"), n("extracted"), n("failed"),
        pages.count { it.first == "extracted" && it.second },
        pages.count { it.third && it.first in setOf("queued", "pending") },
    )
}
