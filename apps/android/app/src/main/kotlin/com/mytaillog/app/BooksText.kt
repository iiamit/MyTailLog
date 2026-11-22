package com.mytaillog.app

import com.mytaillog.core.api.Books
import com.mytaillog.core.api.EntryRow
import com.mytaillog.core.api.FieldBox
import com.mytaillog.core.api.LogbookRow
import com.mytaillog.core.api.PageRow
import com.mytaillog.core.domain.due.fmtDate
import com.mytaillog.core.domain.map.LANES
import com.mytaillog.core.domain.map.MapModel
import com.mytaillog.core.domain.map.MapStop
import com.mytaillog.design.TrustLevel

// Pure helpers behind the Logbooks screens (06 M-BOOKS-*, M-REVIEW-*): words, ordering, the review queue.

/** A field the reader is less sure of than this is doubtful (apps/web lib/extraction/schema.ts CONFIDENCE_THRESHOLD). */
const val DOUBT_BELOW = 0.75

/** The review fields in the drawer, column → label. Paper fields are set in Literata, numbers in Libre Franklin. */
enum class Field(val column: String, val label: String, val numeric: Boolean = false, val paper: Boolean = false) {
    Date("entry_date", "Date"),
    Tach("tach", "Tach", numeric = true),
    Hobbs("hobbs", "Hobbs", numeric = true),
    Title("description", "Title", paper = true),
    Work("work_performed", "Work", paper = true),
    Parts("parts", "Parts", paper = true),
    Signed("signature_name", "Signed"),
    Cert("mechanic_cert_number", "Certificate"),
}

fun EntryRow.value(f: Field): String? = when (f) {
    Field.Date -> entryDate
    Field.Tach -> tach?.let(::hours1)
    Field.Hobbs -> hobbs?.let(::hours1)
    Field.Title -> description
    Field.Work -> workPerformed
    Field.Parts -> parts
    Field.Signed -> signatureName
    Field.Cert -> mechanicCertNumber
}?.takeIf { it.isNotBlank() }

fun EntryRow.confidence(f: Field): Double? = fieldConfidence?.get(f.column)
fun EntryRow.box(f: Field): FieldBox? = fieldBoxes?.get(f.column)
fun EntryRow.doubtful(f: Field): Boolean = (confidence(f) ?: 1.0) < DOUBT_BELOW

/** The drawer's rows: every field with a value or a doubt, the least certain first (M-REVIEW-01). */
fun reviewFields(e: EntryRow): List<Field> =
    Field.entries.filter { e.value(it) != null || e.doubtful(it) }.sortedBy { e.confidence(it) ?: 1.0 }

/** The value to send for an edited field: numbers parsed, blanks cleared; null when a number doesn't parse. */
fun parseField(f: Field, text: String): Result<Any?> {
    val t = text.trim()
    if (t.isEmpty()) return Result.success(null)
    if (f.numeric) return t.replace(",", "").toDoubleOrNull()?.let { Result.success(it) } ?: Result.failure(IllegalArgumentException("number"))
    if (f == Field.Date && !Regex("""\d{4}-\d{2}-\d{2}""").matches(t)) return Result.failure(IllegalArgumentException("date"))
    return Result.success(t)
}

/** Pages with entries read by AI and not yet confirmed, book by book in filed order: the review queue. */
fun reviewQueue(b: Books): List<PageRow> {
    val waiting = b.entries.filter { it.trust == "ai_read" }.mapNotNull { it.pageId }.toSet()
    return b.pages.filter { it.extractionStatus == "extracted" && (it.id in waiting || (it.needsLook == true && it.reviewStatus != "confirmed")) }.sortedWith(compareBy({ bookRank(b, it.logbookId) }, { it.pageSequence ?: Int.MAX_VALUE }))
}

/** Pages still being read (queued, processing, waiting for allowance). */
fun beingRead(b: Books): List<PageRow> = b.pages.filter { it.extractionStatus in setOf("queued", "processing", "waiting_allowance") }

fun entriesOn(b: Books, pageId: String): List<EntryRow> = b.entries.filter { it.pageId == pageId }.sortedBy { it.entryIndex ?: 0 }

private fun bookRank(b: Books, logbookId: String): Int =
    b.logbooks.firstOrNull { it.id == logbookId }?.type?.let { LANES.indexOf(it).takeIf { i -> i >= 0 } } ?: LANES.size

/** M-BOOKS-06's book rows: every logbook, the map's books in lane order, Other (never a map line, 10 §1) last. */
fun shelf(b: Books): List<LogbookRow> = b.logbooks.sortedBy { LANES.indexOf(it.type).let { i -> if (i < 0) LANES.size else i } }

/** Books the map never draws (Other) that hold pages, with their counts: the map links to them. */
fun offMapBooks(b: Books): List<Pair<LogbookRow, Int>> =
    b.logbooks.filter { it.type !in LANES }.map { book -> book to b.pages.count { it.logbookId == book.id } }.filter { it.second > 0 }

/** "Other logbook, 3 pages, not drawn on the map." */
fun offMapLine(name: String, pages: Int): String = "$name logbook, $pages ${if (pages == 1) "page" else "pages"}, not drawn on the map."

fun bookType(b: Books, logbookId: String): String? =b.logbooks.firstOrNull { it.id == logbookId }?.type

fun bookTitle(b: Books, logbookId: String): String {
    val book = b.logbooks.firstOrNull { it.id == logbookId }
    return book?.title ?: bookName(book?.type)?.takeIf { book?.type != "other" } ?: "Other"
}

/** PageCite words: "Airframe p. 6". */
fun pageLabel(b: Books, pageId: String?): String? {
    val p = b.pages.firstOrNull { it.id == pageId } ?: return null
    return "${bookTitle(b, p.logbookId)} p. ${p.pageSequence ?: "?"}"
}

/** The entry's title in the owner's (or the reader's) words: its first sentence, else its kind. */
fun entryTitle(e: EntryRow): String {
    val text = e.description ?: e.workPerformed
    val first = text?.trim()?.split(Regex("(?<=[.!?])\\s"))?.firstOrNull()?.trimEnd('.')?.takeIf { it.isNotBlank() }
    return first ?: e.entryKind?.replace('_', ' ')?.replaceFirstChar { it.uppercase() } ?: "Logbook entry"
}

/** "Mar 2, 2026 · tach 4,205.8 · M. Torres, A&P 3667012" */
fun entryMeta(e: EntryRow): String = listOfNotNull(
    e.entryDate?.let(::fmtDate),
    e.tach?.let { "tach ${hours1(it)}" },
    listOfNotNull(e.signatureName, e.mechanicCertNumber).joinToString(", ").ifBlank { null },
).joinToString(" · ")

/** The full paper text of an entry (the transcription). */
fun transcription(e: EntryRow): String =
    listOfNotNull(e.description, e.workPerformed?.takeIf { it != e.description }, e.parts?.let { "Parts: $it" }).joinToString("\n")

fun entryTrust(e: EntryRow): TrustLevel = when (e.trust) {
    "ai_read" -> TrustLevel.AiRead
    "signed" -> TrustLevel.Signed
    else -> TrustLevel.Confirmed
}

fun entryTrustWords(e: EntryRow): String = when (entryTrust(e)) {
    TrustLevel.AiRead -> "Read by AI"
    TrustLevel.Confirmed -> "Confirmed by you"
    TrustLevel.Signed -> "Signed by a mechanic"
}

/** Union of an entry's field boxes, for the stop sheet's crop and the outline on the page. */
fun entryBox(e: EntryRow): FieldBox? {
    val boxes = e.fieldBoxes?.values?.filterNotNull().orEmpty()
    if (boxes.isEmpty()) return null
    val x0 = boxes.minOf { it.x }; val y0 = boxes.minOf { it.y }
    return FieldBox(x0, y0, boxes.maxOf { it.x + it.w } - x0, boxes.maxOf { it.y + it.h } - y0)
}

/** A stop's spoken name (10 §10): "Replaced landing light, March 2, 2026, Airframe, read by AI, Airframe p. 6". */
fun spokenStop(b: Books, e: EntryRow?, date: String, book: String?, trust: String): String = listOfNotNull(
    e?.let(::entryTitle),
    fmtDate(date),
    bookName(book),
    when (trust) { "ai_read" -> "read by AI"; "signed" -> "signed by a mechanic"; else -> "confirmed by you" },
    e?.pageId?.let { pageLabel(b, it) },
).joinToString(", ")

/** Year groups for the list (M-BOOKS-08): newest first, undated last. */
fun entriesByYear(entries: List<EntryRow>): List<Pair<String, List<EntryRow>>> =
    entries.filter { !it.isContinuation }.groupBy { it.entryDate?.take(4) ?: "Undated" }
        .toList().sortedWith(compareBy({ it.first == "Undated" }, { -(it.first.toIntOrNull() ?: 0) }))
        .map { (y, es) -> y to es.sortedByDescending { it.entryDate } }

/**
 * M-BOOKS-05: the model cut to one book. Every stop is labelled there ("Oil change, 2026"), so the
 * layout gets them as labelled stops; visits that crossed into other books become plain stops.
 */
fun oneBook(m: MapModel, book: String, titleOf: (MapStop) -> String?): MapModel {
    val lines = m.lines.filter { it.logbook == book }.map { it.lineId }.toSet()
    return m.copy(
        lines = m.lines.filter { it.lineId in lines },
        stops = m.stops.filter { it.lineId in lines }.map { s -> s.copy(major = true, label = s.label ?: titleOf(s)) },
        interchanges = emptyList(),
        gaps = m.gaps.filter { it.lineId in lines },
        eras = m.eras.filter { it.lineId in lines },
        squawks = m.squawks.filter { it.lineId in lines },
        rings = m.rings.filter { it.lineId in lines },
        visits = emptyList(),
    )
}

/** Structured documents have their own approval fields on the website. */
fun needsWebsiteReview(b: Books, page: PageRow): Boolean =
    page.extractionStatus == "extracted" && page.needsLook == true && page.reviewStatus != "confirmed" && entriesOn(b, page.id).isEmpty()
