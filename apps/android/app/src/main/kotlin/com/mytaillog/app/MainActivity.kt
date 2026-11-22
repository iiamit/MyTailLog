package com.mytaillog.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.KeyEvent
import android.view.KeyboardShortcutGroup
import android.view.KeyboardShortcutInfo
import android.view.Menu
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.withContext
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
import androidx.compose.runtime.produceState
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

    /** A notification, widget, shortcut or App Action link (05 §5.5) waiting for the shell. */
    private var link by mutableStateOf<AppLink?>(null)

    /** Hardware keyboard commands (06 M-SYS-08). */
    private val keys = MutableSharedFlow<KeyCommand>(extraBufferCapacity = 4)

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val app = application as MyTailLogApp
        if (savedInstanceState == null) take(intent)
        setContent { MyTailLogTheme { AppRoot(app, authReturn, { authReturn = null }, link, { link = null }, keys) } }
    }

    // singleTask: the Custom Tab redirect and App Links come back here instead of stacking a second activity.
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        take(intent)
    }

    private fun take(intent: Intent?) {
        val data = intent?.data?.toString()
        val l = linkFromIntent(data, intent?.getStringExtra(EXTRA_DEEP_LINK), intent?.getStringExtra(EXTRA_FEATURE))
        if (l != null) link = l else data?.let { authReturn = it }
    }

    // Activity's public event hook; AndroidX marks its inherited implementation library-only.
    @android.annotation.SuppressLint("RestrictedApi")
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (super.dispatchKeyEvent(event)) return true
        if (event.action != KeyEvent.ACTION_DOWN || event.repeatCount > 0) return false
        val k = keyCommand(event.keyCode, event.isCtrlPressed, event.isShiftPressed) ?: return false
        if (k == KeyCommand.Back) onBackPressedDispatcher.onBackPressed() else keys.tryEmit(k)
        return true
    }

    /** Meta + / lists these (06 M-SYS-08 acceptance: every shortcut appears in the system list). */
    override fun onProvideKeyboardShortcuts(data: MutableList<KeyboardShortcutGroup>, menu: Menu?, deviceId: Int) {
        super.onProvideKeyboardShortcuts(data, menu, deviceId)
        val ctrl = KeyEvent.META_CTRL_ON
        val items = TabletSections.mapIndexed { i, d -> KeyboardShortcutInfo(getString(d.title), KeyEvent.KEYCODE_1 + i, ctrl) } + listOf(
            KeyboardShortcutInfo(getString(R.string.shortcut_flight), KeyEvent.KEYCODE_F, ctrl or KeyEvent.META_SHIFT_ON),
            KeyboardShortcutInfo(getString(R.string.keys_sync), KeyEvent.KEYCODE_R, ctrl),
            KeyboardShortcutInfo(getString(R.string.settings_title), KeyEvent.KEYCODE_COMMA, ctrl),
            KeyboardShortcutInfo(getString(R.string.keys_back), KeyEvent.KEYCODE_LEFT_BRACKET, ctrl),
            KeyboardShortcutInfo(getString(R.string.keys_back), KeyEvent.KEYCODE_ESCAPE, 0),
        )
        data.add(KeyboardShortcutGroup(getString(R.string.keys_group), items))
    }
}

/** A launcher shortcut per recently opened aircraft, ranked by the system (05 §13.3). */
private fun pushAircraftShortcut(context: Context, id: String, tail: String) {
    val s = ShortcutInfoCompat.Builder(context, "aircraft-$id")
        .setShortLabel(context.getString(R.string.shortcut_aircraft_status, tail))
        .setIcon(IconCompat.createWithResource(context, R.drawable.ic_shortcut_due))
        .setIntent(Intent(Intent.ACTION_VIEW, Uri.parse(appLink(id)), context, MainActivity::class.java))
        .build()
    runCatching { ShortcutManagerCompat.pushDynamicShortcut(context, s) }
}

@Composable
private fun AppRoot(
    app: MyTailLogApp,
    authReturn: String?,
    onReturnHandled: () -> Unit,
    link: AppLink? = null,
    onLinkHandled: () -> Unit = {},
    keys: Flow<KeyCommand>? = null,
) {
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
            val opened by produceState<OfflineStore?>(initialValue = null, user.id) { value = app.offline(user.id) }
            val store = opened ?: return
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
            // Pages scanned on this phone reach Logbooks once their sync lands, not only on pull to refresh.
            LaunchedEffect(sync.lastSync) { if (sync.lastSync != openedAt) books.refresh() }
            // This device gets reminders once signed in; the permission is asked in Reminders, not at launch (05 §10.2).
            LaunchedEffect(user.id) { Push.register(context.applicationContext, app.notifyApi) }
            // Widgets and the launcher's aircraft shortcut follow the aircraft Status has open (05 §11.2, §13.3).
            LaunchedEffect(ui.current, ui.snapshot) {
                val a = ui.current?.aircraft ?: return@LaunchedEffect
                val snap = ui.snapshot?.takeIf { it.body.aircraftId == a.id } ?: return@LaunchedEffect
                withContext(Dispatchers.IO) { WidgetData.save(context, a.tailNumber, snap) }
                refreshWidgets(context.applicationContext)
                pushAircraftShortcut(context, a.id, a.tailNumber)
            }
            Shell(email = user.email, status = StatusHost(ui, model::refresh, model::select, onPhoneTach), books = books, capture = capture, records = app.recordsApi,
                notify = app.notifyApi, link = link, onLinkHandled = onLinkHandled, keys = keys, onSignOut = {
                scope.launch {
                    Push.unregister(context.applicationContext, app.notifyApi) // with the session, before it goes (05 §8.6)
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
