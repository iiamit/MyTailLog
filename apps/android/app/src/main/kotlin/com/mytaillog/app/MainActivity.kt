package com.mytaillog.app

import android.app.Activity
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mytaillog.design.MyTailLogTheme
import kotlinx.coroutines.flow.map

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val app = application as MyTailLogApp
        setContent { MyTailLogTheme { AppRoot(app) } }
    }
}

@Composable
private fun AppRoot(app: MyTailLogApp) {
    // (loaded, signedIn): the cover shows until the stored session has been read.
    val state by remember { app.sessions.session.map { true to (it != null) } }
        .collectAsStateWithLifecycle(initialValue = false to false)
    val (loaded, signedIn) = state
    when {
        !loaded -> Box(Modifier.fillMaxSize().background(MyTailLogTheme.colors.cover))
        signedIn -> Shell()
        else -> SignInScreen(app.auth, app.sessions::save)
    }
}

/** Status bar icons follow the board: dark on the yellow Logbooks board, light elsewhere (02 §9.1). */
@Composable
fun SystemBarIcons(darkStatusIcons: Boolean) {
    val view = LocalView.current
    if (view.isInEditMode) return
    SideEffect {
        val window = (view.context as? Activity)?.window ?: return@SideEffect
        WindowCompat.getInsetsController(window, view).apply {
            isAppearanceLightStatusBars = darkStatusIcons
            isAppearanceLightNavigationBars = false // the tab bar ground is always the dark cover
        }
    }
}
