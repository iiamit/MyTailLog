package com.mytaillog.design

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Alignment
import androidx.compose.material3.Icon
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * The binder Rail for tablets (02 §3.1, 05 §5.4): the cover, then one SectionTab per section.
 * The open tab runs flush into the board. Tab heights are equal until there are counts to weigh them by.
 */
@Composable
fun Rail(items: List<TabItem>, selected: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier, compact: Boolean = false) {
    val colors = MyTailLogTheme.colors
    Column(
        modifier
            .background(colors.cover)
            .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Start + WindowInsetsSides.Top + WindowInsetsSides.Bottom))
            .width(if (compact) 88.dp else 240.dp)
            .fillMaxHeight()
            .verticalScroll(rememberScrollState())
            .padding(top = if (compact) 4.dp else 18.dp, start = if (compact) 4.dp else 14.dp, bottom = if (compact) 4.dp else 16.dp)
            .selectableGroup(),
        verticalArrangement = Arrangement.spacedBy(Tokens.Space.s1),
    ) {
        if (!compact) Wordmark(colors.onCover, Modifier.padding(bottom = Tokens.Space.s4))
        items.forEachIndexed { i, item ->
            if (compact) {
                val s = colors.section(item.section)
                Column(
                    Modifier.fillMaxWidth().heightIn(min = 48.dp).clip(RoundedCornerShape(Tokens.Radius.s))
                        .background(s.board)
                        .selectable(i == selected, role = Role.Tab, onClick = { onSelect(i) })
                        .padding(horizontal = 4.dp, vertical = 4.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Icon(item.icon, contentDescription = null, tint = s.onBoard, modifier = Modifier.size(22.dp))
                    Text(item.label, color = s.onBoard, style = MaterialTheme.typography.labelSmall,
                        maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            } else SectionTab(item, i == selected) { onSelect(i) }
        }
    }
}

@Composable
private fun SectionTab(item: TabItem, open: Boolean, onClick: () -> Unit) {
    val s = MyTailLogTheme.colors.section(item.section)
    val r = Tokens.Radius.l
    Text(
        item.label,
        color = s.onBoard,
        style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight(700), fontSize = 16.sp),
        modifier = Modifier
            .padding(end = if (open) 0.dp else 12.dp)
            .fillMaxWidth()
            .heightIn(min = Tokens.Size.tabMin)
            .focusRing(r)
            .clip(RoundedCornerShape(topStart = r, bottomStart = r))
            .background(s.board)
            .selectable(open, interactionSource = null, indication = StateLayerIndication(s.onBoard), role = Role.Tab, onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 11.dp),
    )
}
