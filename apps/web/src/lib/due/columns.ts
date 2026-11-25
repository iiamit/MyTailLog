/** Shared database projection for the canonical due engine and map inputs. */
export const DUE_AIRCRAFT_COLUMNS = "id, tail_number, enrollment_date, enrollment_tach, enrollment_hobbs, enrollment_airframe, expected_hours_per_week, situation_override, year, home_base";
export const DUE_TABLE_COLUMNS = {
  maintenance_item: "id, updated_at, kind, label, regulatory, interval_months, interval_hours, last_done_date, last_done_hours, next_due_date, next_due_hours, meter, line, provider_id, ifr_only, expires_on, shop_kind, visit_window_days, visit_window_hours",
  ad_compliance: "id, kind, reference, recurring, status, interval_months, interval_hours, complied_date, complied_hours, next_due_date, next_due_hours, reference_entry_id, provider_id",
  document: "id, type, title, expires_on, renews_every_months, track_expiry, remind_lead_days",
  item_completion: "id, maintenance_item_id, ad_compliance_id, log_entry_id, done_date, done_hours",
  log_entry: "id, logbook_id, page_id, entry_date, tach, hobbs, airframe, trust, replaced_by_entry_id, signature_name, is_continuation, mechanic_cert_number, entry_kind, description, work_performed, owner_confirmed",
  logbook: "id, type, component_ref, title",
  page: "id, logbook_id, page_sequence, extraction_status, landing_date",
  hours_reading: "id, updated_at, reading_date, tach, hobbs, airframe, source",
  meter_reset: "meter, reset_date, prior_value, new_value, id",
  planned_visit: "id, updated_at, status, week_of, visit_date, provider_id, airport, from_suggestion_key",
  planned_visit_item: "visit_id, item_key, done_completion_id, id",
  service_provider: "id, name, kind, airport, is_default",
  visit_suggestion_dismissal: "suggestion_key, id",
  record_room: "audience, expires_at, revoked_at, id",
  squawk: "id, description, severity, status, reported_at, resolved_at, resolved_log_entry_id",
  logbook_gap: "id, updated_at, logbook_id, from_date, to_date, status, source, note",
} as const;
