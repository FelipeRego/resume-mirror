import { NextResponse } from "next/server";

import { computeDiff, generateRevisedResume, validateResume } from "@/lib/optimize";
import { rewriteHints, type Positioning, type RewriteHint } from "@/lib/rewrite";
import { screen, type DimensionResult } from "@/lib/screen";

export const maxDuration = 120;

export async function POST(request: Request) {
  let body: {
    originalResume?: unknown;
    currentResume?: unknown;
    jobAd?: unknown;
    dimensions?: unknown;
    gaps?: unknown;
    strengths?: unknown;
    hints?: unknown;
    positioning?: unknown;
    previousFit?: unknown;
    iteration?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const originalResume = typeof body.originalResume === "string" ? body.originalResume.trim() : "";
  const currentResume = typeof body.currentResume === "string" ? body.currentResume.trim() : originalResume;
  const jobAd = typeof body.jobAd === "string" ? body.jobAd.trim() : "";
  const dimensions = (Array.isArray(body.dimensions) ? body.dimensions : []) as DimensionResult[];
  const gaps = (Array.isArray(body.gaps) ? body.gaps : []) as DimensionResult[];
  const strengths = (Array.isArray(body.strengths) ? body.strengths : []) as DimensionResult[];
  const hints = (Array.isArray(body.hints) ? body.hints : []) as RewriteHint[];
  const positioning = (body.positioning as Positioning) || null;
  const previousFit = typeof body.previousFit === "number" ? body.previousFit : 0;
  const iteration = typeof body.iteration === "number" ? body.iteration : 1;

  if (currentResume.length < 100 || jobAd.length < 100) {
    return NextResponse.json(
      { error: "Both the resume and job ad must have at least 100 characters." },
      { status: 400 },
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not set. Add it to .env.local to enable resume optimization." },
      { status: 500 },
    );
  }

  if (!process.env.TYPESAFE_API_KEY) {
    return NextResponse.json(
      { error: "TYPESAFE_API_KEY is not set. Add it to .env.local to re-screen the revised resume." },
      { status: 500 },
    );
  }

  try {
    // Separate dimensions into shortfalls (< benchmark) and strengths to protect (>= benchmark)
    let shortfalls: DimensionResult[] = [];
    let strengthsToProtect: DimensionResult[] = [];

    if (dimensions.length > 0) {
      shortfalls = dimensions.filter((d) => d.demonstrated < d.importance);
      strengthsToProtect = dimensions.filter((d) => d.demonstrated >= d.importance);
    } else {
      shortfalls = gaps.filter((d) => d.demonstrated < d.importance);
      strengthsToProtect = strengths;
    }

    if (shortfalls.length === 0) {
      return NextResponse.json({
        revisedResume: currentResume,
        keyChanges: ["All competencies already meet or exceed the required benchmark!"],
        validation: { isValid: true, injectedPlaceholders: [], lengthRatio: 1 },
        diff: computeDiff(originalResume, currentResume),
        previousFit,
        newFit: previousFit,
        fitDelta: 0,
        newScreenResult: null,
        newHints: [],
        newPositioning: null,
        iteration,
        allGapsClosed: true,
      });
    }

    // Step 1: Synthesize revised resume targeting ONLY shortfalls while strictly locking down strengths
    const revision = await generateRevisedResume(
      currentResume,
      jobAd,
      shortfalls,
      strengthsToProtect,
      hints,
      positioning,
      iteration,
    );

    // Step 2: Validate the revised resume for integrity & structure
    const validation = validateResume(
      originalResume,
      revision.revised_resume,
      revision.injected_placeholders,
    );

    // Step 3: Re-screen the revised resume through TypeSafe Jev to measure actual improvements
    const newScreenResult = await screen(revision.revised_resume, jobAd);

    // Step 4: Compute fresh rewrite hints for the revised resume's remaining gaps
    let newHints: RewriteHint[] = [];
    let newPositioning: Positioning = null;
    try {
      const remainingShortfalls = newScreenResult.gaps.filter(
        (g) => g.demonstrated < g.importance,
      );
      const gapsToRewrite = (remainingShortfalls.length > 0 ? remainingShortfalls : newScreenResult.gaps).slice(0, 6);

      const hintRes = await rewriteHints(
        revision.revised_resume,
        jobAd,
        gapsToRewrite,
        {
          matches: newScreenResult.profile.matches,
          roleWants: newScreenResult.profile.roleWants,
          resumeReads: newScreenResult.profile.resumeReads,
          line: newScreenResult.positioningLine,
        },
      );
      newHints = hintRes.hints;
      newPositioning = hintRes.positioning;
    } catch {
      // Non-fatal: if hint synthesis encounters an issue, the screen result is still returned
    }

    // Step 5: Compute visual line-by-line diff
    const diff = computeDiff(originalResume, revision.revised_resume);

    const fitDelta = Math.round((newScreenResult.fit - previousFit) * 100);

    return NextResponse.json({
      revisedResume: revision.revised_resume,
      keyChanges: revision.key_changes_summary,
      validation,
      diff,
      previousFit,
      newFit: newScreenResult.fit,
      fitDelta,
      newScreenResult,
      newHints,
      newPositioning,
      iteration,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Optimization failed.";
    const status =
      typeof error === "object" && error !== null && "status" in error
        ? Number((error as { status: unknown }).status) || 500
        : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
