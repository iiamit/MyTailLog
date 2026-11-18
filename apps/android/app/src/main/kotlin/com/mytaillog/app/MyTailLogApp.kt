package com.mytaillog.app

import android.app.Application
import com.mytaillog.core.api.AuthApi
import com.mytaillog.core.api.createHttpClient

class MyTailLogApp : Application() {
    val http by lazy { createHttpClient() }
    val account by lazy { Account(AuthApi(http, BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_KEY), SessionStore(this)) }
}
