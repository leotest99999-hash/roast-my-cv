"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import type { RoastHistoryRecord } from "@/lib/roast-history";

type RoastHistoryListProps = {
  entries: RoastHistoryRecord[];
};

function formatTimestamp(timestamp: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function firstLine(text: string) {
  return text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? text;
}

function getAtsScoreClassName(score: number) {
  if (score < 50) {
    return "text-coral";
  }

  if (score < 75) {
    return "text-gold";
  }

  return "text-lime";
}

export function RoastHistoryList({ entries }: RoastHistoryListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {entries.map((entry, index) => {
        const isExpanded = expandedId === entry.id;

        return (
          <article
            key={entry.id}
            className={`poster-shell interactive-lift rounded-[30px] p-5 sm:rounded-[34px] sm:p-6 ${
              index < 5 ? `motion-enter motion-delay-${Math.min(index + 2, 8)}` : ""
            }`}
          >
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1 space-y-4">
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
                  <span className="eyebrow text-[11px]">Saved roast</span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                    {formatTimestamp(entry.timestamp)}
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[22px] border border-white/10 bg-white/4 p-4">
                    <p className="eyebrow text-[10px]">Overall score</p>
                    <p className="mt-3 text-4xl font-semibold tracking-[-0.06em] text-foreground">
                      {entry.score}
                    </p>
                    <p className="mt-2 text-sm text-muted">{entry.scoreLabel}</p>
                  </div>

                  <div className="rounded-[22px] border border-white/10 bg-white/4 p-4">
                    <p className="eyebrow text-[10px]">ATS score</p>
                    <p
                      className={`mt-3 text-4xl font-semibold tracking-[-0.06em] ${getAtsScoreClassName(
                        entry.atsScore,
                      )}`}
                    >
                      {entry.atsScore}
                    </p>
                    <p className="mt-2 text-sm text-muted">Parser friendliness snapshot</p>
                  </div>

                  <div className="rounded-[22px] border border-white/10 bg-white/4 p-4">
                    <p className="eyebrow text-[10px]">Issue count</p>
                    <p className="mt-3 text-4xl font-semibold tracking-[-0.06em] text-foreground">
                      {entry.issues.length}
                    </p>
                    <p className="mt-2 text-sm text-muted">Things this roast called out</p>
                  </div>
                </div>

                <div className="rounded-[24px] border border-coral/18 bg-coral/8 p-4 sm:p-5">
                  <p className="eyebrow text-[10px] text-coral">Roast lead</p>
                  <p className="mt-3 text-lg font-semibold text-foreground">
                    {firstLine(entry.lead)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/12 bg-white/4 px-5 py-3 text-sm font-semibold text-foreground transition hover:border-lime/35 hover:bg-white/8"
                onClick={() => setExpandedId(isExpanded ? null : entry.id)}
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="h-4 w-4" />
                    Hide full roast
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4" />
                    View full roast
                  </>
                )}
              </button>
            </div>

            {isExpanded && (
              <div className="mt-6 grid gap-5 lg:grid-cols-[0.44fr_0.56fr]">
                <div className="space-y-5">
                  <div className="rounded-[24px] border border-white/10 bg-white/4 p-4 sm:p-5">
                    <p className="eyebrow text-[10px]">Summary</p>
                    <p className="mt-3 text-sm leading-7 text-muted-strong">
                      {entry.summary}
                    </p>
                  </div>

                  <div className="rounded-[24px] border border-white/10 bg-white/4 p-4 sm:p-5">
                    <p className="eyebrow text-[10px]">What already worked</p>
                    <div className="mt-4 space-y-3">
                      {entry.wins.length > 0 ? (
                        entry.wins.map((win) => (
                          <div
                            key={win}
                            className="rounded-[18px] border border-lime/16 bg-lime/8 p-3 text-sm leading-7 text-foreground/88"
                          >
                            {win}
                          </div>
                        ))
                      ) : (
                        <p className="text-sm leading-7 text-muted">
                          No wins were stored for this roast.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-white/10 bg-white/4 p-4 sm:p-5">
                    <p className="eyebrow text-[10px]">{entry.upgradePitch.eyebrow}</p>
                    <h3 className="mt-3 text-xl font-semibold tracking-tight text-foreground">
                      {entry.upgradePitch.headline}
                    </h3>
                    <div className="mt-4 space-y-3">
                      {entry.upgradePitch.points.map((point) => (
                        <div
                          key={point}
                          className="rounded-[18px] border border-white/8 bg-white/4 p-3 text-sm leading-7 text-muted-strong"
                        >
                          {point}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {entry.issues.map((issue) => (
                    <div key={`${entry.id}-${issue.category}-${issue.roast}`} className="rounded-[24px] border border-white/10 bg-white/4 p-4 sm:p-5">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="eyebrow text-[10px]">{issue.category}</span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-strong">
                          {issue.severity}
                        </span>
                      </div>
                      <p className="mt-3 text-lg font-semibold text-foreground">{issue.roast}</p>
                      <p className="mt-3 text-sm leading-7 text-muted">{issue.diagnosis}</p>
                      <div className="mt-4 rounded-[18px] border border-lime/18 bg-lime/8 p-4">
                        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-lime">
                          Fix
                        </p>
                        <p className="mt-2 text-sm leading-7 text-foreground/88">
                          {issue.fix}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
