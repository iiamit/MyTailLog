package com.mytaillog.app

import android.annotation.SuppressLint
import android.content.Context
import android.os.storage.StorageManager

// Fall back to physical free space if the storage service cannot estimate reclaimable space.
@SuppressLint("UsableSpace")
internal fun lowScanStorage(context: Context): Boolean {
    val bytes = runCatching {
        val storage = context.getSystemService(StorageManager::class.java)
        storage.getAllocatableBytes(storage.getUuidForPath(context.filesDir))
    }.getOrElse { context.filesDir.usableSpace }
    return bytes < 200L * 1024 * 1024
}
