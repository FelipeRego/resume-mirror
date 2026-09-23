import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import type { Positioning, RewriteHint } from "./rewrite";
import type { DimensionResult } from "./screen";

const MODEL = "gpt-5.4";

const RevisionOutputSchema = z.object({
  revised_resume: z.string().describe("The complete, revised resume document in plain text"),
  key_changes_summary: z.array(z.string()).describe("A bulleted list of the specific changes made"),
  injected_placeholders: z.array(z.string()).describe("List of any bracketed placeholders injected for user customization"),
});

export type RevisionResult = z.infer<typeof RevisionOutputSchema>;

export type DiffItem = {
  type: "same" | "add" | "remove" | "modify";
  text: string;
  originalText?: string;
};

export type ValidationReport = {
  passed: boolean;
  warnings: string[];
  injectedPlaceholders: string[];
  charCountOriginal: number;
  charCountRevised: number;
  lengthRatio: number;
};

const OPTIMIZE_INSTRUCTIONS = `You are an expert resume editor and strategist performing an iterative enhancement cycle.

PRIMARY DIRECTIVE:
You must ONLY target and improve the competencies that are currently below the required benchmark ('SHORTFALLS_TO_SURGICALLY_IMPROVE'), while strictly preserving and locking down every competency that is already meeting or exceeding the benchmark ('STRENGTHS_ALREADY_SATISFIED_DO_NOT_ALTER').

CRITICAL RULES:

1. ZERO REGRESSION ON ALREADY SATISFIED STRENGTHS:
   - Carefully review 'STRENGTHS_ALREADY_SATISFIED_DO_NOT_ALTER'.
   - The candidate ALREADY demonstrates these competencies at or above the job's requirement.
   - You MUST NOT remove, simplify, reword, compress, or dilute any bullets, tools, responsibilities, or metrics that demonstrate these strengths.
   - Any edit that damages or removes evidence supporting a protected strength is an unacceptable regression.

2. SURGICALLY TARGET ONLY THE REMAINING SHORTFALLS:
   - For each item in 'SHORTFALLS_TO_SURGICALLY_IMPROVE':
     a) If an existing anchor line is identified, replace or sharpen that specific line to demonstrate the required higher criteria ('target_level_needed').
     b) If evidence is missing or weak, add a high-impact, concrete drafted bullet under the most relevant past employer.
     c) When drafting new bullets, use explicit bracketed placeholders for specific metrics or achievements only the candidate knows (e.g. [X% reduction in churn], [migrated 4 legacy systems], [led team of 5]). This ensures the user can easily customize with their authentic numbers.

3. MINIMAL SURGICAL DIFF (LEAVE EVERYTHING ELSE UNCHANGED):
   - Do NOT rewrite, paraphrase, or stylistically edit sentences or sections that are already working well.
   - Preserve all employer names, employment dates, job titles, education institutions, credentials, and original formatting intact.

4. VOCABULARY & STYLE:
   - Direct, high-impact Australian English.
   - NEVER use "leverage", "utilise", "synergy", "spearheaded", or "passionate".

Output the complete revised resume text, a summary of the specific changes made, and a list of any injected bracketed placeholders.`;

/**
 * Synthesizes an updated version of the candidate's resume by incorporating
 * the targeted rewrites, positioning reframe, and gap bridges, while strictly
 * preserving already-satisfied competencies from regression.
 */
export async function generateRevisedResume(
  resume: string,
  jobAd: string,
  shortfalls: DimensionResult[],
  strengthsToProtect: DimensionResult[],
  hints: RewriteHint[],
  positioning: Positioning,
  iteration: number = 1,
): Promise<RevisionResult> {
  const client = new OpenAI();

  const inputPayload = {
    iteration,
    current_resume_to_modify: resume,
    job_ad: jobAd,
    positioning: positioning
      ? {
          current_line: positioning.current_line,
          recommended_replacement: positioning.replacement,
          reason: positioning.why,
        }
      : null,
    STRENGTHS_ALREADY_SATISFIED_DO_NOT_ALTER: strengthsToProtect.map((s) => ({
      competency: s.label,
      current_score: `${Math.round(s.demonstrated * 100)}% (meets benchmark ${Math.round(s.importance * 100)}%)`,
      current_level: s.currentLevel,
      directive:
        "CRITICAL: Keep all lines, bullets, and technical evidence demonstrating this competency completely intact. Do NOT remove or dilute.",
    })),
    SHORTFALLS_TO_SURGICALLY_IMPROVE: shortfalls.map((gap) => {
      const hint = hints.find((h) => h.dimension_id === gap.id);
      return {
        competency: gap.label,
        current_score: `${Math.round(gap.demonstrated * 100)}%`,
        target_score: `${Math.round(gap.importance * 100)}%`,
        current_level_reading: gap.currentLevel,
        target_level_needed: gap.nextLevel,
        original_anchor_line: hint?.current_line || gap.anchor?.text || null,
        suggested_rewrite: hint?.replacement || null,
        evidence_missing: hint?.evidence_missing ?? gap.demonstrated < 0.35,
        how_to_bridge_this_gap: hint?.how_to_earn_it?.length
          ? hint.how_to_earn_it
          : [
              `Elevate bullet to describe: ${gap.nextLevel || "concrete domain ownership"}`,
            ],
      };
    }),
  };

  const response = await client.responses.parse({
    model: MODEL,
    instructions: OPTIMIZE_INSTRUCTIONS,
    input: JSON.stringify(inputPayload, null, 2),
    text: { format: zodTextFormat(RevisionOutputSchema, "resume_revision") },
  });

  const parsed = response.output_parsed;
  if (!parsed || !parsed.revised_resume) {
    throw new Error("Failed to generate revised resume.");
  }

  return parsed;
}

/**
 * Validates the revised resume against the original to ensure integrity,
 * reasonable length, and identifies any bracketed placeholders requiring user review.
 */
export function validateResume(
  originalResume: string,
  revisedResume: string,
  injectedPlaceholders: string[] = [],
): ValidationReport {
  const warnings: string[] = [];

  const charOriginal = originalResume.trim().length;
  const charRevised = revisedResume.trim().length;
  const lengthRatio = charOriginal > 0 ? charRevised / charOriginal : 1;

  if (charOriginal > 300) {
    if (lengthRatio < 0.6) {
      warnings.push(
        "The revised resume appears significantly shorter than the original. Verify that no key roles were omitted.",
      );
    } else if (lengthRatio > 1.6) {
      warnings.push(
        "The revised resume is noticeably longer than the original. Consider trimming verbose sections.",
      );
    }
  }

  // Detect any brackets like [X% ...] or [project name]
  const bracketMatches = revisedResume.match(/\[[^\]]{2,80}\]/g) || [];
  const uniquePlaceholders = Array.from(new Set([...injectedPlaceholders, ...bracketMatches]));

  const passed = warnings.length === 0;

  return {
    passed,
    warnings,
    injectedPlaceholders: uniquePlaceholders,
    charCountOriginal: charOriginal,
    charCountRevised: charRevised,
    lengthRatio: Math.round(lengthRatio * 100) / 100,
  };
}

/**
 * Computes a clean line-by-line diff between original and revised resume texts.
 */
export function computeDiff(originalText: string, revisedText: string): DiffItem[] {
  const origLines = originalText.split(/\r?\n/);
  const revLines = revisedText.split(/\r?\n/);

  const diff: DiffItem[] = [];

  let i = 0;
  let j = 0;

  while (i < origLines.length || j < revLines.length) {
    const oLine = origLines[i]?.trim();
    const rLine = revLines[j]?.trim();

    if (i < origLines.length && j < revLines.length) {
      if (oLine === rLine) {
        diff.push({ type: "same", text: origLines[i] });
        i++;
        j++;
      } else {
        // Look ahead to check if this is an insertion or modification
        const oInRev = revLines.slice(j, j + 4).map((l) => l.trim()).indexOf(oLine);
        const rInOrig = origLines.slice(i, i + 4).map((l) => l.trim()).indexOf(rLine);

        if (oInRev > 0 && (rInOrig === -1 || oInRev < rInOrig)) {
          // Lines were added in revised
          const targetJ = j + oInRev;
          while (j < targetJ) {
            diff.push({ type: "add", text: revLines[j] });
            j++;
          }
        } else if (rInOrig > 0 && (oInRev === -1 || rInOrig < oInRev)) {
          // Lines were removed from original
          const targetI = i + rInOrig;
          while (i < targetI) {
            diff.push({ type: "remove", text: origLines[i] });
            i++;
          }
        } else {
          // Line was modified
          diff.push({
            type: "modify",
            text: revLines[j],
            originalText: origLines[i],
          });
          i++;
          j++;
        }
      }
    } else if (j < revLines.length) {
      diff.push({ type: "add", text: revLines[j] });
      j++;
    } else if (i < origLines.length) {
      diff.push({ type: "remove", text: origLines[i] });
      i++;
    }
  }

  return diff;
}
