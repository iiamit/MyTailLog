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
import androidx.compose.ui.Alignment
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
import com.mytaillog.design.SubTabs
import com.mytaillog.design.TabItem
import com.mytaillog.design.section
import kotlinx.coroutines.launch

/** Signed in: the phone binder below 700dp, the rail and list-detail at 700dp and wider. */
@Composable
fun Shell(
    email: String? = null,
    onSignOut: () -> Unit = {},
    status: StatusHost? = null,
    books: BooksViewModel? = null,
    capture: CaptureHost? = null,
    records: RecordsApi? = null,
    notify: NotifyApi? = null,
    link: AppLink? = null,
    onLinkHandled: () -> Unit = {},
    keys: kotlinx.coroutines.flow.Flow<KeyCommand>? = null,
) {
    val unsent = capture?.store?.sync?.collectAsStateWithLifecycle()?.value?.let { it.waiting + it.pages } ?: 0
    val account: @Composable () -> Unit = { AccountSettings(email, onSignOut, unsent) }
    val context = androidx.compose.ui.platform.LocalContext.current
    val aircraft = status?.ui?.current
    val snapshot = status?.ui?.snapshot?.body?.takeIf { it.aircraftId == aircraft?.aircraft?.id }
    // Phase 4's screens: one host per aircraft and snapshot, its toast kept across navigation.
    val recs = remember(capture, records, aircraft, snapshot) {
        if (capture != null && records != null && aircraft != null) Recs(capture.store, records, aircraft, snapshot, capture::kick, context::getString) else null
    }
    // A link (notification, widget, shortcut, App Action) or a keyboard command becomes a landing (05 §5.5).
    var go by remember { mutableStateOf<Landing?>(null) }
    val known = status?.ui?.aircraft.orEmpty()
    // Wait for the linked aircraft to be open, so its screens exist; an aircraft not on this account opens the current one.
    val ready = aircraft != null && (link?.aircraftId == null || link.aircraftId == aircraft.aircraft.id || known.none { it.aircraft.id == link.aircraftId })
    LaunchedEffect(link?.aircraftId, known) { link?.aircraftId?.takeIf { id -> known.any { it.aircraft.id == id } }?.let { status?.select?.invoke(it) } }
    LaunchedEffect(link, ready) {
        if (link != null && ready) { go = landing(link); onLinkHandled() }
    }
    LaunchedEffect(keys) {
        keys?.collect { k ->
            when (k) {
                is KeyCommand.Section -> go = Landing(TabletSections[k.index])
                KeyCommand.LogFlight -> go = landing(AppLink(null, LinkTarget.Flight))
                KeyCommand.Settings -> go = landing(AppLink(null, LinkTarget.Settings))
                KeyCommand.Sync -> { capture?.kick(); status?.refresh?.invoke() }
                KeyCommand.Back -> Unit // the activity sends it to the back dispatcher
            }
        }
    }
    // An inbox row's deep link: the same route table, in place.
    val open: (String?) -> Unit = { raw -> parseAppLink(raw)?.let { l -> l.aircraftId?.let { id -> status?.select?.invoke(id) }; go = landing(l) } }
    BoxWithConstraints(Modifier.fillMaxSize()) {
        if (isTablet(maxWidth.value.toInt(), maxHeight.value.toInt())) TabletShell(account, status, books, recs, go, { go = null }, notify, open)
        else PhoneShell(compactHeight = maxHeight < 480.dp, account = account, status = status, books = books, capture = capture, recs = recs, go = go, onGone = { go = null }, notify = notify, open = open)
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
fun PhoneShell(
    nav: NavHostController = rememberNavController(),
    account: @Composable () -> Unit = {},
    status: StatusHost? = null,
    books: BooksViewModel? = null,
    capture: CaptureHost? = null,
    recs: Recs? = null,
    go: Landing? = null,
    onGone: () -> Unit = {},
    notify: NotifyApi? = null,
    open: (String?) -> Unit = {},
    compactHeight: Boolean = false,
) {
    val entry by nav.currentBackStackEntryAsState()
    val hierarchy = entry?.destination?.hierarchy
    val current = PhoneTabs.indexOfFirst { tab -> hierarchy?.any { it.route == tab.graph } == true }.coerceAtLeast(0)
    val visible = if (entry?.destination?.route == DOCUMENTS_ON_PHONE) Section.Docs else PhoneTabs[current].section
    // Review and the cameras are full-screen covers: dark, no tab bar (06 §1.2).
    val route = entry?.destination?.route
    val cover = route?.startsWith(BOOKS_REVIEW) == true || route == SCAN_CAMERA || route == TACH_CAMERA || route == Routes.NEW_SQUAWK
    val aircraft = status?.ui?.current
    var adding by rememberSaveable { mutableStateOf(false) }
    var scanning by rememberSaveable { mutableStateOf(false) }
    var oiling by rememberSaveable { mutableStateOf(false) }
    var documenting by rememberSaveable { mutableStateOf(false) }
    var maintView by rememberSaveable { mutableStateOf<MaintView?>(null) }
    val atRoot = route in PhoneTabs.filter { it != Destination.Share }.map { it.root }
    val recNav = remember(nav) { RecNav(open = { nav.navigate(it) }, back = { nav.popBackStack() }) }
    val booksNow = books?.ui?.collectAsStateWithLifecycle()?.value?.books
    val captureNav = capture?.let { h ->
        CaptureNav(h, openSync = { nav.navigate("${PhoneTabs[current].graph}/$SYNC") }, openQueue = { nav.openOnItsTab(SCAN_QUEUE) })
    }
    SystemBarIcons(darkStatusIcons = visible == Section.Books && !cover && !compactHeight)
    // A link or a key: the tab (Documents lives under Aircraft here), then the screen pushed on it.
    LaunchedEffect(go, recs != null) {
        val l = go ?: return@LaunchedEffect
        if (recs == null && l.route != null) return@LaunchedEffect // its screens exist once the aircraft is open
        val (tab, pushed) = if (l.section == Destination.Documents) Destination.Aircraft to (l.route ?: DOCUMENTS_ON_PHONE) else l.section to l.route
        nav.selectTab(tab, reselect = false)
        nav.popBackStack(tab.root, inclusive = false)
        when (pushed) {
            null -> Unit
            SCAN_SHEET -> scanning = true
            else -> runCatching { nav.navigate(pushed) }
        }
        onGone()
    }

    androidx.compose.runtime.CompositionLocalProvider(LocalCaptureNav provides captureNav, LocalRecNav provides recNav) {
    Row(Modifier.fillMaxSize()) {
    if (compactHeight && !cover) Rail(
        items = PhoneTabs.map { TabItem(it.section, stringResource(it.tabLabel), it.icon) },
        selected = current,
        onSelect = { i -> nav.selectTab(PhoneTabs[i], reselect = i == current) },
        compact = true,
    )
    Scaffold(
        modifier = Modifier.weight(1f).let {
            if (compactHeight) it.windowInsetsPadding(WindowInsets.safeDrawing.only((if (cover) WindowInsetsSides.Horizontal else WindowInsetsSides.End) + WindowInsetsSides.Bottom)) else it
        },
        containerColor = MyTailLogTheme.colors.section(visible).board,
        floatingActionButton = {
            // Add (02 §9.8) on the top-level screens; viewers get it for "Report a squawk" only (06 §1.5).
            // On Maint.'s Squawks view it opens the new squawk directly (M-MAINT-05).
            if (capture != null && atRoot && aircraft != null) AddButton({
                if (route == Destination.Maintenance.root && maintView == MaintView.Squawks) nav.openOnItsTab(Routes.NEW_SQUAWK) else adding = true
            })
        },
        contentWindowInsets = WindowInsets(0),
        bottomBar = {
            if (!cover && !compactHeight) PhoneTabBar(
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
                            StatusPhone(
                                status, onSeeAll = { nav.navigate(STATUS_ALL_ITEMS) }, onReview = { nav.selectTab(Destination.Logbooks, reselect = false) },
                                onPlan = { nav.navigate(STATUS_PLAN) }, onVisit = { nav.navigate("$STATUS_VISIT/$it") },
                            )
                            return@composable
                        }
                        if (tab == Destination.Share && recs != null) {
                            ShareHome(
                                recs, status, booksNow,
                                onMade = { nav.navigate("$SHARE_MADE/$it") }, onLinks = { nav.navigate(SHARE_LINKS) },
                                onReview = { nav.selectTab(Destination.Logbooks, reselect = false) },
                            )
                            return@composable
                        }
                        if (tab == Destination.Logbooks && books != null) {
                            BooksPhone(books, booksNav(nav))
                            return@composable
                        }
                        if (tab == Destination.Maintenance && recs != null) {
                            MaintTab(recs, maintView, { maintView = it }, status)
                            return@composable
                        }
                        if (tab == Destination.Aircraft && recs != null) {
                            AircraftTab(recs, status, onDocuments = { nav.navigate(DOCUMENTS_ON_PHONE) }, onSettings = { nav.navigate(SETTINGS_ON_PHONE) })
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
                        composable(STATUS_PLAN) { PlanAheadPhone(status, recs, onBack = { nav.popBackStack() }, onVisit = { nav.navigate("$STATUS_VISIT/$it") }) }
                        composable("$STATUS_VISIT/{key}") { e ->
                            val fromPlan = nav.previousBackStackEntry?.destination?.route == STATUS_PLAN
                            VisitScreen(status, recs, e.arguments?.getString("key") ?: "", back = stringResource(if (fromPlan) R.string.plan_title else R.string.section_status) to { nav.popBackStack() })
                        }
                    }
                    if (tab == Destination.Share && recs != null) {
                        val up: () -> Unit = { nav.popBackStack() }
                        composable("$SHARE_MADE/{id}") { e -> LinkScreen(recs, e.arguments?.getString("id") ?: "", made = true, back = stringResource(R.string.section_share) to up) }
                        composable("$SHARE_LINK/{id}") { e -> LinkScreen(recs, e.arguments?.getString("id") ?: "", made = false, back = stringResource(R.string.share_links_title) to up) }
                        composable(SHARE_LINKS) { LinksScreen(recs, back = stringResource(R.string.section_share) to up) { nav.navigate("$SHARE_LINK/$it") } }
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
                                    onDone = { nav.navigate(SCAN_QUEUE) { popUpTo(SCAN_CAMERA) { inclusive = true }; launchSingleTop = true } },
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
                            recs?.let { r -> TachScreen(r, lastTach(status, capture.store, r.id), onClose = up) }
                        }
                    }
                    if (recs != null) {
                        // Phase 4's pushed screens live in the graph of the tab they belong to (05 §5.3).
                        Routes.all.filter { if (tab == Destination.Maintenance) it.startsWith("maint/") else tab == Destination.Aircraft && !it.startsWith("maint/") }.forEach { pattern ->
                            composable(pattern) { e -> RecordsRoute(recs, pattern.replace("{id}", e.arguments?.getString("id") ?: "")) }
                        }
                        if (tab == Destination.Maintenance) composable(Routes.NEW_SQUAWK) { NewSquawk(recs, onClose = { nav.popBackStack() }) }
                    }
                    if (tab == Destination.Aircraft) {
                        composable(DOCUMENTS_ON_PHONE) {
                            val up: () -> Unit = { nav.popBackStack() }
                            if (recs != null) DocumentsScreen(recs, back = stringResource(R.string.section_aircraft) to up)
                            else SectionScreen(Destination.Documents, back = stringResource(R.string.section_aircraft) to up)
                        }
                        composable(SETTINGS_ON_PHONE) {
                            val up: () -> Unit = { nav.popBackStack() }
                            val colors = MyTailLogTheme.colors
                            Column(Modifier.fillMaxSize().background(colors.section(Section.Aircraft).board)) {
                                PhoneHeader(stringResource(R.string.settings_title), Section.Aircraft, back = stringResource(R.string.section_aircraft) to up)
                                PhoneLeaf {
                                    Column(Modifier.verticalScroll(rememberScrollState())) {
                                        if (notify != null) NotifyRows({ nav.navigate(INBOX) }, { nav.navigate(REMINDERS) })
                                        account()
                                    }
                                }
                            }
                        }
                        if (notify != null) {
                            val up: () -> Unit = { nav.popBackStack() }
                            composable(INBOX) { InboxScreen(notify, stringResource(R.string.settings_title) to up, open) { nav.navigate(REMINDERS) } }
                            composable(REMINDERS) { RemindersScreen(notify, stringResource(R.string.settings_title) to up) }
                        }
                    }
                }
            }
        }
    }
    }
    if (capture != null && aircraft != null) {
        if (adding) AddSheet(
            aircraft.aircraft.tailNumber, recs?.canEdit == true, onDismiss = { adding = false },
            onFlight = { nav.openOnItsTab(TACH_CAMERA) },
            onOil = { oiling = true },
            onSquawk = { nav.openOnItsTab(Routes.NEW_SQUAWK) },
            onScan = { scanning = true },
            onDocument = { documenting = true },
        )
        if (recs != null && oiling) AddOilSheet(recs) { oiling = false }
        if (recs != null && documenting) AddDocSheet(recs, null) { documenting = false }
        if (scanning) ScanSetupSheet(
            capture, aircraft, remember(aircraft.aircraft.id) { scanBooks(capture.store, aircraft.aircraft.id, books?.ui?.value?.books?.logbooks) },
            onCamera = { capture.target = it; nav.openOnItsTab(SCAN_CAMERA) },
            onImported = { nav.openOnItsTab(SCAN_QUEUE) },
            onDismiss = { scanning = false },
        )
    }
    }
}

const val SCAN_CAMERA = "logbooks/camera"
const val SCAN_QUEUE = "logbooks/queue"
const val TACH_CAMERA = "status/tach"
const val SYNC = "sync"
const val STATUS_PLAN = "status/plan"
const val STATUS_VISIT = "status/visit"
const val SHARE_MADE = "share/made"
const val SHARE_LINK = "share/link"
const val SHARE_LINKS = "share/links"

/** The last tach the phone knows (05 §16 plausibility): the snapshot's meter, or a newer reading saved here. */
fun lastTach(status: StatusHost?, store: OfflineStore, aircraftId: String): LastTach {
    val m = status?.ui?.snapshot?.body?.takeIf { it.aircraftId == aircraftId }?.meters?.get("tach")
    val server = m?.face ?: m?.stitched
    val local = store.localTach(aircraftId)
    return if (local != null && (server == null || local > server)) LastTach(local, java.time.LocalDate.now().toString(), onPhone = true) else LastTach(server, m?.asOf)
}

fun NavHostController.selectTab(tab: Destination, reselect: Boolean) {
    // Re-selecting pops to the root; when the root isn't on this stack, switch properly rather than do nothing.
    if (reselect && popBackStack(tab.root, inclusive = false)) return
    navigate(tab.graph) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}

/**
 * Pushes [route] on the tab whose graph holds it (SCAN_QUEUE → Logbooks), switching tabs first. The Add sheet and the
 * sync line open other tabs' screens; pushed on the current tab's stack they made the tab bar point at one tab while
 * the stack was another's, so tapping a tab did nothing or bounced back.
 */
fun NavHostController.openOnItsTab(route: String) {
    val owner = PhoneTabs.firstOrNull { (graph.findNode(it.graph) as? androidx.navigation.NavGraph)?.findNode(route) != null }
    val here = PhoneTabs.firstOrNull { t -> currentBackStackEntry?.destination?.hierarchy?.any { it.route == t.graph } == true }
    if (owner != null && owner != here) selectTab(owner, reselect = false)
    navigate(route) { launchSingleTop = true }
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
fun TabletShell(
    account: @Composable () -> Unit = {},
    status: StatusHost? = null,
    books: BooksViewModel? = null,
    recs: Recs? = null,
    go: Landing? = null,
    onGone: () -> Unit = {},
    notify: NotifyApi? = null,
    open: (String?) -> Unit = {},
) {
    var selected by rememberSaveable { mutableIntStateOf(0) }
    // The right leaf of Maintenance, Aircraft and Documents: a records route, "docs", "settings", the inbox or reminders.
    var detail by rememberSaveable { mutableStateOf<String?>(null) }
    var planning by rememberSaveable { mutableStateOf(false) }
    val destination = TabletSections[selected]
    val colors = MyTailLogTheme.colors
    val s = colors.section(destination.section)
    SystemBarIcons(darkStatusIcons = false) // the status bar sits over the dark rail on the left
    LaunchedEffect(go) {
        val l = go ?: return@LaunchedEffect
        selected = TabletSections.indexOf(l.section)
        planning = l.route == STATUS_PLAN || l.route?.startsWith(STATUS_VISIT) == true
        detail = when (l.route) {
            SETTINGS_ON_PHONE -> "settings"
            INBOX, REMINDERS -> l.route
            else -> l.route?.takeIf { l.section in setOf(Destination.Maintenance, Destination.Aircraft, Destination.Documents) }
        }
        onGone()
    }
    // Back (06 M-SYS-07, predictive): close the right leaf, then Plan ahead, then go to Status, then leave the app.
    androidx.activity.compose.BackHandler(enabled = detail != null || planning || selected != 0) {
        when {
            detail != null -> detail = null
            planning -> planning = false
            else -> selected = 0
        }
    }
    Row(Modifier.fillMaxSize().background(colors.cover)) {
        Rail(
            items = TabletSections.map { TabItem(it.section, stringResource(it.title), it.icon) },
            selected = selected,
            onSelect = { selected = it; detail = null },
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
            if (recs != null && destination in setOf(Destination.Maintenance, Destination.Aircraft, Destination.Documents)) {
                TabletRecords(recs, destination, status, account, detail, { detail = it }, notify, open)
                return@Column
            }
            if (recs != null && destination == Destination.Share) {
                TabletShare(recs, status, books?.ui?.collectAsStateWithLifecycle()?.value?.books)
                return@Column
            }
            // T-STATUS-01/02: SubTabs What's due · Plan ahead.
            if (destination == Destination.Status && status?.ui?.snapshot != null) {
                SubTabs(
                    listOf(stringResource(R.string.status_whats_due), stringResource(R.string.plan_title)), if (planning) 1 else 0, { planning = it == 1 }, Section.Status,
                    Modifier.padding(start = 22.dp, bottom = 14.dp),
                )
                if (planning) {
                    TabletPlan(status, recs)
                    return@Column
                }
            }
            val navigator = rememberListDetailPaneScaffoldNavigator<Nothing>()
            var selectedItem by rememberSaveable { mutableStateOf<String?>(null) }
            val statusHere = status.takeIf { destination == Destination.Status }
            val paneScope = androidx.compose.runtime.rememberCoroutineScope()
            // One pane (narrower than 840dp): the item replaces the list, and back returns to it.
            androidx.activity.compose.BackHandler(enabled = navigator.canNavigateBack()) { paneScope.launch { navigator.navigateBack() } }
            ListDetailPaneScaffold(
                directive = navigator.scaffoldDirective,
                value = navigator.scaffoldValue,
                listPane = {
                    AnimatedPane {
                        TabletLeaf {
                            // Settings lives in the RailFoot's Account (06 §9) once that lands; until then, under Aircraft.
                            when {
                                statusHere != null -> StatusTabletList(statusHere, selectedItem) {
                                    selectedItem = it
                                    paneScope.launch { navigator.navigateTo(androidx.compose.material3.adaptive.layout.ListDetailPaneScaffoldRole.Detail) }
                                }
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

/**
 * Maintenance, Aircraft and Documents on a tablet (06 §9 mapping): the list in the left leaf, the
 * detail (squawk, AD, item, an aircraft page, a document) in the right one.
 */
@Composable
private fun TabletRecords(
    recs: Recs,
    destination: Destination,
    status: StatusHost?,
    account: @Composable () -> Unit,
    detail: String?,
    setDetail: (String?) -> Unit,
    notify: NotifyApi?,
    open: (String?) -> Unit,
) {
    var maintView by rememberSaveable { mutableStateOf<MaintView?>(null) }
    val nav = RecNav(open = { setDetail(it) }, back = { setDetail(null) }, tablet = true)
    val settings = stringResource(R.string.settings_title) to { setDetail("settings") }
    androidx.compose.runtime.CompositionLocalProvider(LocalRecNav provides nav) {
        Row(Modifier.fillMaxSize().padding(start = 22.dp, end = 22.dp, bottom = 22.dp), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(10.dp)) {
            Box(Modifier.weight(1f)) {
                TabletLeaf {
                    when (destination) {
                        Destination.Maintenance -> MaintTab(recs, maintView, { maintView = it }, status)
                        Destination.Aircraft -> AircraftTab(recs, status, onDocuments = { setDetail("docs") }, onSettings = { setDetail("settings") })
                        else -> DocumentsScreen(recs, back = null)
                    }
                }
                if (recs.canEdit && destination == Destination.Maintenance) AddButton({ setDetail(Routes.NEW_SQUAWK) }, Modifier.align(Alignment.BottomEnd).padding(16.dp))
            }
            Box(Modifier.weight(1f)) {
                TabletLeaf {
                    when (val d = detail) {
                        null -> EmptyText(destination)
                        "docs" -> DocumentsScreen(recs, back = stringResource(R.string.section_aircraft) to { setDetail(null) })
                        "settings" -> Column(Modifier.verticalScroll(rememberScrollState())) {
                            if (notify != null) NotifyRows({ setDetail(INBOX) }, { setDetail(REMINDERS) })
                            account()
                        }
                        INBOX -> notify?.let { InboxScreen(it, settings, open) { setDetail(REMINDERS) } }
                        REMINDERS -> notify?.let { RemindersScreen(it, settings) }
                        Routes.NEW_SQUAWK -> NewSquawk(recs, onClose = { setDetail(null) })
                        else -> androidx.compose.runtime.key(d) { RecordsRoute(recs, d) }
                    }
                }
            }
        }
    }
}

/** T-STATUS-02: the scrubber and the visits in the left leaf; the statement and the table (or a visit) in the right. */
@Composable
private fun TabletPlan(status: StatusHost, recs: Recs?) {
    val body = status.ui.snapshot?.body ?: return
    val s = rememberPlan(body, recs)
    var visit by rememberSaveable { mutableStateOf<String?>(null) }
    var openKey by rememberSaveable { mutableStateOf<String?>(null) }
    androidx.compose.runtime.CompositionLocalProvider(LocalRecNav provides RecNav({}, {}, tablet = true)) {
        Row(Modifier.fillMaxSize().padding(start = 22.dp, end = 22.dp, bottom = 22.dp), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(10.dp)) {
            Box(Modifier.weight(1.62f)) {
                TabletLeaf {
                    Column(Modifier.verticalScroll(rememberScrollState())) {
                        PlanControls(s) { visit = it }
                        VisitRows(body, { visit = it }, s.visits)
                    }
                }
            }
            Box(Modifier.weight(1f)) {
                TabletLeaf {
                    when (val v = visit) {
                        null -> Column(Modifier.verticalScroll(rememberScrollState())) { PlanResults(s, { visit = it }) { openKey = it } }
                        else -> androidx.compose.runtime.key(v) { VisitScreen(status, recs, v, back = stringResource(R.string.plan_title) to { visit = null }) }
                    }
                }
            }
        }
    }
    ItemSheet(status.ui, openKey) { openKey = null }
}

/** Share on a tablet: who it is for in the left leaf; links and people, or one link, in the right. */
@Composable
private fun TabletShare(recs: Recs, status: StatusHost?, books: com.mytaillog.core.api.Books?) {
    var detail by rememberSaveable { mutableStateOf<String?>(null) }
    androidx.compose.runtime.CompositionLocalProvider(LocalRecNav provides RecNav({}, {}, tablet = true)) {
        Row(Modifier.fillMaxSize().padding(start = 22.dp, end = 22.dp, bottom = 22.dp), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(10.dp)) {
            Box(Modifier.weight(1f)) {
                TabletLeaf { ShareHome(recs, status, books, onMade = { detail = "made:$it" }, onLinks = { detail = null }, onReview = {}) }
            }
            Box(Modifier.weight(1f)) {
                TabletLeaf {
                    val d = detail
                    val back = stringResource(R.string.share_links_title) to { detail = null }
                    when {
                        d == null -> LinksScreen(recs, back = null) { detail = "link:$it" }
                        else -> androidx.compose.runtime.key(d) { LinkScreen(recs, d.substringAfter(':'), made = d.startsWith("made:"), back = back) }
                    }
                }
            }
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
