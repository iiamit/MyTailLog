package com.mytaillog.core.api

import io.ktor.client.HttpClient
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json

internal val wireJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
}

/** One client per process. Pass an engine in tests; the platform engine is used otherwise. */
fun createHttpClient(engine: HttpClientEngine? = null): HttpClient {
    val config: io.ktor.client.HttpClientConfig<*>.() -> Unit = {
        install(ContentNegotiation) { json(wireJson) }
        expectSuccess = false
    }
    return if (engine != null) HttpClient(engine, config) else HttpClient(config)
}
