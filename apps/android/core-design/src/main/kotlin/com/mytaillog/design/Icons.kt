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
    val ChevronUp = lucide("ChevronUp", "m18 15-6-6-6 6")
    val X = lucide("X", "M18 6 6 18", "m6 6 12 12")
    val Zap = lucide("Zap", "M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z")
    val Route = lucide("Route", "M3 19a3 3 0 1 0 6 0a3 3 0 1 0-6 0", "M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15", "M15 5a3 3 0 1 0 6 0a3 3 0 1 0-6 0")
    val ScanLine = lucide("ScanLine", "M3 7V5a2 2 0 0 1 2-2h2", "M17 3h2a2 2 0 0 1 2 2v2", "M21 17v2a2 2 0 0 1-2 2h-2", "M7 21H5a2 2 0 0 1-2-2v-2", "M7 12h10")
    val Camera = lucide("Camera", "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z", "M9 13a3 3 0 1 0 6 0a3 3 0 1 0-6 0")
    val CloudUpload = lucide("CloudUpload", "M12 13v8", "M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242", "m8 17 4-4 4 4")
    val WifiOff = lucide(
        "WifiOff", "M12 20h.01", "M8.5 16.429a5 5 0 0 1 7 0", "M5 12.859a10 10 0 0 1 5.17-2.69", "M19 12.859a10 10 0 0 0-2.007-1.523",
        "M2 8.82a15 15 0 0 1 4.177-2.643", "M22 8.82a15 15 0 0 0-11.288-3.764", "m2 2 20 20",
    )
    val Keyboard = lucide(
        "Keyboard", "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
        "M6 8h.001", "M10 8h.001", "M14 8h.001", "M18 8h.001", "M8 12h.001", "M12 12h.001", "M16 12h.001", "M7 16h10",
    )
    val CircleCheck = lucide("CircleCheck", "M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0", "m9 12 2 2 4-4")
    val Check = lucide("Check", "M20 6 9 17l-5-5")
    val Pencil = lucide(
        "Pencil", "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
        "m15 5 4 4",
    )
    val CircleHelp = lucide("CircleHelp", "M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0", "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3", "M12 17h.01")
    val List = lucide("List", "M3 12h.01", "M3 18h.01", "M3 6h.01", "M8 12h13", "M8 18h13", "M8 6h13")
    val Map = lucide(
        "Map", "M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z",
        "M15 5.764v15", "M9 3.236v15",
    )
    val ZoomIn = lucide("ZoomIn", "M3 11a8 8 0 1 0 16 0a8 8 0 1 0-16 0", "m21 21-4.3-4.3", "M11 8v6", "M8 11h6")

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
