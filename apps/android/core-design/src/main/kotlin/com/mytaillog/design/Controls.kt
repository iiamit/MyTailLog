package com.mytaillog.design

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextFieldColors
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp

enum class ButtonKind { Primary, Secondary, Quiet }

/**
 * D's button (02, 06 §1.8): 52dp, radius.m, ink primary, leaf secondary with the control border,
 * quiet as ink text. Disabled is the whole control at 40%. Busy keeps the width and shows a
 * 16dp progress mark with the busy label.
 */
@Composable
fun DButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    kind: ButtonKind = ButtonKind.Primary,
    enabled: Boolean = true,
    busyText: String? = null,
    icon: ImageVector? = null,
) {
    val c = MyTailLogTheme.colors
    val shape = RoundedCornerShape(Tokens.Radius.m)
    val content = if (kind == ButtonKind.Primary) c.leaf else c.ink
    Row(
        modifier
            .fillMaxWidth()
            .height(if (kind == ButtonKind.Quiet) 48.dp else Tokens.Size.phoneButton)
            .alpha(if (enabled) 1f else 0.4f)
            .focusRing()
            .clip(shape)
            .then(
                when (kind) {
                    ButtonKind.Primary -> Modifier.background(c.ink)
                    ButtonKind.Secondary -> Modifier.background(c.leaf).border(1.dp, c.controlBorder, shape)
                    ButtonKind.Quiet -> Modifier
                },
            )
            .clickable(
                enabled = enabled && busyText == null,
                role = Role.Button,
                interactionSource = null,
                indication = StateLayerIndication(content),
                onClick = onClick,
            ),
        horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s2, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (busyText != null) {
            CircularProgressIndicator(Modifier.size(16.dp), color = content, strokeWidth = 2.dp)
        } else if (icon != null) {
            Icon(icon, contentDescription = null, tint = content, modifier = Modifier.size(18.dp))
        }
        Text(busyText ?: text, color = content, style = MaterialTheme.typography.labelLarge)
    }
}

/**
 * SubTabs (06 §1.1): a segmented control on the board, 36 visual and 44 hit. The selected segment is
 * a leaf chip with ink text; the others are on-board text. TalkBack hears tabs with their position.
 */
@Composable
fun SubTabs(items: List<String>, selected: Int, onSelect: (Int) -> Unit, section: Section, modifier: Modifier = Modifier) {
    val c = MyTailLogTheme.colors
    val s = c.section(section)
    Row(
        modifier
            .fillMaxWidth()
            .height(Tokens.Size.phoneTouchMin)
            .padding(horizontal = Tokens.Space.s4)
            .selectableGroup(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        items.forEachIndexed { i, label ->
            val on = i == selected
            Box(
                Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .focusRing()
                    .selectable(on, role = Role.Tab, interactionSource = null, indication = StateLayerIndication(s.onBoard)) { onSelect(i) },
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(36.dp)
                        .clip(RoundedCornerShape(Tokens.Radius.m))
                        .background(if (on) c.leaf else s.board),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        label,
                        color = if (on) c.ink else s.onBoard,
                        style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight(if (on) 800 else 600)),
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

/** OutlinedTextField restyled: control border at rest, ink when focused (06 §1.8). */
@Composable
fun dTextFieldColors(): TextFieldColors {
    val c = MyTailLogTheme.colors
    return OutlinedTextFieldDefaults.colors(
        focusedBorderColor = c.ink,
        unfocusedBorderColor = c.controlBorder,
        focusedLabelColor = c.ink,
        unfocusedLabelColor = c.ink2,
        cursorColor = c.ink,
        focusedTextColor = c.ink,
        unfocusedTextColor = c.ink,
        focusedContainerColor = c.leaf,
        unfocusedContainerColor = c.leaf,
    )
}
