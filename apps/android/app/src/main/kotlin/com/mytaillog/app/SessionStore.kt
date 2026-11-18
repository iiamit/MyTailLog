package com.mytaillog.app

import android.content.Context
import android.util.Base64
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.google.crypto.tink.Aead
import com.google.crypto.tink.KeyTemplates
import com.google.crypto.tink.RegistryConfiguration
import com.google.crypto.tink.aead.AeadConfig
import com.google.crypto.tink.integration.android.AndroidKeysetManager
import com.mytaillog.core.api.Session
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json

private val Context.sessionData by preferencesDataStore("session")

/**
 * The Supabase session in DataStore, sealed with a Tink AEAD key held in Android Keystore
 * (05 §8.1; EncryptedSharedPreferences is deprecated). A session that can't be decrypted
 * (Keystore reset, restored to another device) reads as signed out.
 */
class SessionStore(private val context: Context, makeAead: () -> Aead = { keystoreAead(context) }) {
    private val key = stringPreferencesKey("session")
    private val json = Json { ignoreUnknownKeys = true }
    private val aead: Aead by lazy(makeAead)

    val session: Flow<Session?> = context.sessionData.data
        .map { prefs -> prefs[key]?.let(::open) }
        .flowOn(Dispatchers.IO)

    suspend fun save(session: Session) {
        withContext(Dispatchers.IO) {
            val sealed = seal(json.encodeToString(Session.serializer(), session).encodeToByteArray())
            context.sessionData.edit { it[key] = sealed }
        }
    }

    suspend fun clear() {
        withContext(Dispatchers.IO) { context.sessionData.edit { it.clear() } }
    }

    /** The PKCE verifier for a flow this phone started; sealed like the session (the email app may outlive this process). */
    suspend fun putVerifier(flow: AuthFlow, verifier: String) {
        withContext(Dispatchers.IO) {
            context.sessionData.edit { it[verifierKey(flow)] = seal(verifier.encodeToByteArray()) }
        }
    }

    /** One use: the verifier is removed as it is read. */
    suspend fun takeVerifier(flow: AuthFlow): String? = withContext(Dispatchers.IO) {
        var sealed: String? = null
        context.sessionData.edit { sealed = it.remove(verifierKey(flow)) }
        sealed?.let { s -> runCatching { unseal(s).decodeToString() }.getOrNull() }
    }

    private fun verifierKey(flow: AuthFlow) = stringPreferencesKey("verifier_${flow.name}")

    private fun seal(plain: ByteArray) = Base64.encodeToString(aead.encrypt(plain, AD), Base64.NO_WRAP)
    private fun unseal(sealed: String) = aead.decrypt(Base64.decode(sealed, Base64.NO_WRAP), AD)

    private fun open(sealed: String): Session? = runCatching {
        json.decodeFromString(Session.serializer(), unseal(sealed).decodeToString())
    }.getOrNull()

    private companion object {
        val AD = "mytaillog.session".encodeToByteArray()

        fun keystoreAead(context: Context): Aead {
            AeadConfig.register()
            return AndroidKeysetManager.Builder()
                .withSharedPref(context, "session_keyset", "mytaillog_keys")
                .withKeyTemplate(KeyTemplates.get("AES256_GCM"))
                .withMasterKeyUri("android-keystore://mytaillog_session")
                .build()
                .keysetHandle
                .getPrimitive(RegistryConfiguration.get(), Aead::class.java)
        }
    }
}
