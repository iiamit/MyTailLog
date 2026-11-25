package com.mytaillog.app

import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mytaillog.core.api.AircraftAccess
import com.mytaillog.core.api.Books
import com.mytaillog.core.api.GapEvidence
import com.mytaillog.core.domain.Mutation
import com.mytaillog.core.domain.PushResult
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** What Logbooks shows for the current aircraft. [books] stays on screen while a refresh runs or after one fails. */
data class BooksUi(
    val aircraft: AircraftAccess? = null,
    val books: Books? = null,
    val loading: Boolean = true,
    val failed: Boolean = false,
    /** A write that didn't land, in words (12): shown once, then cleared. */
    val message: String? = null,
) {
    val canEdit: Boolean get() = aircraft?.canEdit == true
}

/**
 * Loads the aircraft's map and rows and sends review and gap writes through push. A write that can't
 * reach the server goes to the outbox ([queue]) and uploads later (07 B-OFFLINE).
 * shortcut: reads stay online with an in-memory copy; the map and rows aren't derived from the mirror yet.
 */
class BooksViewModel(
    private val load: suspend (String) -> Books,
    private val push: suspend (List<Mutation>) -> List<PushResult>,
    private val loadEvidence: suspend (String, String) -> GapEvidence,
    private val loadImage: suspend (String, Boolean) -> ByteArray,
    private val queue: ((List<Mutation>) -> Unit)? = null,
    private val unqueue: ((List<String>) -> Unit)? = null,
    private val rereadPage: (suspend (String) -> Unit)? = null,
) : ViewModel() {
    private val state = MutableStateFlow(BooksUi())
    val ui: StateFlow<BooksUi> = state.asStateFlow()
    private val cache = mutableMapOf<String, Books>()
    private val images = LruCache<String, ImageBitmap>(48)
    private var job: Job? = null
    private val pendingDetails = mutableMapOf<String, String>()
    fun detailsPending(pageId: String): Boolean = pageId in pendingDetails
    suspend fun reread(pageId: String): String? = try { rereadPage?.invoke(pageId) ?: error("Reading is unavailable."); refresh(); null } catch (e: CancellationException) { throw e } catch (e: Exception) { e.message ?: "Connect to read this page." }

    /** Follows Status's current aircraft. */
    fun show(access: AircraftAccess?) {
        if (access?.aircraft?.id == state.value.aircraft?.aircraft?.id) {
            state.update { it.copy(aircraft = access) }
            return
        }
        state.update { BooksUi(access, access?.aircraft?.id?.let(cache::get), loading = access != null) }
        refresh()
    }

    fun refresh() {
        val id = state.value.aircraft?.aircraft?.id ?: return
        job?.cancel()
        job = viewModelScope.launch {
            state.update { it.copy(loading = true, failed = false) }
            try {
                val b = load(id)
                pendingDetails.entries.removeAll { (pageId, base) -> b.pages.any { it.id == pageId && it.updatedAt != base } }
                cache[id] = b
                state.update { if (it.aircraft?.aircraft?.id == id) it.copy(books = b, loading = false) else it }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                state.update { it.copy(loading = false, failed = true) }
            }
        }
    }

    fun messageShown() = state.update { it.copy(message = null) }

    /**
     * Sends [mutations] in one push and reloads. Returns the results when every change landed, an empty
     * list when they were kept on this phone for later, null otherwise (the message says why: no
     * permission, or changed elsewhere).
     */
    suspend fun write(mutations: List<Mutation>): List<PushResult>? {
        val results = try {
            push(mutations)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            if (queue != null && e !is com.mytaillog.core.api.SyncHttpException) {
                queue(mutations)
                mutations.filter { it.type == "page.details" }.forEach { m -> (m.payload["pageId"] as? kotlinx.serialization.json.JsonPrimitive)?.content?.let { pendingDetails[it] = m.base.orEmpty() } }
                state.update { it.copy(message = SAVED_ON_PHONE) }
                return emptyList()
            }
            state.update { it.copy(message = WRITE_FAILED) }
            return null
        }
        refresh()
        val bad = results.firstOrNull { it.status != PushResult.Status.Ok } ?: return results
        state.update { it.copy(message = if (bad.status == PushResult.Status.Conflict) WRITE_CONFLICT else bad.error ?: WRITE_FAILED) }
        return null
    }

    /** Undo of a write that is still on this phone: take it out of the outbox. */
    fun unqueue(ids: List<String>) = unqueue?.invoke(ids)

    suspend fun evidence(gapId: String): GapEvidence? {
        val id = state.value.aircraft?.aircraft?.id ?: return null
        return try {
            loadEvidence(id, gapId)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            null
        }
    }

    /** A page scan or thumbnail, decoded once and kept for the session. Null when it can't be fetched. */
    suspend fun image(pageId: String, thumb: Boolean): ImageBitmap? {
        val key = "$pageId:$thumb"
        images.get(key)?.let { return it }
        return try {
            val bytes = loadImage(pageId, thumb)
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()?.also { images.put(key, it) }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            null
        }
    }

    companion object {
        const val SAVED_ON_PHONE = "Saved on this phone. It uploads when you have signal."
        const val WRITE_FAILED = "That didn't save. Check your signal and try again."
        const val WRITE_CONFLICT = "This changed on another device. The latest is loaded; check it and try again."
    }
}
