package com.mytaillog.app

import android.app.Activity
import android.content.Context
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.CancellationException

/** What Credential Manager's Google sheet gave back. */
sealed interface GoogleResult {
    data class Token(val idToken: String) : GoogleResult
    data object Cancelled : GoogleResult
    /** No Google account on the device, or no client ID configured: the OAuth Custom Tab instead (06 M-AUTH-01, Android). */
    data object UseBrowser : GoogleResult
}

/**
 * Sign in with Google through Credential Manager (05 §8.2). [hashedNonce] is the hex SHA-256 of the
 * nonce Supabase later checks. Other failures throw and read as "Google sign-in didn't finish".
 */
suspend fun googleIdToken(activity: Activity, hashedNonce: String): GoogleResult {
    // TODO(config): pass -Pmytaillog.googleWebClientId (the Web OAuth client ID Supabase's Google provider uses). Blank: Custom Tab.
    val clientId = BuildConfig.GOOGLE_WEB_CLIENT_ID.ifBlank { return GoogleResult.UseBrowser }
    val option = GetSignInWithGoogleOption.Builder(clientId).setNonce(hashedNonce).build()
    val credential = try {
        CredentialManager.create(activity).getCredential(activity, GetCredentialRequest(listOf(option))).credential
    } catch (_: GetCredentialCancellationException) {
        return GoogleResult.Cancelled
    } catch (_: NoCredentialException) {
        return GoogleResult.UseBrowser
    }
    check(credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) { "Unexpected credential" }
    return GoogleResult.Token(GoogleIdTokenCredential.createFrom(credential.data).idToken)
}

/** Forget the Google account choice on sign-out so the next sign-in asks again. */
suspend fun clearGoogleChoice(context: Context) {
    try {
        CredentialManager.create(context).clearCredentialState(ClearCredentialStateRequest())
    } catch (e: CancellationException) {
        throw e
    } catch (_: Exception) {
        // Nothing stored, or no provider on the device.
    }
}

/** Apple (and Google's fallback) in a Custom Tab; the return reaches MainActivity by the custom scheme. */
fun openCustomTab(context: Context, url: String) {
    CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(context, Uri.parse(url))
}
