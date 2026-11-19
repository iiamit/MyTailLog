package com.mytaillog.app

import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mytaillog.core.api.AircraftAccess
import com.mytaillog.core.api.AircraftRole
import com.mytaillog.core.domain.due.DueItem
import com.mytaillog.core.domain.due.StatusBody
import kotlinx.serialization.json.JsonObject

/**
 * What phase 4's screens share for the aircraft that is open: its records on this phone, the
 * outbox, the online routes, the server's status snapshot, and one toast that survives navigation.
 */
class Recs(
    val store: OfflineStore,
    val api: RecordsApi,
    val aircraft: AircraftAccess,
    val snapshot: StatusBody?,
    val kick: () -> Unit,
    /** Copy for toasts made in callbacks, outside composition. */
    val str: (Int) -> String,
    /** Log a flight (the tach camera), for "No hours recorded yet". */
    val openFlight: () -> Unit = {},
) {
    val id get() = aircraft.aircraft.id
    val tail get() = aircraft.aircraft.tailNumber
    /** 06 §1.5: viewers and the demo aircraft read only. */
    val canEdit get() = aircraft.canEdit && !aircraft.aircraft.isDemo
    val isOwner get() = aircraft.role == AircraftRole.Owner && !aircraft.aircraft.isDemo
    val online get() = store.sync.value.online

    var toast by mutableStateOf<Toast?>(null)

    fun change(type: String, table: String, rowId: String, label: String, payload: JsonObject, dependsOn: String? = null): String =
        store.change(type, id, table, rowId, label, payload, dependsOn).also { kick() }

    fun delete(type: String, table: String, rowId: String, label: String, payload: JsonObject) {
        store.delete(type, id, table, rowId, label, payload)
        kick()
    }

    /** The server's due item for a row ("mx:<id>", "ad:<id>", "doc:<id>"), when the snapshot has it. */
    fun due(key: String): DueItem? = snapshot?.items?.firstOrNull { it.key == key }

    /** "Airframe p. 60" for an entry, from this phone's copy of the books. */
    fun pageLabel(entryId: String?): String? {
        entryId ?: return null
        val e = store.mirror.raw("log_entry", entryId) ?: return null
        val page = e.s("page_id")?.let { store.mirror.raw("page", it) }
        val book = (page?.s("logbook_id") ?: e.s("logbook_id"))?.let { store.mirror.raw("logbook", it) }
        val name = book?.let { bookName(it.s("type") ?: "logbook", it.s("title")) } ?: return null
        return page?.s("page_sequence")?.let { "$name p. $it" } ?: name
    }

    /** Entries for a picker: newest first, "Jul 14, 2026 · Airframe p. 60" and the first words. */
    fun entries(): List<Pair<String, String>> = store.records("log_entry", id)
        .filter { it.s("replaced_by_entry_id") == null }
        .sortedByDescending { it.s("entry_date") ?: "" }
        .map { e -> e.id to listOfNotNull(e.s("entry_date")?.let(::longDate), pageLabel(e.id), e.s("description")?.take(80)).joinToString(" · ") }

    fun entryLine(entryId: String?): String? = entryId?.let { eid -> store.mirror.raw("log_entry", eid)?.let { e -> listOfNotNull(e.s("entry_date")?.let(::longDate), pageLabel(eid)).joinToString(" · ") } }

    /** Last tach this phone knows: the snapshot's meter or a newer reading saved here. */
    fun meter(name: String): Double? {
        val m = snapshot?.meters?.get(name)
        val server = m?.face ?: m?.stitched
        val local = store.records("hours_reading", id).filter { it.pending }.mapNotNull { it.d(name) }.maxOrNull()
        return listOfNotNull(server, local).maxOrNull()
    }
}

/** How a phase 4 screen moves: the phone's NavHost, or the tablet's right leaf. */
class RecNav(val open: (String) -> Unit, val back: () -> Unit, val tablet: Boolean = false)

val LocalRecNav = compositionLocalOf { RecNav({}, {}) }

/** Re-reads [read] whenever the outbox or the mirror moves (a sync, a queued change). */
@Composable
fun <T> Recs.watch(vararg keys: Any?, read: () -> T): T {
    val s by store.sync.collectAsStateWithLifecycle()
    return remember(s.version, s.lastSync, id, *keys) { read() }
}

object Routes {
    const val SQUAWK = "maint/squawk/{id}"
    const val AD = "maint/ad/{id}"
    const val ITEM = "maint/item/{id}"
    const val FIND_ADS = "maint/findads"
    const val NEW_SQUAWK = "maint/newsquawk"
    const val HOURS = "aircraft/hours"
    const val EQUIPMENT = "aircraft/equipment"
    const val COMPONENT = "aircraft/component/{id}"
    const val WB = "aircraft/wb"
    const val OIL = "aircraft/oil"
    const val DETAILS = "aircraft/details"
    const val DOC = "docs/doc/{id}"

    val all = listOf(SQUAWK, AD, ITEM, FIND_ADS, HOURS, EQUIPMENT, COMPONENT, WB, OIL, DETAILS, DOC)

    fun of(pattern: String, id: String) = pattern.replace("{id}", id)
}

/** One phase 4 screen by its route ("maint/ad/<id>"), on the phone or in the tablet's right leaf. */
@Composable
fun RecordsRoute(recs: Recs, route: String) {
    val parts = route.split("/")
    val arg = parts.getOrNull(2) ?: ""
    when ("${parts[0]}/${parts.getOrNull(1)}") {
        "maint/squawk" -> SquawkDetail(recs, arg)
        "maint/ad" -> AdDetail(recs, arg)
        "maint/item" -> ItemEditor(recs, arg)
        "maint/findads" -> FindAds(recs)
        "aircraft/hours" -> HoursScreen(recs)
        "aircraft/equipment" -> EquipmentScreen(recs)
        "aircraft/component" -> ComponentEditor(recs, arg)
        "aircraft/wb" -> WeightBalanceScreen(recs)
        "aircraft/oil" -> OilScreen(recs)
        "aircraft/details" -> DetailsScreen(recs)
        "docs/doc" -> DocViewer(recs, arg)
    }
}
