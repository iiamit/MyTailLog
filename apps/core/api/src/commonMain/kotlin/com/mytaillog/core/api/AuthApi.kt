package com.mytaillog.core.api

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.request.bearerAuth
import io.ktor.client.request.header
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.HttpMethod
import io.ktor.http.URLBuilder
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerialName
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

@Serializable
data class AuthUser(val id: String, val email: String? = null)

/** A Supabase session as returned by /auth/v1/verify and /auth/v1/token. */
@Serializable
data class Session(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String,
    @SerialName("expires_at") val expiresAt: Long? = null,
    val user: AuthUser,
)

/** /auth/v1/signup answers a session when the project auto-confirms, a bare user when it emails a confirmation. */
@Serializable
private data class SignUpReply(
    @SerialName("access_token") val accessToken: String? = null,
    @SerialName("refresh_token") val refreshToken: String? = null,
    @SerialName("expires_at") val expiresAt: Long? = null,
    val user: AuthUser? = null,
)

/** Why a sign-in step failed. The UI maps each to copy from 06 M-AUTH-01; raw server text is never shown. */
enum class AuthFailure { NoSignal, CodeRejected, TooManyRequests, ServerError, WrongPassword, SignUpRejected, ProviderFailed, SessionEnded }

class AuthException(val failure: AuthFailure, cause: Throwable? = null) : Exception(failure.name, cause)

/** Which email a 6-digit code came in (GoTrue's verify `type`). */
enum class CodeKind(val wire: String) { Email("email"), Signup("signup"), Recovery("recovery") }

/** A PKCE challenge (S256) and where the link or provider should send the user back. */
data class Pkce(val challenge: String, val redirectTo: String)

/**
 * Supabase Auth (GoTrue) over the shared Ktor client (05 §8): email one-time code and link,
 * password, provider ID tokens, the PKCE code exchange, refresh and sign-out. The platform
 * makes the PKCE verifier and challenge (it has the secure random and SHA-256).
 */
class AuthApi(
    private val http: HttpClient,
    private val supabaseUrl: String,
    private val publishableKey: String,
) {
    private val base get() = "${supabaseUrl.trimEnd('/')}/auth/v1"

    /** One email with a link and a 6-digit code. With [pkce] the link returns a code for [exchangeCode]. */
    suspend fun sendCode(email: String, pkce: Pkce? = null) {
        call("otp", buildJsonObject {
            put("email", email)
            put("create_user", true)
            pkce(pkce)
        }, onClientError = AuthFailure.ServerError, redirectTo = pkce?.redirectTo)
    }

    suspend fun verifyCode(email: String, code: String, kind: CodeKind = CodeKind.Email): Session =
        call("verify", buildJsonObject {
            put("type", kind.wire)
            put("email", email)
            put("token", code)
        }, onClientError = AuthFailure.CodeRejected).body()

    suspend fun signInWithPassword(email: String, password: String): Session =
        call("token?grant_type=password", buildJsonObject {
            put("email", email)
            put("password", password)
        }, onClientError = AuthFailure.WrongPassword).body()

    /** Returns the session, or null when the project sends a confirmation email first (finish with [CodeKind.Signup]). */
    suspend fun signUp(email: String, password: String, name: String, pkce: Pkce? = null): Session? {
        val reply = call("signup", buildJsonObject {
            put("email", email)
            put("password", password)
            putJsonObject("data") { put("full_name", name) }
            pkce(pkce)
        }, onClientError = AuthFailure.SignUpRejected, redirectTo = pkce?.redirectTo).body<SignUpReply>()
        val user = reply.user ?: return null
        val access = reply.accessToken ?: return null
        return Session(access, reply.refreshToken ?: return null, reply.expiresAt, user)
    }

    /** Emails a reset code; finish with [verifyCode] ([CodeKind.Recovery]) then [updatePassword]. */
    suspend fun sendPasswordReset(email: String) {
        call("recover", buildJsonObject { put("email", email) }, onClientError = AuthFailure.ServerError)
    }

    suspend fun updatePassword(accessToken: String, password: String) {
        call("user", buildJsonObject { put("password", password) }, onClientError = AuthFailure.ServerError, method = HttpMethod.Put) {
            bearerAuth(accessToken)
        }
    }

    /** A provider's OpenID token (Google via Credential Manager). [nonce] is the raw nonce; the token carries its SHA-256. */
    suspend fun signInWithIdToken(provider: String, idToken: String, nonce: String): Session =
        call("token?grant_type=id_token", buildJsonObject {
            put("provider", provider)
            put("id_token", idToken)
            put("nonce", nonce)
        }, onClientError = AuthFailure.ProviderFailed).body()

    /** Trades the `code` from an OAuth or email-link return for a session, with the verifier that made the challenge. */
    suspend fun exchangeCode(authCode: String, verifier: String): Session =
        call("token?grant_type=pkce", buildJsonObject {
            put("auth_code", authCode)
            put("code_verifier", verifier)
        }, onClientError = AuthFailure.CodeRejected).body()

    /** A 4xx means the refresh token is spent or revoked: [AuthFailure.SessionEnded]. */
    suspend fun refresh(refreshToken: String): Session =
        call("token?grant_type=refresh_token", buildJsonObject {
            put("refresh_token", refreshToken)
        }, onClientError = AuthFailure.SessionEnded).body()

    /** Revokes this device's refresh token. */
    suspend fun signOut(accessToken: String) {
        call("logout?scope=local", buildJsonObject {}, onClientError = AuthFailure.SessionEnded) { bearerAuth(accessToken) }
    }

    /** The page a Custom Tab or web session opens for a provider (Apple on Android). */
    fun authorizeUrl(provider: String, pkce: Pkce): String = URLBuilder("$base/authorize").apply {
        parameters.append("provider", provider)
        parameters.append("redirect_to", pkce.redirectTo)
        parameters.append("code_challenge", pkce.challenge)
        parameters.append("code_challenge_method", "s256")
    }.buildString()

    private fun JsonObjectBuilder.pkce(pkce: Pkce?) {
        if (pkce == null) return
        put("code_challenge", pkce.challenge)
        put("code_challenge_method", "s256")
    }

    private suspend fun call(
        path: String,
        body: JsonObject,
        onClientError: AuthFailure,
        redirectTo: String? = null,
        method: HttpMethod = HttpMethod.Post,
        extra: HttpRequestBuilder.() -> Unit = {},
    ): HttpResponse {
        val response = try {
            http.request(URLBuilder("$base/$path").apply { redirectTo?.let { parameters.append("redirect_to", it) } }.build()) {
                this.method = method
                header("apikey", publishableKey)
                contentType(ContentType.Application.Json)
                setBody(body)
                extra()
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
