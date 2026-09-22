import {
  TypeSafeClient,
  choice,
  noul,
  score,
  type Fetch,
  type Questions,
  type Usage,
} from "@typesafe-ai/sdk";

import {
  CAREER_PROGRESSION,
  DIMENSIONS,
  DIMENSION_BY_ID,
  EXPERIENCE_BANDS,
  MAX_SCORE,
  SENIORITY,
  SENIORITY_ORDER,
  TALENT_PROFILES,
  type CareerProgression,
  type Dimension,
  type SeniorityLevel,
  type TalentProfile,
} from "./dimensions";
import { numberLines } from "./redact";

/**
 * Built to the shape in the TypeSafe build guide's "three software
 * architectures": code owns the control flow, and the model appears only where
 * the system needs programmable common sense. There is no agent loop here.
 *
 * The guide's steps, and where each one lives:
 *
 *   1. Use code when you can ......... every threshold, weight, sum and sort below
 *   2. Decompose the input state ..... three passes, each carrying only what its
 *                                      questions need (see the pass comments)
 *   3. Structure in the input state .. named JSON fields, questions point at them
 *                                      with backticked paths
 *   4. Decompose the questions ....... one narrow judgment per question; no
 *                                      "is this a good candidate?" anywhere
 *   5. Structure in the questions .... instructions carry question + focus + the
 *                                      data the question refers to
 *   6. Ask a lot of questions ........ ~24 in pass 1, ~16 in pass 2, all parallel
 *   7. Combine outputs in code ....... fit and cost are arithmetic, not judgment
 *   8. Route on uncertainty .......... low-confidence reads are quarantined
 *                                      rather than reported as fact
 *
 * Three passes rather than one because state decomposition and question
 * parallelism pull in opposite directions: questions in a single request all
 * see the same state. Asking "rate this resume" while the job ad sits in the
 * same state invites the ad to colour the rating. So the passes are split by
 * what each question is allowed to see, and questions are batched to the
 * maximum within each pass.
 */

/** A dimension counts as part of the role above this probability. */
const REQUIREMENT_THRESHOLD = 0.4;
/** Never score more than this many dimensions, highest-weighted first. */
const MAX_SCORED_DIMENSIONS = 10;
/**
 * Below this, we do not trust a score enough to tell someone to act on it.
 * Step 8 of the guide: escalate rather than assert. Tune against your own data —
 * the docs are explicit that thresholds are to be evaluated, not inherited.
 */
const MIN_SCORE_CONFIDENCE = 0.55;
/** Below this, we report a choice as ambiguous rather than as the answer. */
const MIN_CHOICE_CONFIDENCE = 0.5;
/**
 * Anchor confidence gets its own, much lower bar. A Choice over sixty lines
 * spreads probability thin, so a correct pick can still sit around 0.3 — the
 * number means something different here than it does over six options. Below
 * this we still show the line, but as a suggestion to check rather than an
 * instruction to follow.
 */
const MIN_ANCHOR_CONFIDENCE = 0.35;

export type DimensionResult = {
  id: string;
  label: string;
  /** How much the job ad wants this, 0..1 (Jev's noul on the ad). */
  importance: number;
  /** How well the resume demonstrates it, 0..1 (normalised Jev score). */
  demonstrated: number;
  /** Raw Jev score across the rubric, may fall between levels. */
  rawScore: number;
  /** Jev's confidence in that score, 0..1. */
  confidence: number;
  /** True when confidence fell below the bar — read, but not acted on. */
  uncertain: boolean;
  /** importance x (1 - demonstrated): how much this gap costs the application. */
  cost: number;
  /** The rubric level the resume currently reads at. */
  currentLevel: string;
  /** The next level up — what "better" concretely looks like. */
  nextLevel: string | null;
  /** The specific line to change. Only populated for gaps. */
  anchor: Anchor | null;
};

export type ScreenResult = {
  fit: number;
  dimensions: DimensionResult[];
  gaps: DimensionResult[];
  strengths: DimensionResult[];
  /** Dimensions we could not read confidently. Surfaced, never silently dropped. */
  unreadable: DimensionResult[];
  seniority: {
    required: SeniorityLevel;
    demonstrated: SeniorityLevel;
    /** Negative = resume reads more junior than the ad asks for. */
    delta: number;
    /** True when either read was too uncertain to lean on. */
    uncertain: boolean;
    /** How the ad's seniority probability was spread. */
    requiredSplit: Split<SeniorityLevel>;
    /** How the resume's seniority probability was spread. */
    demonstratedSplit: Split<SeniorityLevel>;
  };
  profile: {
    roleWants: TalentProfile;
    resumeReads: TalentProfile;
    matches: boolean;
    /** Runner-up read of the resume, shown when the top read is not clear-cut. */
    resumeAlternative: TalentProfile | null;
    uncertain: boolean;
  };
  experience: {
    /** Probability-weighted years, e.g. 5.2 means "between 4 and 6". */
    years: number;
    band: string;
    progression: CareerProgression;
    progressionUncertain: boolean;
  };
  /** Raw 0..1 probabilities. Kept unrounded so the UI can set its own bars. */
  signals: {
    quantifiedOutcomes: number;
    tailoredToAd: number;
    unexplainedGaps: number;
    experienceIsStale: number;
    buriesTheLede: number;
    keywordStuffing: number;
    machineReadable: number;
    hardRequirementConflict: number;
  };
  /** The line that frames how the whole resume reads. */
  positioningLine: Anchor | null;
  /** The strongest single piece of evidence for this job. */
  strongestLine: Anchor | null;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
};

/** Swap the transport in tests; production passes nothing. */
export type ScreenOptions = { fetch?: Fetch };

function client(options: ScreenOptions = {}) {
  // Reads TYPESAFE_API_KEY from the environment. Server-side only.
  return new TypeSafeClient({ timeout: 60_000, fetch: options.fetch });
}

// --- small readers that keep the narrowing noise out of the logic below -----

type Answers = Record<string, unknown>;

/** A Choice's probability spread, ranked, trimmed to what is worth showing. */
export type Split<T extends string = string> = { option: T; p: number }[];

const asNoul = (a: Answers, key: string): number => {
  const v = a[key] as { type?: string; noul?: number } | undefined;
  return v?.type === "noul" ? (v.noul ?? 0) : 0;
};

const asChoice = <T extends string>(
  a: Answers,
  key: string,
  fallback: T,
): {
  value: T;
  confidence: number;
  runnerUp: T | null;
  split: Split<T>;
} => {
  const v = a[key] as
    | { type?: string; choice?: string; confidence?: number; probabilities?: Record<string, number> }
    | undefined;
  if (v?.type !== "choice")
    return { value: fallback, confidence: 0, runnerUp: null, split: [] };

  const ranked = Object.entries(v.probabilities ?? {}).sort((x, y) => y[1] - x[1]);
  return {
    value: (v.choice ?? fallback) as T,
    confidence: v.confidence ?? 0,
    runnerUp: (ranked[1]?.[0] as T) ?? null,
    // Only the options that carry real probability. A 17-way choice has a long
    // tail of zeroes that tells the reader nothing.
    split: ranked
      .filter(([, p]) => p >= 0.02)
      .slice(0, 4)
      .map(([option, p]) => ({ option: option as T, p })),
  };
};

const asScore = (
  a: Answers,
  key: string,
): { score: number; confidence: number } => {
  const v = a[key] as
    | { type?: string; score?: number; confidence?: number }
    | undefined;
  return v?.type === "score"
    ? { score: v.score ?? 0, confidence: v.confidence ?? 0 }
    : { score: 0, confidence: 0 };
};

// --- pass 1: the role ------------------------------------------------------
// State: the job ad alone. Nothing about the candidate can reach these answers,
// so the weights describe the role rather than the applicant.

async function readRole(jobAd: string, options: ScreenOptions) {
  const questions: Questions = {};

  for (const d of DIMENSIONS) {
    questions[`req__${d.id}`] = noul(
      {
        question: `Does \`job_ad\` require this of the person hired? ${d.requirement}`,
        focus:
          "Judge the work the role actually involves, not the industry it sits in.",
      },
      {
        true: "The ad asks for this, either explicitly or as an unmistakable part of the work described",
        false:
          "The ad does not ask for this, or names it only as an optional nice-to-have",
      },
    );
  }

  questions.seniority = choice(
    {
      question: "What level of seniority does `job_ad` expect from the person hired?",
      focus:
        "Weight the responsibilities described over the job title, which is often inflated.",
    },
    SENIORITY,
  );

  questions.profile = choice(
    {
      question: "Which kind of practitioner is `job_ad` hiring?",
      focus:
        "Judge from the work described. A stack keyword list is weak evidence next to the responsibilities.",
    },
    TALENT_PROFILES,
  );

  const res = await client(options).systemOne({
    state: { job_ad: jobAd },
    questions,
  });

  const answers = res.answers as Answers;
  const weights = new Map<string, number>();
  for (const d of DIMENSIONS) weights.set(d.id, asNoul(answers, `req__${d.id}`));

  return {
    weights,
    seniority: asChoice<SeniorityLevel>(answers, "seniority", "mid"),
    profile: asChoice<TalentProfile>(answers, "profile", "other"),
    usage: res.usage,
  };
}

// --- pass 2: the candidate -------------------------------------------------
// State: the resume alone. These questions describe the person in absolute
// terms, so the answers stay reusable if the same resume is screened against a
// different ad — and the ad cannot bias the reading.

async function readCandidate(
  resume: string,
  selected: readonly Dimension[],
  today: string,
  options: ScreenOptions,
) {
  const questions: Questions = {};

  for (const d of selected) {
    questions[`dim__${d.id}`] = score(
      {
        question: `Rate what \`resume\` demonstrates about this candidate's ${d.label.toLowerCase()}.`,
        focus:
          "Judge what the candidate personally did, from the experience and project detail.",
        ignore:
          "Skills keyword lists, job titles, and employer names. A named tool is weaker evidence than described work using it.",
        tie_break: "When torn between two levels, pick the lower one.",
      },
      d.levels,
    );
  }

  questions.seniority = choice(
    {
      question: "What level of seniority does the experience in `resume` demonstrate?",
      focus: "Judge the scope owned, not the titles held.",
    },
    SENIORITY,
  );

  questions.profile = choice(
    {
      question: "Which kind of practitioner does `resume` read as?",
      focus:
        "Judge holistically from the experience, weighting the most recent roles heaviest. Not from job titles or the skills list alone.",
    },
    TALENT_PROFILES,
  );

  questions.experience_years = score(
    {
      question: "How many years of professional experience does `resume` show?",
      today,
      focus:
        "Count professional work only. Exclude study, and do not double-count overlapping roles.",
    },
    EXPERIENCE_BANDS,
  );

  questions.progression = choice(
    { question: "What shape does the career history in `resume` have?" },
    CAREER_PROGRESSION,
  );

  questions.quantified_outcomes = noul(
    {
      question:
        "Does `resume` back its claims with specific figures — scale, percentages, dollar amounts, or timeframes?",
      focus: "The figures must attach to the candidate's own work, not the employer's size.",
    },
    {
      true: "Concrete figures appear throughout, attached to what this person did",
      false: "Claims are stated in general terms with few or no supporting numbers",
    },
  );

  questions.unexplained_gaps = noul(
    "Does the employment history in `resume` contain unexplained gaps, or abrupt changes in direction a reader would want explained?",
    {
      true: "There are periods or transitions that raise an unanswered question",
      false: "The history reads continuously, or any breaks are accounted for",
    },
  );

  questions.experience_is_stale = noul(
    {
      question:
        "Is the strongest experience in `resume` concentrated in the candidate's older roles rather than their recent ones?",
      today,
    },
    {
      true: "The most impressive work is years old; recent roles are thinner",
      false: "Recent roles carry the strongest work",
    },
  );

  questions.keyword_stuffing = noul(
    "Does `resume` list technologies or skills that never appear in any described piece of work?",
    {
      true: "The skills list names things the experience section never demonstrates",
      false: "Named skills are backed by work described elsewhere in the resume",
    },
  );

  questions.machine_readable = noul(
    {
      question:
        "Would an automated resume parser reliably extract this candidate's roles, dates, and employers from `resume`?",
      focus:
        "Judge structure: clear headings, conventional date formats, one role per entry. Multi-column layouts, tables, and graphics parse badly.",
    },
    {
      true: "Conventional, clearly delimited structure that a parser handles",
      false: "Structure a parser would mangle or skip",
    },
  );

  const res = await client(options).systemOne({ state: { resume }, questions });
  return res;
}

// --- pass 3: the comparison ------------------------------------------------
// State: both. Only the questions that genuinely need to see the two together
// live here, which is what keeps passes 1 and 2 clean.

async function readFit(resume: string, jobAd: string, options: ScreenOptions) {
  const questions: Questions = {
    tailored_to_ad: noul(
      {
        question:
          "Does `resume` read as though it was written for the role in `job_ad`, rather than as a generic resume sent to any employer?",
        focus: "Language, emphasis, and the ordering of experience.",
      },
      {
        true: "Clearly aimed at this role",
        false: "Generic, or aimed at a different kind of role",
      },
    ),
    buries_the_lede: noul(
      {
        question:
          "Is the experience in `resume` that best matches `job_ad` placed where a reader skimming the first half would miss it?",
        focus:
          "A screener reads the top third. Relevant work below that is effectively invisible.",
      },
      {
        true: "The most relevant experience sits late in the document",
        false: "The most relevant experience is near the top",
      },
    ),
    hard_requirement_conflict: noul(
      {
        question:
          "Does `job_ad` state a hard requirement that `resume` appears not to meet — such as a location, work authorisation, licence, security clearance, or mandatory credential?",
        focus:
          "Only stated, checkable requirements. Do not infer one that the ad does not state.",
      },
      {
        true: "A stated hard requirement appears unmet",
        false: "No stated hard requirement appears unmet",
      },
    ),
  };

  return client(options).systemOne({
    state: { resume, job_ad: jobAd },
    questions,
  });
}

// --- pass 4: where in the document -----------------------------------------
// State: the resume with every line tagged by its ORIGINAL line number, so an
// answer of "L14" is line 14 of the document on the candidate's screen.
//
// This is the "select, don't generate" pattern: code finds the candidates (the
// lines), Jev selects among them, and only then does a generative model write
// replacement wording for the one line that was chosen.

/** Choice accepts at most 255 options, so that is the line ceiling per request. */
const MAX_ANCHOR_LINES = 255;

export type Anchor = {
  /** Line number in the original document. */
  line: number;
  text: string;
  /** Jev's confidence that this is the right line. */
  confidence: number;
  /** True when the pick was thin — shown as "probably this one". */
  uncertain: boolean;
};

async function anchorGaps(
  resume: string,
  gaps: DimensionResult[],
  topStrength: DimensionResult | undefined,
  options: ScreenOptions,
): Promise<{
  anchors: Map<string, Anchor>;
  positioning: Anchor | null;
  strongest: Anchor | null;
  usage: Usage;
}> {
  const anchors = new Map<string, Anchor>();
  const none = {
    anchors,
    positioning: null,
    strongest: null,
    usage: { input_tokens: 0, output_tokens: 0 },
  };
  if (gaps.length === 0 && !topStrength) return none;

  const lines = numberLines(resume).slice(0, MAX_ANCHOR_LINES);
  if (lines.length === 0) return none;

  const byId = new Map(lines.map((l) => [`L${l.n}`, l]));
  const ids = Object.fromEntries(lines.map((l) => [`L${l.n}`, null]));
  const tagged = lines.map((l) => `L${l.n}| ${l.text}`).join("\n");

  const questions: Questions = {};
  for (const gap of gaps) {
    // Which line, if any, is the one to change.
    questions[`where__${gap.id}`] = choice(
      {
        question: `Which single line of \`resume\` is the best one to rewrite in order to show more ${gap.label.toLowerCase()}?`,
        focus:
          "Prefer a line that already describes relevant work but undersells it, over a line that would have to invent something.",
      },
      ids,
    );

    // Choice probabilities always sum to 1, so some line ranks first even when
    // the resume has nothing to say on this dimension. Without this companion
    // question we would confidently point at an irrelevant line.
    questions[`has__${gap.id}`] = noul(
      {
        question: `Does \`resume\` contain any line that genuinely relates to ${gap.label.toLowerCase()}?`,
      },
      {
        true: "At least one line describes work relevant to this, even if it undersells it",
        false: "Nothing in the resume relates to this; rewording could only invent it",
      },
    );
  }

  // The line that decides what kind of practitioner the reader thinks you
  // are. Usually the summary, which is exactly the line people never revisit.
  questions.where__positioning = choice(
    {
      question:
        "Which single line of `resume` most sets a reader's first impression of what kind of practitioner this person is?",
      focus:
        "The line that frames everything read after it, such as a summary or headline. Not the most impressive line — the most defining one.",
    },
    ids,
  );

  // Asked resume-only, with the competency name carrying the job's interest,
  // so pass 4 never needs to see the ad.
  if (topStrength) {
    questions.where__strongest = choice(
      {
        question: `Which single line of \`resume\` is the strongest evidence of this person's ${topStrength.label.toLowerCase()}?`,
        focus: "The line a reader would point at as proof, not a skills entry.",
      },
      ids,
    );
  }

  const res = await client(options).systemOne({
    state: { resume: tagged },
    questions,
  });

  const answers = res.answers as Answers;

  const readAnchor = (key: string): Anchor | null => {
    const picked = asChoice(answers, key, "");
    const line = byId.get(picked.value);
    if (!line) return null;
    return {
      line: line.n,
      text: line.text,
      confidence: picked.confidence,
      uncertain: picked.confidence < MIN_ANCHOR_CONFIDENCE,
    };
  };

  for (const gap of gaps) {
    if (asNoul(answers, `has__${gap.id}`) < 0.5) continue;

    const picked = asChoice(answers, `where__${gap.id}`, "");
    const line = byId.get(picked.value);
    if (!line) continue;

    anchors.set(gap.id, {
      line: line.n,
      text: line.text,
      confidence: picked.confidence,
      uncertain: picked.confidence < MIN_ANCHOR_CONFIDENCE,
    });
  }

  return {
    anchors,
    positioning: readAnchor("where__positioning"),
    strongest: topStrength ? readAnchor("where__strongest") : null,
    usage: res.usage,
  };
}

// --- composition -----------------------------------------------------------

export async function screen(
  resume: string,
  jobAd: string,
  options: ScreenOptions = {},
): Promise<ScreenResult> {
  const today = new Date().toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const role = await readRole(jobAd, options);

  // Code decides what is worth a second pass. No model call needed for a sort.
  const selected = DIMENSIONS.filter(
    (d) => (role.weights.get(d.id) ?? 0) >= REQUIREMENT_THRESHOLD,
  )
    .sort((a, b) => (role.weights.get(b.id) ?? 0) - (role.weights.get(a.id) ?? 0))
    .slice(0, MAX_SCORED_DIMENSIONS);

  if (selected.length === 0) {
    throw new Error(
      "No competencies in the catalogue matched this job ad. Add dimensions in src/lib/dimensions.ts, or check that the job ad pasted correctly.",
    );
  }

  // Passes 2 and 3 share no data, so they run concurrently.
  const [candidate, fit] = await Promise.all([
    readCandidate(resume, selected, today, options),
    readFit(resume, jobAd, options),
  ]);

  const cAnswers = candidate.answers as Answers;
  const fAnswers = fit.answers as Answers;

  const dimensions: DimensionResult[] = selected.map((d) => {
    const { score: rawScore, confidence } = asScore(cAnswers, `dim__${d.id}`);
    const demonstrated = Math.min(1, Math.max(0, rawScore / MAX_SCORE));
    const importance = role.weights.get(d.id) ?? 0;
    const levelIndex = Math.min(MAX_SCORE, Math.round(rawScore));
    const rubric = DIMENSION_BY_ID.get(d.id)!;

    return {
      id: d.id,
      label: d.label,
      importance,
      demonstrated,
      rawScore,
      confidence,
      uncertain: confidence < MIN_SCORE_CONFIDENCE,
      cost: importance * (1 - demonstrated),
      currentLevel: rubric.levels[levelIndex],
      nextLevel: levelIndex < MAX_SCORE ? rubric.levels[levelIndex + 1] : null,
      anchor: null,
    };
  });

  // Step 8. A score we could not read confidently still counts toward fit —
  // dropping it would quietly reshape the number — but it never becomes advice.
  const confident = dimensions.filter((d) => !d.uncertain);
  const unreadable = dimensions.filter((d) => d.uncertain);

  const weightTotal = dimensions.reduce((sum, d) => sum + d.importance, 0);
  const fitScore =
    weightTotal > 0
      ? dimensions.reduce((sum, d) => sum + d.importance * d.demonstrated, 0) /
        weightTotal
      : 0;

  const candidateSeniority = asChoice<SeniorityLevel>(cAnswers, "seniority", "mid");
  const candidateProfile = asChoice<TalentProfile>(cAnswers, "profile", "other");
  const progression = asChoice<CareerProgression>(cAnswers, "progression", "unclear");
  const years = asScore(cAnswers, "experience_years");

  const gaps = [...confident]
    .filter((d) => d.cost > 0.15)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5);

  const strengths = [...confident]
    .filter((d) => d.demonstrated >= 0.6 && d.importance >= 0.5)
    .sort(
      (a, b) => b.demonstrated * b.importance - a.demonstrated * a.importance,
    )
    .slice(0, 4);

  // Pass 4 needs the gap list, so it cannot run alongside passes 2 and 3.
  const anchored = await anchorGaps(resume, gaps, strengths[0], options);
  for (const gap of gaps) gap.anchor = anchored.anchors.get(gap.id) ?? null;

  return {
    fit: fitScore,
    dimensions: [...dimensions].sort((a, b) => b.importance - a.importance),
    gaps,
    strengths,
    unreadable,
    seniority: {
      required: role.seniority.value,
      demonstrated: candidateSeniority.value,
      delta:
        SENIORITY_ORDER.indexOf(candidateSeniority.value) -
        SENIORITY_ORDER.indexOf(role.seniority.value),
      uncertain:
        role.seniority.confidence < MIN_CHOICE_CONFIDENCE ||
        candidateSeniority.confidence < MIN_CHOICE_CONFIDENCE,
      requiredSplit: role.seniority.split,
      demonstratedSplit: candidateSeniority.split,
    },
    profile: {
      roleWants: role.profile.value,
      resumeReads: candidateProfile.value,
      matches: role.profile.value === candidateProfile.value,
      resumeAlternative:
        candidateProfile.confidence < MIN_CHOICE_CONFIDENCE
          ? candidateProfile.runnerUp
          : null,
      uncertain:
        role.profile.confidence < MIN_CHOICE_CONFIDENCE ||
        candidateProfile.confidence < MIN_CHOICE_CONFIDENCE,
    },
    experience: {
      // Bands step in 2-year increments from 0, so the score doubles into years.
      years: years.score * 2,
      band: EXPERIENCE_BANDS[Math.min(EXPERIENCE_BANDS.length - 1, Math.round(years.score))],
      progression: progression.value,
      progressionUncertain: progression.confidence < MIN_CHOICE_CONFIDENCE,
    },
    signals: {
      quantifiedOutcomes: asNoul(cAnswers, "quantified_outcomes"),
      unexplainedGaps: asNoul(cAnswers, "unexplained_gaps"),
      experienceIsStale: asNoul(cAnswers, "experience_is_stale"),
      keywordStuffing: asNoul(cAnswers, "keyword_stuffing"),
      machineReadable: asNoul(cAnswers, "machine_readable"),
      tailoredToAd: asNoul(fAnswers, "tailored_to_ad"),
      buriesTheLede: asNoul(fAnswers, "buries_the_lede"),
      hardRequirementConflict: asNoul(fAnswers, "hard_requirement_conflict"),
    },
    positioningLine: anchored.positioning,
    strongestLine: anchored.strongest,
    usage: {
      inputTokens:
        role.usage.input_tokens +
        candidate.usage.input_tokens +
        fit.usage.input_tokens +
        anchored.usage.input_tokens,
      outputTokens:
        role.usage.output_tokens +
        candidate.usage.output_tokens +
        fit.usage.output_tokens +
        anchored.usage.output_tokens,
    },
    model: candidate.model,
  };
}
