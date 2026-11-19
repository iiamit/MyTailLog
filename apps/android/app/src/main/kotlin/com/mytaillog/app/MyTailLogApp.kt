package com.mytaillog.app

import android.app.Application
import com.mytaillog.core.api.AuthApi
import com.mytaillog.core.api.BooksApi
import com.mytaillog.core.api.HttpSyncApi
import com.mytaillog.core.api.StatusApi
import com.mytaillog.core.api.createHttpClient

class MyTailLogApp : Application() {
    val http by lazy { createHttpClient() }
    val account by lazy { Account(AuthApi(http, BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_KEY), SessionStore(this)) }
    val statusApi by lazy {
        StatusApi(http, BuildConfig.API_URL, BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_KEY) {
            account.accessToken() ?: error("Signed out")
        }
    }
    val booksApi by lazy {
        BooksApi(http, BuildConfig.API_URL, BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_KEY) { account.accessToken() ?: error("Signed out") }
    }
    val syncApi by lazy { HttpSyncApi(http, BuildConfig.API_URL) { account.accessToken() ?: error("Signed out") } }
}
