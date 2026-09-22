"use client";

import { useEffect, useState, type ReactNode } from "react";

import { TALENT_PROFILES } from "@/lib/dimensions";
import type { RewriteHint } from "@/lib/rewrite";
import type { ScreenResult } from "@/lib/screen";

type Report = ScreenResult & { hints: RewriteHint[]; hintsError: string | null };

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

const PASSES = [
  "Reading the job ad",
  "Reading your resume",
  "Comparing the two",
  "Writing suggestions",
];

const pct = (n: number) => `${Math.round(n * 100)}%`;
const profileName = (p: string) => PROFILE_LABEL[p] ?? p.replace(/_/g, " ");

export default function Home() {
  const [resume, setResume] = useState("");
  const [jobAd, setJobAd] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    setReport(null);

    try {
      const res = await fetch("/api/screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume, jobAd }),
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
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="crop relative mb-8 px-3 py-6 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-4xl">
          RESUME MIRROR
        </h1>
        <p className="mt-2 max-w-2xl text-[13px]/relaxed text-white/85">
          Screening tools read your resume before a person does. This runs the
          same kind of judgment on your side of the table.
        </p>
      </header>

      <div className="grid gap-5 sm:grid-cols-2">
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

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button
          onClick={run}
          disabled={busy || !ready}
          className="raised px-5 py-2 text-xs font-bold uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Working…" : "Screen my resume"}
        </button>
        {!ready && !busy && (
          <span className="text-[11px] uppercase tracking-wider text-white/65">
            Paste both to continue
          </span>
        )}
      </div>

      {busy && <LoadingDialog />}

      {error && (
        <div className="win mt-6">
          <div className="win-title" style={{ background: "var(--bad)" }}>
            <span>Error</span>
            <span className="win-btn" />
          </div>
          <p className="p-4 text-[13px]/relaxed">{error}</p>
        </div>
      )}

      {report && <Results report={report} />}

      <footer className="mt-10 px-1 text-[11px]/relaxed text-white/55">
        Built on TypeSafe · Jev returns the judgments, code does the arithmetic.
      </footer>
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
  tone?: "accent";
}) {
  return (
    <section className="win">
      <div
        className="win-title"
        style={
          tone === "accent"
            ? { background: "var(--brand-blue-bright)" }
            : undefined
        }
      >
        <span className="truncate">{title}</span>
        <span className="flex gap-1">
          <span className="win-btn" />
          <span className="win-btn" />
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
    <div className="p-2">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={13}
        spellCheck={false}
        className="sunken w-full resize-y p-2.5 text-[12px]/relaxed outline-none placeholder:text-[var(--muted)] focus:shadow-[inset_2px_2px_0_rgba(0,0,0,0.18),0_0_0_2px_var(--brand-yellow)]"
      />
      <div className="mt-1.5 flex justify-between text-[10px] uppercase tracking-wider text-[var(--muted)]">
        <span>{value.length < 100 ? "min 100 chars" : "ready"}</span>
        <span>{value.length.toLocaleString()} chars</span>
      </div>
    </div>
  );
}

/** Stands in for the ~10s the three passes take. Purely cosmetic pacing. */
function LoadingDialog() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t = setInterval(
      () => setStep((s) => Math.min(PASSES.length - 1, s + 1)),
      2600,
    );
    return () => clearInterval(t);
  }, []);

  return (
    <div className="win mx-auto mt-6 max-w-md">
      <div className="win-title">
        <span>ResumeMirror 1.0</span>
        <span className="win-btn" />
      </div>
      <div className="p-4">
        <p className="text-[12px]">{PASSES[step]}…</p>
        <div className="sunken mt-3 h-4 p-[2px]">
          <div
            className="ants h-full transition-all duration-700"
            style={{ width: `${((step + 1) / PASSES.length) * 100}%` }}
          />
        </div>
        <p className="mt-2 text-[10px] uppercase tracking-wider text-[var(--muted)]">
          Pass {Math.min(step + 1, 3)} of 3
        </p>
      </div>
    </div>
  );
}

/** Blocky segmented meter — 20 cells, hard-filled, no smooth gradient. */
function Meter({ value, color }: { value: number; color: string }) {
  const cells = 20;
  const exact = value * cells;
  const full = Math.floor(exact);
  const partial = exact - full;

  return (
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
  );
}

function Results({ report }: { report: Report }) {
  const hintFor = (id: string) =>
    report.hints.find((h) => h.dimension_id === id);

  return (
    <div className="mt-8 flex flex-col gap-5">
      <Headline report={report} />
      <ProfileRead report={report} />

      <Window title="Role wants / you show">
        <div className="flex flex-col gap-3.5 p-4">
          {report.dimensions.map((d) => (
            <div key={d.id}>
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                <span className="text-[12px] font-bold uppercase tracking-wide">
                  {d.label}
                  {d.uncertain && (
                    <span className="ml-2 font-normal normal-case text-[var(--muted)]">
                      unclear read
                    </span>
                  )}
                </span>
                <span className="text-[11px] tabular-nums text-[var(--muted)]">
                  wants {pct(d.importance)} · shows {pct(d.demonstrated)}
                </span>
              </div>
              <Meter
                value={d.demonstrated}
                color={
                  d.uncertain
                    ? "var(--muted)"
                    : d.cost > 0.35
                      ? "var(--bad)"
                      : d.cost > 0.15
                        ? "var(--warn)"
                        : "var(--good)"
                }
              />
              <p className="mt-1 text-[11px]/relaxed text-[var(--muted)]">
                Reads as: {d.currentLevel.toLowerCase()}
              </p>
            </div>
          ))}

          {report.unreadable.length > 0 && (
            <p className="mt-1 border border-dashed border-[var(--muted)] p-2.5 text-[11px]/relaxed text-[var(--muted)]">
              {report.unreadable.map((d) => d.label).join(", ")} scored below the
              confidence bar, so {report.unreadable.length === 1 ? "it is" : "they are"}{" "}
              left out of the advice below. Usually that means your resume is
              ambiguous on the point — itself worth fixing.
            </p>
          )}
        </div>
      </Window>

      {report.gaps.length > 0 && (
        <Window title="Where the distance costs you most" tone="accent">
          <div className="p-4">
            <p className="mb-3.5 text-[11px]/relaxed text-[var(--muted)]">
              Ranked by how much the role wants it × how little you show — not
              simply by your lowest scores.
            </p>
            {report.hintsError && (
              <p className="mb-3.5 border border-[var(--ink)] bg-[var(--accent)] p-2.5 text-[11px]/relaxed">
                {report.hintsError}
              </p>
            )}
            <div className="flex flex-col gap-4">
              {report.gaps.map((gap) => {
                const hint = hintFor(gap.id);
                return (
                  <article
                    key={gap.id}
                    className="border border-[var(--ink)] p-3.5"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-[13px] font-bold uppercase tracking-wide">
                        {gap.label}
                      </h3>
                      {hint?.evidence_missing && (
                        <span className="border border-[var(--ink)] bg-[var(--accent)] px-2 py-0.5 text-[10px] uppercase tracking-wider">
                          Not in your resume
                        </span>
                      )}
                    </div>

                    {hint && (
                      <p className="mt-2 text-[12px]/relaxed">{hint.diagnosis}</p>
                    )}

                    {gap.nextLevel && (
                      <p className="mt-2.5 text-[11px]/relaxed text-[var(--muted)]">
                        Next level up: {gap.nextLevel.toLowerCase()}
                      </p>
                    )}

                    {hint && hint.suggestions.length > 0 && (
                      <ul className="mt-3 flex flex-col gap-2">
                        {hint.suggestions.map((s, i) => (
                          <li
                            key={i}
                            className="border-l-4 border-[var(--brand-blue-bright)] bg-black/[0.04] px-3 py-2 text-[12px]/relaxed"
                          >
                            {s}
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        </Window>
      )}

      {report.strengths.length > 0 && (
        <Window title="Lead with these">
          <ul className="flex flex-wrap gap-2 p-4">
            {report.strengths.map((s) => (
              <li
                key={s.id}
                className="border border-[var(--ink)] bg-[var(--accent)] px-3 py-1.5 text-[12px] font-bold uppercase tracking-wide"
              >
                {s.label}
                <span className="ml-2 font-normal tabular-nums">
                  {pct(s.demonstrated)}
                </span>
              </li>
            ))}
          </ul>
        </Window>
      )}

      <HowItReads report={report} />

      <Window title="Run info">
        <p className="p-3 text-[11px]/relaxed text-[var(--muted)]">
          {report.model} · {report.dimensions.length} dimensions drawn from the
          ad · 3 passes · {report.usage.inputTokens.toLocaleString()} input
          tokens. Typed judgment guarantees the shape of these numbers, not that
          they are right about you.
        </p>
      </Window>
    </div>
  );
}

function Headline({ report }: { report: Report }) {
  const { seniority, experience } = report;

  const note = seniority.uncertain
    ? `Seniority was hard to read on one side or the other. Treat this loosely.`
    : seniority.delta === 0
      ? `Your resume reads at the level the ad asks for.`
      : seniority.delta < 0
        ? `You are pitching above what the resume currently shows.`
        : `You may be over-qualified, or aiming lower than you could.`;

  return (
    <Window title="Weighted fit" tone="accent">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-6">
        <div className="shrink-0">
          <div className="text-5xl font-bold tabular-nums leading-none">
            {pct(report.fit)}
          </div>
          <div className="mt-1.5 text-[10px] uppercase tracking-widest text-[var(--muted)]">
            weighted fit
          </div>
        </div>
        <div className="flex flex-col gap-2 text-[12px]/relaxed">
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <Stat label="Ad reads" value={SENIORITY_LABEL[seniority.required]} />
            <Stat
              label="You read"
              value={SENIORITY_LABEL[seniority.demonstrated]}
            />
            <Stat label="Experience" value={`~${Math.round(experience.years)} YRS`} />
          </div>
          <p>{note}</p>
          <p className="text-[var(--muted)]">
            Career shape: {PROGRESSION_LABEL[experience.progression]}
            {experience.progressionUncertain && " (not clear-cut)"}.
          </p>
        </div>
      </div>
    </Window>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-[10px] uppercase tracking-widest text-[var(--muted)]">
        {label}
      </span>
      <span className="text-[13px] font-bold">{value}</span>
    </span>
  );
}

function ProfileRead({ report }: { report: Report }) {
  const { profile } = report;
  if (profile.matches && !profile.resumeAlternative) return null;

  return (
    <Window title="Who you read as">
      <div className="p-4">
        {profile.matches ? (
          <p className="text-[12px]/relaxed">
            You read as a {profileName(profile.resumeReads)}, which is what this
            role is hiring — though the read was not clear-cut, and{" "}
            {profileName(profile.resumeAlternative!)} was a close second.
          </p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px] font-bold uppercase tracking-wide">
              <span className="border border-[var(--ink)] bg-[var(--accent)] px-2.5 py-1">
                Ad wants: {profileName(profile.roleWants)}
              </span>
              <span className="text-[var(--muted)]">≠</span>
              <span className="border border-[var(--ink)] px-2.5 py-1">
                You read: {profileName(profile.resumeReads)}
              </span>
            </div>
            <p className="text-[12px]/relaxed">
              That mismatch costs more than any single missing skill: a screener
              decides what kind of person you are in the first ten seconds, and
              everything after that is read through it.
              {profile.uncertain &&
                " Both reads carried some doubt, so weigh this alongside the detail below."}
            </p>
          </>
        )}
        <p className="mt-3 text-[11px]/relaxed text-[var(--muted)]">
          {TALENT_PROFILES[profile.roleWants]}
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
      text: "The ad states a hard requirement — location, work rights, a licence or credential — that your resume does not appear to meet. Worth checking before you spend time on the application.",
    },
    {
      on: s.buriesTheLede > 0.5,
      text: "Your most relevant experience sits too far down. A screener reads the top third; move it up.",
    },
    {
      on: s.quantifiedOutcomes < 0.5,
      text: "Your claims are mostly unquantified. Numbers are the cheapest credibility you can add.",
    },
    {
      on: s.tailoredToAd < 0.5,
      text: "This reads as a generic resume rather than one aimed at this ad.",
    },
    {
      on: s.machineReadable < 0.5,
      text: "The layout may not survive an automated parser — columns, tables, or graphics where plain headings would be safer.",
    },
    {
      on: s.keywordStuffing > 0.5,
      text: "Your skills list names things the experience section never demonstrates. Screeners notice, and it weakens the skills you can actually back.",
    },
    {
      on: s.experienceIsStale > 0.5,
      text: "Your strongest work is in older roles. Recent experience is what gets read first.",
    },
    {
      on: s.unexplainedGaps > 0.5,
      text: "There are gaps or turns in the history a reader would want explained.",
    },
  ];

  const active = notes.filter((n) => n.on);
  if (active.length === 0) return null;

  return (
    <Window title="How the document itself reads">
      <ul className="flex flex-col gap-2 p-4">
        {active.map((n, i) => (
          <li key={i} className="flex gap-2.5 text-[12px]/relaxed">
            <span className="mt-[0.15rem] shrink-0 font-bold text-[var(--brand-blue-bright)]">
              ▸
            </span>
            <span>{n.text}</span>
          </li>
        ))}
      </ul>
    </Window>
  );
}
