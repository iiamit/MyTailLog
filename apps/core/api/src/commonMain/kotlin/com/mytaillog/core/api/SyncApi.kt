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

/** The two endpoints of today's sync protocol (05 §6.3, §6.4). */
interface SyncApi {
    suspend fun pull(cursor: Long, limit: Int = 500): PullPage
    suspend fun push(mutations: List<Mutation>): List<PushResult>
}

/** HTTP failure from the sync API; [status] 401 means the session needs refreshing. */
class SyncHttpException(val status: Int, message: String) : Exception(message)

class HttpSyncApi(
    private val http: HttpClient,
    private val baseUrl: String,
    /** The Supabase access token, injected by the platform (05 §8.1). */
    private val accessToken: suspend () -> String,
) : SyncApi {
    override suspend fun pull(cursor: Long, limit: Int): PullPage =
        http.get("${baseUrl.trimEnd('/')}/api/sync/pull") {
            bearerAuth(accessToken())
            parameter("cursor", cursor)
            parameter("limit", limit)
        }.orThrow().body()

    override suspend fun push(mutations: List<Mutation>): List<PushResult> =
        http.post("${baseUrl.trimEnd('/')}/api/sync/push") {
            bearerAuth(accessToken())
            contentType(ContentType.Application.Json)
            setBody(PushRequest(mutations))
        }.orThrow().body<PushResponse>().results

    private suspend fun HttpResponse.orThrow(): HttpResponse =
        if (status.isSuccess()) this else throw SyncHttpException(status.value, bodyAsText())
}
