package com.mytaillog.app

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.mytaillog.design.MyTailLogTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
class AddSheetTest {
    @get:Rule val compose = createComposeRule()

    private fun pick(label: String, destination: String) {
        var chosen = ""
        compose.setContent {
            MyTailLogTheme(dark = false) {
                AddSheet("N123AB", true, {},
                    onFlight = { chosen = "flight" }, onOil = { chosen = "oil" },
                    onSquawk = { chosen = "squawk" }, onScan = { chosen = "scan" },
                    onDocument = { chosen = "document" })
            }
        }
        compose.onNodeWithText(label).performClick()
        compose.runOnIdle { assertEquals(label, destination, chosen) }
    }

    @Test fun flightOpens() = pick("Log a flight", "flight")
    @Test fun oilOpens() = pick("Add oil", "oil")
    @Test fun squawkOpens() = pick("Report a squawk", "squawk")
    @Test fun scanOpens() = pick("Scan logbook pages", "scan")
    @Test fun documentOpens() = pick("Add a document", "document")

    @Test fun viewerCanReportOnly() {
        var chosen = false
        compose.setContent {
            MyTailLogTheme(dark = false) {
                AddSheet("N123AB", false, {}, onSquawk = { chosen = true })
            }
        }
        compose.onNodeWithText("Report a squawk").assertExists().performClick()
        compose.runOnIdle { assertEquals(true, chosen) }
        for (label in listOf("Log a flight", "Add oil", "Scan logbook pages", "Add a document"))
            compose.onNodeWithText(label).assertDoesNotExist()
    }
}
