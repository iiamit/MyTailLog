package com.mytaillog.app

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.TextButton
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.adaptive.ExperimentalMaterial3AdaptiveApi
import androidx.compose.material3.adaptive.layout.AnimatedPane
import androidx.compose.material3.adaptive.layout.ListDetailPaneScaffold
import androidx.compose.material3.adaptive.navigation.rememberListDetailPaneScaffoldNavigator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mytaillog.design.AddButton
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navigation
import com.mytaillog.design.MyTailLogTheme
import com.mytaillog.design.PhoneHeader
import com.mytaillog.design.PhoneLeaf
import com.mytaillog.design.PhoneRow
import com.mytaillog.design.PhoneTabBar
import com.mytaillog.design.Rail
import com.mytaillog.design.Section
import com.mytaillog.design.TabItem
import com.mytaillog.design.section

/** Signed in: the phone binder below 700dp, the rail and list-detail at 700dp and wider. */
@Composable
fun Shell(email: String? = null, onSignOut: () -> Unit = {}, status: StatusHost? = null, books: BooksViewModel? = null, capture: CaptureHost? = null) {
    val unsent = capture?.store?.sync?.collectAsStateWithLifecycle()?.value?.let { it.waiting + it.pages } ?: 0
    val account: @Composable () -> Unit = { AccountSettings(email, onSignOut, unsent) }
    BoxWithConstraints(Modifier.fillMaxSize()) {
        if (isTablet(maxWidth.value.toInt())) TabletShell(account, status, books) else PhoneShell(account = account, status = status, books = books, capture = capture)
    }
}

/**
 * The account part of Settings (06 M-SYS-02) until that screen lands: who is signed in and
 * **Sign out** in alarm text, confirmed first (05 §8.6), naming what hasn't uploaded: sign-out deletes this phone's copy.
 */
@Composable
fun AccountSettings(email: String?, onSignOut: () -> Unit, unsent: Long = 0) {
    val colors = MyTailLogTheme.colors
    var confirming by rememberSaveable { mutableStateOf(false) }
    Column {
        email?.let { Text(stringResource(R.string.settings_signed_in_as, it), color = colors.ink, style = MaterialTheme.typography.bodyLarge) }
        TextButton(
            onClick = { confirming = true },
            colors = ButtonDefaults.textButtonColors(contentColor = colors.alarmText),
            contentPadding = PaddingValues(0.dp),
            modifier = Modifier.heightIn(min = 48.dp),
        ) { Text(stringResource(R.string.sign_out), style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight(700))) }
    }
    if (confirming) {
        AlertDialog(
            onDismissRequest = { confirming = false },
            title = { Text(stringResource(R.string.sign_out_title)) },
            text = { Text(if (unsent > 0) pluralStringResource(R.plurals.sign_out_unsent, unsent.toInt(), unsent.toInt()) else stringResource(R.string.sign_out_body)) },
            confirmButton = {
                TextButton(onClick = { confirming = false; onSignOut() }, colors = ButtonDefaults.textButtonColors(contentColor = colors.alarmText)) {
                    Text(stringResource(R.string.sign_out))
                }
            },
            dismissButton = {
                TextButton(onClick = { confirming = false }, colors = ButtonDefaults.textButtonColors(contentColor = colors.ink)) {
                    Text(stringResource(R.string.cancel))
                }
            },
            containerColor = colors.leaf,
            titleContentColor = colors.ink,
            textContentColor = colors.ink,
        )
    }
}

/**
 * One Scaffold with D's PhoneTabBar as bottomBar and one back stack per tab (05 §5.3):
 * switching tabs saves and restores each tab's stack; re-selecting the open tab pops it to its root.
 */
@Composable
fun PhoneShell(nav: NavHostController = rememberNavController(), account: @Composable () -> Unit = {}, status: StatusHost? = null, books: BooksViewModel? = null, capture: CaptureHost? = null) {
    val entry by nav.currentBackStackEntryAsState()
    val hierarchy = entry?.destination?.hierarchy
    val current = PhoneTabs.indexOfFirst { tab -> hierarchy?.any { it.route == tab.graph } == true }.coerceAtLeast(0)
    val visible = if (entry?.destination?.route == DOCUMENTS_ON_PHONE) Section.Docs else PhoneTabs[current].section
    // Review and the cameras are full-screen covers: dark, no tab bar (06 §1.2).
    val route = entry?.destination?.route
    val cover = route?.startsWith(BOOKS_REVIEW) == true || route == SCAN_CAMERA || route == TACH_CAMERA
    val aircraft = status?.ui?.current
    var adding by rememberSaveable { mutableStateOf(false) }
    var scanning by rememberSaveable { mutableStateOf(false) }
    val atRoot = route == Destination.Status.root || route == Destination.Logbooks.root
    val captureNav = capture?.let { h ->
        CaptureNav(h, openSync = { nav.navigate("${PhoneTabs[current].graph}/$SYNC") }, openQueue = { nav.navigate(SCAN_QUEUE) })
    }
    SystemBarIcons(darkStatusIcons = visible == Section.Books && !cover)

    androidx.compose.runtime.CompositionLocalProvider(LocalCaptureNav provides captureNav) {
    Scaffold(
        containerColor = MyTailLogTheme.colors.section(visible).board,
        floatingActionButton = {
            // Add (02 §9.8) on the Status and Logbooks homes; never for viewers (07 B-VIEWER).
            if (capture != null && atRoot && aircraft?.canEdit == true) AddButton({ adding = true })
        },
        contentWindowInsets = WindowInsets(0),
        bottomBar = {
            if (!cover) PhoneTabBar(
                items = PhoneTabs.map { tab ->
                    // 06 §1.3: Status carries an alarm badge with the overdue count.
                    val overdue = if (tab == Destination.Status) status?.ui?.snapshot?.body?.counts?.overdue ?: 0 else 0
                    TabItem(tab.section, stringResource(tab.tabLabel), tab.icon, overdue, pluralStringResource(R.plurals.status_tab_overdue, overdue, overdue))
                },
                selected = current,
                onSelect = { i -> nav.selectTab(PhoneTabs[i], reselect = i == current) },
            )
        },
    ) { padding ->
        NavHost(nav, startDestination = PhoneTabs.first().graph, modifier = Modifier.padding(padding)) {
            PhoneTabs.forEach { tab ->
                navigation(startDestination = tab.root, route = tab.graph) {
                    composable(tab.root) {
                        if (tab == Destination.Status && status != null) {
                            StatusPhone(status, onSeeAll = { nav.navigate(STATUS_ALL_ITEMS) }, onReview = { nav.selectTab(Destination.Logbooks, reselect = false) })
                            return@composable
                        }
                        if (tab == Destination.Logbooks && books != null) {
                            BooksPhone(books, booksNav(nav))
                            return@composable
                        }
                        SectionScreen(tab) {
                            if (tab == Destination.Aircraft) {
                                PhoneRow(stringResource(R.string.section_docs), onClick = { nav.navigate(DOCUMENTS_ON_PHONE) })
                                PhoneRow(stringResource(R.string.settings_title), onClick = { nav.navigate(SETTINGS_ON_PHONE) })
                            }
                        }
                    }
                    if (tab == Destination.Status && status != null) {
                        composable(STATUS_ALL_ITEMS) { AllItemsPhone(status, onBack = { nav.popBackStack() }) }
                    }
                    if (tab == Destination.Logbooks && books != null) booksRoutes(nav, books)
                    if (capture != null) {
                        val up: () -> Unit = { nav.popBackStack() }
                        composable("${tab.graph}/$SYNC") { WaitingScreen(capture, tab.section, stringResource(tab.title), up) }
                        if (tab == Destination.Logbooks) {
                            composable(SCAN_CAMERA) {
                                val t = capture.target
                                if (t == null) { LaunchedEffect(Unit) { up() }; return@composable }
                                ScanCameraScreen(
                                    capture, t,
                                    onDone = { nav.navigate(SCAN_QUEUE) { popUpTo(SCAN_CAMERA) { inclusive = true } } },
                                    onCancel = up,
                                    onSystemScanner = { up(); scanning = true },
                                    onPhotos = { up(); scanning = true },
                                )
                            }
                            composable(SCAN_QUEUE) {
                                aircraft?.let { a -> ScanQueueScreen(capture, a, onBack = up, onReview = { nav.navigate(BOOKS_REVIEW) }) }
                            }
                        }
                        if (tab == Destination.Status) composable(TACH_CAMERA) {
                            aircraft?.let { a -> TachScreen(capture, a, lastTach(status, capture.store, a.aircraft.id), onClose = up) }
                        }
                    }
                    if (tab == Destination.Aircraft) {
                        composable(DOCUMENTS_ON_PHONE) {
                            val up: () -> Unit = { nav.popBackStack() }
                            SectionScreen(Destination.Documents, back = stringResource(R.string.section_aircraft) to up)
                        }
                        composable(SETTINGS_ON_PHONE) {
                            val up: () -> Unit = { nav.popBackStack() }
                            val colors = MyTailLogTheme.colors
                            Column(Modifier.fillMaxSize().background(colors.section(Section.Aircraft).board)) {
                                PhoneHeader(stringResource(R.string.settings_title), Section.Aircraft, back = stringResource(R.string.section_aircraft) to up)
                                PhoneLeaf { account() }
                            }
                        }
                    }
                }
            }
        }
    }
    if (capture != null && aircraft != null) {
        if (adding) AddSheet(
            onScan = { scanning = true },
            onFlight = { nav.navigate(TACH_CAMERA) },
            onDismiss = { adding = false },
        )
        if (scanning) ScanSetupSheet(
            capture, aircraft, remember(aircraft.aircraft.id) { scanBooks(capture.store, aircraft.aircraft.id, books?.ui?.value?.books?.logbooks) },
            onCamera = { capture.target = it; nav.navigate(SCAN_CAMERA) },
            onImported = { nav.navigate(SCAN_QUEUE) },
            onDismiss = { scanning = false },
        )
    }
    }
}

const val SCAN_CAMERA = "logbooks/camera"
const val SCAN_QUEUE = "logbooks/queue"
const val TACH_CAMERA = "status/tach"
const val SYNC = "sync"

/** The last tach the phone knows (05 §16 plausibility): the snapshot's meter, or a newer reading saved here. */
fun lastTach(status: StatusHost?, store: OfflineStore, aircraftId: String): LastTach {
    val m = status?.ui?.snapshot?.body?.takeIf { it.aircraftId == aircraftId }?.meters?.get("tach")
    val server = m?.face ?: m?.stitched
    val local = store.localTach(aircraftId)
    return if (local != null && (server == null || local > server)) LastTach(local, java.time.LocalDate.now().toString(), onPhone = true) else LastTach(server, m?.asOf)
}

fun NavHostController.selectTab(tab: Destination, reselect: Boolean) {
    if (reselect) {
        popBackStack(tab.root, inclusive = false)
        return
    }
    navigate(tab.graph) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}

/** A top-level or pushed phone screen: PhoneHeader in the section colour over an empty PhoneLeaf. */
@Composable
private fun SectionScreen(
    destination: Destination,
    back: Pair<String, () -> Unit>? = null,
    rows: @Composable () -> Unit = {},
) {
    val colors = MyTailLogTheme.colors
    Column(Modifier.fillMaxSize().background(colors.section(destination.section).board)) {
        PhoneHeader(stringResource(destination.title), destination.section, back = back)
        PhoneLeaf {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                rows()
                if (destination != Destination.Aircraft) EmptyText(destination)
            }
        }
    }
}

@Composable
private fun EmptyText(destination: Destination) {
    Text(stringResource(destination.empty), color = MyTailLogTheme.colors.ink, style = MaterialTheme.typography.bodyLarge)
}

/** Tablet: the binder Rail beside the board, which holds a list-detail scaffold of leaves (05 §5.4). */
@OptIn(ExperimentalMaterial3AdaptiveApi::class)
@Composable
fun TabletShell(account: @Composable () -> Unit = {}, status: StatusHost? = null, books: BooksViewModel? = null) {
    var selected by rememberSaveable { mutableIntStateOf(0) }
    val destination = TabletSections[selected]
    val colors = MyTailLogTheme.colors
    val s = colors.section(destination.section)
    SystemBarIcons(darkStatusIcons = false) // the status bar sits over the dark rail on the left
    Row(Modifier.fillMaxSize().background(colors.cover)) {
        Rail(
            items = TabletSections.map { TabItem(it.section, stringResource(it.title), it.icon) },
            selected = selected,
            onSelect = { selected = it },
        )
        Column(
            Modifier
                .weight(1f)
                .fillMaxHeight()
                .background(s.board)
                .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.End + WindowInsetsSides.Bottom)),
        ) {
            Text(
                stringResource(destination.title),
                color = s.onBoard,
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.padding(start = 22.dp, top = 20.dp, bottom = 14.dp).semantics { heading() },
            )
            if (destination == Destination.Logbooks && books != null) {
                Box(Modifier.padding(start = 22.dp, end = 22.dp, bottom = 22.dp)) { TabletBooks(books) }
                return@Column
            }
            val navigator = rememberListDetailPaneScaffoldNavigator<Nothing>()
            var selectedItem by rememberSaveable { mutableStateOf<String?>(null) }
            val statusHere = status.takeIf { destination == Destination.Status }
            ListDetailPaneScaffold(
                directive = navigator.scaffoldDirective,
                value = navigator.scaffoldValue,
                listPane = {
                    AnimatedPane {
                        TabletLeaf {
                            // Settings lives in the RailFoot's Account (06 §9) once that lands; until then, under Aircraft.
                            when {
                                statusHere != null -> StatusTabletList(statusHere, selectedItem) { selectedItem = it }
                                destination == Destination.Aircraft -> account()
                                else -> EmptyText(destination)
                            }
                        }
                    }
                },
                detailPane = { AnimatedPane { TabletLeaf { statusHere?.let { StatusTabletDetail(it, selectedItem) } } } },
                modifier = Modifier.padding(start = 22.dp, end = 22.dp, bottom = 22.dp),
            )
        }
    }
}

@Composable
private fun TabletLeaf(content: @Composable () -> Unit) {
    Box(
        Modifier
            .fillMaxSize()
            .clip(RoundedCornerShape(3.dp))
            .background(MyTailLogTheme.colors.leaf)
            .padding(horizontal = 30.dp, vertical = 26.dp),
    ) { content() }
}
