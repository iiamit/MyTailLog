package com.mytaillog.design

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
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
fun Rail(items: List<TabItem>, selected: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier) {
    val colors = MyTailLogTheme.colors
    Column(
        modifier
            .width(240.dp)
            .fillMaxHeight()
            .background(colors.cover)
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .padding(top = 18.dp, start = 14.dp, bottom = 16.dp)
            .selectableGroup(),
        verticalArrangement = Arrangement.spacedBy(Tokens.Space.s1),
    ) {
        Wordmark(colors.onCover, Modifier.padding(bottom = Tokens.Space.s4))
        items.forEachIndexed { i, item -> SectionTab(item, i == selected) { onSelect(i) } }
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
