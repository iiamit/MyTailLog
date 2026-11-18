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
import androidx.compose.ui.semantics.Role
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
) {
    val s = MyTailLogTheme.colors.section(section)
    Column(
        modifier
            .fillMaxWidth()
            .background(s.board)
            .windowInsetsPadding(WindowInsets.statusBars)
            .heightIn(min = 96.dp)
            .padding(start = Tokens.Space.s4, end = Tokens.Space.s4, top = Tokens.Space.s2, bottom = Tokens.Space.s4),
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
        Text(title, color = s.onBoard, style = MaterialTheme.typography.headlineMedium, modifier = Modifier.semantics { heading() })
    }
}

/** One tab of the PhoneTabBar. */
data class TabItem(val section: Section, val label: String, val icon: ImageVector)

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
        Icon(item.icon, contentDescription = null, tint = s.onBoard, modifier = Modifier.size(21.dp))
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
