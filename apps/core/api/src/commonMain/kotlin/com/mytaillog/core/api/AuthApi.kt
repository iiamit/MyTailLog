package com.mytaillog.core.api

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerialName
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

@Serializable
data class AuthUser(val id: String, val email: String? = null)

/** A Supabase session as returned by /auth/v1/verify. */
@Serializable
data class Session(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String,
    @SerialName("expires_at") val expiresAt: Long? = null,
    val user: AuthUser,
)

/** Why a sign-in step failed. The UI maps each to copy from 06 M-AUTH-01; raw server text is never shown. */
enum class AuthFailure { NoSignal, CodeRejected, TooManyRequests, ServerError }

class AuthException(val failure: AuthFailure, cause: Throwable? = null) : Exception(failure.name, cause)

/**
 * Email one-time code against Supabase Auth (GoTrue): /auth/v1/otp sends the email,
 * /auth/v1/verify trades the 6-digit code for a session.
 */
class AuthApi(
    private val http: HttpClient,
    private val supabaseUrl: String,
    private val publishableKey: String,
) {
    suspend fun sendCode(email: String) {
        call("otp", buildJsonObject {
            put("email", email)
            put("create_user", true)
        }, onClientError = AuthFailure.ServerError)
    }

    suspend fun verifyCode(email: String, code: String): Session =
        call("verify", buildJsonObject {
            put("type", "email")
            put("email", email)
            put("token", code)
        }, onClientError = AuthFailure.CodeRejected).body()

    private suspend fun call(path: String, body: JsonObject, onClientError: AuthFailure): HttpResponse {
        val response = try {
            http.post("${supabaseUrl.trimEnd('/')}/auth/v1/$path") {
                header("apikey", publishableKey)
                contentType(ContentType.Application.Json)
                setBody(body)
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            throw AuthException(AuthFailure.NoSignal, e)
        }
        val status = response.status.value
        return when {
            response.status.isSuccess() -> response
            status == 429 -> throw AuthException(AuthFailure.TooManyRequests)
            // GoTrue answers 403 "otp_expired" for both a wrong and an expired code.
            status in 400..499 -> throw AuthException(onClientError)
            else -> throw AuthException(AuthFailure.ServerError)
        }
    }
}
