package com.mytaillog.app

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.mytaillog.core.api.StatusApi
import com.mytaillog.design.MyTailLogTheme
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    /** An OAuth return or email link (05 §8.4) waiting for the sign-in screen. */
    private var authReturn by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val app = application as MyTailLogApp
        if (savedInstanceState == null) authReturn = intent?.data?.toString()
        setContent { MyTailLogTheme { AppRoot(app.account, app.statusApi, authReturn) { authReturn = null } } }
    }

    // singleTask: the Custom Tab redirect and App Links come back here instead of stacking a second activity.
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.data?.let { authReturn = it.toString() }
    }
}

@Composable
private fun AppRoot(account: Account, statusApi: StatusApi, authReturn: String?, onReturnHandled: () -> Unit) {
    // (loaded, signedIn): the cover shows until the stored session has been read.
    val state by remember { account.session.map { true to it } }
        .collectAsStateWithLifecycle(initialValue = false to null)
    val (loaded, session) = state
    val signedIn = session != null
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    // Refresh on every return to the foreground (05 §8.1); a spent refresh token signs out with a notice.
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(signedIn) { if (signedIn) lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) { account.accessToken() } }
    when {
        !loaded -> Box(Modifier.fillMaxSize().background(MyTailLogTheme.colors.cover))
        signedIn -> {
            LaunchedEffect(authReturn) { if (authReturn != null) onReturnHandled() } // already signed in: drop it
            // One Status model per signed-in user, so another account never sees the last one's aircraft.
            val user = session.user
            val model = viewModel(key = "status-${user.id}") {
                StatusViewModel({ statusApi.aircraft(user.id, user.email) }, statusApi::status)
            }
            val ui by model.ui.collectAsStateWithLifecycle()
            Shell(email = user.email, status = StatusHost(ui, model::refresh, model::select), onSignOut = {
                scope.launch {
                    account.signOut()
                    clearGoogleChoice(context)
                }
            })
        }
        else -> SignInScreen(account, authReturn, onReturnHandled)
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
