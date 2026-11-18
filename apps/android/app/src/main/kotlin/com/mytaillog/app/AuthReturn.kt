package com.mytaillog.app

import com.mytaillog.core.api.AuthApi
import com.mytaillog.core.api.AuthException
import com.mytaillog.core.api.AuthFailure
import com.mytaillog.core.api.Pkce
import com.mytaillog.core.api.Session
import java.net.URI
import java.net.URLDecoder
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/** Where each flow returns (05 §8.4). Both must be in the Supabase project's redirect allow list. */
enum class AuthFlow(val returnUrl: String) {
    /** Apple (and Google without Credential Manager) in a Custom Tab, back by the custom scheme. */
    OAuth("com.mytaillog.app://auth/callback"),
    /** The link in the sign-in email, back by the verified App Link. */
    Email("https://mytaillog.com/app/auth/callback"),
}

/** A recognised return: the PKCE `code`, or null when the provider or link reported an error. */
data class AuthReturn(val flow: AuthFlow, val code: String?)

/**
 * Accepts only this app's two return routes; any other URL is not an instruction to exchange
 * a code. Errors arrive in the query (OAuth) or the fragment (an expired email link).
 */
fun parseAuthReturn(raw: String): AuthReturn? {
    val uri = runCatching { URI(raw) }.getOrNull() ?: return null
    val flow = AuthFlow.entries.firstOrNull { f ->
        val r = URI(f.returnUrl)
        uri.scheme.equals(r.scheme, ignoreCase = true) && uri.host.equals(r.host, ignoreCase = true) &&
            uri.path.trimEnd('/') == r.path && (uri.port == -1 || uri.port == 443)
    } ?: return null
    val params = (params(uri.rawQuery) + params(uri.rawFragment))
    val code = params["code"]?.takeIf { it.isNotBlank() && params["error"] == null && params["error_code"] == null }
    return AuthReturn(flow, code)
}

private fun params(raw: String?): Map<String, String> = raw.orEmpty().split('&').filter { '=' in it }.associate {
    val (k, v) = it.split('=', limit = 2)
    URLDecoder.decode(k, "UTF-8") to URLDecoder.decode(v, "UTF-8")
}

/** What the sign-in screen does with a return. */
sealed interface ReturnOutcome {
    data class SignedIn(val session: Session) : ReturnOutcome
    /** An email link with no verifier on this phone, or one the server would not take: type the code instead. */
    data object EnterCode : ReturnOutcome
    data class Failed(val failure: AuthFailure) : ReturnOutcome
}

/** [verifier] is the one stored when this phone started the flow, or null if it didn't. */
suspend fun completeAuthReturn(ret: AuthReturn, verifier: String?, auth: AuthApi): ReturnOutcome {
    val isEmail = ret.flow == AuthFlow.Email
    if (ret.code == null || verifier == null) {
        return if (isEmail) ReturnOutcome.EnterCode else ReturnOutcome.Failed(AuthFailure.ProviderFailed)
    }
    return try {
        ReturnOutcome.SignedIn(auth.exchangeCode(ret.code, verifier))
    } catch (e: AuthException) {
        when {
            isEmail && e.failure == AuthFailure.CodeRejected -> ReturnOutcome.EnterCode
            e.failure == AuthFailure.CodeRejected -> ReturnOutcome.Failed(AuthFailure.ProviderFailed)
            else -> ReturnOutcome.Failed(e.failure)
        }
    }
}

/** PKCE (RFC 7636, S256) and the Google ID-token nonce. */
object Crypto {
    private val random = SecureRandom()
    private val b64 = Base64.getUrlEncoder().withoutPadding()

    fun randomToken(): String = ByteArray(32).also(random::nextBytes).let(b64::encodeToString)

    fun challenge(verifier: String): String = b64.encodeToString(sha256(verifier))

    fun pkce(verifier: String, flow: AuthFlow) = Pkce(challenge(verifier), flow.returnUrl)

    /** Google gets the hex SHA-256 of the nonce; Supabase gets the raw nonce and hashes it to compare. */
    fun sha256Hex(value: String): String = sha256(value).joinToString("") { "%02x".format(it) }

    private fun sha256(value: String) = MessageDigest.getInstance("SHA-256").digest(value.encodeToByteArray())
}
