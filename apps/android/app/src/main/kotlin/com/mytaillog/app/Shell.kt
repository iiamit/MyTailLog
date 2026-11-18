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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.adaptive.ExperimentalMaterial3AdaptiveApi
import androidx.compose.material3.adaptive.layout.AnimatedPane
import androidx.compose.material3.adaptive.layout.ListDetailPaneScaffold
import androidx.compose.material3.adaptive.navigation.rememberListDetailPaneScaffoldNavigator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
fun Shell() {
    BoxWithConstraints(Modifier.fillMaxSize()) {
        if (isTablet(maxWidth.value.toInt())) TabletShell() else PhoneShell()
    }
}

/**
 * One Scaffold with D's PhoneTabBar as bottomBar and one back stack per tab (05 §5.3):
 * switching tabs saves and restores each tab's stack; re-selecting the open tab pops it to its root.
 */
@Composable
fun PhoneShell(nav: NavHostController = rememberNavController()) {
    val entry by nav.currentBackStackEntryAsState()
    val hierarchy = entry?.destination?.hierarchy
    val current = PhoneTabs.indexOfFirst { tab -> hierarchy?.any { it.route == tab.graph } == true }.coerceAtLeast(0)
    val visible = if (entry?.destination?.route == DOCUMENTS_ON_PHONE) Section.Docs else PhoneTabs[current].section
    SystemBarIcons(darkStatusIcons = visible == Section.Books)

    Scaffold(
        containerColor = MyTailLogTheme.colors.section(visible).board,
        contentWindowInsets = WindowInsets(0),
        bottomBar = {
            PhoneTabBar(
                items = PhoneTabs.map { TabItem(it.section, stringResource(it.tabLabel), it.icon) },
                selected = current,
                onSelect = { i -> nav.selectTab(PhoneTabs[i], reselect = i == current) },
            )
        },
    ) { padding ->
        NavHost(nav, startDestination = PhoneTabs.first().graph, modifier = Modifier.padding(padding)) {
            PhoneTabs.forEach { tab ->
                navigation(startDestination = tab.root, route = tab.graph) {
                    composable(tab.root) {
                        SectionScreen(tab) {
                            if (tab == Destination.Aircraft) {
                                PhoneRow(stringResource(R.string.section_docs), onClick = { nav.navigate(DOCUMENTS_ON_PHONE) })
                            }
                        }
                    }
                    if (tab == Destination.Aircraft) {
                        composable(DOCUMENTS_ON_PHONE) {
                            SectionScreen(Destination.Documents, back = stringResource(R.string.section_aircraft) to { nav.popBackStack() })
                        }
                    }
                }
            }
        }
    }
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
fun TabletShell() {
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
            val navigator = rememberListDetailPaneScaffoldNavigator<Nothing>()
            ListDetailPaneScaffold(
                directive = navigator.scaffoldDirective,
                value = navigator.scaffoldValue,
                listPane = { AnimatedPane { TabletLeaf { EmptyText(destination) } } },
                detailPane = { AnimatedPane { TabletLeaf {} } },
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
