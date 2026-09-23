"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { DIMENSION_BY_ID, TALENT_PROFILES } from "@/lib/dimensions";
import { redact, type Redaction } from "@/lib/redact";
import type { Positioning, RewriteHint } from "@/lib/rewrite";
import type { ScreenResult } from "@/lib/screen";

type Report = ScreenResult & {
  hints: RewriteHint[];
  positioning: Positioning;
  hintsError: string | null;
};

type Action = {
  /** The imperative. Starts with a verb. */
  what: string;
  /** Where in the document, when we know. */
  where: string | null;
  /** One line of context, kept short. */
  detail?: string;
};

/**
 * The "so what do I do" list, composed in code from measurements we already
 * trust rather than asked of a model. Ordering is the whole value: a hard
 * requirement can make the rest moot, and positioning gates how anything
 * further down gets read.
 */
function buildActions(report: Report): Action[] {
  const out: Action[] = [];
  const hintFor = (id: string) => report.hints.find((h) => h.dimension_id === id);

  if (report.signals.hardRequirementConflict > 0.5) {
    out.push({
      what: "Check you actually meet this job's hard requirement",
      where: null,
      detail:
        "The ad names a location, work right, licence or credential your resume doesn't appear to meet. Settle that before spending an evening on the rest.",
    });
  }

  if (!report.profile.matches && report.positioning) {
    out.push({
      what: `Rewrite your opening so you read as a ${profileName(report.profile.roleWants)}`,
      where: "opening summary",
      detail:
        "This frames everything read after it, so it's worth more than any single bullet below.",
    });
  }

  // Rewrites are per-line, so each earns its own step.
  for (const gap of report.gaps.slice(0, 3)) {
    const hint = hintFor(gap.id);
    if (hint && !hint.evidence_missing && gap.anchor) {
      out.push({
        what: `Rewrite the ${gap.label.toLowerCase()} text`,
        where: null,
        detail: `You're ${Math.round((gap.importance - gap.demonstrated) * 100)} points short on something this job weights at ${pct(gap.importance)}.`,
      });
    }
  }

  // Absences collapse into one decision. Three separate "decide whether to
  // chase X" steps read as three tasks when they are really one question
  // about whether this role is the right target at all.
  const absent = report.gaps.filter(
    (g) => (hintFor(g.id)?.evidence_missing ?? false) && g.cost > 0.15,
  );
  if (absent.length > 0) {
    const names = absent.map((g) => g.label.toLowerCase());
    const list =
      names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
    out.push({
      what:
        absent.length === 1
          ? `Decide whether to chase ${list} or let this role go`
          : `Decide whether this is the right role to chase`,
      where: null,
      detail:
        absent.length === 1
          ? `This job weights it at ${pct(absent[0].importance)} and your resume has nothing to point at. Wording won't close it.`
          : `${absent.length} of this job's core requirements — ${list} — aren't in your resume at all. No amount of rewriting closes that, so the honest question is whether to build the experience or find a closer role.`,
    });
  }

  if (report.signals.buriesTheLede > 0.5) {
    out.push({
      what: "Move your strongest experience into your top third",
      where: null,
      detail: "A screener decides in the first third. Below that is effectively unread.",
    });
  }

  if (report.signals.quantifiedOutcomes < 0.5) {
    out.push({
      what: "Put a number on three of your bullets",
      where: null,
      detail: "How many, how much, how fast, how many people. It's the cheapest credibility there is.",
    });
  }

  if (report.signals.keywordStuffing > 0.5) {
    out.push({
      what: "Cut the skills you can't point at in your experience",
      where: null,
      detail: "Listing things your roles never demonstrate weakens the ones you can genuinely back.",
    });
  }

  return out.slice(0, 5);
}

const SENIORITY_LABEL: Record<string, string> = {
  entry: "ENTRY",
  early: "EARLY CAREER",
  mid: "MID",
  senior: "SENIOR",
  lead: "LEAD / PRINCIPAL",
  executive: "EXECUTIVE",
};

const PROFILE_LABEL: Record<string, string> = {
  frontend_engineer: "frontend engineer",
  backend_engineer: "backend engineer",
  full_stack_engineer: "full-stack engineer",
  mobile_engineer: "mobile engineer",
  devops_infrastructure: "DevOps / infrastructure",
  data_engineer: "data engineer",
  data_analyst: "data analyst",
  ml_ai_engineer: "ML / AI engineer",
  security_engineer: "security engineer",
  embedded_systems: "embedded / systems engineer",
  product_manager: "product manager",
  designer: "designer",
  consultant_advisor: "consultant / advisor",
  trainer_educator: "trainer / educator",
  manager_leader: "manager / leader",
  commercial_gtm: "commercial / go-to-market",
  other: "something outside the usual categories",
};

const PROGRESSION_LABEL: Record<string, string> = {
  steady_growth: "steady growth in scope",
  lateral_moves: "lateral moves",
  job_hopping: "short tenures",
  long_tenure: "long tenure, little visible change",
  unclear: "hard to read",
};

const REDACTION_LABEL: Record<string, string> = {
  name: "Name",
  email: "Email",
  phone: "Phone",
  url: "Profile link",
  location: "Location",
  custom: "Your own term",
};

const PASSES = [
  "Reading the job ad",
  "Reading your resume",
  "Comparing the two",
  "Finding the exact lines",
  "Writing your rewrites",
];

const pct = (n: number) => `${Math.round(n * 100)}%`;
const profileName = (p: string) => PROFILE_LABEL[p] ?? p.replace(/_/g, " ");

export default function Home() {
  const [resume, setResume] = useState("");
  const [jobAd, setJobAd] = useState("");
  const [extraTerms, setExtraTerms] = useState<string[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Runs entirely in the browser. Nothing has been sent at this point.
  const scrubbed = useMemo(
    () => redact(resume, extraTerms),
    [resume, extraTerms],
  );

  async function run() {
    setBusy(true);
    setError(null);
    setReport(null);

    try {
      const res = await fetch("/api/screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The redacted text, never the original.
        body: JSON.stringify({ resume: scrubbed.text, jobAd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setReport(data as Report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const ready = resume.length >= 100 && jobAd.length >= 100;

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-8 sm:py-12">
      <header className="crop relative mb-8 px-3 py-6 sm:px-6 print:hidden">
        <h1 className="w-fit text-3xl font-bold tracking-tight sm:text-5xl">
          <span className="inline-block bg-[var(--accent)] px-2 py-0.5 text-[var(--ink)] selection:bg-[var(--ink)] selection:text-[var(--accent)]">
            RESUME MIRROR
          </span>
        </h1>
        <p className="mt-3 max-w-3xl text-[15px]/relaxed text-white/90">
          Most resumes are read by software before a person ever sees them.
          Paste yours and the ad you&apos;re going for, and you&apos;ll get the
          same read a screener gets — which lines are letting you down, what to
          write instead, and what this job is really asking for.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2 print:hidden">
        <Window title="Your resume.txt">
          <Paste
            value={resume}
            onChange={setResume}
            placeholder="Paste your resume here…"
          />
        </Window>
        <Window title="The job ad.txt">
          <Paste
            value={jobAd}
            onChange={setJobAd}
            placeholder="Paste the job advertisement here…"
          />
        </Window>
      </div>

      {resume.length > 0 && (
        <PrivacyCheck
          found={scrubbed.found}
          extraTerms={extraTerms}
          onAddTerm={(t) => setExtraTerms((xs) => [...xs, t])}
          onRemoveTerm={(t) => setExtraTerms((xs) => xs.filter((x) => x !== t))}
          preview={scrubbed.text}
        />
      )}

      <div className="mt-6 flex flex-wrap items-center gap-4 print:hidden">
        <button
          onClick={run}
          disabled={busy || !ready}
          className="raised px-6 py-2.5 text-[13px] font-bold uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Working…" : "Screen my resume"}
        </button>
        {!ready && !busy && (
          <span className="text-[12px] uppercase tracking-wider text-white/70">
            Paste both to continue
          </span>
        )}
        {report && (
          <button
            onClick={() => window.print()}
            className="raised px-5 py-2.5 text-[13px] font-bold uppercase tracking-widest"
          >
            Save as PDF
          </button>
        )}
      </div>

      {busy && <LoadingDialog />}

      {error && (
        <div className="win mt-6">
          <div className="win-title" style={{ background: "var(--bad)" }}>
            <span>Error</span>
            <span className="win-btn" />
          </div>
          <p className="p-5 text-[14px]/relaxed">{error}</p>
        </div>
      )}

      {report && <Results report={report} />}

      <Footer />
    </main>
  );
}

function Window({
  title,
  children,
  tone,
}: {
  title: string;
  children: ReactNode;
  tone?: "accent" | "warn";
}) {
  const bg =
    tone === "accent"
      ? "var(--brand-blue-bright)"
      : tone === "warn"
        ? "var(--brand-yellow)"
        : undefined;
  const fg = tone === "warn" ? "var(--ink)" : undefined;

  return (
    <section className="win break-inside-avoid">
      <div className="win-title" style={{ background: bg, color: fg }}>
        <span className="truncate">{title}</span>
        <span className="flex gap-1">
          <span className="win-btn" style={{ borderColor: fg }} />
          <span className="win-btn" style={{ borderColor: fg }} />
        </span>
      </div>
      {children}
    </section>
  );
}

function Paste({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="p-3">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={14}
        spellCheck={false}
        className="sunken w-full resize-y p-3 text-[13px]/relaxed outline-none placeholder:text-[var(--muted)] focus:shadow-[inset_2px_2px_0_rgba(0,0,0,0.18),0_0_0_3px_var(--brand-yellow)]"
      />
      <div className="mt-2 flex justify-between text-[11px] uppercase tracking-wider text-[var(--muted)]">
        <span>{value.length < 100 ? "min 100 chars" : "ready"}</span>
        <span>{value.length.toLocaleString()} chars</span>
      </div>
    </div>
  );
}

/**
 * The honest part of the privacy story: show the candidate exactly what is
 * being removed and let them add anything the patterns missed, before a single
 * byte leaves the browser.
 */
function PrivacyCheck({
  found,
  extraTerms,
  onAddTerm,
  onRemoveTerm,
  preview,
}: {
  found: Redaction[];
  extraTerms: string[];
  onAddTerm: (t: string) => void;
  onRemoveTerm: (t: string) => void;
  preview: string;
}) {
  const [draft, setDraft] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  // One chip per distinct original string, not one per occurrence.
  const unique = useMemo(() => {
    const seen = new Map<string, Redaction & { count: number }>();
    for (const f of found) {
      const key = `${f.kind}:${f.original.toLowerCase()}`;
      const hit = seen.get(key);
      if (hit) hit.count += 1;
      else seen.set(key, { ...f, count: 1 });
    }
    return [...seen.values()];
  }, [found]);

  const add = () => {
    const t = draft.trim();
    if (t.length >= 2 && !extraTerms.includes(t)) onAddTerm(t);
    setDraft("");
  };

  return (
    <div className="mt-6 print:hidden">
      <Window title="Before anything leaves your browser" tone="warn">
        <div className="p-5">
          <p className="text-[14px]/relaxed">
            Your resume is stripped of personal details{" "}
            <strong>on this device</strong>, before it is sent anywhere. The
            analysis never needs your name or contact details, so they are
            removed rather than trusted to anyone.
          </p>

          {unique.length > 0 ? (
            <>
              <p className="mt-4 text-[12px] uppercase tracking-wider text-[var(--muted)]">
                Removing {unique.length}{" "}
                {unique.length === 1 ? "item" : "items"}
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {unique.map((f, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 border border-[var(--ink)] bg-white px-2.5 py-1 text-[12px]"
                  >
                    <span className="text-[var(--muted)]">
                      {REDACTION_LABEL[f.kind]}
                    </span>
                    <span className="font-bold line-through decoration-2">
                      {f.original.length > 34
                        ? `${f.original.slice(0, 34)}…`
                        : f.original}
                    </span>
                    {f.count > 1 && (
                      <span className="text-[var(--muted)]">×{f.count}</span>
                    )}
                    {f.kind === "custom" && (
                      <button
                        onClick={() => onRemoveTerm(f.original)}
                        className="text-[var(--muted)] hover:text-[var(--bad)]"
                        aria-label={`Stop removing ${f.original}`}
                      >
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-4 text-[13px]/relaxed text-[var(--muted)]">
              Nothing detected yet. Patterns catch emails, phone numbers,
              profile links, locations and the name in your header.
            </p>
          )}

          <div className="mt-5 border-t border-dashed border-[var(--muted)] pt-4">
            <label className="text-[13px]/relaxed">
              Missed something? A name further down, a referee, a client you
              can&apos;t share — add it and it&apos;ll be removed everywhere.
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
                placeholder="e.g. a surname, a company"
                className="sunken min-w-0 flex-1 px-3 py-2 text-[13px] outline-none placeholder:text-[var(--muted)]"
              />
              <button
                onClick={add}
                className="raised px-4 py-2 text-[12px] font-bold uppercase tracking-wider"
              >
                Remove it too
              </button>
            </div>
          </div>

          <button
            onClick={() => setShowPreview((s) => !s)}
            className="mt-4 text-[12px] underline underline-offset-2"
          >
            {showPreview ? "Hide" : "Show"} exactly what gets sent
          </button>
          {showPreview && (
            <pre className="sunken mt-2 max-h-72 overflow-auto p-3 text-[12px]/relaxed whitespace-pre-wrap">
              {preview}
            </pre>
          )}

          <p className="mt-4 text-[12px]/relaxed text-[var(--muted)]">
            What remains — your roles, dates and achievements — is sent to
            TypeSafe and OpenAI to be analysed. Nothing is stored on our side,
            and no account is required. Automatic detection is good, not
            perfect; the preview above is the final word.
          </p>
        </div>
      </Window>
    </div>
  );
}

function LoadingDialog() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t = setInterval(
      () => setStep((s) => Math.min(PASSES.length - 1, s + 1)),
      2400,
    );
    return () => clearInterval(t);
  }, []);

  return (
    <div className="win mx-auto mt-6 max-w-lg print:hidden">
      <div className="win-title">
        <span>ResumeMirror 1.0</span>
        <span className="win-btn" />
      </div>
      <div className="p-5">
        <p className="text-[14px]">{PASSES[step]}…</p>
        <div className="sunken mt-3 h-5 p-[3px]">
          <div
            className="ants h-full transition-all duration-700"
            style={{ width: `${((step + 1) / PASSES.length) * 100}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] uppercase tracking-wider text-[var(--muted)]">
          This takes about fifteen seconds
        </p>
      </div>
    </div>
  );
}

function Meter({
  value,
  target,
  color,
}: {
  value: number;
  target?: number;
  color: string;
}) {
  const cells = 20;
  const exact = value * cells;
  const full = Math.floor(exact);
  const partial = exact - full;

  return (
    <div className="meter-wrap">
      <div className="meter" style={{ ["--cell" as string]: color }}>
        {Array.from({ length: cells }, (_, i) => (
          <span
            key={i}
            className="meter-cell"
            data-on={i < full}
            data-partial={i === full && partial > 0.05}
            style={
              i === full && partial > 0.05
                ? ({ ["--fill" as string]: `${partial * 100}%` } as React.CSSProperties)
                : undefined
            }
          />
        ))}
      </div>
      {target !== undefined && (
        <span
          className="meter-target"
          style={{ left: `${Math.min(100, target * 100)}%` }}
          aria-hidden
        />
      )}
    </div>
  );
}

function Results({ report }: { report: Report }) {
  const hintFor = (id: string) =>
    report.hints.find((h) => h.dimension_id === id);

  // Biggest problem first. The server sorts by importance for other callers;
  // here the reader wants a to-do list, not a copy of the job ad.
  const byCost = [...report.dimensions].sort((a, b) => b.cost - a.cost);

  return (
    <div className="mt-8 flex flex-col gap-6">
      <Headline report={report} />
      <StartHere report={report} />
      <ProfileRead report={report} />

      <Window title="What this job wants, and where you stand" tone="accent">
        <div className="p-5">
          <p className="text-[13px]/relaxed text-[var(--muted)]">
            One row per thing this ad asks for, biggest problem first. The bar
            is how much you show; the ▼ marker is where this job wants you.
          </p>
          <ColourKey />

          <div className="mt-5 flex flex-col gap-5">
            {byCost.map((d) => (
              <DimensionRow key={d.id} d={d} hint={hintFor(d.id)} />
            ))}
          </div>

          {report.unreadable.length > 0 && (
            <p className="mt-5 border border-dashed border-[var(--muted)] p-3 text-[12px]/relaxed text-[var(--muted)]">
              We couldn&apos;t get a clear read on{" "}
              {report.unreadable.map((d) => d.label.toLowerCase()).join(" or ")},
              so {report.unreadable.length === 1 ? "it is" : "they are"} shown in
              grey and left out of the advice. That usually means your resume is
              genuinely ambiguous on the point — which is worth fixing on its own.
            </p>
          )}
        </div>
      </Window>

      {report.strengths.length > 0 && (
        <Window title="Lead with these">
          <div className="p-5">
            <p className="mb-3 text-[14px]/relaxed">
              <strong>What to do:</strong>{" "}
              {report.strongestLine ? (
                <>
                  your strongest proof for this job is extracted below. If it
                  isn&apos;t in your top third, move it higher — and echo it in
                  your opening line so it&apos;s read twice.
                </>
              ) : (
                <>
                  get these into your top third and into your opening line. A
                  strength a screener never reaches counts for nothing.
                </>
              )}
            </p>
            {report.strongestLine && (
              <div className="mb-4">
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--good)]">
                    Strongest proof in your resume
                  </p>
                  <CopyButton
                    text={report.strongestLine.text}
                    label="Copy (Cmd+F)"
                  />
                </div>
                <p className="border-l-4 border-[var(--good)] bg-[var(--good)]/[0.08] px-3.5 py-2.5 text-[13px]/relaxed">
                  {report.strongestLine.text}
                </p>
              </div>
            )}
            <ul className="flex flex-wrap gap-2">
              {report.strengths.map((s) => (
                <li
                  key={s.id}
                  className="border border-[var(--ink)] bg-[var(--accent)] px-3 py-1.5 text-[13px] font-bold uppercase tracking-wide"
                >
                  {s.label}
                  <span className="ml-2 font-normal tabular-nums">
                    {pct(s.demonstrated)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Window>
      )}

      <HowItReads report={report} />

      <Window title="How this was worked out">
        <div className="flex flex-col gap-2 p-4 text-[12px]/relaxed text-[var(--muted)]">
          <p>
            We read the ad first and worked out{" "}
            {report.dimensions.length} things it&apos;s really asking for. Then
            we read your resume on its own, so the ad couldn&apos;t colour the
            reading. Then we compared the two, and finally went looking for the
            exact lines worth changing.
          </p>
          <p>
            Where the reading wasn&apos;t clear, we&apos;ve said so rather than
            guessed. This is one careful reader&apos;s judgment of a document —
            not a verdict on you, and not what any particular employer will
            think.
          </p>
        </div>
      </Window>
    </div>
  );
}

/**
 * Colour encodes cost — how much a shortfall actually costs this application,
 * which is importance multiplied by how far short you fall. That is the right
 * measure to rank by, but it is not guessable from a coloured bar, so it gets
 * stated rather than left for the reader to infer.
 */
function ColourKey() {
  const items: [string, string][] = [
    ["var(--bad)", "costing you the most"],
    ["var(--warn)", "worth fixing"],
    ["var(--good)", "already clear"],
    ["var(--muted)", "couldn't read it"],
  ];
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 border border-dashed border-[var(--muted)] p-2.5">
      <span className="text-[11px] uppercase tracking-widest text-[var(--muted)]">
        Bar colour
      </span>
      {items.map(([c, label]) => (
        <span key={label} className="flex items-center gap-1.5 text-[12px]">
          <span
            className="inline-block h-3 w-3 border border-[var(--ink)]"
            style={{ background: c }}
          />
          {label}
        </span>
      ))}
      <span className="text-[11px]/relaxed text-[var(--muted)]">
        (how far short × how much this job cares — not your score)
      </span>
    </div>
  );
}

function barColour(d: Report["dimensions"][number]) {
  if (d.uncertain) return "var(--muted)";
  if (d.cost > 0.35) return "var(--bad)";
  if (d.cost > 0.15) return "var(--warn)";
  return "var(--good)";
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable/restricted
    }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      className="cursor-pointer text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] hover:text-[var(--ink)]"
      title="Copy to clipboard"
    >
      {copied ? "✓ Copied" : label}
    </button>
  );
}

/**
 * One dimension: the bar, and directly beneath it the fix, if there is one.
 * Keeping these together is the point — the diagnosis and the thing to do
 * about it were previously in two different sections.
 */
function DimensionRow({
  d,
  hint,
}: {
  d: Report["dimensions"][number];
  hint?: RewriteHint;
}) {
  const shortfall = Math.max(0, d.importance - d.demonstrated);
  const cleared = d.demonstrated >= d.importance;
  // A competency is ONLY missing if demonstrated is low (< 0.35).
  // When demonstrated is high (e.g. 96%), evidence is demonstrably present in the resume.
  const missing = (hint?.evidence_missing ?? false) && d.demonstrated < 0.35;
  const originalText = hint?.current_line || d.anchor?.text || null;
  const veryClose = !cleared && shortfall <= 0.05;

  const rubric = DIMENSION_BY_ID.get(d.id);
  const targetLevelText =
    d.nextLevel ||
    rubric?.levels[Math.min(4, Math.max(1, Math.round(d.importance * 4)))] ||
    rubric?.levels[4] ||
    "senior impact and measurable outcomes";

  return (
    <article className="break-inside-avoid border border-[var(--ink)] p-4">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <h3 className="text-[14px] font-bold uppercase tracking-wide">
          {d.label}
          {d.uncertain && (
            <span className="ml-2 text-[12px] font-normal normal-case text-[var(--muted)]">
              couldn&apos;t read this clearly
            </span>
          )}
        </h3>
        <span className="text-[12px] tabular-nums text-[var(--muted)]">
          this job wants {pct(d.importance)} · you show {pct(d.demonstrated)}
        </span>
      </div>

      <Meter value={d.demonstrated} target={d.importance} color={barColour(d)} />

      <p className="mt-2 text-[12px]/relaxed text-[var(--muted)]">
        {cleared ? (
          <>You&apos;re past what this job asks for here. </>
        ) : veryClose ? (
          <>
            You&apos;re{" "}
            <strong className="text-[var(--ink)]">
              {Math.max(1, Math.round(shortfall * 100))} points short
            </strong>{" "}
            — very close to what this job asks for.{" "}
          </>
        ) : (
          <>
            You&apos;re{" "}
            <strong className="text-[var(--ink)]">
              {Math.round(shortfall * 100)} points short
            </strong>{" "}
            of where the ▼ sits.{" "}
          </>
        )}
        Right now yours reads as: {d.currentLevel.toLowerCase()}
      </p>

      {hint ? (
        <div className="mt-4 border-t border-dashed border-[var(--muted)] pt-3.5">
          {missing && (
            <span className="mb-2 inline-block border border-[var(--ink)] bg-[var(--accent)] px-2 py-0.5 text-[11px] uppercase tracking-wider">
              Not in your resume yet
            </span>
          )}

          <p className="text-[14px]/relaxed">{hint.diagnosis}</p>

          {!missing && originalText && (
            <div className="mt-3.5 flex flex-col gap-3">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">
                    Original in your resume
                  </p>
                  <CopyButton text={originalText} label="Copy (Cmd+F)" />
                </div>
                <p
                  className={`border-l-4 border-[var(--muted)] bg-black/[0.04] px-3.5 py-2.5 text-[13px]/relaxed ${
                    cleared || veryClose ? "" : "line-through decoration-[var(--bad)]/60"
                  }`}
                >
                  {originalText}
                </p>
              </div>

              {hint.replacement ? (
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--good)]">
                      {cleared || veryClose ? "Suggested sharpening" : "Suggested change"}
                    </p>
                    <CopyButton text={hint.replacement} label="Copy rewrite" />
                  </div>
                  <p className="border-l-4 border-[var(--good)] bg-[var(--good)]/[0.08] px-3.5 py-2.5 text-[13px]/relaxed font-medium">
                    {hint.replacement}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">
                    Target to bridge the gap
                  </p>
                  <p className="border-l-4 border-[var(--good)] bg-[var(--good)]/[0.08] px-3.5 py-2.5 text-[13px]/relaxed font-medium">
                    {targetLevelText}
                  </p>
                </div>
              )}
            </div>
          )}

          {!missing && !originalText && (
            <div className="mt-3.5 flex flex-col gap-2">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--good)]">
                  {veryClose ? "Suggested sharpening" : "Suggested addition to bridge the gap"}
                </p>
                {hint.replacement && <CopyButton text={hint.replacement} label="Copy bullet" />}
              </div>
              <p className="border-l-4 border-[var(--good)] bg-[var(--good)]/[0.08] px-3.5 py-2.5 text-[13px]/relaxed font-medium">
                {hint.replacement || `Add concrete evidence to your resume describing: ${targetLevelText}`}
              </p>
            </div>
          )}

          {missing && (
            <div className="mt-3.5 flex flex-col gap-2">
              <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--brand-blue-bright)]">
                Suggested addition
              </p>
              {hint.how_to_earn_it.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {hint.how_to_earn_it.map((t, i) => (
                    <li
                      key={i}
                      className="border-l-4 border-[var(--brand-blue-bright)] bg-black/[0.04] px-3.5 py-2.5 text-[13px]/relaxed"
                    >
                      {t}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="border-l-4 border-[var(--brand-blue-bright)] bg-black/[0.04] px-3.5 py-2.5 text-[13px]/relaxed">
                  Add concrete evidence to your resume demonstrating: {targetLevelText}
                </p>
              )}
            </div>
          )}

          {hint.why && (
            <p className="mt-3 text-[12px]/relaxed text-[var(--muted)]">
              Why: {hint.why}
            </p>
          )}
        </div>
      ) : d.anchor ? (
        <div className="mt-4 border-t border-dashed border-[var(--muted)] pt-3.5">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">
              Original in your resume
            </p>
            <CopyButton text={d.anchor.text} label="Copy (Cmd+F)" />
          </div>
          <p className="border-l-4 border-[var(--muted)] bg-black/[0.04] px-3.5 py-2.5 text-[13px]/relaxed">
            {d.anchor.text}
          </p>
          <div className="mt-3">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-[var(--good)]">
              {veryClose ? "How to reach the top benchmark" : "Suggested improvement"}
            </p>
            <p className="border-l-4 border-[var(--good)] bg-[var(--good)]/[0.08] px-3.5 py-2.5 text-[13px]/relaxed">
              Show evidence of: <span className="font-medium text-[var(--ink)]">{targetLevelText}</span>
            </p>
          </div>
        </div>
      ) : !cleared ? (
        <div className="mt-4 border-t border-dashed border-[var(--muted)] pt-3.5">
          {d.demonstrated < 0.35 && (
            <span className="mb-2 inline-block border border-[var(--ink)] bg-[var(--accent)] px-2 py-0.5 text-[11px] uppercase tracking-wider">
              Not in your resume yet
            </span>
          )}
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-[var(--good)]">
            {veryClose
              ? "How to bridge the final gap"
              : d.demonstrated < 0.35
                ? "Suggested addition"
                : "To reach the top benchmark"}
          </p>
          <div className="border-l-4 border-[var(--good)] bg-[var(--good)]/[0.08] px-3.5 py-2.5 text-[13px]/relaxed">
            <p className="text-[12px] text-[var(--muted)]">
              {veryClose
                ? `You're already at ${d.currentLevel.toLowerCase()}. To match the top benchmark (${pct(d.importance)}), elevate your bullet to describe:`
                : `To bridge this gap (${pct(d.importance)} importance), add evidence describing:`}
            </p>
            <p className="mt-1 font-medium text-[var(--ink)]">
              {targetLevelText}
            </p>
          </div>
        </div>
      ) : null}
    </article>
  );
}

/** The answer to "so what do I actually do?", ordered. */
function StartHere({ report }: { report: Report }) {
  const actions = buildActions(report);
  if (actions.length === 0) return null;

  return (
    <Window title="Start here" tone="warn">
      <div className="p-5">
        <p className="text-[13px]/relaxed text-[var(--muted)]">
          In this order. Everything below this block is the reasoning behind it.
        </p>
        <ol className="mt-4 flex flex-col gap-3">
          {actions.map((a, i) => (
            <li key={i} className="flex gap-3.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-[var(--ink)] bg-[var(--accent)] text-[13px] font-bold">
                {i + 1}
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="text-[14px]/relaxed font-bold">
                  {a.what}
                  {a.where && (
                    <span className="ml-2 border border-[var(--ink)] px-1.5 py-0.5 text-[11px] font-normal uppercase tracking-wider">
                      {a.where}
                    </span>
                  )}
                </p>
                {a.detail && (
                  <p className="mt-1 text-[12px]/relaxed text-[var(--muted)]">
                    {a.detail}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Window>
  );
}

function Headline({ report }: { report: Report }) {
  const { seniority, experience } = report;

  // What the number actually means for the decision in front of them.
  const verdict =
    report.fit >= 0.7
      ? "You're competitive here. Tighten the lines below and send it."
      : report.fit >= 0.45
        ? "Worth applying, but not as it stands. The changes below are what close the distance."
        : "This is a stretch as written. Work the list below first, or find a role closer to what you've actually done.";

  const seniorityNote = seniority.uncertain
    ? "The two reads are close enough that the level is genuinely arguable — see the split below."
    : seniority.delta === 0
      ? "You're pitching at the right level for this one, so don't over-claim: the gap is in evidence, not ambition."
      : seniority.delta < 0
        ? "You're reaching above what the resume backs up. Senior reads come from owned decisions and outcomes, not longer task lists — that's what the rewrites below change."
        : "You're aiming below what your resume supports. Worth checking whether there's a bigger version of this role open.";

  return (
    <Window title="How you'd land" tone="accent">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:gap-8">
        <div className="shrink-0">
          <div className="text-6xl font-bold tabular-nums leading-none">
            {pct(report.fit)}
          </div>
          <div className="mt-2 text-[11px] uppercase tracking-widest text-[var(--muted)]">
            weighted fit
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-4 text-[14px]/relaxed">
          <p className="font-bold">{verdict}</p>
          <p>{seniorityNote}</p>

          <div className="flex flex-col gap-3 sm:flex-row sm:gap-8">
            <SplitRead
              label="This ad reads as"
              top={SENIORITY_LABEL[seniority.required]}
              split={seniority.requiredSplit}
            />
            <SplitRead
              label="Your resume reads as"
              top={SENIORITY_LABEL[seniority.demonstrated]}
              split={seniority.demonstratedSplit}
            />
          </div>

          <p className="text-[13px] text-[var(--muted)]">
            About {Math.round(experience.years)} years of experience, reading as{" "}
            {PROGRESSION_LABEL[experience.progression]}
            {experience.progressionUncertain && ", though not clear-cut"}.
          </p>
        </div>
      </div>
    </Window>
  );
}

/**
 * Shows the answer and the probability behind it. A 45/40 split and a 95/3
 * split produce the same headline word, and the reader deserves to know which
 * one they are looking at.
 */
function SplitRead({
  label,
  top,
  split,
}: {
  label: string;
  top: string;
  split: { option: string; p: number }[];
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="text-[11px] uppercase tracking-widest text-[var(--muted)]">
        {label}
      </div>
      <div className="mt-0.5 text-[15px] font-bold">{top}</div>
      {split.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {split.map((row, i) => (
            <li key={row.option} className="flex items-center gap-2 text-[12px]">
              <span className="w-24 shrink-0 truncate text-[var(--muted)]">
                {SENIORITY_LABEL[row.option]?.toLowerCase() ?? row.option}
              </span>
              <span className="h-2.5 min-w-[2px] border border-[var(--ink)]"
                style={{
                  width: `${Math.max(2, row.p * 100)}%`,
                  background: i === 0 ? "var(--accent)" : "transparent",
                }}
              />
              <span className="shrink-0 tabular-nums text-[var(--muted)]">
                {Math.round(row.p * 100)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProfileRead({ report }: { report: Report }) {
  const { profile, positioning } = report;
  if (profile.matches && !profile.resumeAlternative) return null;

  return (
    <Window title="Who your resume says you are">
      <div className="p-5">
        {profile.matches ? (
          <p className="text-[14px]/relaxed">
            You come across as a {profileName(profile.resumeReads)}, which is
            what this role is after — though it was a close call, and{" "}
            {profileName(profile.resumeAlternative!)} nearly won.
          </p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px] font-bold uppercase tracking-wide">
              <span className="border border-[var(--ink)] bg-[var(--accent)] px-3 py-1.5">
                They want: {profileName(profile.roleWants)}
              </span>
              <span className="text-[var(--muted)]">≠</span>
              <span className="border border-[var(--ink)] px-3 py-1.5">
                You read as: {profileName(profile.resumeReads)}
              </span>
            </div>
            <p className="text-[14px]/relaxed">
              A screener decides what kind of person you are in about ten
              seconds, and everything after that gets read through it — so a
              perfect skills match further down often never gets reached.
              {profile.uncertain &&
                " Both reads carried some doubt, so weigh it alongside the detail below."}
            </p>
          </>
        )}

        {positioning && (
          <div className="mt-4 border-t border-dashed border-[var(--muted)] pt-4">
            <p className="mb-3 text-[13px]/relaxed">
              <strong>What to do:</strong> this one line sets the frame. Rewrite
              it and the rest of your resume gets read differently.
            </p>
            <div className="flex flex-col gap-3">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">
                    Original in your resume
                  </p>
                  <CopyButton
                    text={positioning.current_line}
                    label="Copy (Cmd+F)"
                  />
                </div>
                <p className="border-l-4 border-[var(--muted)] bg-black/[0.04] px-3.5 py-2.5 text-[13px]/relaxed line-through decoration-[var(--bad)]/60">
                  {positioning.current_line}
                </p>
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--good)]">
                    Suggested change
                  </p>
                  <CopyButton
                    text={positioning.replacement}
                    label="Copy rewrite"
                  />
                </div>
                <p className="border-l-4 border-[var(--good)] bg-[var(--good)]/[0.08] px-3.5 py-2.5 text-[13px]/relaxed font-medium">
                  {positioning.replacement}
                </p>
              </div>
            </div>
            <p className="mt-3 text-[12px]/relaxed text-[var(--muted)]">
              Why: {positioning.why}
            </p>
          </div>
        )}

        <p className="mt-3 text-[12px]/relaxed text-[var(--muted)]">
          What they&apos;re after: {TALENT_PROFILES[profile.roleWants]}
        </p>
      </div>
    </Window>
  );
}

function HowItReads({ report }: { report: Report }) {
  const s = report.signals;

  const notes: { on: boolean; text: string }[] = [
    {
      on: s.hardRequirementConflict > 0.5,
      text: "This ad states a hard requirement — a location, work rights, a licence or a credential — that your resume doesn't appear to meet. Check that before you spend an evening on the application.",
    },
    {
      on: s.buriesTheLede > 0.5,
      text: "Your most relevant experience is too far down. A screener reads the top third and decides; move your best-matching role or bullets above that line.",
    },
    {
      on: s.quantifiedOutcomes < 0.5,
      text: "Almost nothing you claim has a number attached. Numbers are the cheapest credibility there is — how many, how much, how fast, how many people.",
    },
    {
      on: s.tailoredToAd < 0.5,
      text: "This reads like a resume you send to everyone. Even reordering your bullets so the ones matching this ad come first would change how it lands.",
    },
    {
      on: s.machineReadable < 0.5,
      text: "The layout may not survive the software that reads it first — columns, tables and text inside graphics often get dropped. Plain headings and one role per block are safer.",
    },
    {
      on: s.keywordStuffing > 0.5,
      text: "Your skills list names things that never show up in your actual experience. Screeners notice, and it quietly undermines the skills you can genuinely back.",
    },
    {
      on: s.experienceIsStale > 0.5,
      text: "Your best work is in your older roles. Recent experience is what gets read first, so if newer roles involved similar work, say so more fully.",
    },
    {
      on: s.unexplainedGaps > 0.5,
      text: "There's a gap or a turn in your history that a reader will pause on. A short line of explanation costs you nothing and stops them guessing.",
    },
  ];

  const active = notes.filter((n) => n.on);
  if (active.length === 0) return null;

  return (
    <Window title="How the document itself reads">
      <div className="p-5">
        <p className="mb-3 text-[13px]/relaxed text-[var(--muted)]">
          Separate from what you&apos;ve done — this is about the resume as an
          object someone has to read.
        </p>
        <ul className="flex flex-col gap-2.5">
          {active.map((n, i) => (
            <li key={i} className="flex gap-3 text-[14px]/relaxed">
              <span className="mt-[0.15rem] shrink-0 font-bold text-[var(--brand-blue-bright)]">
                ▸
              </span>
              <span>{n.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </Window>
  );
}

function Footer() {
  return (
    <footer className="mt-10 break-inside-avoid">
      <div className="win">
        <div className="flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <a
            href="https://feliperego.com"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0"
          >
            <Image
              src="/felipe-rego-logo.png"
              alt="Felipe Rego"
              width={783}
              height={201}
              className="h-9 w-auto"
              priority={false}
            />
          </a>
          <p className="text-[12px]/relaxed text-[var(--muted)]">
            Built by{" "}
            <a
              href="https://feliperego.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-[var(--brand-blue-bright)] underline underline-offset-2"
            >
              feliperego.com
            </a>{" "}
            — data, storytelling and AI consulting. Judgments by TypeSafe&apos;s
            Jev; wording by OpenAI. Your resume is redacted in your browser and
            never stored.
          </p>
        </div>
      </div>
    </footer>
  );
}
