package com.mytaillog.design

import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/**
 * Lucide 0.469.0 glyphs (ISC licence) as ImageVectors, copied from lucide-static's SVG paths
 * (circles, rects and lines rewritten as paths). 24-unit grid, stroke 2, round caps and joins.
 * Tint with Icon(tint = …); the black stroke is replaced by the tint.
 */
object LucideIcons {
    val ListChecks = lucide("ListChecks", "m3 17 2 2 4-4", "m3 7 2 2 4-4", "M13 6h8", "M13 12h8", "M13 18h8")
    val BookOpen = lucide(
        "BookOpen", "M12 7v14",
        "M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z",
    )
    val Wrench = lucide(
        "Wrench",
        "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z",
    )
    val Plane = lucide(
        "Plane",
        "M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z",
    )
    val Folder = lucide(
        "Folder",
        "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
    )
    val Share2 = lucide(
        "Share2",
        "M15 5a3 3 0 1 0 6 0a3 3 0 1 0-6 0", "M3 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0", "M15 19a3 3 0 1 0 6 0a3 3 0 1 0-6 0",
        "M8.59 13.51 15.42 17.49", "M15.41 6.51 8.59 10.49",
    )
    val Plus = lucide("Plus", "M5 12h14", "M12 5v14")
    val Mail = lucide(
        "Mail", "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
        "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7",
    )
    val ChevronLeft = lucide("ChevronLeft", "m15 18-6-6 6-6")
    val ChevronRight = lucide("ChevronRight", "m9 18 6-6-6-6")
    val ChevronDown = lucide("ChevronDown", "m6 9 6 6 6-6")
    val Calendar = lucide(
        "Calendar", "M8 2v4", "M16 2v4",
        "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M3 10h18",
    )
    val Gauge = lucide("Gauge", "m12 14 4-4", "M3.34 19a10 10 0 1 1 17.32 0")
    val FileText = lucide(
        "FileText", "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",
        "M14 2v4a2 2 0 0 0 2 2h4", "M10 9H8", "M16 13H8", "M16 17H8",
    )

    private fun lucide(name: String, vararg paths: String): ImageVector =
        ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f).apply {
            paths.forEach {
                addPath(
                    pathData = addPathNodes(it),
                    stroke = SolidColor(Color.Black),
                    strokeLineWidth = 2f,
                    strokeLineCap = StrokeCap.Round,
                    strokeLineJoin = StrokeJoin.Round,
                )
            }
        }.build()
}
