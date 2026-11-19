package com.mytaillog.core.domain

import com.mytaillog.core.domain.due.DueInput
import com.mytaillog.core.domain.map.Layout
import com.mytaillog.core.domain.map.LayoutOptions
import com.mytaillog.core.domain.map.MapInput
import com.mytaillog.core.domain.map.MapModel
import com.mytaillog.core.domain.map.MapOptions
import com.mytaillog.core.domain.map.buildMapModel
import com.mytaillog.core.domain.map.layoutMap
import com.mytaillog.core.domain.map.stopId
import kotlinx.io.buffered
import kotlinx.io.files.Path
import kotlinx.io.files.SystemFileSystem
import kotlinx.io.readString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.fail

/**
 * Runs the map fixtures (packages/shared/fixtures/map-*.json, generated from the TypeScript
 * derivation and layout) through the Kotlin port: the MapModel must match exactly, layout
 * positions within 0.5 viewBox units (13 §5 phase 2, 10 §11).
 */
class MapFixturesTest {
    private val json = Json { ignoreUnknownKeys = true; explicitNulls = true; encodeDefaults = true }

    private fun cases(name: String): JsonArray =
        Json.parseToJsonElement(SystemFileSystem.source(Path(FIXTURES_DIR, "$name.json")).buffered().use { it.readString() })
            .jsonObject["cases"]!!.jsonArray

    @Test
    fun everyMapModelFixtureMatches() {
        var total = 0
        val failures = mutableListOf<String>()
        for (file in listOf("map-grouping", "map-model")) for (c in cases(file)) {
            val o = c.jsonObject
            val input = o["input"]!!
            val opts = input.jsonObject["_options"]?.let { json.decodeFromJsonElement(MapOptions.serializer(), it) } ?: MapOptions()
            val model = buildMapModel(
                json.decodeFromJsonElement(MapInput.serializer(), input),
                json.decodeFromJsonElement(DueInput.serializer(), input),
                o["today"]!!.jsonPrimitive.content, opts,
            )
            diff(o["expected"]!!, json.encodeToJsonElement(MapModel.serializer(), model), "", 0.0)
                ?.let { failures.add("$file: ${o["name"]!!.jsonPrimitive.content} at $it") }
            total++
        }
        if (failures.isNotEmpty()) fail("${failures.size} of $total cases differ:\n" + failures.joinToString("\n"))
        assertTrue(total >= 16, "$total cases")
    }

    @Test
    fun everyLayoutFixtureMatchesWithinHalfAUnit() {
        var total = 0
        val failures = mutableListOf<String>()
        for (file in listOf("map-layout", "map-layout-stress")) for (c in cases(file)) {
            val o = c.jsonObject
            val model = json.decodeFromJsonElement(MapModel.serializer(), o["input"]!!.jsonObject["model"]!!)
            val opts = o["input"]!!.jsonObject["options"]!!
            val expected = o["expected"]!!
            val pairs = if (opts is JsonArray) opts.zip(expected.jsonArray) else listOf(opts to expected)
            for ((oo, ex) in pairs) {
                val layout = layoutMap(model, json.decodeFromJsonElement(LayoutOptions.serializer(), oo))
                diff(ex, json.encodeToJsonElement(Layout.serializer(), layout), "", 0.5)
                    ?.let { failures.add("$file: ${o["name"]!!.jsonPrimitive.content} at $it") }
                total++
            }
        }
        if (failures.isNotEmpty()) fail("${failures.size} of $total layouts differ:\n" + failures.joinToString("\n"))
        assertTrue(total >= 30, "$total layouts")
    }

    @Test
    fun stopIdsAreSha1() {
        // sha1("lb-air|2024-12-03"), first 16 hex, as node:crypto computes it.
        assertEquals(16, stopId("lb-air", "2024-12-03").length)
        assertEquals("da39a3ee5e6b4b0d", com.mytaillog.core.domain.map.interchangeId(emptyList()))
    }

    /** Path of the first mismatch, or null. Objects: expected keys only; numbers within `tol`. */
    private fun diff(expected: JsonElement, actual: JsonElement?, path: String, tol: Double): String? = when (expected) {
        is JsonObject -> if (actual !is JsonObject) path else
            expected.entries.firstNotNullOfOrNull { (k, v) -> diff(v, actual[k] ?: JsonNull, "$path.$k", tol) }
        is JsonArray -> if (actual !is JsonArray || actual.size != expected.size) "$path (length ${expected.size} != ${(actual as? JsonArray)?.size})" else
            expected.indices.firstNotNullOfOrNull { diff(expected[it], actual[it], "$path[$it]", tol) }
        is JsonNull -> if (actual == null || actual is JsonNull) null else "$path (null != $actual)"
        is JsonPrimitive -> when {
            actual !is JsonPrimitive || actual is JsonNull -> "$path (${expected.content} != null)"
            expected.isString || actual.isString -> if (expected.isString == actual.isString && expected.content == actual.content) null else "$path (${expected.content} != ${actual.content})"
            expected.booleanOrNull != null -> if (expected.booleanOrNull == actual.booleanOrNull) null else path
            else -> if (abs(expected.doubleOrNull!! - (actual.doubleOrNull ?: Double.NaN)) <= tol + 1e-9) null else "$path (${expected.content} != ${actual.content})"
        }
    }
}
