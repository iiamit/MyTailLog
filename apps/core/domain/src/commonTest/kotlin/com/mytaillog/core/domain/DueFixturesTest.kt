package com.mytaillog.core.domain

import com.mytaillog.core.domain.due.DueInput
import com.mytaillog.core.domain.due.computeStatus
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
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.fail

/**
 * Runs every due-engine fixture (packages/shared/fixtures, generated from the TypeScript
 * engine) through the Kotlin port. Each case's `expected` is a view of the full status
 * (fixtures/README.md): every key it names must equal the Kotlin output, arrays element by element.
 */
class DueFixturesTest {
    private val files = listOf("due-calendar", "due-hours", "status-thresholds", "projection", "verdict")
    private val json = Json { ignoreUnknownKeys = true; explicitNulls = true; encodeDefaults = true }

    @Test
    fun everyDueFixtureMatchesTheKotlinEngine() {
        var total = 0
        val failures = mutableListOf<String>()
        for (name in files) {
            val text = SystemFileSystem.source(Path(FIXTURES_DIR, "$name.json")).buffered().use { it.readString() }
            val cases = Json.parseToJsonElement(text).jsonObject["cases"]!!.jsonArray
            for (c in cases) {
                val o = c.jsonObject
                val label = "$name: ${o["name"]!!.jsonPrimitive.content}"
                val input = json.decodeFromJsonElement(DueInput.serializer(), o["input"]!!)
                val actual = json.encodeToJsonElement(
                    com.mytaillog.core.domain.due.StatusBody.serializer(),
                    computeStatus(input, o["today"]!!.jsonPrimitive.content),
                )
                diff(o["expected"]!!, actual, "")?.let { failures.add("$label at $it") }
                total++
            }
        }
        if (failures.isNotEmpty()) fail("${failures.size} of $total cases differ:\n" + failures.joinToString("\n"))
        assertTrue(total >= 60, "$total cases")
    }

    @Test
    fun theDiffCatchesADifference() {
        val a = Json.parseToJsonElement("""{"x":[1,{"y":"a"}]}""")
        assertEquals(null, diff(a, Json.parseToJsonElement("""{"x":[1.0,{"y":"a","z":2}],"w":0}""")))
        assertEquals(".x[1].y (a != b)", diff(a, Json.parseToJsonElement("""{"x":[1,{"y":"b"}]}""")))
        assertEquals(".x[0] (1 != 2)", diff(a, Json.parseToJsonElement("""{"x":[2,{"y":"a"}]}""")))
    }

    /** Path of the first mismatch, or null. Objects: expected keys only; numbers compared as doubles. */
    private fun diff(expected: JsonElement, actual: JsonElement?, path: String = ""): String? = when (expected) {
        is JsonObject -> if (actual !is JsonObject) path else
            expected.entries.firstNotNullOfOrNull { (k, v) -> diff(v, actual[k] ?: JsonNull, "$path.$k") }
        is JsonArray -> if (actual !is JsonArray || actual.size != expected.size) "$path (length)" else
            expected.indices.firstNotNullOfOrNull { diff(expected[it], actual[it], "$path[$it]") }
        is JsonNull -> if (actual == null || actual is JsonNull) null else path
        is JsonPrimitive -> when {
            actual !is JsonPrimitive || actual is JsonNull -> path
            expected.isString || actual.isString -> if (expected.isString == actual.isString && expected.content == actual.content) null else "$path (${expected.content} != ${actual.content})"
            expected.booleanOrNull != null -> if (expected.booleanOrNull == actual.booleanOrNull) null else path
            else -> if (expected.doubleOrNull == actual.doubleOrNull) null else "$path (${expected.content} != ${actual.content})"
        }
    }
}
