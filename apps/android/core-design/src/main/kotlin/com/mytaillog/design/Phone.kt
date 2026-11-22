package com.mytaillog.design

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * PhoneHeader (02 §9.1): the board colour flooding under the status bar, the screen title
 * at type.board-title, and on pushed screens a back control naming the parent.
 * It does not collapse on scroll (02 §9.1 Decision: the colour is the place marker).
 */
@Composable
fun PhoneHeader(
    title: String,
    section: Section,
    modifier: Modifier = Modifier,
    back: Pair<String, () -> Unit>? = null,
    syncLine: SyncLine? = null,
) {
    val s = MyTailLogTheme.colors.section(section)
    val compact = with(LocalDensity.current) { LocalWindowInfo.current.containerSize.height.toDp() < 480.dp }
    val titleStyle = MaterialTheme.typography.headlineMedium
    Column(
        modifier
            .fillMaxWidth()
            .background(s.board)
            .windowInsetsPadding(WindowInsets.statusBars)
            .heightIn(min = if (compact) 0.dp else 96.dp)
            .padding(start = Tokens.Space.s4, end = Tokens.Space.s4, top = if (compact) Tokens.Space.s1 else Tokens.Space.s2, bottom = if (compact) Tokens.Space.s2 else Tokens.Space.s4),
        verticalArrangement = Arrangement.Bottom,
    ) {
        if (back != null) {
            val (parent, onBack) = back
            Row(
                Modifier
                    .heightIn(min = 48.dp)
                    .focusRing()
                    .clickable(indication = StateLayerIndication(s.onBoard), interactionSource = null, onClick = onBack)
                    .semantics(mergeDescendants = true) { contentDescription = "Back to $parent" },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Icon(LucideIcons.ChevronLeft, contentDescription = null, tint = s.onBoard, modifier = Modifier.size(20.dp))
                Text(parent, color = s.onBoard, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight(600)))
            }
        }
        if (syncLine != null) {
            Row(
                Modifier
                    .heightIn(min = Tokens.Size.phoneTouchMin)
                    .focusRing()
                    .clickable(indication = StateLayerIndication(s.onBoard), interactionSource = null, role = Role.Button, onClick = syncLine.onClick)
                    .semantics(mergeDescendants = true) { contentDescription = syncLine.spoken },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(syncLine.tail, color = s.onBoard, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight(600)))
                Icon(LucideIcons.ChevronDown, contentDescription = null, tint = s.onBoard, modifier = Modifier.size(16.dp))
                if (syncLine.state != null) {
                    Text("· ${syncLine.state}", color = s.onBoard2, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight(500)))
                }
            }
        }
        Text(title, color = s.onBoard, style = if (compact) titleStyle.copy(fontSize = 24.sp, lineHeight = 30.sp) else titleStyle, modifier = Modifier.semantics { heading() })
    }
}

/** SyncLine (06 §1.1, §1.3): "N734DM ⌄ · synced 9:38", one button that opens the aircraft switcher. */
data class SyncLine(val tail: String, val state: String?, val spoken: String, val onClick: () -> Unit)

/** One tab of the PhoneTabBar. [badge] above zero shows as an alarm count, read after the label as [badgeSpoken] (06 §1.3). */
data class TabItem(val section: Section, val label: String, val icon: ImageVector, val badge: Int = 0, val badgeSpoken: String? = null)

/**
 * PhoneTabBar (02 §9.4): coloured tabs hanging from the cover ground; the open tab is 58dp
 * tall and rises 8dp into the leaf. A custom Row, not Material's NavigationBar, which can't
 * draw per-tab colour blocks.
 */
@Composable
fun PhoneTabBar(items: List<TabItem>, selected: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier) {
    val colors = MyTailLogTheme.colors
    val haptics = LocalHapticFeedback.current
    Row(
        modifier
            .fillMaxWidth()
            .background(colors.cover)
            .windowInsetsPadding(WindowInsets.navigationBars)
            .height(Tokens.Size.phoneTabbar)
            .padding(horizontal = Tokens.Space.s2)
            .selectableGroup(),
        horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s1),
        verticalAlignment = Alignment.Top,
    ) {
        items.forEachIndexed { i, item ->
            PhoneTab(item, selected = i == selected) {
                if (i != selected) haptics.performHapticFeedback(HapticFeedbackType.SegmentTick)
                onSelect(i)
            }
        }
    }
}

@Composable
private fun RowScope.PhoneTab(item: TabItem, selected: Boolean, onClick: () -> Unit) {
    val s = MyTailLogTheme.colors.section(item.section)
    val r = Tokens.Radius.l
    val shape = if (selected) RoundedCornerShape(r) else RoundedCornerShape(bottomStart = r, bottomEnd = r)
    Column(
        Modifier
            .weight(1f)
            .offset(y = if (selected) (-8).dp else 0.dp)
            .height(if (selected) 58.dp else Tokens.Size.phoneTabbar)
            .focusRing(r)
            .alpha(if (selected) 1f else 0.92f)
            .clip(shape)
            .background(s.board)
            .selectable(selected, interactionSource = null, indication = StateLayerIndication(s.onBoard), role = Role.Tab, onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(3.dp, Alignment.CenterVertically),
    ) {
        Box {
            Icon(item.icon, contentDescription = null, tint = s.onBoard, modifier = Modifier.size(21.dp))
            if (item.badge > 0) {
                val c = MyTailLogTheme.colors
                Box(
                    Modifier
                        .align(Alignment.TopEnd)
                        .offset(x = 10.dp, y = (-6).dp)
                        .heightIn(min = 18.dp)
                        .clip(RoundedCornerShape(Tokens.Radius.s))
                        .background(c.alarm)
                        .padding(horizontal = 5.dp)
                        .clearAndSetSemantics { item.badgeSpoken?.let { contentDescription = it } },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(item.badge.toString(), color = c.onAlarm, style = MaterialTheme.typography.labelSmall)
                }
            }
        }
        Text(item.label, color = s.onBoard, style = MaterialTheme.typography.labelSmall, maxLines = 1)
    }
}

/**
 * PhoneLeaf (02 §9.5): the white working surface, 8dp in from the screen edges so the
 * board shows either side, square-ish top corners.
 */
@Composable
fun PhoneLeaf(modifier: Modifier = Modifier, content: @Composable BoxScope.() -> Unit) {
    val colors = MyTailLogTheme.colors
    Box(
        modifier
            .fillMaxSize()
            .padding(horizontal = Tokens.Space.s2)
            .clip(RoundedCornerShape(topStart = Tokens.Radius.s, topEnd = Tokens.Radius.s))
            .background(colors.leaf)
            .padding(top = Tokens.Space.s5, start = Tokens.Space.s4, end = Tokens.Space.s4),
        content = content,
    )
}

/** AddButton (02 §9.8): a square, never a circle. Name "Add". */
@Composable
fun AddButton(onClick: () -> Unit, modifier: Modifier = Modifier) {
    val colors = MyTailLogTheme.colors
    FloatingActionButton(
        onClick = onClick,
        modifier = modifier.size(Tokens.Size.phoneAddButton).focusRing(6.dp),
        shape = RoundedCornerShape(6.dp),
        containerColor = colors.ink,
        contentColor = colors.leaf,
    ) {
        Icon(LucideIcons.Plus, contentDescription = "Add", modifier = Modifier.size(28.dp))
    }
}

/** SectionIcon (02 §9.8): a 44dp tile in a section's colour. Decorative. */
@Composable
fun SectionIcon(section: Section, icon: ImageVector, modifier: Modifier = Modifier) {
    val s = MyTailLogTheme.colors.section(section)
    Box(
        modifier.size(Tokens.Size.phoneTouchMin).clip(RoundedCornerShape(Tokens.Radius.m)).background(s.board),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = s.onBoard, modifier = Modifier.size(22.dp))
    }
}

/** PhoneRow (02 §9.7), the navigating variant: title and a chevron, one element to TalkBack. */
@Composable
fun PhoneRow(title: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val colors = MyTailLogTheme.colors
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = Tokens.Size.phoneRowMin)
            .focusRing()
            .clickable(onClick = onClick)
            .padding(vertical = Tokens.Space.s3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, color = colors.ink, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight(700)), modifier = Modifier.weight(1f))
        Icon(LucideIcons.ChevronRight, contentDescription = null, tint = colors.ink3, modifier = Modifier.size(20.dp))
    }
    Box(Modifier.fillMaxWidth().height(1.dp).background(colors.rule))
}

/** Wordmark on the setup board; 34/800 per 06 M-AUTH-01. */
@Composable
fun Wordmark(color: androidx.compose.ui.graphics.Color, modifier: Modifier = Modifier) {
    Text("MyTailLog", color = color, fontFamily = LibreFranklin, fontWeight = FontWeight(800), fontSize = 34.sp, modifier = modifier)
}
