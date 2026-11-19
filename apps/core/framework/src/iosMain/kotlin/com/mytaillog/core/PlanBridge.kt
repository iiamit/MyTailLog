package com.mytaillog.core

import com.mytaillog.core.domain.due.StatusBody
import com.mytaillog.core.domain.due.Visits
import com.mytaillog.core.domain.due.planDate
import kotlinx.serialization.json.Json

private val lenient = Json { ignoreUnknownKeys = true; explicitNulls = false }

/**
 * Plan ahead on iOS (06 M-STATUS-03): core's planDate over the status snapshot as JSON, so Swift never builds Kotlin
 * types. [visitsJson] (GET …/visits, 24 months) replaces the snapshot's visits when given. Returns PlanResult as JSON,
 * or "" when the snapshot can't be read (a Kotlin exception would end the app from Swift).
 */
fun planDateJson(statusJson: String, visitsJson: String?, date: String, hoursPerWeek: Double?): String = runCatching {
    var body = lenient.decodeFromString(StatusBody.serializer(), statusJson)
    if (visitsJson != null) body = body.copy(visits = lenient.decodeFromString(Visits.serializer(), visitsJson))
    Json.encodeToString(com.mytaillog.core.domain.due.PlanResult.serializer(), planDate(body, date, hoursPerWeek))
}.getOrDefault("")
