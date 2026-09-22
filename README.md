# Resume Mirror

Resume screening, pointed the other way. The TypeSafe docs use resume screening
as their worked example for [composite scoring][cs] — a recruiter ranking
candidates. This runs the same machinery for the person being ranked: paste your
resume and the ad you're applying for, and see what the role asks for, what your
resume actually evidences, and where the distance between the two costs you most.

## How it works

This is [AI-powered software][arch] rather than an agent: code owns the control
flow, and the model appears only where the system needs programmable common
sense. There is no `while` loop, and nothing asks a model to add up numbers.

```
job ad ──────▶ PASS 1 · the role
               24 Nouls — "does this role require X?"
               the returned probability IS the weight
               + required seniority, + which practitioner it's hiring
                            │
                  code keeps what scores > 0.4
                            │
resume ──────▶ PASS 2 · the candidate        ┐
               Score per surviving competency │ run
               + seniority, years, progression│ concurrently
               + 5 document-quality Nouls     │
                                              │
resume ──────▶ PASS 3 · the comparison        │
+ job ad       tailored / buries-the-lede /   │
               hard-requirement conflict      ┘
                            │
                     code composes
                     fit  = Σ(want × show) / Σ(want)
                     cost = want × (1 − show)
                     low-confidence reads quarantined
                            │
             top gaps ──▶ GPT-5.4 ──▶ wording only
```

**Why three passes.** Questions in one request all see the same state, so state
decomposition and question batching pull against each other. Asking "rate this
resume" while the job ad sits in the same state invites the ad to colour the
rating. The split is by what each question is allowed to see; within each pass,
questions are batched to the maximum and run in parallel.

That split also makes pass 2 reusable — it describes the candidate in absolute
terms, so the same answers hold when you screen that resume against a different
ad.

**No hand-tuned weights.** The importance of each competency is Jev's calibrated
probability that the ad asks for it. Nothing in the code says "leadership is
worth 20%".

**Gaps rank by cost, not by low score.** A competency you score badly on barely
matters if the ad doesn't want it. `want × (1 − show)` is what moves a gap up the
list.

**Uncertainty is routed, not ignored.** A score below `MIN_SCORE_CONFIDENCE`
still counts toward fit — dropping it would quietly reshape the headline — but
it never becomes advice. It surfaces as "we couldn't read this confidently",
which usually means the resume is ambiguous on the point.

[arch]: https://docs.typesafe.ai/concepts/how-to-build-with-system-one#three-software-architectures

## Setup

```bash
npm install
cp .env.local.example .env.local   # then add your keys
npm run dev
```

| Variable | Required | Used for |
|---|---|---|
| `TYPESAFE_API_KEY` | Yes | Both Jev passes. Get one at [console.typesafe.ai/keys](https://console.typesafe.ai/keys). |
| `OPENAI_API_KEY` | No | Rewrite suggestions only (`gpt-5.4`). Without it, scores and gaps still work and the UI says the wording step was skipped. |

Both keys are read only in `src/app/api/screen/route.ts`, server-side. Neither
reaches the browser.

## Tuning it

**`src/lib/dimensions.ts` is the file you edit.** It holds the competency
catalogue: 24 dimensions, each with a yes/no question asked about the job ad and
a five-level rubric scored against the resume. Jev never invents a dimension — it
only selects from and scores against this list, so the catalogue is the ceiling on
what the app can notice. Add dimensions for your field; the rest of the code
picks them up with no other changes.

Rubric levels have to describe concrete situations and stand on their own — Jev
reads them without the dimension's label, so "Good" and "Excellent" are useless
where "Primary language across multiple projects" works.

`TALENT_PROFILES` in the same file is asked twice — once of the ad, once of the
resume — and the mismatch between the two answers is the single most useful
thing the app reports. Neither question reveals it alone.

Thresholds live at the top of `src/lib/screen.ts`:

- `REQUIREMENT_THRESHOLD` (0.4) — how strongly the ad must want something before
  it gets scored.
- `MAX_SCORED_DIMENSIONS` (10) — cap on the second pass.
- `MIN_SCORE_CONFIDENCE` (0.55) — below this, a score is reported but not acted on.
- `MIN_CHOICE_CONFIDENCE` (0.5) — below this, a choice is reported as ambiguous.

All four are starting points, and the confidence ones are the least settled: on
real resumes, scores land near 0.55 often enough that the threshold decides
whether advice appears. The TypeSafe docs are explicit that thresholds are
examples to evaluate, not universal rules — plot confidence against your own
judgment on a handful of real resumes before trusting these.

## Verifying

```bash
npm run verify
```

Stubs the HTTP transport and checks the parts we own rather than the model's
judgment — 22 assertions covering state decomposition (the role pass never sees
the resume, the candidate pass never sees the ad, only comparison questions get
both), question construction (rubrics inside the API's 2–10 level limit,
backticked state paths, today's date carried rather than assumed), the
arithmetic (fit, cost, gap ordering, year conversion), and the confidence
routing (a low-confidence read is quarantined out of advice but still counts
toward fit). No API key needed, no tokens spent.

## What this does not do

It reads text, so a PDF has to be pasted as text first — Jev takes text only.

The judgments are calibrated, not correct. A typed answer guarantees the shape of
the result, not that it is right about you. The rubric in `dimensions.ts` is the
opinion being applied; when a score looks wrong, read the level it landed on
before assuming the model erred.

It will not help you claim experience you don't have. Where the resume has
nothing to build on, the rewrite step is instructed to say so and suggest how to
acquire the evidence instead of how to word around its absence.

[cs]: https://docs.typesafe.ai/patterns/composite-scoring
