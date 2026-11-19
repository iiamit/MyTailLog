package com.mytaillog.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mytaillog.core.api.AircraftAccess
import com.mytaillog.core.api.AircraftRole
import com.mytaillog.core.api.StatusSnapshot
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * What Status shows. [snapshot] is the server's (09 §3.12: the server is the authority); it stays on
 * screen while a refresh runs or after one fails. [failed] with no snapshot is the error state.
 */
data class StatusUi(
    val aircraft: List<AircraftAccess> = emptyList(),
    val currentId: String? = null,
    val snapshot: StatusSnapshot? = null,
    val loading: Boolean = true,
    val failed: Boolean = false,
) {
    val current: AircraftAccess? get() = aircraft.firstOrNull { it.aircraft.id == currentId }
    val noAircraft: Boolean get() = !loading && !failed && aircraft.isEmpty()
}

/**
 * Loads the aircraft list and the current aircraft's status snapshot.
 * shortcut: snapshots are cached in memory only, until the phase 3 mirror and on-device engine land.
 */
class StatusViewModel(
    private val loadAircraft: suspend () -> List<AircraftAccess>,
    private val loadStatus: suspend (String) -> StatusSnapshot,
) : ViewModel() {
    private val state = MutableStateFlow(StatusUi())
    val ui: StateFlow<StatusUi> = state.asStateFlow()
    private val cache = mutableMapOf<String, StatusSnapshot>()
    private var job: Job? = null

    init {
        refresh()
    }

    /** Pull to refresh and Retry: the list and the current aircraft's snapshot again. */
    fun refresh() = load(state.value.currentId)

    fun select(aircraftId: String) {
        if (aircraftId == state.value.currentId) return
        state.update { it.copy(currentId = aircraftId, snapshot = cache[aircraftId], failed = false) }
        load(aircraftId)
    }

    private fun load(preferred: String?) {
        job?.cancel()
        job = viewModelScope.launch {
            state.update { it.copy(loading = true, failed = false) }
            try {
                val list = loadAircraft()
                val id = preferred?.takeIf { p -> list.any { it.aircraft.id == p } } ?: defaultAircraft(list)
                state.update { it.copy(aircraft = list, currentId = id, snapshot = id?.let(cache::get) ?: it.snapshot?.takeIf { s -> s.body.aircraftId == id }) }
                if (id == null) {
                    state.update { it.copy(loading = false) }
                    return@launch
                }
                val snap = loadStatus(id)
                cache[id] = snap
                state.update { it.copy(snapshot = snap, loading = false) }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                state.update { it.copy(loading = false, failed = true) }
            }
        }
    }
}

/** Until the hangar (M-HANGAR-01) remembers a choice: the user's own aircraft first, the demo last. */
fun defaultAircraft(list: List<AircraftAccess>): String? =
    (list.firstOrNull { it.role == AircraftRole.Owner && !it.aircraft.isDemo } ?: list.firstOrNull { !it.aircraft.isDemo } ?: list.firstOrNull())
        ?.aircraft?.id
