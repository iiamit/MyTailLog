package com.mytaillog.app

import android.app.Application
import com.mytaillog.core.api.AuthApi
import com.mytaillog.core.api.createHttpClient

class MyTailLogApp : Application() {
    val http by lazy { createHttpClient() }
    val auth by lazy { AuthApi(http, BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_KEY) }
    val sessions by lazy { SessionStore(this) }
}
