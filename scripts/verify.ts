/**
 * Verifies the parts we own: the state and questions we send Jev, and the
 * arithmetic we do on what comes back. Stubs the transport, so it costs
 * nothing and needs no API key.
 *
 *   npm run verify
 */

import assert from "node:assert/strict";

import { DIMENSIONS, MAX_SCORE } from "../src/lib/dimensions";
import { screen } from "../src/lib/screen";

type Payload = {
  state: Record<string, unknown>;
  model: string;
  questions: Record<string, Record<string, unknown>>;
};

const sent: Payload[] = [];

/** What the fake job ad "wants". Everything else lands below the threshold. */
const WANTS: Record<string, number> = {
  data_analysis: 0.95,
  sql_querying: 0.88,
  stakeholder_management: 0.7,
  people_leadership: 0.45,
  programming: 0.2, // below the 0.4 threshold — must not be scored
};

/** Raw Jev scores (0..4) the fake resume earns. */
const SHOWS: Record<string, number> = {
  data_analysis: 3.6,
  sql_querying: 1.0,
  stakeholder_management: 2.0,
  people_leadership: 0.4,
};

/** stakeholder_management comes back too uncertain to act on. */
const LOW_CONFIDENCE = new Set(["stakeholder_management"]);

const stubFetch = async (_url: string, init?: RequestInit): Promise<Response> => {
  const payload = JSON.parse(String(init?.body)) as Payload;
  sent.push(payload);

  const onResume = "resume" in payload.state;
  const answers: Record<string, unknown> = {};

  for (const [id, q] of Object.entries(payload.questions)) {
    if (q.type === "noul") {
      if (id.startsWith("has__")) {
        // machine_learning-style absence: no line to anchor to.
        answers[id] = { type: "noul", noul: id === "has__people_leadership" ? 0.1 : 0.9 };
        continue;
      }
      const dim = id.startsWith("req__") ? id.slice(5) : null;
      answers[id] = { type: "noul", noul: dim ? (WANTS[dim] ?? 0.05) : 0.3 };
    } else if (q.type === "score") {
      if (id === "experience_years") {
        answers[id] = { type: "score", score: 3.0, confidence: 0.8, legend: {}, probabilities: {} };
      } else {
        const dim = id.slice(5);
        answers[id] = {
          type: "score",
          score: SHOWS[dim] ?? 0,
          confidence: LOW_CONFIDENCE.has(dim) ? 0.3 : 0.9,
          legend: {},
          probabilities: {},
        };
      }
    } else if (id.startsWith("where__")) {
      answers[id] = {
        type: "choice",
        choice: "L3",
        confidence: 0.8,
        probabilities: { L3: 0.8, L1: 0.2 },
      };
    } else {
      // Choice. The role reads senior/data_analyst; the resume reads mid/data_engineer.
      const pick =
        id === "seniority"
          ? onResume
            ? "mid"
            : "senior"
          : id === "progression"
            ? "steady_growth"
            : onResume
              ? "data_engineer"
              : "data_analyst";
      answers[id] = {
        type: "choice",
        choice: pick,
        confidence: 0.85,
        probabilities: { [pick]: 0.85, other: 0.15 },
      };
    }
  }

  return new Response(
    JSON.stringify({
      model: "jev-1.13.0",
      answers,
      usage: { input_tokens: 100, output_tokens: 10 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};

const checks: string[] = [];
const check = (name: string, fn: () => void) => {
  fn();
  checks.push(name);
};

async function main() {
  process.env.TYPESAFE_API_KEY ||= "test-key-not-used";

  const RESUME = [
    "ALEX TAYLOR",
    "Data analyst with eight years across retail and finance.",
    "- Built the weekly trading pack used by the exec team",
    "- Ran cohort analysis that changed the retention budget",
  ].join("\n");

  const result = await screen(RESUME, "a job ad".repeat(30), {
    fetch: stubFetch,
  });

  // ---- state decomposition (build guide, step 2) -------------------------

  check("sends four passes", () => {
    assert.equal(sent.length, 4);
  });

  const rolePass = sent.find((p) => !("resume" in p.state))!;
  const candidatePass = sent.find(
    (p) =>
      "resume" in p.state &&
      !("job_ad" in p.state) &&
      Object.keys(p.questions).some((k) => k.startsWith("dim__")),
  )!;
  const anchorPass = sent.find((p) =>
    Object.keys(p.questions).some((k) => k.startsWith("where__")),
  )!;
  const fitPass = sent.find((p) => "resume" in p.state && "job_ad" in p.state)!;

  check("the role pass never sees the resume", () => {
    assert.deepEqual(Object.keys(rolePass.state), ["job_ad"]);
  });

  check("the candidate pass never sees the job ad", () => {
    assert.deepEqual(Object.keys(candidatePass.state), ["resume"]);
  });

  check("only comparison questions get both halves of the state", () => {
    assert.deepEqual(Object.keys(fitPass.state).sort(), ["job_ad", "resume"]);
    assert.deepEqual(Object.keys(fitPass.questions).sort(), [
      "buries_the_lede",
      "hard_requirement_conflict",
      "tailored_to_ad",
    ]);
  });

  check("role pass asks one requirement noul per catalogue dimension", () => {
    const nouls = Object.keys(rolePass.questions).filter((k) =>
      k.startsWith("req__"),
    );
    assert.equal(nouls.length, DIMENSIONS.length);
  });

  check("candidate pass scores only the dimensions above threshold", () => {
    const scored = Object.keys(candidatePass.questions)
      .filter((k) => k.startsWith("dim__"))
      .map((k) => k.slice(5))
      .sort();
    assert.deepEqual(scored, [
      "data_analysis",
      "people_leadership",
      "sql_querying",
      "stakeholder_management",
    ]);
  });

  check("questions point at state with backticked paths", () => {
    const withPaths = Object.values(candidatePass.questions).filter((q) => {
      const i = q.instructions;
      const text = typeof i === "string" ? i : JSON.stringify(i);
      return text.includes("`resume`");
    });
    assert.ok(withPaths.length > 0, "at least some questions cite `resume`");
  });

  check("score rubrics stay within the API's 2..10 levels", () => {
    for (const p of sent) {
      for (const q of Object.values(p.questions)) {
        if (q.type !== "score") continue;
        const levels = q.criteria as unknown[];
        assert.ok(levels.length >= 2 && levels.length <= 10, "level count");
      }
    }
  });

  check("the dated questions carry today's date rather than assuming it", () => {
    const q = candidatePass.questions.experience_years;
    assert.ok(
      (q.instructions as Record<string, unknown>).today,
      "experience_years carries today",
    );
  });

  // ---- arithmetic (step 7) ------------------------------------------------

  check("importance comes straight from the job-ad noul", () => {
    const d = result.dimensions.find((x) => x.id === "data_analysis")!;
    assert.equal(d.importance, 0.95);
  });

  check("demonstrated normalises the raw score across the rubric", () => {
    const d = result.dimensions.find((x) => x.id === "sql_querying")!;
    assert.equal(d.demonstrated, 1.0 / MAX_SCORE);
  });

  check("fit is the importance-weighted mean of demonstrated", () => {
    let num = 0;
    let den = 0;
    for (const id of Object.keys(SHOWS)) {
      num += WANTS[id] * (SHOWS[id] / MAX_SCORE);
      den += WANTS[id];
    }
    assert.ok(Math.abs(result.fit - num / den) < 1e-9, `fit ${result.fit}`);
  });

  check("cost is importance x shortfall", () => {
    for (const d of result.dimensions) {
      assert.ok(Math.abs(d.cost - d.importance * (1 - d.demonstrated)) < 1e-9, d.id);
    }
  });

  check("gaps rank by cost, not by lowest score", () => {
    const costs = result.gaps.map((g) => g.cost);
    assert.deepEqual(costs, [...costs].sort((a, b) => b - a));
    const sql = result.gaps.findIndex((g) => g.id === "sql_querying");
    const lead = result.gaps.findIndex((g) => g.id === "people_leadership");
    assert.ok(sql >= 0 && lead >= 0 && sql < lead, "sql outranks leadership");
  });

  check("years convert from the 2-year band spacing", () => {
    assert.equal(result.experience.years, 6);
    assert.equal(result.experience.band, "About 6 years");
  });

  // ---- confidence routing (step 8) ---------------------------------------

  check("a low-confidence score is quarantined, not turned into advice", () => {
    assert.ok(
      result.unreadable.some((d) => d.id === "stakeholder_management"),
      "appears in unreadable",
    );
    assert.ok(
      !result.gaps.some((d) => d.id === "stakeholder_management"),
      "never appears in gaps",
    );
    assert.ok(
      !result.strengths.some((d) => d.id === "stakeholder_management"),
      "never appears in strengths",
    );
  });

  check("a quarantined score still counts toward fit", () => {
    // Dropping it would quietly reshape the headline number.
    assert.ok(
      result.dimensions.some((d) => d.id === "stakeholder_management"),
      "still in the full list",
    );
  });

  check("confident dimensions are unaffected by the quarantine", () => {
    assert.ok(result.gaps.some((d) => d.id === "sql_querying"));
  });

  // ---- comparisons --------------------------------------------------------

  check("seniority delta compares demonstrated against required", () => {
    assert.equal(result.seniority.required, "senior");
    assert.equal(result.seniority.demonstrated, "mid");
    assert.equal(result.seniority.delta, -1);
    assert.equal(result.seniority.uncertain, false);
  });

  check("a talent-profile mismatch is detected across the two passes", () => {
    assert.equal(result.profile.roleWants, "data_analyst");
    assert.equal(result.profile.resumeReads, "data_engineer");
    assert.equal(result.profile.matches, false);
  });

  check("comparison signals come from the pass that saw both", () => {
    assert.equal(result.signals.tailoredToAd, 0.3);
    assert.equal(result.signals.buriesTheLede, 0.3);
  });

  check("usage sums across all four passes", () => {
    assert.equal(result.usage.inputTokens, 400);
  });

  // ---- line anchoring (pass 4) -------------------------------------------

  check("the anchor pass sees only the resume, with lines tagged", () => {
    assert.deepEqual(Object.keys(anchorPass.state), ["resume"]);
    assert.match(String(anchorPass.state.resume), /^L1\| ALEX TAYLOR/);
  });

  check("every gap gets both a where and a has question", () => {
    const wheres = Object.keys(anchorPass.questions).filter((k) => k.startsWith("where__"));
    const hases = Object.keys(anchorPass.questions).filter((k) => k.startsWith("has__"));
    assert.equal(wheres.length, hases.length);
    assert.ok(wheres.length > 0);
  });

  check("line ids offered as options are the original line numbers", () => {
    const q = Object.entries(anchorPass.questions).find(([k]) => k.startsWith("where__"))![1];
    assert.deepEqual(Object.keys(q.criteria as object), ["L1", "L2", "L3", "L4"]);
  });

  check("a gap with a matching line gets anchored to it", () => {
    const sql = result.gaps.find((g) => g.id === "sql_querying")!;
    assert.equal(sql.anchor?.line, 3);
    assert.match(sql.anchor!.text, /weekly trading pack/);
  });

  check("a gap the resume cannot support is left unanchored", () => {
    // has__people_leadership came back 0.1 — nothing to point at, so pointing
    // anywhere would be worse than pointing nowhere.
    const lead = result.gaps.find((g) => g.id === "people_leadership");
    assert.equal(lead?.anchor, null);
  });

  for (const c of checks) console.log(`  ok  ${c}`);
  console.log(`\n${checks.length} checks passed.`);
}

main().catch((error) => {
  console.error("\nFAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
