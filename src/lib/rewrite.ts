import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import type { DimensionResult } from "./screen";

/**
 * Jev returns judgments, not prose, and by this point it has already decided
 * everything measurable: which competencies matter, how the resume scores, and
 * which single line to change. This step only writes words for that line.
 *
 * The hard rule is no invention. Where the resume has nothing to build on, Jev
 * has already told us so (the `has__` companion question in pass 4 came back
 * negative and no anchor was set), and this step must say so plainly rather
 * than hand the candidate a line that would collapse in an interview.
 */

const MODEL = "gpt-5.4";

const HintSchema = z.object({
  /**
   * The summary line rewrite. Null when there is nothing to fix — either the
   * positioning already matches, or no line was anchored.
   */
  positioning: z
    .object({
      current_line: z.string(),
      replacement: z.string(),
      why: z.string(),
    })
    .nullable(),
  hints: z.array(
    z.object({
      dimension_id: z.string(),
      /** Plain-language read of what a screener sees. One or two sentences. */
      diagnosis: z.string(),
      /** True when the resume has nothing to build on. */
      evidence_missing: z.boolean(),
      /** The candidate's own line, quoted back, or null when nothing was anchored. */
      current_line: z.string().nullable(),
      /** A drop-in replacement for that line, or null when evidence is missing. */
      replacement: z.string().nullable(),
      /** One sentence on what the change buys them. */
      why: z.string(),
      /** Used only when evidence is missing: how to actually earn the claim. */
      how_to_earn_it: z.array(z.string()),
    }),
  ),
});

export type RewriteHint = z.infer<typeof HintSchema>["hints"][number];

const INSTRUCTIONS = `You are helping someone improve their own resume for a specific job. Write like a good friend who happens to hire people: direct, warm, specific, never stern and never salesy.

Everything measurable has already been decided by another system. Do not re-score anything, do not argue with the measurements, and do not hedge with "consider" or "you might want to".

Provide a hint object in the 'hints' array for EVERY item in the input 'gaps' array. Do not skip or omit any dimension.

For each competency in 'gaps', you get one of two situations:

SITUATION A — candidate_shows_pct >= 35 OR current_line is present.
The candidate ALREADY has evidence for this competency in their resume. NEVER say this is missing or not in their resume!
- If candidate_shows_pct is close to or meets job_wants_pct (e.g. within 5-10 points or cleared):
  diagnosis: acknowledge that their foundation is already solid (quote their demonstrated level or strength). Explain what fine-grained distinction is needed to close the remaining points or reach the top tier (e.g. strategic scale, org-wide reach, or quantifying business outcome).
  replacement: a drop-in rewrite of current_line (or a drop-in bullet using facts from their resume) that elevates the phrasing to that top tier.
  why: one sentence on what the elevation buys them with the screener.
  evidence_missing: false. how_to_earn_it: empty array.
- If they have a noticeable gap (e.g. shows 40% vs wants 80%):
  diagnosis: say what a screener sees in that line and what needs to be made clearer or stronger.
  current_line: echo back the line you were given, or null if no single line was anchored.
  replacement: a drop-in rewrite that strengthens the existing evidence using facts already in the resume.
  why: one sentence on what the rewrite buys them.
  evidence_missing: false. how_to_earn_it: empty array.

SITUATION B — candidate_shows_pct < 35 AND current_line is null.
The resume genuinely has nothing to build on here. Do not invent, do not stretch an unrelated line, and do not suggest wording. Your job:
- diagnosis: say plainly that this competency is not evident in the resume yet, and what the role needs.
- current_line: null. replacement: null.
- why: one sentence on why this gap matters for this role.
- evidence_missing: true.
- how_to_earn_it: two concrete, genuinely achievable things that would let them make the claim honestly. Specific actions, not "gain experience".

POSITIONING. You may also be given positioning: the kind of practitioner the ad is hiring, the kind the resume currently reads as, and the one line that most sets that impression. When those two kinds differ, rewrite that line so it frames the same real experience for the role being applied for. This is reframing, not reinvention — every claim must still be true of the resume you were given. If the two kinds already match, or no line was given, return null for positioning.

Write in Australian English. Address them as "you". Never use the words "leverage", "utilise", "synergy", "spearheaded" or "passionate".`;

export type Positioning = z.infer<typeof HintSchema>["positioning"];

export async function rewriteHints(
  resume: string,
  jobAd: string,
  gaps: DimensionResult[],
  positioning: {
    roleWants: string;
    resumeReads: string;
    matches: boolean;
    line: { line: number; text: string } | null;
  },
): Promise<{ hints: RewriteHint[]; positioning: Positioning }> {
  if (gaps.length === 0 && positioning.matches) {
    return { hints: [], positioning: null };
  }

  const client = new OpenAI();

  const response = await client.responses.parse({
    model: MODEL,
    instructions: INSTRUCTIONS,
    input: JSON.stringify(
      {
        job_ad: jobAd,
        resume,
        positioning: positioning.matches
          ? null
          : {
              ad_is_hiring_a: positioning.roleWants.replace(/_/g, " "),
              resume_currently_reads_as: positioning.resumeReads.replace(/_/g, " "),
              line_that_sets_the_impression: positioning.line?.text ?? null,
            },
        gaps: gaps.map((g) => ({
          dimension_id: g.id,
          competency_name: g.label,
          candidate_shows_pct: Math.round(g.demonstrated * 100),
          job_wants_pct: Math.round(g.importance * 100),
          current_line: g.anchor?.text ?? null,
          reads_at_this_level_now: g.currentLevel,
          next_level_up: g.nextLevel,
        })),
      },
      null,
      2,
    ),
    text: { format: zodTextFormat(HintSchema, "rewrite_hints") },
  });

  return {
    hints: response.output_parsed?.hints ?? [],
    positioning: response.output_parsed?.positioning ?? null,
  };
}
