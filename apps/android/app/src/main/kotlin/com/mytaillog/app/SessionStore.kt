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
class SessionStore(private val context: Context) {
    private val key = stringPreferencesKey("session")
    private val json = Json { ignoreUnknownKeys = true }

    private val aead: Aead by lazy {
        AeadConfig.register()
        AndroidKeysetManager.Builder()
            .withSharedPref(context, "session_keyset", "mytaillog_keys")
            .withKeyTemplate(KeyTemplates.get("AES256_GCM"))
            .withMasterKeyUri("android-keystore://mytaillog_session")
            .build()
            .keysetHandle
            .getPrimitive(RegistryConfiguration.get(), Aead::class.java)
    }

    val session: Flow<Session?> = context.sessionData.data
        .map { prefs -> prefs[key]?.let(::open) }
        .flowOn(Dispatchers.IO)

    suspend fun save(session: Session) = withContext(Dispatchers.IO) {
        val sealed = aead.encrypt(json.encodeToString(Session.serializer(), session).encodeToByteArray(), AD)
        context.sessionData.edit { it[key] = Base64.encodeToString(sealed, Base64.NO_WRAP) }
    }

    private fun open(sealed: String): Session? = runCatching {
        json.decodeFromString(Session.serializer(), aead.decrypt(Base64.decode(sealed, Base64.NO_WRAP), AD).decodeToString())
    }.getOrNull()

    private companion object { val AD = "mytaillog.session".encodeToByteArray() }
}
