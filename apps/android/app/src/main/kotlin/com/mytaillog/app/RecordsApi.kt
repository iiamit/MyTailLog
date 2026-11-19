package com.mytaillog.app

import io.ktor.client.HttpClient
import io.ktor.client.request.bearerAuth
import io.ktor.client.request.forms.formData
import io.ktor.client.request.forms.submitFormWithBinaryData
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.client.statement.readRawBytes
import io.ktor.http.ContentType
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.http.encodeURLParameter
import io.ktor.http.isSuccess
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.util.Base64

/** The file half of squawks and documents, behind an interface so the store's tests run without a server. */
interface RecordUploads {
    /** POST …/blob kind squawk_photo; the squawk must already be on the server. */
    suspend fun squawkPhoto(aircraftId: String, squawkId: String, photoId: String, jpeg: ByteArray)

    /** POST …/documents (JSON, base64): the upload is the create. Returns the new `document` row. */
    suspend fun document(aircraftId: String, meta: JsonObject, bytes: ByteArray): JsonObject
}

/** One AD from the Federal Register (W-MAINT-02's source; the phone queries it directly, as the browser does). */
data class FoundAd(val adNumber: String?, val title: String, val abstract: String?, val effectiveOn: String?, val htmlUrl: String)

/** A written-versus-calculated time check (09 §3.10). */
data class TimeCheck(
    val component: String,
    val entryId: String,
    val pageLabel: String?,
    val written: Double,
    val calculated: Double,
    val apart: Boolean,
    val difference: Double,
    val digitSwap: Boolean,
    val dismissed: Boolean,
)

/** A mechanic link just made (09 §4.12). */
data class MechanicLink(val url: String, val expiresAt: String?)

/**
 * Phase 4's phone routes: squawk photos, documents, mechanic links, time checks, aircraft details and
 * the FAA search. shortcut: lives in the app, not :core:api, like [CaptureApi]; move both when iOS shares them.
 */
class RecordsApi(
    private val http: HttpClient,
    private val baseUrl: String,
    private val supabaseUrl: String,
    private val supabaseKey: String,
    private val accessToken: suspend () -> String,
) : RecordUploads {
    private val root get() = baseUrl.trimEnd('/')

    override suspend fun squawkPhoto(aircraftId: String, squawkId: String, photoId: String, jpeg: ByteArray) {
        http.submitFormWithBinaryData(
            "$root/api/aircraft/$aircraftId/blob",
            formData {
                append("kind", "squawk_photo"); append("squawkId", squawkId); append("id", photoId)
                append("file", jpeg, Headers.build { append(HttpHeaders.ContentType, "image/jpeg"); append(HttpHeaders.ContentDisposition, "filename=\"$photoId.jpg\"") })
            },
        ) { bearerAuth(accessToken()) }.json()
    }

    override suspend fun document(aircraftId: String, meta: JsonObject, bytes: ByteArray): JsonObject {
        val body = buildJsonObject {
            meta.forEach { (k, v) -> put(k, v) }
            put("file", Base64.getEncoder().encodeToString(bytes))
        }
        val o = http.post("$root/api/aircraft/$aircraftId/documents") {
            bearerAuth(accessToken()); contentType(ContentType.Application.Json); setBody(body.toString())
        }.json()
        return o["document"]?.jsonObject ?: error("No document came back")
    }

    /** The stored file (GET /api/document/{id}, RLS-checked). */
    suspend fun documentFile(id: String): ByteArray {
        val r = http.get("$root/api/document/$id") { bearerAuth(accessToken()) }
        if (!r.status.isSuccess()) throw UploadHttpException(r.status.value, "This file couldn't be downloaded (${r.status.value}).")
        return r.readRawBytes()
    }

    suspend fun mechanicLink(aircraftId: String, squawkId: String, recipient: String, days: Int, photos: Boolean): MechanicLink {
        val body = buildJsonObject {
            put("kind", "squawk"); put("squawkIds", JsonArray(listOf(kotlinx.serialization.json.JsonPrimitive(squawkId))))
            put("recipientLabel", recipient); put("expiresInDays", days); put("includePhotos", photos); put("includeReporter", false)
        }
        val o = http.post("$root/api/aircraft/$aircraftId/mechanic-links") {
            bearerAuth(accessToken()); contentType(ContentType.Application.Json); setBody(body.toString())
        }.json()
        return MechanicLink(o["url"]!!.jsonPrimitive.content, o["expiresAt"]?.jsonPrimitive?.contentOrNull)
    }

    suspend fun timeChecks(aircraftId: String): List<TimeCheck> {
        val r = http.get("$root/api/aircraft/$aircraftId/time-checks") { bearerAuth(accessToken()) }
        if (!r.status.isSuccess()) throw UploadHttpException(r.status.value, "Time checks failed (${r.status.value}).")
        return parseTimeChecks(Json.parseToJsonElement(r.bodyAsText()))
    }

    /** Aircraft details through PostgREST; the owner-only RLS policy is the guard (W-AIRCRAFT-05, online only). */
    suspend fun saveDetails(aircraftId: String, fields: JsonObject) {
        val r = http.patch("${supabaseUrl.trimEnd('/')}/rest/v1/aircraft?id=eq.$aircraftId") {
            header("apikey", supabaseKey); bearerAuth(accessToken()); header("Prefer", "return=representation")
            contentType(ContentType.Application.Json); setBody(fields.toString())
        }
        val text = r.bodyAsText()
        if (!r.status.isSuccess()) throw UploadHttpException(r.status.value, "Not saved (${r.status.value}).")
        if (runCatching { Json.parseToJsonElement(text).jsonArray.isEmpty() }.getOrDefault(false)) throw UploadHttpException(403, "Only the aircraft owner can edit these details.")
    }

    /** The Federal Register's FAA final rules under 14 CFR 39 matching [term] (lib/faa/federalRegister.ts). */
    suspend fun findAds(term: String): List<FoundAd> {
        val q = listOf(
            "conditions[agencies][]" to "federal-aviation-administration", "conditions[type][]" to "RULE",
            "conditions[cfr][title]" to "14", "conditions[cfr][part]" to "39", "conditions[term]" to term,
            "order" to "newest", "per_page" to "40",
        ) + listOf("title", "effective_on", "html_url", "abstract", "docket_ids").map { "fields[]" to it }
        val url = "https://www.federalregister.gov/api/v1/documents.json?" + q.joinToString("&") { (k, v) -> "${k.encodeURLParameter()}=${v.encodeURLParameter()}" }
        val r = http.get(url) { header(HttpHeaders.Accept, "application/json") }
        if (!r.status.isSuccess()) throw UploadHttpException(r.status.value, "The FAA list didn't answer (${r.status.value}).")
        return parseFoundAds(Json.parseToJsonElement(r.bodyAsText()).jsonObject)
    }

    /** "Find completions in the logbooks" (POST …/maintenance/scan, online only, uses the AI allowance). */
    suspend fun scanCompletions(aircraftId: String) { http.post("$root/api/aircraft/$aircraftId/maintenance/scan") { bearerAuth(accessToken()) }.json() }

    /** "Find equipment in the logbooks" (POST …/equipment/scan): proposals land in equipment_proposal. Returns how many. */
    suspend fun scanEquipment(aircraftId: String): Int =
        http.post("$root/api/aircraft/$aircraftId/equipment/scan") { bearerAuth(accessToken()) }.json()["proposed"]?.jsonPrimitive?.contentOrNull?.toIntOrNull() ?: 0

    private suspend fun HttpResponse.json(): JsonObject {
        val text = bodyAsText()
        val o = runCatching { Json.parseToJsonElement(text).jsonObject }.getOrNull()
        if (!status.isSuccess()) throw UploadHttpException(status.value, o?.get("error")?.jsonPrimitive?.contentOrNull ?: "The server refused it (${status.value}).")
        return o ?: error("Not JSON")
    }
}

fun parseFoundAds(o: JsonObject): List<FoundAd> = o["results"]?.jsonArray.orEmpty().map { e ->
    val r = e.jsonObject
    fun s(k: String) = r[k]?.jsonPrimitive?.contentOrNull
    val number = r["docket_ids"]?.jsonArray.orEmpty().firstNotNullOfOrNull { d -> Regex("^AD\\s+(.+)$", RegexOption.IGNORE_CASE).find(d.jsonPrimitive.content.trim())?.groupValues?.get(1)?.trim() }
    FoundAd(number, s("title") ?: "", s("abstract"), s("effective_on"), s("html_url") ?: "")
}

fun parseTimeChecks(e: JsonElement): List<TimeCheck> = (e as? JsonArray).orEmpty().mapNotNull { x ->
    val o = x as? JsonObject ?: return@mapNotNull null
    fun d(k: String) = o[k]?.jsonPrimitive?.contentOrNull?.toDoubleOrNull()
    val page = o["pageRef"] as? JsonObject
    TimeCheck(
        o["component"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null,
        o["entryId"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null,
        page?.get("label")?.jsonPrimitive?.contentOrNull,
        d("written") ?: return@mapNotNull null, d("calculated") ?: return@mapNotNull null,
        o["result"]?.jsonPrimitive?.contentOrNull == "apart", d("difference") ?: 0.0,
        o["digitSwap"]?.jsonPrimitive?.contentOrNull == "true", o["dismissed"]?.jsonPrimitive?.contentOrNull == "true",
    )
}
