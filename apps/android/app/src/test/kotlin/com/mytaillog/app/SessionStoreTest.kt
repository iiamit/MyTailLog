package com.mytaillog.app

import org.robolectric.RuntimeEnvironment
import com.google.crypto.tink.Aead
import com.google.crypto.tink.KeyTemplates
import com.google.crypto.tink.KeysetHandle
import com.google.crypto.tink.RegistryConfiguration
import com.google.crypto.tink.aead.AeadConfig
import com.mytaillog.core.api.AuthUser
import com.mytaillog.core.api.Session
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** The sealed store and the refresh rules, with an in-memory Tink key standing in for Android Keystore. */
@RunWith(RobolectricTestRunner::class)
class SessionStoreTest {
    private val aead: Aead by lazy {
        AeadConfig.register()
        KeysetHandle.generateNew(KeyTemplates.get("AES256_GCM").toParameters()).getPrimitive(RegistryConfiguration.get(), Aead::class.java)
    }
    private val store by lazy { SessionStore(RuntimeEnvironment.getApplication()) { aead } }
    private val session = Session("a1", "r1", expiresAt = 1000, user = AuthUser("u1", "dana@example.com"))

    @Test
    fun sessionAndVerifierRoundTripSealed() = runTest {
        store.clear()
        store.save(session)
        assertEquals(session, store.session.first())

        store.putVerifier(AuthFlow.Email, "v-email")
        assertNull(store.takeVerifier(AuthFlow.OAuth))
        assertEquals("v-email", store.takeVerifier(AuthFlow.Email))
        assertNull("a verifier is used once", store.takeVerifier(AuthFlow.Email))

        store.clear()
        assertNull(store.session.first())
    }

    @Test
    fun refreshReplacesAnExpiringSession() = runTest {
        store.clear()
        store.save(session)
        val seen = mutableListOf<String>()
        val account = Account(authApi(HttpStatusCode.OK, seen = seen), store, now = { 990 })
        assertEquals("a2", account.accessToken())
        assertEquals("r2", store.session.first()?.refreshToken)
        assertTrue(seen.single().endsWith("grant_type=refresh_token"))
        // Fresh now: no second call.
        assertEquals("a2", Account(authApi(HttpStatusCode.OK, seen = seen), store, now = { 990 }).accessToken())
        assertEquals(1, seen.size)
    }

    @Test
    fun spentRefreshTokenSignsOutWithNotice_offlineKeepsTheSession() = runTest {
        store.clear()
        store.save(session)
        val serverDown = Account(authApi(HttpStatusCode.InternalServerError, "{}"), store, now = { 990 })
        assertEquals("a1", serverDown.accessToken())
        assertEquals(session, store.session.first())

        val revoked = Account(authApi(HttpStatusCode.BadRequest, """{"error_code":"refresh_token_not_found"}"""), store, now = { 990 })
        assertNull(revoked.accessToken())
        assertNull(store.session.first())
        assertTrue(revoked.endedNotice.value)
    }

    @Test
    fun signOutForgetsEvenWhenTheServerIsUnreachable() = runTest {
        store.clear()
        store.save(session)
        Account(authApi(HttpStatusCode.ServiceUnavailable, "{}"), store).signOut()
        assertNull(store.session.first())
    }
}
