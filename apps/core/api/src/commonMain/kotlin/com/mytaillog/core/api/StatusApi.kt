package com.mytaillog.core.api

import com.mytaillog.core.domain.due.StatusBody
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.bearerAuth
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.isSuccess
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

@Serializable
data class AircraftSummary(
    val id: String,
    @SerialName("tail_number") val tailNumber: String,
    @SerialName("owner_id") val ownerId: String,
    @SerialName("is_demo") val isDemo: Boolean = false,
)

/** 06 §1.5: the demo aircraft is read-only like a viewer's. */
enum class AircraftRole { Owner, Editor, Viewer }

data class AircraftAccess(val aircraft: AircraftSummary, val role: AircraftRole) {
    val canEdit: Boolean get() = role != AircraftRole.Viewer
}

/** GET /api/aircraft/{id}/status (09 §4.2, 4.3): the engine's output plus when the server worked it out. */
data class StatusSnapshot(val body: StatusBody, val computedAt: String?)

/** HTTP failure from the app API or PostgREST; [status] 401 means the session needs refreshing, 404 no access. */
class ApiHttpException(val status: Int, message: String) : Exception(message)

@Serializable
private data class ShareRow(@SerialName("aircraft_id") val aircraftId: String, val role: String)

/**
 * What Status reads while there is no local mirror (phase 3): the aircraft the user can open, through
 * PostgREST under RLS, and the server's status snapshot, which is the authority (09 §3.12).
 */
class StatusApi(
    private val http: HttpClient,
    private val apiBaseUrl: String,
    private val supabaseUrl: String,
    private val supabaseKey: String,
    /** The Supabase access token, injected by the platform (05 §8.1). */
    private val accessToken: suspend () -> String,
) {
    /** Every aircraft RLS lets this user read, by tail number, with the user's role on each. */
    suspend fun aircraft(userId: String, email: String?): List<AircraftAccess> {
        val token = accessToken()
        val rows = http.get("${supabaseUrl.trimEnd('/')}/rest/v1/aircraft") {
            header("apikey", supabaseKey)
            bearerAuth(token)
            parameter("select", "id,tail_number,owner_id,is_demo")
            parameter("order", "tail_number")
        }.orThrow().body<List<AircraftSummary>>()
        // Only shared aircraft need the grant; an owner can read the grants they gave, so match on the caller's email.
        val shares = if (email == null || rows.all { it.ownerId == userId }) emptyMap() else
            http.get("${supabaseUrl.trimEnd('/')}/rest/v1/aircraft_share") {
                header("apikey", supabaseKey)
                bearerAuth(token)
                parameter("select", "aircraft_id,role")
                parameter("invited_email", "ilike.$email")
            }.orThrow().body<List<ShareRow>>().associate { it.aircraftId to it.role }
        return rows.map { a ->
            val role = when {
                a.isDemo -> AircraftRole.Viewer
                a.ownerId == userId -> AircraftRole.Owner
                shares[a.id] == "editor" -> AircraftRole.Editor
                else -> AircraftRole.Viewer
            }
            AircraftAccess(a, role)
        }
    }

    suspend fun status(aircraftId: String): StatusSnapshot {
        val json = http.get("${apiBaseUrl.trimEnd('/')}/api/aircraft/$aircraftId/status") {
            bearerAuth(accessToken())
        }.orThrow().bodyAsText()
        return parseStatus(json)
    }

    private suspend fun HttpResponse.orThrow(): HttpResponse =
        if (status.isSuccess()) this else throw ApiHttpException(status.value, bodyAsText())
}

fun parseStatus(json: String): StatusSnapshot {
    val obj = wireJson.parseToJsonElement(json) as JsonObject
    return StatusSnapshot(wireJson.decodeFromJsonElement(StatusBody.serializer(), obj), obj["computedAt"]?.jsonPrimitive?.contentOrNull)
}
