/**
 * Redaction tests. Two failure modes matter here and they pull in opposite
 * directions: missing PII (a privacy failure) and eating evidence (a silent
 * correctness failure that makes the whole analysis wrong). Both are covered.
 *
 *   npm run verify
 */

import assert from "node:assert/strict";

import { numberLines, redact } from "../src/lib/redact";

const checks: string[] = [];
const check = (name: string, fn: () => void) => {
  fn();
  checks.push(name);
};

const RESUME = `SASHA BERNOULLI
San Francisco, CA | sasha.bernoulli@email.com | github.com/sashabernoulli | linkedin.com/in/sashabernoulli
+1 (415) 555-0142

PROFESSIONAL SUMMARY
Experienced Product Engineer building developer-focused tools.

EXPERIENCE

Senior Product Engineer | CloudSync Systems | San Francisco, CA | Jan 2022 - Present
- Led frontend architecture redesign, reducing initial load time by 65% and improving TypeScript coverage from 42% to 98%
- Optimized plugin installation pipeline, reducing time from 45s to 8s
- Handled 2M+ monthly requests across 10k+ nodes
- Sasha also mentored 3 junior engineers

Product Engineer | DevTools Lab | May 2021 - Dec 2021
- Architected IDE plugin marketplace with 50k+ downloads

SKILLS
Frontend: React, TypeScript, Redux, Vue.js
Backend: Node.js, Python, Go, PostgreSQL`;

export function run() {
  const { text, found } = redact(RESUME);
  const kinds = (k: string) => found.filter((f) => f.kind === k);

  // ---- finds the PII -----------------------------------------------------

  check("redacts the email address", () => {
    assert.ok(!text.includes("sasha.bernoulli@email.com"));
    assert.equal(kinds("email").length, 1);
  });

  check("redacts profile URLs", () => {
    assert.ok(!text.includes("github.com/sashabernoulli"));
    assert.ok(!text.includes("linkedin.com/in/sashabernoulli"));
    assert.equal(kinds("url").length, 2);
  });

  check("redacts the phone number", () => {
    assert.ok(!text.includes("555-0142"));
    assert.equal(kinds("phone").length, 1);
  });

  check("redacts the header name", () => {
    assert.ok(!text.includes("SASHA BERNOULLI"));
    assert.equal(kinds("name").length >= 1, true);
  });

  check("redacts the name where it recurs mid-document", () => {
    // "Sasha also mentored..." — the header-name literal is applied everywhere,
    // case-insensitively, which is the only way a mid-body name gets caught.
    assert.ok(!/\bSasha\b/i.test(text), "no Sasha anywhere");
  });

  check("redacts the city and state", () => {
    assert.ok(!text.includes("San Francisco, CA"));
  });

  // ---- does NOT eat the evidence ----------------------------------------

  check("keeps percentages", () => {
    assert.ok(text.includes("65%"), "65%");
    assert.ok(text.includes("42% to 98%"), "42% to 98%");
  });

  check("keeps employment date ranges", () => {
    assert.ok(text.includes("Jan 2022 - Present"), "Jan 2022 - Present");
    assert.ok(text.includes("May 2021 - Dec 2021"), "May 2021 - Dec 2021");
  });

  check("keeps scale figures", () => {
    assert.ok(text.includes("2M+"), "2M+");
    assert.ok(text.includes("10k+"), "10k+");
    assert.ok(text.includes("50k+"), "50k+");
    assert.ok(text.includes("45s to 8s"), "45s to 8s");
  });

  check("keeps employer names, which the analysis needs", () => {
    assert.ok(text.includes("CloudSync Systems"));
    assert.ok(text.includes("DevTools Lab"));
  });

  check("keeps the skills list intact", () => {
    assert.ok(text.includes("React, TypeScript, Redux"), "comma-separated tech");
    assert.ok(text.includes("Node.js, Python, Go, PostgreSQL"));
  });

  // Regression: a shape-based location rule ate all of these, because
  // "Capitalised, Capitalised" is the single most common pattern in a resume.
  check("comma-separated title-case pairs are not mistaken for locations", () => {
    const cases = [
      "Backend: Node.js, Python (FastAPI), Go, Java (Spring Boot), SQL",
      "Frontend: React, Vue.js, TypeScript, Webpack, Tailwind CSS, Material-UI",
      "Developer Tools: Git, Docker, GitHub Actions, Datadog, New Relic",
      "Specializations: Developer Experience, API Design, Real-time Systems",
      "Relevant Coursework: Data Structures, Algorithms, Systems Design, Databases",
      "B.S. Computer Science | University of California, Berkeley | 2019",
    ];
    for (const c of cases) {
      const r = redact(c);
      assert.equal(
        r.found.filter((f) => f.kind === "location").length,
        0,
        `should not redact a location in: ${c}`,
      );
      assert.equal(r.text, c, `should be byte-identical: ${c}`);
    }
  });

  check("still catches real locations in their common forms", () => {
    const cases: [string, string][] = [
      ["San Francisco, CA", "US city and state"],
      ["Sydney, NSW 2000", "AU city, state and postcode"],
      ["Melbourne, Australia", "city and country"],
      ["Toronto, ON", "Canadian province"],
      ["Austin, TX 78701", "US with ZIP"],
    ];
    for (const [c, why] of cases) {
      const r = redact(`Based in ${c} | available now`);
      assert.equal(
        r.found.filter((f) => f.kind === "location").length,
        1,
        `should redact ${why}: ${c}`,
      );
    }
  });

  check("a bare year range is never read as a phone number", () => {
    const r = redact("Worked there 2019-2023 and 2015 - 2018.");
    assert.equal(r.found.filter((f) => f.kind === "phone").length, 0);
    assert.ok(r.text.includes("2019-2023"));
    assert.ok(r.text.includes("2015 - 2018"));
  });

  // ---- structural guarantees --------------------------------------------

  check("line count is preserved exactly", () => {
    assert.equal(text.split("\n").length, RESUME.split("\n").length);
  });

  check("every line keeps its position", () => {
    const before = RESUME.split("\n");
    const after = text.split("\n");
    // A line with no PII must come back byte-identical.
    assert.equal(after[4], before[4], "PROFESSIONAL SUMMARY unchanged");
    assert.equal(after[7], before[7], "EXPERIENCE unchanged");
  });

  check("numbered lines carry original document positions", () => {
    const numbered = numberLines(text);
    assert.equal(numbered[0].n, 1, "first line is 1");
    const summary = numbered.find((l) => l.text === "PROFESSIONAL SUMMARY");
    assert.equal(summary?.n, 5, "PROFESSIONAL SUMMARY is line 5 of the original");
  });

  check("blank lines are dropped from numbering but not from the document", () => {
    const numbered = numberLines(text);
    assert.ok(numbered.every((l) => l.text.length > 0));
    assert.ok(text.includes("\n\n"), "document still has its blank lines");
  });

  // ---- user-supplied extras ----------------------------------------------

  check("user-added literals are removed everywhere, case-insensitively", () => {
    const r = redact("Contact CloudSync or cloudsync for details.", ["CloudSync"]);
    assert.ok(!/cloudsync/i.test(r.text));
    assert.equal(r.found.filter((f) => f.kind === "custom").length, 2);
  });

  check("reports what it removed, with line numbers, for the review step", () => {
    const emailHit = found.find((f) => f.kind === "email");
    assert.equal(emailHit?.line, 2, "email was on line 2");
    assert.equal(emailHit?.original, "sasha.bernoulli@email.com");
  });

  check("handles a resume with no PII at all without damage", () => {
    const plain = "EXPERIENCE\n- Built things\n- Shipped them";
    const r = redact(plain);
    assert.equal(r.text, plain);
    assert.equal(r.found.length, 0);
  });

  for (const c of checks) console.log(`  ok  ${c}`);
  return checks.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const n = run();
  console.log(`\n${n} redaction checks passed.`);
}
