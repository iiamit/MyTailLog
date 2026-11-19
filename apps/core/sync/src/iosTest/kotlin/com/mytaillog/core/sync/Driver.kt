package com.mytaillog.core.sync

import app.cash.sqldelight.db.QueryResult
import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.db.SqlSchema
import app.cash.sqldelight.driver.native.inMemoryDriver as nativeInMemory

actual fun inMemoryDriver(schema: SqlSchema<QueryResult.Value<Unit>>): SqlDriver = nativeInMemory(schema)
