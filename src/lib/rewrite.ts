import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import type { DimensionResult } from "./screen";

/**
 * Jev returns judgments, not prose — it never generates text. So the wording
 * half of "fit + gaps + rewrite hints" is a separate generative call, and it
 * runs only on the handful of gaps that actually cost the application
 * something. Everything measurable has already been decided before we get here.
 *
 * The hard rule is no invention. The model may only surface what the resume
 * already supports; where the experience genuinely is not there, it has to say
 * so rather than hand the candidate a line that would not survive an interview.
 */

const MODEL = "gpt-5.4";

const HintSchema = z.object({
  hints: z.array(
    z.object({
      dimension_id: z.string(),
      /** Honest read of why this reads weak, one sentence. */
      diagnosis: z.string(),
      /** True when the resume has nothing to build on and rewording cannot fix it. */
      evidence_missing: z.boolean(),
      /** Concrete rewrites grounded in the resume, or how to acquire the evidence. */
      suggestions: z.array(z.string()),
    }),
  ),
});

export type RewriteHint = z.infer<typeof HintSchema>["hints"][number];

const INSTRUCTIONS = `You help a job candidate improve their own resume for a specific role.

You are given gaps already measured by a separate scoring model. Your job is only the wording. Do not re-score anything, and do not argue with the measurements.

Rules, in order of importance:
1. Never invent experience. Every suggestion must be traceable to something the resume already contains.
2. If the resume genuinely lacks the experience, set evidence_missing to true and say so plainly in the diagnosis. Then make the suggestions about how to acquire or evidence that experience, not how to word it. Do not help someone imply experience they do not have.
3. When the experience IS there but buried, undersold, or stated without evidence, that is the case worth working on. Quote or closely paraphrase the candidate's own line and show a stronger version.
4. Suggestions are concrete and ready to paste. Write the actual bullet, not advice about writing bullets. No preamble like "Consider adding".
5. Two suggestions per gap, at most three. One sentence each where possible.

Write in plain Australian English. Address the candidate as "you".`;

export async function rewriteHints(
  resume: string,
  jobAd: string,
  gaps: DimensionResult[],
): Promise<RewriteHint[]> {
  if (gaps.length === 0) return [];

  const client = new OpenAI();

  const response = await client.responses.parse({
    model: MODEL,
    instructions: INSTRUCTIONS,
    input: JSON.stringify(
      {
        job_ad: jobAd,
        resume,
        measured_gaps: gaps.map((g) => ({
          dimension_id: g.id,
          dimension: g.label,
          how_much_the_role_wants_it: Number(g.importance.toFixed(2)),
          how_well_the_resume_shows_it: Number(g.demonstrated.toFixed(2)),
          reads_at_this_level_now: g.currentLevel,
          next_level_up: g.nextLevel,
        })),
      },
      null,
      2,
    ),
    text: { format: zodTextFormat(HintSchema, "rewrite_hints") },
  });

  return response.output_parsed?.hints ?? [];
}
