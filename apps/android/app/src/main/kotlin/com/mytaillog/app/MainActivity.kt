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
        setContent { MyTailLogTheme { AppRoot(app, authReturn) { authReturn = null } } }
    }

    // singleTask: the Custom Tab redirect and App Links come back here instead of stacking a second activity.
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.data?.let { authReturn = it.toString() }
    }
}

@Composable
private fun AppRoot(app: MyTailLogApp, authReturn: String?, onReturnHandled: () -> Unit) {
    val account = app.account
    val statusApi = app.statusApi
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
            // The user's offline store (05 §6): sync on open and hourly, uploads whenever there is a network.
            val store = remember(user.id) { app.offline(user.id) }
            val capture = remember(store) { CaptureHost(store, app.captureApi, context.applicationContext) }
            LaunchedEffect(store) {
                SyncWorker.periodic(context)
                SyncWorker.now(context)
            }
            val cache = java.io.File(store.dir, "cache/snapshots")
            val model = viewModel(key = "status-${user.id}") {
                StatusViewModel(
                    { lastKnown(java.io.File(cache, "aircraft.json"), { statusApi.aircraft(user.id, user.email) }, ::encodeAircraft, ::decodeAircraft) },
                    { id -> lastKnown(java.io.File(cache, "status-$id.json"), { statusApi.status(id) }, ::encodeStatus, ::decodeStatus) },
                )
            }
            val ui by model.ui.collectAsStateWithLifecycle()
            val sync by store.sync.collectAsStateWithLifecycle()
            // After a sync lands, Status asks for the server's snapshot again (it replaces "On this phone" values).
            val openedAt = remember(store) { sync.lastSync }
            LaunchedEffect(sync.lastSync) { if (sync.lastSync != openedAt) model.refresh() }
            val onPhoneTach = remember(ui.currentId, sync.version) { ui.currentId?.let { lastTach(null, store, it) }?.takeIf { it.onPhone }?.value }
            val books = viewModel(key = "books-${user.id}") {
                BooksViewModel(
                    app.booksApi::load, app.syncApi::push, app.booksApi::evidence, app.booksApi::pageImage,
                    queue = { queueBookWrites(store, it); capture.kick() },
                    unqueue = { ids -> ids.forEach(store::discard) },
                )
            }
            // Logbooks follows the aircraft Status has open (one switcher, 06 §1.3).
            LaunchedEffect(ui.current) { books.show(ui.current) }
            Shell(email = user.email, status = StatusHost(ui, model::refresh, model::select, onPhoneTach), books = books, capture = capture, records = app.recordsApi, onSignOut = {
                scope.launch {
                    account.signOut()
                    app.forget(user.id)
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
