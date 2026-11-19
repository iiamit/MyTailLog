package com.mytaillog.app

import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasScrollToNodeAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import com.mytaillog.core.api.AircraftAccess
import com.mytaillog.core.api.AircraftRole
import com.mytaillog.core.api.AircraftSummary
import com.mytaillog.design.MyTailLogTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
class StatusScreenTest {
    @get:Rule val compose = createComposeRule()

    private val demo = AircraftAccess(AircraftSummary("d", "N734DM", "x", isDemo = true), AircraftRole.Viewer)
    private fun host(ui: StatusUi) = StatusHost(ui, refresh = {}, select = {})

    @Test
    fun homeShowsTheVerdictRowsAndTheViewerLine() {
        val ui = StatusUi(listOf(demo), "d", sampleSnapshot(), loading = false)
        compose.setContent { MyTailLogTheme(dark = false) { Shell(status = host(ui)) } }
        compose.onNodeWithText("3 items are overdue.").assertExists()
        compose.onNodeWithText("N734DM").assertExists()
        compose.onNode(hasContentDescription("Status, 3 overdue", substring = true) or hasContentDescription("3 overdue")).assertExists()
        val list = compose.onNode(hasScrollToNodeAction())
        list.performScrollToNode(hasText("See all 7 items"))
        list.performScrollToNode(hasText("This is the demo aircraft. Add your own from the hangar."))
    }

    @Test
    fun aRowOpensItemDetailAndSeeAllListsEverything() {
        val ui = StatusUi(listOf(demo), "d", sampleSnapshot(), loading = false)
        compose.setContent { MyTailLogTheme(dark = false) { Shell(status = host(ui)) } }
        compose.onNode(hasContentDescription("Annual, overdue, lapsed", substring = true)).performClick()
        compose.onNodeWithText("The page that says so").assertExists()
        compose.onNodeWithText("end of July 2026 (Jul 31) · lapsed 110 days ago").assertExists()
        compose.onNodeWithText("Close").performClick()
        compose.waitForIdle()
        compose.onNode(hasScrollToNodeAction()).performScrollToNode(hasText("See all 7 items"))
        compose.onNodeWithText("See all 7 items").performClick()
        compose.onNodeWithText("All 7 items").assertExists()
        compose.onNode(hasScrollToNodeAction()).performScrollToNode(hasContentDescription("Engine overhaul", substring = true))
    }

    @Test
    fun errorAndEmptyStates() {
        compose.setContent { MyTailLogTheme(dark = false) { Shell(status = host(StatusUi(loading = false, failed = true))) } }
        compose.onNodeWithText("We could not work out what is due right now.").assertExists()
        compose.onNodeWithText("Retry").assertExists()
    }
}
