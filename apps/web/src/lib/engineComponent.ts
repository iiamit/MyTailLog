/** Equipment category names a system, not a complete powerplant. Explicit reviewed roles win. */
export function isEngineComponent(c: { category?: string | null; component_kind?: string | null; name: string; model?: string | null }): boolean {
  if (c.component_kind) return c.component_kind === "engine";
  if (c.category !== "engine") return false;
  if (/\b(pump|magneto|alternator|starter|exhaust|muffler|filter|monitor|mount|cylinder|baffle|hose|belt|injector|governor|sensor|tachometer)\b/i.test(c.name)) return false;
  return /\bengine\b|\b(?:AEIO|AIO|IO|O|TSIO|TIO|GTSIO|GO|HIO|LIO)-?\d{3}\b|\b(?:Rotax|Rotec|PT6)[\s-]*\w+/i.test(`${c.name} ${c.model ?? ""}`);
}
