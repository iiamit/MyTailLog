package com.mytaillog.core.api

import com.mytaillog.core.domain.Mutation
import com.mytaillog.core.domain.map.MapModel
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.bearerAuth
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.client.statement.readRawBytes
import io.ktor.http.isSuccess
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

// What Logbooks reads while there is no local mirror (phase 3): the server's MapModel, and the
// rows behind it through PostgREST under RLS (09 §4.6, §4.7). Writes go through POST /api/sync/push.

@Serializable data class FieldBox(val x: Double, val y: Double, val w: Double, val h: Double)

@Serializable data class EntryRow(
    val id: String,
    @SerialName("page_id") val pageId: String? = null,
    @SerialName("logbook_id") val logbookId: String,
    @SerialName("entry_date") val entryDate: String? = null,
    val tach: Double? = null,
    val hobbs: Double? = null,
    val airframe: Double? = null,
    val description: String? = null,
    @SerialName("work_performed") val workPerformed: String? = null,
    val parts: String? = null,
    @SerialName("signature_name") val signatureName: String? = null,
    @SerialName("mechanic_cert_number") val mechanicCertNumber: String? = null,
    @SerialName("ad_refs") val adRefs: List<String> = emptyList(),
    val confidence: Double? = null,
    @SerialName("field_confidence") val fieldConfidence: Map<String, Double?>? = null,
    @SerialName("field_boxes") val fieldBoxes: Map<String, FieldBox?>? = null,
    val trust: String,
    @SerialName("is_continuation") val isContinuation: Boolean = false,
    @SerialName("entry_index") val entryIndex: Int? = null,
    @SerialName("entry_kind") val entryKind: String? = null,
    @SerialName("authored_signed_at") val authoredSignedAt: String? = null,
    @SerialName("updated_at") val updatedAt: String,
)

@Serializable data class PageRow(
    val id: String,
    @SerialName("logbook_id") val logbookId: String,
    @SerialName("page_sequence") val pageSequence: Int? = null,
    @SerialName("review_status") val reviewStatus: String = "unreviewed",
    @SerialName("extraction_status") val extractionStatus: String? = null,
    @SerialName("ocr_text") val ocrText: String? = null,
    @SerialName("unread_rotated_content") val unreadRotated: Boolean = false,
    @SerialName("needs_look") val needsLook: Boolean? = null,
    @SerialName("updated_at") val updatedAt: String,
)

@Serializable data class LogbookRow(val id: String, val type: String, val title: String? = null)

@Serializable data class GapRow(val id: String, val status: String, val note: String? = null, @SerialName("updated_at") val updatedAt: String)

@Serializable data class PageRef(val pageId: String, val label: String, val entryId: String? = null)
@Serializable data class OtherBook(
    val logbook: String, val entries: Int, val annuals: Int = 0, val tachFrom: Double? = null, val tachTo: Double? = null,
    val pageRange: String? = null,
)
@Serializable data class Neighbours(val before: PageRef? = null, val after: PageRef? = null)
/** GET /api/aircraft/{id}/gaps/{gapId}/evidence (09 §3.8): computed from confirmed entries only. */
@Serializable data class GapEvidence(
    val otherBooks: List<OtherBook>,
    val hoursFlownApprox: Double? = null,
    val unconfirmedPagesInGap: Int = 0,
    val verdict: String,
    val neighbourPages: Neighbours = Neighbours(),
)

/** One aircraft's logbooks: the map and the rows the sheets, pages and review read. */
data class Books(
    val map: MapModel,
    val entries: List<EntryRow>,
    val pages: List<PageRow>,
    val logbooks: List<LogbookRow>,
    val gaps: List<GapRow>,
)

private const val ENTRY_COLUMNS = "id,page_id,logbook_id,entry_date,tach,hobbs,airframe,description,work_performed,parts," +
    "signature_name,mechanic_cert_number,ad_refs,confidence,field_confidence,field_boxes,trust,is_continuation,entry_index," +
    "entry_kind,authored_signed_at,updated_at"

internal const val REST_PAGE = 1000

class BooksApi(
    private val http: HttpClient,
    private val apiBaseUrl: String,
    private val supabaseUrl: String,
    private val supabaseKey: String,
    private val accessToken: suspend () -> String,
) {
    suspend fun load(aircraftId: String): Books = coroutineScope {
        val map = async { parseMap(api("/api/aircraft/$aircraftId/map").bodyAsText()) }
        val entries = async { rest<EntryRow>("log_entry", aircraftId, ENTRY_COLUMNS, "entry_date.desc.nullslast,entry_index") }
        val pages = async { rest<PageRow>("page", aircraftId, "id,logbook_id,page_sequence,review_status,extraction_status,ocr_text,unread_rotated_content,needs_look,updated_at", "page_sequence") }
        val books = async { rest<LogbookRow>("logbook", aircraftId, "id,type,title", "type") }
        val gaps = async { rest<GapRow>("logbook_gap", aircraftId, "id,status,note,updated_at", "from_date") }
        Books(map.await(), entries.await(), pages.await(), books.await(), gaps.await())
    }

    suspend fun evidence(aircraftId: String, gapId: String): GapEvidence =
        wireJson.decodeFromString(GapEvidence.serializer(), api("/api/aircraft/$aircraftId/gaps/$gapId/evidence").bodyAsText())

    /** The scan or its thumbnail, served through the app under RLS (apps/web /api/page/{id}/image). */
    suspend fun pageImage(pageId: String, thumb: Boolean): ByteArray =
        http.get("${apiBaseUrl.trimEnd('/')}/api/page/$pageId/image") {
            bearerAuth(accessToken())
            if (thumb) parameter("thumb", 1)
        }.orThrow().readRawBytes()

    private suspend fun api(path: String): HttpResponse =
        http.get("${apiBaseUrl.trimEnd('/')}$path") { bearerAuth(accessToken()) }.orThrow()

    /** Every row, a page at a time: PostgREST answers at most [REST_PAGE] rows a request (Supabase's max-rows). */
    private suspend inline fun <reified T> rest(table: String, aircraftId: String, select: String, order: String): List<T> {
        val all = mutableListOf<T>()
        while (true) {
            val page: List<T> = http.get("${supabaseUrl.trimEnd('/')}/rest/v1/$table") {
                header("apikey", supabaseKey)
                bearerAuth(accessToken())
                parameter("aircraft_id", "eq.$aircraftId")
                parameter("select", select)
                parameter("order", "$order,id") // id breaks ties so offsets never skip or repeat a row
                parameter("limit", REST_PAGE)
                parameter("offset", all.size)
            }.orThrow().body()
            all += page
            if (page.size < REST_PAGE) return all
        }
    }

    private suspend fun HttpResponse.orThrow(): HttpResponse =
        if (status.isSuccess()) this else throw ApiHttpException(status.value, bodyAsText())
}

fun parseMap(json: String): MapModel = wireJson.decodeFromString(MapModel.serializer(), json)

/**
 * The Logbooks writes (09 §5.3), as push mutations. `base` is the row's updated_at so a change made
 * elsewhere since this phone read the row comes back as a conflict instead of being overwritten.
 */
@OptIn(ExperimentalUuidApi::class)
object BookWrites {
    private fun m(type: String, aircraftId: String, base: String?, payload: JsonObject) =
        Mutation(Uuid.random().toString(), type, aircraftId, payload, base)

    fun confirm(aircraftId: String, e: EntryRow, confirmed: Boolean = true, base: String = e.updatedAt) =
        m("entry.confirm", aircraftId, base, buildJsonObject { put("entryId", e.id); put("confirmed", confirmed) })

    /** Editing confirms (apps/web lib/writes/entries.ts `update`). [fields] are column → value (String, Double or null). */
    fun update(aircraftId: String, e: EntryRow, fields: Map<String, Any?>) =
        m("entry.update", aircraftId, e.updatedAt, buildJsonObject {
            put("entryId", e.id)
            put("fields", JsonObject(fields.mapValues { (_, v) ->
                when (v) {
                    null -> JsonNull
                    is Number -> JsonPrimitive(v)
                    else -> JsonPrimitive(v.toString())
                }
            }))
        })

    fun delete(aircraftId: String, e: EntryRow) = m("entry.delete", aircraftId, e.updatedAt, buildJsonObject { put("entryId", e.id) })

    fun reviewPage(aircraftId: String, pageId: String, status: String, base: String) =
        m("page.review", aircraftId, base, buildJsonObject { put("pageId", pageId); put("status", status) })

    fun confirmClean(aircraftId: String) = m("entries.confirmClean", aircraftId, null, JsonObject(emptyMap()))

    /** [status]: no_pages_exist, asked_previous_owner or open. */
    fun gapStatus(aircraftId: String, gap: GapRow, status: String, note: String?) =
        m("gap.setStatus", aircraftId, gap.updatedAt, buildJsonObject {
            put("gapId", gap.id); put("status", status); put("note", note?.takeIf { it.isNotBlank() })
        })
}
