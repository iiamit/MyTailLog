// OAuth scope constants + labels, kept free of any oidc-provider import so both
// the provider config and the (client-facing) portal/consent UI can use them.

// The read-only, per-aircraft scopes apps may request (see docs/oauth-api-plan).
export const OAUTH_SCOPES = [
  "openid",
  "offline_access",
  "airworthiness:read",
  "aircraft:read",
  "equipment:read",
  "hours:read",
  "hours:write",
  "oil:read",
  "weightbalance:read",
] as const;

// The data scopes a developer picks (openid is implicit; offline_access opt-in).
export const DATA_SCOPES = OAUTH_SCOPES.filter((s) => s !== "openid" && s !== "offline_access");

// Plain-English labels for the consent screen + developer portal.
export const SCOPE_LABELS: Record<string, string> = {
  "airworthiness:read": "Airworthiness — AD/inspection status, due dates, current hours",
  "aircraft:read": "Aircraft details — tail, make/model, serial numbers, home base",
  "equipment:read": "Installed equipment & components",
  "hours:read": "Current hours (hobbs / tach)",
  "hours:write": "Add hobbs / tach readings to your aircraft (e.g. synced flight hours)",
  "oil:read": "Oil-analysis samples & wear-metal trends",
  "weightbalance:read": "Weight & balance",
};
