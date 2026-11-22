package com.mytaillog.app

import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.unit.dp
import org.junit.Assert.assertTrue
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.mytaillog.core.api.AircraftAccess
import com.mytaillog.core.api.AircraftRole
import com.mytaillog.core.api.AircraftSummary
import com.mytaillog.core.api.GapEvidence
import com.mytaillog.core.domain.Mutation
import com.mytaillog.core.domain.PushResult
import com.mytaillog.design.MyTailLogTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
class BooksScreenTest {
    @get:Rule val compose = createComposeRule()

    private val pushed = mutableListOf<Mutation>()
    private fun model(role: AircraftRole) = BooksViewModel(
        load = { sampleBooks() },
        push = { ms -> pushed += ms; ms.map { PushResult(it.id, PushResult.Status.Ok) } },
        loadEvidence = { _, _ -> GapEvidence(emptyList(), verdict = "The other books show 0 entries in those years.") },
        loadImage = { _, _ -> error("offline") },
    ).apply { show(AircraftAccess(AircraftSummary("b6f4", "N734DM", "me"), role)) }

    @Test
    fun theMapHasItsListEquivalentAndEveryStopIsATalkBackNode() {
        compose.setContent { MyTailLogTheme(dark = false) { PhoneShell(books = model(AircraftRole.Viewer)) } }
        compose.onNodeWithText("Logbooks").performClick()
        compose.onNodeWithText("Review 2").assertExists()
        compose.onNode(hasContentDescription("Replaced landing light, Mar 2, 2026, Airframe, read by AI", substring = true)).assertExists()
        compose.onNodeWithText("Show as list").performClick()
        compose.onNode(hasText("2026  ", substring = true)).assertExists() // the year group header
        compose.onAllNodesWithText("Replaced landing light").fetchSemanticsNodes().let { assertEquals(1, it.size) }
    }

    @Test
    fun anEditorConfirmsAPageOnlyAfterEveryDoubtHasAnOutcome() {
        val vm = model(AircraftRole.Owner)
        compose.setContent { MyTailLogTheme(dark = false) { PhoneShell(books = vm) } }
        compose.onNodeWithText("Logbooks").performClick()
        compose.onNodeWithText("Review 2").performClick()
        compose.onNodeWithText("Airframe p. 6").performClick()
        compose.onNodeWithText("1 of 2 to check").assertExists()
        compose.onNodeWithText("Confirm page and next").assertIsNotEnabled()
        // The least certain field is first; tapping it opens the three outcomes.
        compose.onNode(hasContentDescription("Date, 2026-03-02, read with doubt")).performClick()
        compose.onNodeWithText("Not on this page").assertExists()
        compose.onNodeWithText("Looks right").performClick()
        // The next doubtful field (entry 2's tach) is selected for us.
        compose.onNodeWithText("Entry 2 of 2 · Annual inspection").assertExists()
        compose.onNodeWithText("Looks right").performClick()
        compose.onNodeWithText("Confirm page and next").assertIsEnabled().performClick()
        compose.waitUntil(3000) { pushed.isNotEmpty() }
        assertEquals("page.review", pushed.last().type)
        assertEquals(entriesOn(sampleBooks(), pushed.last().payload["pageId"].toString().trim('"')).count { it.trust == "ai_read" } + 1, pushed.size)
        compose.onNodeWithText("2 of 2 to check").assertExists()
        compose.onNode(hasText("confirmed", substring = true) and hasText("Airframe p. 6", substring = true)).assertExists()
    }

    @Test
    fun aViewerSeesTheDrawerWithoutOutcomes() {
        compose.setContent { MyTailLogTheme(dark = false) { ReviewScreen(model(AircraftRole.Viewer), null, BooksNav()) } }
        compose.onNodeWithText("You can view this page. The owner confirms entries.").assertExists()
        compose.onNodeWithText("Confirm page and next").assertDoesNotExist()
    }
    @Test
    @Config(qualifiers = "w891dp-h411dp-land")
    fun landscapeScanFitsTheAvailableHeight() {
        val b = sampleBooks()
        val page = b.pages.first()
        compose.setContent { MyTailLogTheme(dark = false) { PageScreen(model(AircraftRole.Owner), page.id, BooksNav()) } }
        val bounds = compose.onNodeWithContentDescription(pageLabel(b, page.id)!!).getUnclippedBoundsInRoot()
        assertTrue("The page image is taller than the landscape viewport", bounds.height < 411.dp)
    }

}
