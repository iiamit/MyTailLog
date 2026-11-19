package com.mytaillog.core.domain

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * The mutation catalogue, mirrored from apps/web/src/lib/sync/mutations.ts (MUTATIONS).
 * The server is the authority; this copy lets the phone refuse online-only types
 * before queueing them and attach `base` where the server will demand it.
 */
object Mutations {
    enum class Base { Never, Always, IfId }

    data class Rule(val base: Base, val online: Boolean = false)

    const val MAX_PER_PUSH = 100

    val catalogue: Map<String, Rule> = buildMap {
        fun never(vararg t: String) = t.forEach { put(it, Rule(Base.Never)) }
        fun always(vararg t: String) = t.forEach { put(it, Rule(Base.Always)) }
        fun ifId(vararg t: String) = t.forEach { put(it, Rule(Base.IfId)) }
        fun online(vararg t: String) = t.forEach { put(it, Rule(Base.Never, online = true)) }

        never("entry.create", "entries.confirmClean", "page.reorder", "page.delete", "reading.create",
            "meterReset.create", "mx.seedStandard", "ad.track", "proposals.confirm", "proposals.dismiss",
            "squawk.create", "oil.create", "gap.create")
        always("entry.update", "entry.confirm", "entry.delete", "entry.merge", "entry.setLinks", "page.review", "gap.setStatus",
            "reading.update", "reading.delete", "meterReset.delete", "mx.delete", "mx.complete", "ad.delete",
            "component.delete", "component.remove", "component.reinstall", "squawk.resolve", "squawk.reopen",
            "squawk.update", "squawk.delete", "oil.delete", "document.update", "document.setEntry",
            "document.delete", "wb.delete")
        ifId("mx.upsert", "ad.upsert", "component.upsert", "wb.upsert")
        online("page.extract", "mx.scan", "equipment.scan", "aircraft.enroll", "backup.run")
    }

    fun isKnown(type: String): Boolean = type in catalogue

    /** Online-only types are never queued (00 §3 rule 7, 05 §6.5). */
    fun isOnlineOnly(type: String): Boolean = catalogue[type]?.online == true

    /** Whether this mutation changes an existing row and so must carry `base`. */
    fun needsBase(type: String, payload: JsonObject): Boolean = when (catalogue[type]?.base) {
        Base.Always -> true
        Base.IfId -> (payload["id"] as? JsonPrimitive)?.takeIf { it.isString }?.content?.isNotEmpty() == true
        else -> false
    }
}
