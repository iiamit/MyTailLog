package com.mytaillog.design

import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

/** The binder's sections (01 §2). Setup is the cover of the binder: sign-in, onboarding, camera. */
enum class Section { Status, Books, Maint, Aircraft, Docs, Share, Setup }

/** The open section's colours (02 §2.2): `board`, `on-board`, `on-board-2`, `board-ink`. */
@Immutable
data class SectionColors(val board: Color, val onBoard: Color, val onBoard2: Color, val boardInk: Color)

fun MyTailLogColors.section(section: Section): SectionColors = when (section) {
    Section.Status -> SectionColors(sectionStatus, onSectionStatus, onSection2Status, sectionInkStatus)
    Section.Books -> SectionColors(sectionBooks, onSectionBooks, onSection2Books, sectionInkBooks)
    Section.Maint -> SectionColors(sectionMaint, onSectionMaint, onSection2Maint, sectionInkMaint)
    Section.Aircraft -> SectionColors(sectionAircraft, onSectionAircraft, onSection2Aircraft, sectionInkAircraft)
    Section.Docs -> SectionColors(sectionDocs, onSectionDocs, onSection2Docs, sectionInkDocs)
    Section.Share -> SectionColors(sectionShare, onSectionShare, onSection2Share, sectionInkShare)
    Section.Setup -> SectionColors(sectionSetup, onSectionSetup, onSection2Setup, sectionInkSetup)
}

val LocalMyTailLogColors = staticCompositionLocalOf { LightColors }

/** Material 3 roles mapped onto D's colours (01 §11) so stock components inherit sensible defaults. */
fun materialColorScheme(c: MyTailLogColors, dark: Boolean): ColorScheme {
    val scheme = if (dark) darkColorScheme() else lightColorScheme()
    return scheme.copy(
        primary = c.ink,
        onPrimary = c.leaf,
        primaryContainer = c.leaf2,
        onPrimaryContainer = c.ink,
        secondary = c.ink2,
        onSecondary = c.leaf,
        background = c.leaf,
        onBackground = c.ink,
        surface = c.leaf,
        onSurface = c.ink,
        surfaceVariant = c.leaf2,
        onSurfaceVariant = c.ink2,
        surfaceContainer = c.leaf,
        surfaceContainerLow = c.leaf,
        surfaceContainerHigh = c.leaf2,
        outline = c.controlBorder,
        outlineVariant = c.rule,
        error = c.alarm,
        onError = c.onAlarm,
        errorContainer = c.alarmBg,
        onErrorContainer = c.onAlarmBg,
        inverseSurface = c.cover,
        inverseOnSurface = c.onCover,
    )
}

private val variable = listOf(400, 500, 600, 700, 800)

val LibreFranklin = FontFamily(
    variable.map { w ->
        Font(R.font.libre_franklin, FontWeight(w), variationSettings = FontVariation.Settings(FontVariation.weight(w)))
    },
)

/** Literata is only for words transcribed from a scanned page (01 §5, 12 §2). */
val Literata = FontFamily(
    listOf(400, 500, 700).map { w ->
        Font(R.font.literata, FontWeight(w), variationSettings = FontVariation.Settings(FontVariation.weight(w)))
    },
)

fun TypeRole.toTextStyle(): TextStyle = TextStyle(
    fontFamily = if (family == TypeFamily.Paper) Literata else LibreFranklin,
    fontSize = size,
    fontWeight = weight,
    lineHeight = (lineHeight).em,
    fontFeatureSettings = "tnum",
)

/** 01 §5 phone scale → Material type roles. Everything is in sp, so it follows the font scale. */
val MyTailLogTypography: Typography = Typography().let { base ->
    val t = Tokens.PhoneType
    base.copy(
        headlineMedium = t.boardTitle.toTextStyle().copy(letterSpacing = (-0.01).em),
        titleLarge = t.lede.toTextStyle(),
        titleMedium = t.heading.toTextStyle(),
        bodyLarge = t.body.toTextStyle(),
        bodyMedium = t.small.toTextStyle(),
        labelLarge = t.bodyStrong.toTextStyle().copy(fontSize = 15.sp, lineHeight = 1.em),
        labelMedium = t.caption.toTextStyle(),
        labelSmall = t.tabLabel.toTextStyle(),
    )
}

object MyTailLogTheme {
    val colors: MyTailLogColors
        @Composable @ReadOnlyComposable get() = LocalMyTailLogColors.current
}

/** Light and dark follow the system setting (14 C8: Match system is the default). */
@Composable
fun MyTailLogTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val colors = if (dark) DarkColors else LightColors
    CompositionLocalProvider(LocalMyTailLogColors provides colors) {
        MaterialTheme(colorScheme = materialColorScheme(colors, dark), typography = MyTailLogTypography) {
            // No ripple anywhere (02 §2.3): an ink state layer at 8% hover / 14% pressed.
            CompositionLocalProvider(LocalIndication provides StateLayerIndication(colors.ink), content = content)
        }
    }
}
