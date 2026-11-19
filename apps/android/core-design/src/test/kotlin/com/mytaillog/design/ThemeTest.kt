package com.mytaillog.design

import org.junit.Assert.assertEquals
import org.junit.Test

class ThemeTest {
    @Test
    fun materialRolesMapToTheBinder() {
        for ((colors, dark) in listOf(LightColors to false, DarkColors to true)) {
            val m = materialColorScheme(colors, dark)
            assertEquals(colors.leaf, m.surface)
            assertEquals(colors.ink, m.onSurface)
            assertEquals(colors.ink, m.primary)
            assertEquals(colors.alarm, m.error)
            assertEquals(colors.controlBorder, m.outline)
        }
    }

    @Test
    fun sectionColoursComeFromTheirOwnTokens() {
        val books = LightColors.section(Section.Books)
        assertEquals(LightColors.sectionBooks, books.board)
        assertEquals(LightColors.onSectionBooks, books.onBoard)
        assertEquals(LightColors.sectionInkBooks, books.boardInk)
        // Dark text on the yellow Logbooks board, white on every other section (01 §2).
        Section.entries.filter { it != Section.Books }.forEach {
            assertEquals(androidx.compose.ui.graphics.Color.White, LightColors.section(it).onBoard)
        }
        assertEquals(DarkColors.sectionStatus, DarkColors.section(Section.Status).board)
    }
}
