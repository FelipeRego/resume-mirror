import { NextResponse } from "next/server";

import { rewriteHints, type Positioning, type RewriteHint } from "@/lib/rewrite";
import { screen } from "@/lib/screen";

/** Both API keys are read here, on the server. Neither reaches the browser. */

export const maxDuration = 120;

const MAX_CHARS = 30_000;

export async function POST(request: Request) {
  let body: { resume?: unknown; jobAd?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const resume = typeof body.resume === "string" ? body.resume.trim() : "";
  const jobAd = typeof body.jobAd === "string" ? body.jobAd.trim() : "";

  if (resume.length < 100) {
    return NextResponse.json(
      { error: "Paste your resume — at least a hundred characters of it." },
      { status: 400 },
    );
  }
  if (jobAd.length < 100) {
    return NextResponse.json(
      { error: "Paste the job ad — at least a hundred characters of it." },
      { status: 400 },
    );
  }
  if (resume.length > MAX_CHARS || jobAd.length > MAX_CHARS) {
    return NextResponse.json(
      {
        error: `Keep each input under ${MAX_CHARS.toLocaleString()} characters so it fits in one request.`,
      },
      { status: 400 },
    );
  }

  if (!process.env.TYPESAFE_API_KEY) {
    return NextResponse.json(
      {
        error:
          "TYPESAFE_API_KEY is not set. Add it to .env.local and restart the dev server.",
      },
      { status: 500 },
    );
  }

  try {
    const result = await screen(resume, jobAd);

    // The rewrite step is a bonus, not the product. If it fails — no Anthropic
    // key, a refusal, a rate limit — the measured result still ships.
    let hints: RewriteHint[] = [];
    let positioning: Positioning = null;
    let hintsError: string | null = null;

    if (!process.env.OPENAI_API_KEY) {
      hintsError =
        "OPENAI_API_KEY is not set, so rewrite suggestions were skipped. Scores and gaps are unaffected.";
    } else {
      try {
        const written = await rewriteHints(resume, jobAd, result.gaps, {
          roleWants: result.profile.roleWants,
          resumeReads: result.profile.resumeReads,
          matches: result.profile.matches,
          line: result.positioningLine,
        });
        hints = written.hints;
        positioning = written.positioning;
      } catch (error) {
        hintsError =
          error instanceof Error
            ? error.message
            : "Rewrite suggestions could not be generated.";
      }
    }

    return NextResponse.json({ ...result, hints, positioning, hintsError });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Screening failed.";
    const status =
      typeof error === "object" && error !== null && "status" in error
        ? Number((error as { status: unknown }).status) || 500
        : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
