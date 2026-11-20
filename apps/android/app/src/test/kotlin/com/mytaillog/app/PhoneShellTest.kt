package com.mytaillog.app

import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isSelectable
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.navigation.NavHostController
import androidx.navigation.compose.rememberNavController
import com.mytaillog.design.MyTailLogTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
class PhoneShellTest {
    @get:Rule val compose = createComposeRule()

    private val documentsEmpty = "Keep registration, airworthiness certificate, POH, insurance and W&B here."

    // Board titles repeat the tab labels; tabs are the selectable ones.
    private fun tab(label: String) = compose.onNode(hasText(label) and isSelectable())

    @Test
    fun eachTabKeepsItsOwnBackStack() {
        compose.setContent { MyTailLogTheme(dark = false) { Shell() } }
        compose.onNodeWithText("Nothing to show yet. Status fills in as your logbooks are read and confirmed.").assertExists()
        tab("Status").assertIsSelected()

        // Aircraft → Documents, away to Share, back to Aircraft: Documents is still open.
        tab("Aircraft").performClick()
        compose.onNodeWithText("Documents").performClick()
        compose.onNodeWithText(documentsEmpty).assertExists()
        tab("Share").performClick()
        tab("Share").assertIsSelected()
        tab("Aircraft").performClick()
        compose.onNodeWithText(documentsEmpty).assertExists()

        // Re-selecting the open tab pops it to its root.
        tab("Aircraft").performClick()
        compose.onNodeWithText(documentsEmpty).assertDoesNotExist()
    }

    @Test
    fun anotherTabsScreenOpensOnThatTabAndEveryTabStillSwitches() {
        lateinit var nav: NavHostController
        compose.setContent { MyTailLogTheme(dark = false) { nav = rememberNavController(); PhoneShell(nav = nav) } }

        // From Share, a screen that belongs to Aircraft (as the Add sheet opens Logbooks' scan queue from any tab).
        tab("Share").performClick()
        compose.runOnIdle { nav.openOnItsTab(DOCUMENTS_ON_PHONE) }
        tab("Aircraft").assertIsSelected()
        compose.onNodeWithText(documentsEmpty).assertExists()

        // Away and back: Share is at its own root, Aircraft still holds Documents.
        tab("Share").performClick()
        tab("Share").assertIsSelected()
        compose.onNodeWithText(documentsEmpty).assertDoesNotExist()
        tab("Aircraft").performClick()
        compose.onNodeWithText(documentsEmpty).assertExists()

        // Opening it again from Status lands on the same Aircraft stack, once, and Status is untouched.
        tab("Status").performClick()
        compose.runOnIdle { nav.openOnItsTab(DOCUMENTS_ON_PHONE) }
        tab("Aircraft").assertIsSelected()
        tab("Aircraft").performClick() // re-selecting pops to its root
        compose.onNodeWithText(documentsEmpty).assertDoesNotExist()
        tab("Status").performClick()
        tab("Status").assertIsSelected()
    }
}
