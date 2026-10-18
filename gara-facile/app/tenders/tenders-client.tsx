"use client";

import Link from "next/link";
import { AppSidebar } from "../components/app-sidebar";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { AmdStats } from "@/app/services/ai/amdStats";
import type { BidDraft } from "@/app/services/ai/draft";
import type { TenderSummary } from "@/app/services/ai/tenders";
import type {
  Requirement,
  TenderAnalysis,
  Verdict,
} from "@/app/services/ai/types";
import { decodeEntities, draftToText, requestJson } from "./ui-helpers";

type TenderItem = TenderSummary & {
  analysis: TenderAnalysis | null;
  analyzedAt: string | null;
};

interface TendersResponse {
  tenders: TenderItem[];
}

interface AnalyzeResponse {
  analysis: TenderAnalysis;
  requirements: Requirement[];
  stats: unknown;
}

interface EvolusComparison {
  ours: number;
  evolus: number;
  matched: { kind: string; ourPage: number; evolusPage: number }[];
  onlyOurs: { kind: string; page: number }[];
  onlyEvolus: { kind: string; page: number }[];
}

interface EvolusPending {
  status: "running" | "none" | "failed";
  tenderId: string;
}

interface EvolusDone {
  status: "done";
  tenderId: string;
  evolus: {
    kind: string;
    description: string;
    value?: number | string;
    page: number;
    quote: string;
  }[];
  comparison: EvolusComparison;
}

interface HealthEntry {
  model: string | null;
  ok: boolean;
  ms: number;
}

interface HealthResponse {
  extract: HealthEntry;
  draft: HealthEntry;
  gpu: string | null;
  checkedAt: string;
}

const STATUS_LABELS: Record<TenderAnalysis["results"][number]["status"], string> = {
  MEETS: "Meets",
  FAILS: "Fails",
  MISSING_DOC: "Missing document",
};

const STATUS_CLASSES: Record<TenderAnalysis["results"][number]["status"], string> = {
  MEETS: "status-badge status-meets",
  FAILS: "status-badge status-fails",
  MISSING_DOC: "status-badge status-missing",
};

const VERDICT_CLASSES: Record<Verdict, string> = {
  GO: "verdict verdict-go",
  NO_GO: "verdict verdict-nogo",
  REVIEW: "verdict verdict-review",
};

const eur = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function formatSeconds(ms: number) {
  return `${(ms / 1000).toFixed(1)}s`;
}

const deadlineFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatDeadline(value: string): string {
  const datePart = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return value;
  const date = new Date(`${datePart}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return deadlineFormatter.format(date);
}

export function TendersClient({
  recordId,
  companyName,
}: {
  recordId: number | null;
  companyName: string | null;
}) {
  const [tenders, setTenders] = useState<TenderItem[] | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<TenderAnalysis | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");
  const [evolus, setEvolus] = useState<EvolusDone | null>(null);
  const [draft, setDraft] = useState<BidDraft | null>(null);
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [approved, setApproved] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState("");
  const [amd, setAmd] = useState<AmdStats | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);

  const busy = analyzing || drafting;
  const selected = tenders?.find((tender) => tender.id === selectedId) ?? null;
  const requirementById = useMemo(
    () => new Map(requirements.map((requirement) => [requirement.id, requirement])),
    [requirements],
  );

  const [, startTransition] = useTransition();
  // Guards the Evolus fetch against tender switches while it is in flight.
  const evolusSeq = useRef(0);
  // Caches requirement descriptions per tender so switching back to an
  // already-analyzed tender keeps the matrix rows readable.
  const requirementsByTender = useRef<Record<string, Requirement[]>>({});

  async function refreshAmd() {
    try {
      setAmd(await requestJson<AmdStats>("/api/ai/amd-stats"));
    } catch {
      // The AMD panel is informational: never block the workflow on it.
    }
  }

  function resetForTender(tender: TenderItem | null) {
    setAnalysis(tender?.analysis ?? null);
    setRequirements(tender ? (requirementsByTender.current[tender.id] ?? []) : []);
    setAnalyzeError("");
    setDraft(null);
    setBodies({});
    setApproved(false);
    setDraftError("");
    setEvolus(null);
  }

  function fetchEvolus(tenderId: string) {
    const seq = ++evolusSeq.current;
    void requestJson<EvolusDone | EvolusPending>(
      `/api/ai/evolus/extract?tenderId=${encodeURIComponent(tenderId)}`,
    )
      .then((data) => {
        if (evolusSeq.current === seq && data.status === "done") setEvolus(data);
      })
      .catch(() => {
        // Any other status or error hides the box silently.
      });
  }

  // Selecting a tender resets the matrix, draft and Evolus box to that tender.
  function selectTender(id: string) {
    if (id === selectedId || busy) return;
    const current = tenders?.find((tender) => tender.id === id) ?? null;
    setSelectedId(id);
    resetForTender(current);
    if (current) fetchEvolus(current.id);
  }

  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      setListLoading(true);
      setListError("");
      try {
        const suffix = recordId ? `?businessRecordId=${recordId}` : "";
        const data = await requestJson<TendersResponse>(`/api/ai/tenders${suffix}`);
        if (cancelled) return;
        setTenders(data.tenders);
        if (data.tenders.length > 0) {
          setSelectedId(data.tenders[0].id);
          resetForTender(data.tenders[0]);
          fetchEvolus(data.tenders[0].id);
        }
      } catch (error) {
        if (cancelled) return;
        setListError(
          error instanceof Error ? error.message : "Something went wrong. Try again.",
        );
      } finally {
        if (!cancelled) setListLoading(false);
      }
      try {
        const stats = await requestJson<AmdStats>("/api/ai/amd-stats");
        if (!cancelled) setAmd(stats);
      } catch {
        // The AMD panel is informational: never block the workflow on it.
      }
      try {
        const status = await requestJson<HealthResponse>("/api/ai/health");
        if (!cancelled) setHealth(status);
      } catch {
        // Health failures stay hidden.
      }
    });
    return () => {
      cancelled = true;
    };
  }, [recordId]);

  async function runAnalyze() {
    if (!selected || busy) return;
    setAnalyzing(true);
    setAnalyzeError("");
    try {
      const data = await requestJson<AnalyzeResponse>("/api/ai/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenderId: selected.id,
          ...(recordId ? { businessRecordId: recordId } : {}),
        }),
      });
      setAnalysis(data.analysis);
      setRequirements(data.requirements);
      requirementsByTender.current[selected.id] = data.requirements;
      setTenders((current) =>
        current?.map((tender) =>
          tender.id === selected.id
            ? {
                ...tender,
                analysis: data.analysis,
                analyzedAt: new Date().toISOString(),
              }
            : tender,
        ) ?? current,
      );
      await refreshAmd();
    } catch (error) {
      setAnalyzeError(
        error instanceof Error ? error.message : "Something went wrong. Try again.",
      );
    } finally {
      setAnalyzing(false);
    }
  }

  async function runDraft() {
    if (!selected || !analysis || busy) return;
    setDrafting(true);
    setDraftError("");
    try {
      const data = await requestJson<BidDraft>("/api/ai/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenderId: selected.id,
          ...(recordId ? { businessRecordId: recordId } : {}),
        }),
      });
      setDraft(data);
      setBodies(
        Object.fromEntries(data.sections.map((section) => [section.key, section.body])),
      );
      setApproved(false);
      await refreshAmd();
    } catch (error) {
      setDraftError(
        error instanceof Error ? error.message : "Something went wrong. Try again.",
      );
    } finally {
      setDrafting(false);
    }
  }

  function downloadDraft() {
    if (!selected || !draft || !approved) return;
    const edited: BidDraft = {
      ...draft,
      sections: draft.sections.map((section) => ({
        ...section,
        body: bodies[section.key] ?? section.body,
      })),
    };
    const blob = new Blob([draftToText(decodeEntities(selected.title), edited)], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `draft-${selected.id}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#tenders-main">
        Skip to tenders
      </a>
      <AppSidebar
        current="tenders"
        label="Tenders navigation"
        note={
          <>
            <p>Pick a tender to check eligibility.</p>
            <span>Analysis and drafts run on AMD.</span>
          </>
        }
      />
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <span aria-hidden="true">/</span>
            <strong>Tenders</strong>
          </div>
          <div className="topbar-actions">
            <Link className="text-button" href="/">
              Business profile
            </Link>
          </div>
        </header>
        <main className="main-content" id="tenders-main">
          <div className="page-heading">
            <div>
              <h1>Find tenders you can win.</h1>
              <p>
                Select a tender, check eligibility against your profile, then
                generate a draft bid.
              </p>
            </div>
          </div>

          {recordId ? (
            <p className="tender-banner" role="status">
              Analyzing as {companyName ?? "your company"}.
            </p>
          ) : (
            <p className="tender-banner" role="status">
              You are using a demo company. Create your business profile to
              analyze tenders with your own data.{" "}
              <Link href="/">Open your business profile</Link>
            </p>
          )}

          <section aria-labelledby="tender-list-heading">
            <div className="form-heading">
              <h2 id="tender-list-heading">Step 1: Choose a tender</h2>
            </div>
            {listLoading ? (
              <p role="status" aria-live="polite">
                Loading tenders...
              </p>
            ) : null}
            {listError ? (
              <p className="error-message" role="alert">
                {listError}
              </p>
            ) : null}
            {tenders && tenders.length === 0 && !listLoading ? (
              <p role="status">No tenders available right now.</p>
            ) : null}
            <ul className="tender-list">
              {(tenders ?? []).map((tender) => {
                const isSelected = tender.id === selectedId;
                return (
                  <li key={tender.id}>
                    <button
                      type="button"
                      className={`tender-card${isSelected ? " selected" : ""}`}
                      aria-pressed={isSelected}
                      disabled={busy}
                      onClick={() => selectTender(tender.id)}
                    >
                      <span className="tender-card-title">{decodeEntities(tender.title)}</span>
                      <span className="tender-card-meta">
                        {[
                          tender.country,
                          tender.deadline
                            ? `Deadline ${formatDeadline(tender.deadline)}`
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        {tender.estimatedValueEur !== undefined
                          ? ` · ${eur.format(tender.estimatedValueEur)}`
                          : ""}
                      </span>
                      {tender.analysis ? (
                        <span className={VERDICT_CLASSES[tender.analysis.verdict]}>
                          {tender.analysis.verdict.replace("_", "-")} ·{" "}
                          {tender.analysis.score}/100
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="analyze-heading">
            <div className="form-heading">
              <h2 id="analyze-heading">Step 2: Analyze eligibility</h2>
              <p>Eligibility is decided by deterministic rules, not by the AI.</p>
            </div>
            <button
              type="button"
              className="button-primary"
              disabled={!selected || busy}
              onClick={() => void runAnalyze()}
            >
              {analyzing ? "Analyzing..." : "Analyze tender"}
            </button>
            {analyzing ? (
              <p role="status" aria-live="polite" className="busy-note">
                Analyzing the tender… this can take about a minute.
              </p>
            ) : null}
            {analyzeError ? (
              <p className="error-message" role="alert">
                {analyzeError}
              </p>
            ) : null}
            {analysis ? (
              <div className="matrix">
                <div className="matrix-header">
                  <span className={VERDICT_CLASSES[analysis.verdict]}>
                    {analysis.verdict.replace("_", "-")}
                  </span>
                  <span className="matrix-score">{analysis.score}/100</span>
                  <span className="matrix-meta">
                    {analysis.generatedBy.model} ·{" "}
                    {formatSeconds(analysis.generatedBy.ms)}
                  </span>
                </div>
                <table className="req-table">
                  <thead>
                    <tr>
                      <th scope="col">Requirement</th>
                      <th scope="col">Status</th>
                      <th scope="col">Page</th>
                      <th scope="col">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.results.map((result) => {
                      const requirement = requirementById.get(result.requirementId);
                      return (
                        <tr key={result.requirementId}>
                          <td data-label="Requirement">
                            {requirement?.description ?? result.requirementId}
                            {requirement ? (
                              <small className="req-kind">{requirement.kind}</small>
                            ) : null}
                          </td>
                          <td data-label="Status">
                            <span className={STATUS_CLASSES[result.status]}>
                              {STATUS_LABELS[result.status]}
                            </span>
                          </td>
                          <td data-label="Page">{result.page}</td>
                          <td data-label="Reason">
                            {result.reason}
                            {result.evidence ? (
                              <small className="req-evidence">{result.evidence}</small>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          {evolus ? (
            <section className="evolus-box" aria-labelledby="evolus-heading">
              <h2 id="evolus-heading">Evolus vs our extractor</h2>
              <p>
                Our extractor found {evolus.comparison.ours} requirements, Evolus
                found {evolus.comparison.evolus}, {evolus.comparison.matched.length}{" "}
                matched.
              </p>
              <div className="evolus-columns">
                <div>
                  <h3>Only in ours ({evolus.comparison.onlyOurs.length})</h3>
                  <ul>
                    {evolus.comparison.onlyOurs.map((item, index) => (
                      <li key={`${item.kind}-${item.page}-${index}`}>
                        {item.kind} · page {item.page}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3>Only in Evolus ({evolus.comparison.onlyEvolus.length})</h3>
                  <ul>
                    {evolus.comparison.onlyEvolus.map((item, index) => (
                      <li key={`${item.kind}-${item.page}-${index}`}>
                        {item.kind} · page {item.page}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          ) : null}

          <section aria-labelledby="draft-heading">
            <div className="form-heading">
              <h2 id="draft-heading">Step 3: Draft your bid</h2>
            </div>
            <button
              type="button"
              className="button-secondary"
              disabled={!selected || !analysis || busy}
              onClick={() => void runDraft()}
            >
              {drafting ? "Writing..." : "Generate draft"}
            </button>
            {drafting ? (
              <p role="status" aria-live="polite" className="busy-note">
                Writing the draft… this can take about a minute.
              </p>
            ) : null}
            {draftError ? (
              <p className="error-message" role="alert">
                {draftError}
              </p>
            ) : null}
            {draft ? (
              <div className="draft-panel">
                {approved ? (
                  <p className="draft-approved" role="status">
                    Approved
                  </p>
                ) : null}
                {draft.warnings.length > 0 ? (
                  <ul className="draft-warnings" aria-label="Draft warnings">
                    {draft.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
                {draft.sections.map((section) => (
                  <div className="field" key={section.key}>
                    <label htmlFor={`draft-${section.key}`}>{section.title}</label>
                    <textarea
                      id={`draft-${section.key}`}
                      rows={8}
                      value={bodies[section.key] ?? section.body}
                      readOnly={approved}
                      onChange={(event) =>
                        setBodies((current) => ({
                          ...current,
                          [section.key]: event.target.value,
                        }))
                      }
                    />
                  </div>
                ))}
                <p className="field-hint">AI-generated — review before sending.</p>
                <div className="draft-actions">
                  {approved ? (
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => setApproved(false)}
                    >
                      Edit again
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="button-primary"
                      onClick={() => setApproved(true)}
                    >
                      Approve draft
                    </button>
                  )}
                  {approved ? (
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={downloadDraft}
                    >
                      Download (.txt)
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>

          <section className="amd-box" aria-labelledby="amd-heading">
            <h2 id="amd-heading">Running on AMD</h2>
            {amd && amd.totals.calls > 0 ? (
              <>
                <p>
                  {amd.gpu}
                  {amd.models.length > 0 ? ` · ${amd.models[0].model}` : ""} ·{" "}
                  {amd.totals.calls} calls
                </p>
                <ul className="amd-roles">
                  {(["extract", "draft"] as const).map((role) => {
                    const stats = amd.byRole[role];
                    if (!stats) return null;
                    return (
                      <li key={role}>
                        {role}: p50 {formatSeconds(stats.p50Ms)} ·{" "}
                        {stats.tokensPerSecond} tokens/s
                      </li>
                    );
                  })}
                </ul>
                {amd.last ? (
                  <p className="field-hint">
                    Last run: {amd.last.tokensPerSecond} tokens/s
                  </p>
                ) : null}
              </>
            ) : (
              <p>No AI runs yet.</p>
            )}
            {health ? (
              <p className="health-dots">
                <span
                  className={`dot ${health.extract.ok ? "dot-ok" : "dot-fail"}`}
                  role="img"
                  aria-label={`Extract model ${health.extract.ok ? "online" : "offline"}`}
                />
                <span
                  className={`dot ${health.draft.ok ? "dot-ok" : "dot-fail"}`}
                  role="img"
                  aria-label={`Draft model ${health.draft.ok ? "online" : "offline"}`}
                />
                <span className="field-hint">
                  {health.extract.ok && health.draft.ok
                    ? "Models online"
                    : "A model is offline"}
                </span>
              </p>
            ) : null}
          </section>

          <footer className="bottom-note">
            <span>Your profile first. Opportunities next.</span>
            <span>Gara Facile</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
