package com.mytaillog.app

import android.app.Application
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import app.cash.sqldelight.driver.android.AndroidSqliteDriver
import com.mytaillog.core.api.AuthApi
import com.mytaillog.core.api.BooksApi
import com.mytaillog.core.api.HttpSyncApi
import com.mytaillog.core.api.StatusApi
import com.mytaillog.core.api.createHttpClient
import com.mytaillog.core.db.MIRROR_DB
import com.mytaillog.core.db.OUTBOX_DB
import com.mytaillog.core.db.mirror.MirrorDatabase
import com.mytaillog.core.db.outbox.OutboxDatabase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import java.io.File

class MyTailLogApp : Application() {
    val http by lazy { createHttpClient() }
    val account by lazy { Account(AuthApi(http, BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_KEY), SessionStore(this)) }
    private val token: suspend () -> String = { account.accessToken() ?: error("Signed out") }
    val statusApi by lazy { StatusApi(http, BuildConfig.API_URL, BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_KEY, token) }
    val booksApi by lazy { BooksApi(http, BuildConfig.API_URL, BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_KEY, token) }
    val syncApi by lazy { HttpSyncApi(http, BuildConfig.API_URL, token) }
    val captureApi by lazy { CaptureApi(http, BuildConfig.API_URL, token) }

    /** Whether the phone has a network (06 §1.3 "offline"). */
    val online = MutableStateFlow(true)

    private var offline: OfflineStore? = null

    override fun onCreate() {
        super.onCreate()
        val cm = getSystemService(ConnectivityManager::class.java) ?: return
        online.value = cm.getNetworkCapabilities(cm.activeNetwork)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
        cm.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { setOnline(true) }
            override fun onLost(network: Network) { setOnline(false) }
        })
    }

    private fun setOnline(v: Boolean) {
        online.value = v
        offline?.let { it.setOnline(v); if (v) SyncWorker.now(this) } // reconnect: blobs, then the outbox (07 B-OFFLINE)
    }

    /** The signed-in user's store: `filesDir/{userId}` with mirror.db and outbox.db (05 §6.2, §7.1). */
    @Synchronized
    fun offline(userId: String): OfflineStore {
        offline?.takeIf { it.userId == userId }?.let { return it }
        offline?.close()
        val dir = File(filesDir, userId).apply { mkdirs() }
        val mirror = AndroidSqliteDriver(MirrorDatabase.Schema, this, File(dir, MIRROR_DB).path)
        val outbox = AndroidSqliteDriver(OutboxDatabase.Schema, this, File(dir, OUTBOX_DB).path)
        return OfflineStore(userId, dir, mirror, outbox, syncApi, captureApi).also {
            it.setOnline(online.value)
            offline = it
        }
    }

    suspend fun currentOffline(): OfflineStore? = account.session.first()?.user?.id?.let(::offline)

    /** Sign-out deletes the user's directory: mirror, outbox, held pages and cached copies (05 §7.1). */
    @Synchronized
    fun forget(userId: String) {
        SyncWorker.cancel(this)
        if (offline?.userId == userId) { offline?.close(); offline = null }
        File(filesDir, userId).deleteRecursively()
    }
}
