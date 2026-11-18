package com.mytaillog.core.db

import com.mytaillog.core.db.mirror.MirrorDatabase
import com.mytaillog.core.domain.PullPage
import com.mytaillog.core.domain.PullSink
import com.mytaillog.core.domain.SyncChange

const val MIRROR_DB = "mirror.db"
const val OUTBOX_DB = "outbox.db"

/** Reads and writes the pull cursor and applies pulled pages to mirror.db. */
class MirrorStore(private val db: MirrorDatabase) : PullSink {
    override fun cursor(): Long = db.mirrorQueries.stateValue(CURSOR).executeAsOneOrNull()?.toLongOrNull() ?: 0

    /** One page in one transaction, cursor included, so a crash never skips or half-applies a page (05 §6.3). */
    override fun apply(page: PullPage) = db.transaction {
        val q = db.mirrorQueries
        for (c in page.changes) when (c.op) {
            SyncChange.Op.Upsert -> q.upsertUnknown(c.table, c.id, requireNotNull(c.row) { "upsert without a row: ${c.table}/${c.id}" }.toString(), c.seq)
            SyncChange.Op.Delete -> q.deleteUnknown(c.table, c.id)
        }
        q.setState(CURSOR, page.nextCursor.toString())
    }

    private companion object { const val CURSOR = "cursor" }
}
