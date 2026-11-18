package com.mytaillog.design

import androidx.compose.foundation.IndicationNodeFactory
import androidx.compose.foundation.interaction.HoverInteraction
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.ContentDrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.node.DelegatableNode
import androidx.compose.ui.node.DrawModifierNode
import androidx.compose.ui.node.invalidateDraw
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.Modifier.Node
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import kotlinx.coroutines.launch

/** Hover and pressed layers of 02 §2.3: the content colour at 8% / 14% over the fill. No ripple. */
const val HOVER_ALPHA = 0.08f
const val PRESSED_ALPHA = 0.14f

class StateLayerIndication(private val contentColor: Color) : IndicationNodeFactory {
    override fun create(interactionSource: InteractionSource): DelegatableNode = StateLayerNode(interactionSource, contentColor)
    override fun equals(other: Any?) = other is StateLayerIndication && other.contentColor == contentColor
    override fun hashCode() = contentColor.hashCode()
}

private class StateLayerNode(private val source: InteractionSource, private val color: Color) : Node(), DrawModifierNode {
    private var pressed = 0
    private var hovered = 0

    override fun onAttach() {
        coroutineScope.launch {
            source.interactions.collect {
                when (it) {
                    is PressInteraction.Press -> pressed++
                    is PressInteraction.Release, is PressInteraction.Cancel -> pressed = (pressed - 1).coerceAtLeast(0)
                    is HoverInteraction.Enter -> hovered++
                    is HoverInteraction.Exit -> hovered = (hovered - 1).coerceAtLeast(0)
                }
                invalidateDraw()
            }
        }
    }

    override fun ContentDrawScope.draw() {
        drawContent()
        val alpha = when {
            pressed > 0 -> PRESSED_ALPHA
            hovered > 0 -> HOVER_ALPHA
            else -> 0f
        }
        if (alpha > 0f) drawRect(color.copy(alpha = alpha))
    }
}

/**
 * The double FocusRing of 02 §2.4: a 2dp leaf ring inside a 2dp ink ring, 2dp outside the
 * component, following its corner radius. Compose only focuses clickables for keyboard
 * and D-pad, so the ring never appears on touch. Apply it before `clickable`/`selectable`.
 */
@Composable
fun Modifier.focusRing(cornerRadius: Dp = Tokens.Radius.m): Modifier {
    val colors = MyTailLogTheme.colors
    val state = remember { FocusState() }
    return this
        .onFocusChanged { state.focused = it.isFocused }
        .drawWithContent {
            drawContent()
            if (!state.focused) return@drawWithContent
            val w = 2.dp.toPx()
            // Strokes are centred on the path: leaf band 0–2dp outside, ink band 2–4dp outside.
            ring(colors.focusInner, inset = -w * 0.5f, stroke = w, radius = cornerRadius.toPx() + w * 0.5f)
            ring(colors.focus, inset = -w * 1.5f, stroke = w, radius = cornerRadius.toPx() + w * 1.5f)
        }
}

private class FocusState { var focused by mutableStateOf(false) }

private fun ContentDrawScope.ring(color: Color, inset: Float, stroke: Float, radius: Float) = drawRoundRect(
    color = color,
    topLeft = Offset(inset, inset),
    size = Size(size.width - 2 * inset, size.height - 2 * inset),
    cornerRadius = CornerRadius(radius),
    style = Stroke(stroke),
)
