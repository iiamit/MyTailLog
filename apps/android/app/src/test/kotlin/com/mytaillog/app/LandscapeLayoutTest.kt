package com.mytaillog.app

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isSelectable
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipe
import androidx.compose.ui.unit.dp
import com.mytaillog.design.MyTailLogTheme
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w891dp-h411dp-land")
class LandscapeLayoutTest {
    @get:Rule val compose = createComposeRule()

    @Test fun shortWideWindowKeepsAllPhoneTabsReachable() {
        compose.setContent { MyTailLogTheme(dark = false) { Shell() } }
        compose.onNodeWithText("MyTailLog").assertDoesNotExist()
        for (label in listOf("Logbooks", "Maint.", "Aircraft", "Share", "Status")) {
            compose.onNode(hasText(label) and isSelectable()).assertIsDisplayed().performClick().assertIsSelected()
        }
    }

    @Test fun unzoomedScanAllowsItsPageToScroll() {
        lateinit var scroll: androidx.compose.foundation.ScrollState
        compose.setContent {
            scroll = rememberScrollState()
            MyTailLogTheme(dark = false) {
                Column(Modifier.height(200.dp).verticalScroll(scroll)) {
                    ScanViewer(Scan.Loading, "Scanned page", Modifier.fillMaxWidth().height(600.dp))
                }
            }
        }
        compose.onRoot().performTouchInput { swipe(Offset(150f, 180f), Offset(150f, 40f)) }
        compose.runOnIdle { assertTrue("The scan swallowed the page scroll", scroll.value > 0) }
    }
}
