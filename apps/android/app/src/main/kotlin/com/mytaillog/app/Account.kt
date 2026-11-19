package com.mytaillog.app

import com.mytaillog.core.api.AuthApi
import com.mytaillog.core.api.AuthException
import com.mytaillog.core.api.AuthFailure
import com.mytaillog.core.api.Session
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * The signed-in session and its lifecycle (05 §8.1, §8.6): one lock so callers never refresh
 * concurrently, a spent refresh token signs out with a notice, and sign-out revokes and forgets.
 */
class Account(val auth: AuthApi, val store: SessionStore, private val now: () -> Long = { System.currentTimeMillis() / 1000 }) {
    val session: Flow<Session?> = store.session

    /** True after a session could not be refreshed: M-AUTH-01 shows "You've been signed out…" first. */
    val endedNotice = MutableStateFlow(false)

    private val lock = Mutex()

    suspend fun signIn(session: Session) {
        endedNotice.value = false
        store.save(session)
    }

    /**
     * A current access token for API calls, refreshed when it expires within a minute. Null when
     * signed out. Offline keeps the stored session (the token is refreshed on the next call).
     */
    suspend fun accessToken(): String? = lock.withLock {
        val current = store.session.first() ?: return@withLock null
        if (!expiresSoon(current, now())) return@withLock current.accessToken
        try {
            auth.refresh(current.refreshToken).also { store.save(it) }.accessToken
        } catch (e: AuthException) {
            if (e.failure == AuthFailure.SessionEnded) {
                store.clear()
                endedNotice.value = true
                null
            } else {
                current.accessToken
            }
        }
    }

    /** 05 §8.6, nothing unsent (there is no outbox yet): revoke on the server if reachable, then forget the session. */
    suspend fun signOut() = lock.withLock {
        store.session.first()?.let { s ->
            try {
                auth.signOut(s.accessToken)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // Offline or already revoked: the device copy goes regardless.
            }
        }
        store.clear()
    }
}

fun expiresSoon(session: Session, nowSeconds: Long): Boolean = session.expiresAt?.let { it - nowSeconds < 60 } ?: false
