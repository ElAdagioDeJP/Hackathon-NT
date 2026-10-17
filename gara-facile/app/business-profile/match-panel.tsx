"use client";

import { useEffect, useState, useTransition } from "react";
import { findMatchesAction, listStoredMatches } from "./match-actions";
import type { StoredMatch } from "../services/match/types";

export function MatchPanel({ enabled }: { enabled: boolean }) {
  const [matches, setMatches] = useState<StoredMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    startTransition(async () => {
      const result = await listStoredMatches();
      if (cancelled) return;
      if ("error" in result) {
        setError(result.error);
      } else {
        setMatches(result.matches);
        setError(null);
      }
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!enabled) return null;

  function runMatching() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await findMatchesAction();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMatches(result.matches);
      setNotice(
        result.matches.length
          ? `Matching finished. ${result.matches.length} contracts scored.`
          : "Matching finished with an empty ledger.",
      );
    });
  }

  const visible = matches.filter((match) => match.type !== "none");
  const hiddenNone = matches.length - visible.length;

  return (
    <section className="match-panel" aria-label="Contract matches">
      <div className="match-panel-header">
        <div>
          <h2>Contract matches</h2>
          <p>
            Search active TED notices for your coverage area and score them with
            the Matching agent.
          </p>
        </div>
        <button
          type="button"
          className="button-primary"
          onClick={runMatching}
          disabled={pending}
        >
          {pending ? "Finding matches..." : "Find matches"}
        </button>
      </div>

      {error ? (
        <p className="match-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="field-hint" role="status">
          {notice}
        </p>
      ) : null}

      {loaded && !matches.length && !error ? (
        <p className="field-hint">
          No matches stored yet. Run Find matches after your profile is
          approved.
        </p>
      ) : null}

      {visible.length ? (
        <ul className="match-list">
          {visible.map((match) => (
            <li key={match.id} className="match-item">
              <div className="match-item-top">
                <span className={`match-type match-type-${match.type}`}>
                  {match.type}
                </span>
                <span className="match-score">{match.score}/100</span>
              </div>
              <a
                href={match.url}
                target="_blank"
                rel="noreferrer"
                className="match-title"
              >
                {match.title}
              </a>
              {match.buyerName ? (
                <p className="field-hint">Buyer: {match.buyerName}</p>
              ) : null}
              {match.deadline ? (
                <p className="field-hint">Deadline: {match.deadline}</p>
              ) : null}
              <p className="match-rationale">{match.rationale}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {hiddenNone > 0 ? (
        <p className="field-hint">
          {hiddenNone} contract{hiddenNone === 1 ? "" : "s"} scored as none and
          hidden from this list.
        </p>
      ) : null}
    </section>
  );
}
