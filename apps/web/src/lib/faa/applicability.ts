// ===========================================================================
// Applicability — pull the MODEL DESIGNATIONS an AD names out of its title and
// abstract, so an owner can see whether their specific variant is actually
// listed instead of guessing from the manufacturer alone.
//
// Neither source hands us a structured model list. The Federal Register gives a
// title and an abstract; DRS gives a title and a truncated OCR teaser. Both
// write applicability the same two ways:
//
//   "…Model 172N, 172P, 172Q, 172RG, F172N, F172P, FR172K airplanes"   (keyword)
//   "Cessna Aircraft Company 172, 175, 180, 182 Series Airplanes"      (noun)
//
// So we walk forward from a "Model(s)" keyword and backward from a product noun
// ("airplanes", "engines", "propellers", …), collecting designation-shaped
// tokens until something that isn't one ends the run.
//
// This is a READING AID, not a determination. A parsed list can be incomplete
// (the binding applicability lives in the AD's own Applicability paragraph,
// usually with serial-number ranges we deliberately don't try to interpret).
// The UI presents it as such — applicability is the owner's and their A&P's call.
// ===========================================================================

/** Words naming the product an AD applies to — the right edge of a model list. */
const PRODUCT_NOUN =
  /^(?:airplanes?|aircraft|helicopters?|rotorcraft|engines?|propellers?|gliders?|balloons?|airships?)$/i;

/** Filler allowed *inside* a run, but only when a designation follows it. */
const RUN_FILLER = /^(?:series|and|or|&|thru|through)$/i;

/** Model designations are capped so a runaway match can't flood the UI. */
const MAX_MODELS = 40;

/** An AD number ("2015-19-07", "79-10-14") — never a model designation. Note
 *  the 2-or-4 digit year: a 3-digit lead is a model ("TAE 125-02-99"). */
const AD_NUMBER_SHAPE = /^(?:\d{2}|\d{4})-\d{2}-\d{2}[a-z]?$/i;

/**
 * Does this token look like a model designation? Must carry a digit (models
 * essentially always do: 172N, B300C, O-320, TAE 125-02-99, 2A36) and be short
 * alphanumeric-with-punctuation. Years and AD numbers are excluded.
 */
function isDesignation(tok: string): boolean {
  if (tok.length > 24 || !/\d/.test(tok)) return false;
  if (!/^[A-Za-z0-9][A-Za-z0-9./-]*$/.test(tok)) return false;
  if (/^(?:19|20)\d{2}$/.test(tok)) return false; // a year
  if (AD_NUMBER_SHAPE.test(tok)) return false; // an AD number
  return true;
}

/**
 * Words and bare designations. Commas are dropped outright — a list separator
 * carries no meaning here, and any *word* that isn't a designation already ends
 * the run, so "172N, 172P" and "172N 172P" parse identically.
 */
function tokenize(text: string): string[] {
  return text.match(/[A-Za-z0-9][A-Za-z0-9./-]*/g) ?? [];
}

/**
 * Some designations are two tokens: "Model TAE 125-02-99". Glue a short
 * all-letters prefix onto the designation that follows it — but never the
 * "Model" keyword itself or a run separator ("and 210").
 */
function glue(prefix: string | undefined, model: string): string {
  if (!prefix || !/^[A-Za-z]{2,5}$/.test(prefix)) return model;
  if (RUN_FILLER.test(prefix) || /^models?$/i.test(prefix)) return model;
  return `${prefix} ${model}`;
}

/**
 * Every model designation named in the given AD text (title, abstract, or both
 * concatenated), in the order they appear, deduplicated case-insensitively.
 */
export function extractModels(...texts: (string | null | undefined)[]): string[] {
  const tokens = tokenize(texts.filter(Boolean).join(". "));
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (m: string) => {
    const key = m.toUpperCase();
    if (!seen.has(key) && out.length < MAX_MODELS) {
      seen.add(key);
      out.push(m);
    }
  };

  for (let i = 0; i < tokens.length; i++) {
    // Forward from a "Model"/"Models" keyword.
    if (/^models?$/i.test(tokens[i])) {
      for (let j = i + 1; j < tokens.length; j++) {
        if (isDesignation(tokens[j])) {
          push(glue(tokens[j - 1], tokens[j]));
        } else if (RUN_FILLER.test(tokens[j]) && isDesignation(tokens[j + 1] ?? "")) {
          continue; // "172R and 172S"
        } else if (
          /^[A-Za-z]{2,5}$/.test(tokens[j]) &&
          isDesignation(tokens[j + 1] ?? "")
        ) {
          continue; // prefix token — the glue above picks it up
        } else {
          break; // the run ends here
        }
      }
    }

    // Backward from a product noun: "Cessna … 172, 175, 180 Series Airplanes".
    if (PRODUCT_NOUN.test(tokens[i])) {
      const run: string[] = [];
      for (let j = i - 1; j >= 0; j--) {
        if (isDesignation(tokens[j])) {
          run.unshift(glue(tokens[j - 1], tokens[j]));
        } else if (RUN_FILLER.test(tokens[j]) && isDesignation(tokens[j - 1] ?? "")) {
          continue;
        } else {
          break;
        }
      }
      run.forEach(push);
    }
  }
  return out;
}

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Does an AD's model designation cover the owner's model? Exact match, or the
 * shorter one is the longer one's base series with a LETTER suffix — an AD on
 * "Model 172" covers a 172N, and "O-320" covers an "O-320-D2J". A digit suffix
 * is a different model, so "17" never matches "172".
 */
export function modelMatches(adModel: string, ownerModel: string): boolean {
  const a = norm(adModel);
  const b = norm(ownerModel);
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  // A 1-char stem ("5" vs "5B") is noise, not a series.
  if (short.length < 2 || !long.startsWith(short)) return false;
  return /\d$/.test(short) && /^[A-Z]/.test(long.slice(short.length));
}

/**
 * The subset of an AD's models that cover the owner's model. Empty means the
 * AD didn't name their variant — which is a prompt to check the AD itself, not
 * proof it doesn't apply (the model list is parsed prose, and applicability
 * often turns on serial numbers or installed equipment).
 */
export function matchedModels(models: string[], ownerModel: string | null): string[] {
  if (!ownerModel?.trim()) return [];
  return models.filter((m) => modelMatches(m, ownerModel));
}
