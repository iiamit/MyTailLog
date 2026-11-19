package com.mytaillog.core.db

/**
 * The typed mirror tables and their query columns, as declared in Mirror.sq (05 §6.2).
 * Besides these, every table has `id`, `aircraft_id`, `updated_at`, `_raw` and `_seq`.
 */
object MirrorTables {
    enum class Type { Text, Integer, Real }

    private fun t(vararg c: String) = c.map { it to Type.Text }
    private fun i(vararg c: String) = c.map { it to Type.Integer }
    private fun r(vararg c: String) = c.map { it to Type.Real }

    val columns: Map<String, List<Pair<String, Type>>> = mapOf(
        "aircraft" to t("tail_number", "owner_id", "make", "model") + i("year") + t("home_base", "situation_override"),
        "logbook" to t("type", "component_ref", "title"),
        "page" to t("logbook_id", "batch_id") + i("page_sequence") + t("extraction_status", "review_status") +
            i("needs_look") + t("landing_date", "thumbnail_path", "duplicate_of_page_id"),
        "log_entry" to t("page_id", "logbook_id", "entry_date") + r("tach", "hobbs", "airframe") + t("description") +
            i("owner_confirmed") + t("trust", "replaced_by_entry_id") + i("is_continuation"),
        "maintenance_item" to t("kind", "label") + i("regulatory", "interval_months") + r("interval_hours") +
            t("last_done_date") + r("last_done_hours") + t("next_due_date") + r("next_due_hours") + t("meter"),
        "ad_compliance" to t("kind", "reference", "title", "status", "complied_date", "next_due_date") + r("next_due_hours"),
        "item_completion" to t("maintenance_item_id", "ad_compliance_id", "log_entry_id", "done_date") + r("done_hours"),
        "logbook_gap" to t("logbook_id", "from_date", "to_date", "status"),
        "hours_reading" to t("reading_date") + r("tach", "hobbs", "airframe") + t("source"),
        "scan_batch" to t("logbook_id", "source") + i("expected_pages") + t("created_at", "completed_at"),
        "squawk" to t("description", "severity", "status", "reported_at"),
        "aircraft_status_snapshot" to t("computed_at") + i("inputs_seq"),
    )

    fun isTyped(table: String) = table in columns
}
