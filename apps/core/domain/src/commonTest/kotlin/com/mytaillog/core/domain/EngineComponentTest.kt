package com.mytaillog.core.domain
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue
class EngineComponentTest {
    @Test fun accessoriesAreNotCompleteEngines() {
        listOf("Vacuum pump", "Right magneto", "Engine oil filter", "Exhaust system", "Alternator", "Engine monitor").forEach { assertFalse(isCompleteEngine(it, "engine"), it) }
        listOf("Engine", "Lycoming IO-360-A1A", "Continental TSIO-520", "Rotax 912").forEach { assertTrue(isCompleteEngine(it, "engine"), it) }
        assertFalse(isCompleteEngine("Engine", "engine", "accessory"))
        assertTrue(isCompleteEngine("Powerplant", "engine", "engine"))
    }
}
