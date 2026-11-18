package com.mytaillog.app

import androidx.annotation.StringRes
import androidx.compose.ui.graphics.vector.ImageVector
import com.mytaillog.design.LucideIcons
import com.mytaillog.design.Section

/** The binder's six sections (00 §5) with their board title, phone tab label, icon and empty-state copy (12 §9). */
enum class Destination(
    val section: Section,
    @StringRes val title: Int,
    @StringRes val tabLabel: Int,
    val icon: ImageVector,
    @StringRes val empty: Int,
) {
    Status(Section.Status, R.string.section_status, R.string.section_status, LucideIcons.ListChecks, R.string.empty_status),
    Logbooks(Section.Books, R.string.section_books, R.string.section_books, LucideIcons.BookOpen, R.string.empty_books),
    Maintenance(Section.Maint, R.string.section_maint, R.string.tab_maint, LucideIcons.Wrench, R.string.empty_nothing),
    Aircraft(Section.Aircraft, R.string.section_aircraft, R.string.section_aircraft, LucideIcons.Plane, R.string.empty_nothing),
    Documents(Section.Docs, R.string.section_docs, R.string.section_docs, LucideIcons.Folder, R.string.empty_docs),
    Share(Section.Share, R.string.section_share, R.string.section_share, LucideIcons.Share2, R.string.empty_share),
    ;

    /** Navigation graph route for the tab, and the route of its root screen. */
    val graph: String get() = name.lowercase()
    val root: String get() = "$graph/root"
}

/** Phone: five tabs; Documents is pushed from Aircraft (05 §5.1, 06 §2 M-DOCS-01). */
val PhoneTabs = listOf(Destination.Status, Destination.Logbooks, Destination.Maintenance, Destination.Aircraft, Destination.Share)

/** Tablet rail: all six, Documents its own tab, matching the web rail (05 §5.4). */
val TabletSections = Destination.entries.toList()

const val DOCUMENTS_ON_PHONE = "aircraft/documents"

/** Rail and list-detail from this width (01 §6: tablet list-detail at ≥ 700). */
const val TABLET_MIN_WIDTH_DP = 700

fun isTablet(widthDp: Int) = widthDp >= TABLET_MIN_WIDTH_DP
