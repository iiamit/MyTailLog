package com.mytaillog.app

import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isSelectable
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
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
}
