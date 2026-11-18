package com.mytaillog.core.domain

import kotlinx.io.buffered
import kotlinx.io.files.Path
import kotlinx.io.files.SystemFileSystem
import kotlinx.io.readString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertNotNull

/**
 * Loads every JSON fixture in packages/shared/fixtures (13 §2.3). The folder may be
 * empty or missing until the TypeScript generator lands; then there is nothing to check.
 */
class FixturesTest {
    @Test
    fun everyFixtureParses() {
        val dir = Path(FIXTURES_DIR)
        if (!SystemFileSystem.exists(dir)) return
        SystemFileSystem.list(dir).filter { it.name.endsWith(".json") }.forEach { file ->
            val text = SystemFileSystem.source(file).buffered().use { it.readString() }
            assertNotNull(runCatching { Json.parseToJsonElement(text) }.getOrNull(), "${file.name} is not valid JSON")
        }
    }
}
