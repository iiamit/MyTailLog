package com.mytaillog.app

import com.mytaillog.design.Section
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DestinationsTest {
    @Test
    fun phoneHasFiveTabsInBinderOrderWithDocumentsUnderAircraft() {
        assertEquals(
            listOf(Section.Status, Section.Books, Section.Maint, Section.Aircraft, Section.Share),
            PhoneTabs.map { it.section },
        )
        assertEquals(R.string.tab_maint, Destination.Maintenance.tabLabel)
        assertFalse(Destination.Documents in PhoneTabs)
        assertTrue(DOCUMENTS_ON_PHONE.startsWith(Destination.Aircraft.graph + "/"))
    }

    @Test
    fun tabletRailHasAllSixSections() {
        assertEquals(
            listOf(Section.Status, Section.Books, Section.Maint, Section.Aircraft, Section.Docs, Section.Share),
            TabletSections.map { it.section },
        )
    }

    @Test
    fun routesAreDistinctPerTab() {
        val routes = Destination.entries.flatMap { listOf(it.graph, it.root) } + DOCUMENTS_ON_PHONE
        assertEquals(routes.size, routes.toSet().size)
    }

    @Test
    fun tabletFrom700dp() {
        assertFalse(isTablet(699))
        assertTrue(isTablet(700))
    }
}
