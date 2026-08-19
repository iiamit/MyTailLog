// ===========================================================================
// Provider price map for the usage/cost ledger. Prices are USD per 1M tokens.
//
// ponytail: hardcoded from provider pricing pages — there's no runtime source
// of truth for prices. Verify + update these when providers change pricing or
// when EXTRACTION_MODEL/TEXT_MODEL is pointed at a model not listed here.
// Matched by substring on the model id so overrides (e.g. dated snapshots) still
// resolve; an unknown model falls back to the Opus (priciest) tier so cost is
// never understated.
// ===========================================================================

type Price = { in: number; out: number };

const TIERS: Array<{ match: RegExp; price: Price }> = [
  { match: /opus/, price: { in: 15, out: 75 } },
  { match: /sonnet/, price: { in: 3, out: 15 } },
  { match: /haiku/, price: { in: 1, out: 5 } },
  { match: /gpt-5\.6-sol/, price: { in: 5, out: 30 } },
  { match: /gpt-5\.6-terra/, price: { in: 2, out: 12 } },
  { match: /gpt-5\.6-luna/, price: { in: 0.2, out: 1.2 } },
];

const FALLBACK: Price = { in: 15, out: 75 };

function priceFor(model: string): Price {
  return TIERS.find((t) => t.match.test(model))?.price ?? FALLBACK;
}

/** Estimated USD cost of one call, from its token counts. */
export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceFor(model);
  return (inputTokens * p.in + outputTokens * p.out) / 1_000_000;
}
