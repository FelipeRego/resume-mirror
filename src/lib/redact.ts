/**
 * Contact-PII redaction, designed to run in the browser BEFORE anything is
 * sent anywhere. That placement is the whole point: TypeSafe and OpenAI never
 * receive the candidate's contact details, which is an architectural guarantee
 * rather than a promise about how we handle data.
 *
 * Two design rules everything here follows:
 *
 *   1. LINE COUNT AND LINE ORDER NEVER CHANGE. Redaction rewrites tokens in
 *      place. The line-anchoring pass quotes "line 14", and that has to be
 *      line 14 of the document sitting on the candidate's screen.
 *
 *   2. NEVER EAT EVIDENCE. Dates, percentages, counts and money are the
 *      substance of a resume. A phone pattern that swallows "2021-2022" or
 *      "42% to 98%" would quietly destroy the thing being measured, so the
 *      numeric rules are deliberately conservative and err toward missing a
 *      phone number rather than eating a metric.
 *
 * Regex cannot reliably find a human name, so this is not a security boundary
 * on its own. It is the first pass; the review step in the UI is the second,
 * and the user is the authority.
 */

export type RedactionKind =
  | "name"
  | "email"
  | "phone"
  | "url"
  | "location"
  | "custom";

export type Redaction = {
  kind: RedactionKind;
  /** The text as it appeared in the original document. */
  original: string;
  /** What it was replaced with. */
  placeholder: string;
  /** 1-based line number, for showing the user where it was found. */
  line: number;
};

export type RedactionResult = {
  /** Safe to send. Same number of lines as the input. */
  text: string;
  found: Redaction[];
};

const PLACEHOLDER: Record<RedactionKind, string> = {
  name: "[NAME]",
  email: "[EMAIL]",
  phone: "[PHONE]",
  url: "[PROFILE URL]",
  location: "[LOCATION]",
  custom: "[REDACTED]",
};

/**
 * Order matters. Email runs before URL because an address contains something
 * that looks like a domain; URL runs before location because a URL can contain
 * a comma-separated path that reads like "City, ST".
 */
const RULES: { kind: RedactionKind; re: RegExp; guard?: (m: string) => boolean }[] = [
  {
    kind: "email",
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    kind: "url",
    // Profile and personal sites. Deliberately not matching bare company
    // domains mentioned in prose, which are not the candidate's identity.
    re: /\b(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com|github\.com|gitlab\.com|x\.com|twitter\.com|medium\.com|behance\.net|dribbble\.com|stackoverflow\.com)\/[^\s|,)]+/gi,
  },
  {
    kind: "phone",
    // Requires a phone-ish shape: an optional country code, then groups of
    // digits separated by space, dot, dash or parens.
    re: /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{2,4}[\s.-]\d{2,4}[\s.-]?\d{0,4}\b/g,
    guard: isPlausiblePhone,
  },
  {
    kind: "location",
    // "San Francisco, CA" / "Sydney NSW 2000" / "Melbourne, Australia".
    //
    // Matched against a CLOSED SET of states, territories and countries, not
    // against the shape "Capitalised, Capitalised". Resumes are full of
    // comma-separated title-case pairs — "Java, Spring Boot", "Data
    // Structures, Algorithms", "University of California, Berkeley" — and a
    // shape-based rule eats all of them.
    re: new RegExp(
      String.raw`\b[A-Z][A-Za-z.'’-]*(?:[ -][A-Z][A-Za-z.'’-]*)*,?\s+(?:${[
        // US states and DC
        "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN",
        "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV",
        "NH","NJ","NM","NY","NC","ND","OH","OK","PA","RI","SC","SD","TN","TX",
        "UT","VT","VA","WA","WV","WI","WY","DC",
        // Australian states and territories
        "NSW","VIC","QLD","SA","TAS","ACT","NT",
        // Canadian provinces
        "ON","BC","QC","AB","MB","SK","NS","NB","NL","PE",
        // Countries commonly written out on a resume
        "Australia","New Zealand","United States","USA","United Kingdom","UK",
        "Canada","Ireland","Singapore","India","Germany","France","Spain",
        "Netherlands","Brazil","Portugal","Japan","China",
      ].join("|")})\b(?:\s+\d{4,5})?`,
      "g",
    ),
    guard: isPlausibleLocation,
  },
];

/**
 * A phone number has at least 9 digits. This is what stops the rule eating
 * "2021 - 2022" (8 digits) and "45s to 8s". It will miss some short local
 * numbers, which is the correct trade: a missed phone is recoverable at the
 * review step, a destroyed date is not.
 */
function isPlausiblePhone(match: string): boolean {
  const digits = match.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 15) return false;

  // A bare 4-4 or 4-digit-range reads as a year span, not a number to call.
  if (/^\d{4}\s*[-–—]\s*\d{4}$/.test(match.trim())) return false;

  // Reject things sitting next to a unit or percent, e.g. "40% - 65%".
  if (/[%$]/.test(match)) return false;

  return true;
}

/**
 * The closed set still collides with a few real words. "SA" is South Australia
 * and also the tail of some acronyms; "IN", "OR" and "ON" are states and also
 * English words. Requiring the state token to be genuinely uppercase (or a
 * spelled-out country) removes most of that, and this guard covers the rest.
 */
const LOCATION_STOPWORDS =
  /\b(?:Skills|Experience|Education|Summary|Languages|Tools|Frontend|Backend|Stack|Certifications|Achievements|Projects|References|Coursework)\b/i;

function isPlausibleLocation(match: string): boolean {
  if (LOCATION_STOPWORDS.test(match)) return false;

  // The state/country token is the last non-numeric word.
  const tail = match.trim().replace(/\s+\d{4,5}$/, "").split(/[\s,]+/).pop() ?? "";

  // A two-or-three letter code must be all caps to count. This rejects
  // "... based in" style prose and lowercase collisions.
  if (tail.length <= 3 && tail !== tail.toUpperCase()) return false;

  // "IN", "OR", "ON", "AB" read as English far more often than as a state when
  // they follow no comma. Require the comma form for these.
  if (/^(?:IN|OR|ON|AB|SA|PE|DE|LA|ME|MS|MT|OK|LA)$/.test(tail) && !match.includes(",")) {
    return false;
  }

  return true;
}

/**
 * The header name. Resumes almost always open with it, on its own line, in
 * caps or title case, with no digits and no separators. Restricting the search
 * to the first few lines is what keeps this from redacting arbitrary
 * capitalised prose further down.
 */
function findHeaderName(lines: string[]): { line: number; text: string } | null {
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const raw = lines[i].trim();
    if (!raw) continue;

    // Stop at the first line that is clearly content rather than a header.
    if (/[@|•·,:/\d]/.test(raw)) return null;

    const words = raw.split(/\s+/);
    if (words.length < 2 || words.length > 4) continue;

    const allCaps = raw === raw.toUpperCase() && /[A-Z]/.test(raw);
    const titleCase = words.every((w) => /^[A-Z][a-z'’-]+$/.test(w));
    if (allCaps || titleCase) return { line: i + 1, text: raw };
  }
  return null;
}

/**
 * @param extra Additional literal strings the user asked to remove, from the
 *              review step. These are matched case-insensitively everywhere,
 *              which is how a name appearing mid-document gets caught.
 */
export function redact(input: string, extra: string[] = []): RedactionResult {
  const lines = input.split("\n");
  const found: Redaction[] = [];

  const header = findHeaderName(lines);

  // The full name AND its parts. Matching only the full string would leave
  // "Sasha also mentored..." untouched further down the document, which is the
  // most common way a name survives redaction. Parts are matched as whole
  // words, so this can over-redact an unusual surname that doubles as an
  // ordinary word — a visible cost at the review step, and the right way to be
  // wrong when the alternative is leaking the name.
  const literals = [...extra];
  if (header) {
    literals.push(header.text);
    for (const part of header.text.split(/\s+/)) {
      if (part.length >= 3) literals.push(part);
    }
  }

  // Longest first, so "Sasha Bernoulli" is consumed before "Sasha" can split it.
  literals.sort((a, b) => b.length - a.length);

  const nameLiterals = new Set(
    header
      ? [header.text.toLowerCase(), ...header.text.split(/\s+/).map((p) => p.toLowerCase())]
      : [],
  );

  const out = lines.map((line, idx) => {
    let working = line;
    const lineNo = idx + 1;

    // Structured rules run FIRST. They match on shape, and a name is usually
    // embedded inside that shape — sasha.bernoulli@email.com is one email, not
    // a name plus punctuation. Redacting the name first would break the local
    // part and leave the rest of the address behind, which is worse than doing
    // nothing.
    for (const rule of RULES) {
      working = working.replace(rule.re, (m) => {
        if (rule.guard && !rule.guard(m)) return m;
        found.push({
          kind: rule.kind,
          original: m,
          placeholder: PLACEHOLDER[rule.kind],
          line: lineNo,
        });
        return PLACEHOLDER[rule.kind];
      });
    }

    // Then the name and any user-supplied literals, to catch bare occurrences
    // the shape rules could not see — a first name in prose, a personal domain.
    for (const literal of literals) {
      const trimmed = literal.trim();
      if (trimmed.length < 2) continue;
      // \b so a name part only matches as a whole word — "Rego" never
      // matches inside "Oregon".
      const re = new RegExp(`\\b${escapeRegExp(trimmed)}\\b`, "gi");
      working = working.replace(re, (m) => {
        const kind: RedactionKind = nameLiterals.has(m.toLowerCase())
          ? "name"
          : "custom";
        found.push({ kind, original: m, placeholder: PLACEHOLDER[kind], line: lineNo });
        return PLACEHOLDER[kind];
      });
    }

    return working;
  });

  return { text: out.join("\n"), found };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Numbered, non-empty lines, for the line-anchoring pass. The number is the
 * line's position in the ORIGINAL document, so a quote the UI shows as
 * "line 14" is line 14 of what the candidate is looking at.
 */
export type NumberedLine = { n: number; text: string };

export function numberLines(text: string): NumberedLine[] {
  return text
    .split("\n")
    .map((text, i) => ({ n: i + 1, text: text.trim() }))
    .filter((l) => l.text.length > 0);
}
