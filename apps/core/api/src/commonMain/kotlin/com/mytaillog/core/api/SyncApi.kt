package com.mytaillog.core.api

import com.mytaillog.core.domain.Mutation
import com.mytaillog.core.domain.PullPage
import com.mytaillog.core.domain.PushRequest
import com.mytaillog.core.domain.PushResponse
import com.mytaillog.core.domain.PushResult
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.bearerAuth
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.serialization.Serializable

/** Sync protocol v2 (09 §5; 05 §6.3, §6.4, §6.6). The Capacitor app keeps v1; the native apps speak v2. */
interface SyncApi {
    suspend fun pull(cursor: Long, limit: Int = 500): PullPage
    suspend fun push(mutations: List<Mutation>): List<PushResult>
    /** Close the server's conflict record when the owner dropped their change: `take_theirs` or `discard`. */
    suspend fun resolveConflict(mutationId: String, resolution: String)
}

/** HTTP failure from the sync API; [status] 401 means the session needs refreshing, 410 a rebuild from cursor 0. */
class SyncHttpException(val status: Int, message: String) : Exception(message)

@Serializable
private data class ResolveRequest(val resolution: String)

class HttpSyncApi(
    private val http: HttpClient,
    private val baseUrl: String,
    /** The Supabase access token, injected by the platform (05 §8.1). */
    private val accessToken: suspend () -> String,
) : SyncApi {
    private val root get() = "${baseUrl.trimEnd('/')}/api/sync/v2"

    override suspend fun pull(cursor: Long, limit: Int): PullPage =
        http.get("$root/pull") {
            bearerAuth(accessToken())
            parameter("cursor", cursor)
            parameter("limit", limit)
        }.orThrow().body()

    override suspend fun push(mutations: List<Mutation>): List<PushResult> =
        http.post("$root/push") {
            bearerAuth(accessToken())
            contentType(ContentType.Application.Json)
            setBody(PushRequest(mutations))
        }.orThrow().body<PushResponse>().results

    override suspend fun resolveConflict(mutationId: String, resolution: String) {
        http.post("$root/conflicts/$mutationId") {
            bearerAuth(accessToken())
            contentType(ContentType.Application.Json)
            setBody(ResolveRequest(resolution))
        }.orThrow()
    }

    private suspend fun HttpResponse.orThrow(): HttpResponse =
        if (status.isSuccess()) this else throw SyncHttpException(status.value, bodyAsText())
}
