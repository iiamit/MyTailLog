package com.mytaillog.app

import com.mytaillog.core.api.AircraftAccess
import com.mytaillog.core.api.AircraftRole
import com.mytaillog.core.api.AircraftSummary
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class StatusViewModelTest {
    private val demo = AircraftAccess(AircraftSummary("d", "N734DM", "x", isDemo = true), AircraftRole.Viewer)
    private val mine = AircraftAccess(AircraftSummary("m", "N12AB", "me"), AircraftRole.Owner)
    private val shared = AircraftAccess(AircraftSummary("s", "N9", "dana"), AircraftRole.Editor)
    private val sample = sampleSnapshot()
    private fun snapFor(id: String) = sample.copy(body = sample.body.copy(aircraftId = id))

    @Before fun main() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun reset() = Dispatchers.resetMain()

    @Test
    fun picksTheOwnAircraftBeforeSharedAndDemo() {
        assertEquals("m", defaultAircraft(listOf(demo, shared, mine)))
        assertEquals("s", defaultAircraft(listOf(demo, shared)))
        assertEquals("d", defaultAircraft(listOf(demo)))
        assertNull(defaultAircraft(emptyList()))
    }

    @Test
    fun loadsTheDefaultAircraftsSnapshot() {
        val asked = mutableListOf<String>()
        val vm = StatusViewModel({ listOf(demo, mine) }, { asked += it; snapFor(it) })
        val ui = vm.ui.value
        assertEquals(listOf("m"), asked)
        assertEquals("m", ui.currentId)
        assertEquals("m", ui.snapshot?.body?.aircraftId)
        assertFalse(ui.loading)
    }

    @Test
    fun noAircraftIsItsOwnState() {
        val vm = StatusViewModel({ emptyList() }, { error("not called") })
        assertTrue(vm.ui.value.noAircraft)
    }

    @Test
    fun aFailureWithNothingShownIsTheErrorStateAndRetryRecovers() {
        var fail = true
        val vm = StatusViewModel({ listOf(mine) }, { if (fail) throw RuntimeException("offline") else snapFor(it) })
        assertTrue(vm.ui.value.failed)
        assertNull(vm.ui.value.snapshot)
        fail = false
        vm.refresh()
        assertFalse(vm.ui.value.failed)
        assertEquals("m", vm.ui.value.snapshot?.body?.aircraftId)
    }

    @Test
    fun aFailedRefreshKeepsTheLastSnapshot() {
        var fail = false
        val vm = StatusViewModel({ listOf(mine) }, { if (fail) throw RuntimeException("offline") else snapFor(it) })
        fail = true
        vm.refresh()
        assertTrue(vm.ui.value.failed)
        assertEquals("m", vm.ui.value.snapshot?.body?.aircraftId)
    }

    @Test
    fun switchingAircraftLoadsItAndRemembersTheCurrent() {
        val vm = StatusViewModel({ listOf(mine, demo) }, ::snapFor)
        vm.select("d")
        assertEquals("d", vm.ui.value.currentId)
        assertEquals("d", vm.ui.value.snapshot?.body?.aircraftId)
        vm.refresh()
        assertEquals("d", vm.ui.value.currentId)
    }
}
