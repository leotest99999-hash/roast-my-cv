"use client";

import {
  BadgeDollarSign,
  Check,
  Clipboard,
  FileUp,
  Flame,
  LoaderCircle,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { RoastIssue, RoastResult, RewriteResult } from "@/lib/schemas";

type RoastMyCvAppProps = {
  initialSessionId: string | null;
};

type StoredSession = {
  analysis: RoastResult | null;
  rewrite: RewriteResult | null;
  paidSessionId: string | null;
  resumeName: string | null;
};

const storageKey = "roastmycv-session-v1";
const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-full border border-coral/40 bg-coral px-5 py-3 text-sm font-semibold text-[#180f0a] transition hover:bg-[#ff7f65] disabled:cursor-not-allowed disabled:opacity-45";
const secondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-full border border-white/12 bg-white/4 px-5 py-3 text-sm font-semibold text-foreground transition hover:border-lime/35 hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-45";

const severityConfig: Record<
  RoastIssue["severity"],
  { label: string; className: string }
> = {
  cosmetic: {
    label: "Cosmetic",
    className: "border-white/12 bg-white/6 text-muted-strong",
  },
  messy: {
    label: "Messy",
    className: "border-gold/35 bg-gold/12 text-gold",
  },
  critical: {
    label: "Critical",
    className: "border-coral/35 bg-coral/12 text-coral",
  },
};

function getApiError(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }

  return fallback;
}

function IssueRow({ issue }: { issue: RoastIssue }) {
  const config = severityConfig[issue.severity];

  return (
    <article className="poster-shell rounded-[26px] p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="eyebrow text-[11px]">{issue.category}</span>
        <span
          className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${config.className}`}
        >
          {config.label}
        </span>
      </div>
      <p className="text-lg font-semibold text-foreground">{issue.roast}</p>
      <p className="mt-3 text-sm leading-7 text-muted">{issue.diagnosis}</p>
      <div className="mt-4 rounded-[20px] border border-lime/18 bg-lime/7 p-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-lime">
          Fix
        </p>
        <p className="mt-2 text-sm leading-7 text-foreground/88">{issue.fix}</p>
      </div>
    </article>
  );
}

export function RoastMyCvApp({ initialSessionId }: RoastMyCvAppProps) {
  const [hydrated, setHydrated] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [resumeName, setResumeName] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<RoastResult | null>(null);
  const [rewrite, setRewrite] = useState<RewriteResult | null>(null);
  const [paidSessionId, setPaidSessionId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [didCopy, setDidCopy] = useState(false);
  const [isRoasting, setIsRoasting] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const processedSessionRef = useRef<string | null>(null);
  const copyTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const stored = JSON.parse(raw) as StoredSession;
        setAnalysis(stored.analysis ?? null);
        setRewrite(stored.rewrite ?? null);
        setPaidSessionId(stored.paidSessionId ?? null);
        setResumeName(stored.resumeName ?? null);
      }
    } catch {
      window.localStorage.removeItem(storageKey);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ analysis, rewrite, paidSessionId, resumeName } satisfies StoredSession),
    );
  }, [analysis, hydrated, paidSessionId, resumeName, rewrite]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  async function requestRewrite(sessionId: string) {
    if (!analysis) {
      setError("The roast snapshot is missing, so the rewrite cannot start.");
      return;
    }

    setIsRewriting(true);
    setError(null);
    setStatusMessage("Paid unlock verified. Rewriting the resume now...");

    try {
      const response = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          resumeText: analysis.normalizedResume,
          resumeHash: analysis.resumeHash,
        }),
      });
      const payload = (await response.json()) as RewriteResult | { error?: string };

      if (!response.ok) {
        throw new Error(getApiError(payload, "Could not generate the rewrite."));
      }

      setRewrite(payload as RewriteResult);
      setPaidSessionId(sessionId);
      setStatusMessage("Polished rewrite ready. Copy it and tailor it before sending.");
      window.setTimeout(() => {
        document
          .getElementById("premium-rewrite")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    } catch (rewriteError) {
      setError(
        rewriteError instanceof Error
          ? rewriteError.message
          : "Could not generate the rewrite.",
      );
    } finally {
      setIsRewriting(false);
    }
  }

  const verifySession = useEffectEvent(async (sessionId: string) => {
    setIsVerifyingPayment(true);
    setError(null);
    setStatusMessage("Checking whether Stripe finished the $2.99 redemption...");

    try {
      const response = await fetch(
        `/api/checkout/verify?session_id=${encodeURIComponent(sessionId)}`,
      );
      const payload = (await response.json()) as
        | { paid: boolean; resumeHash: string | null; error?: string }
        | { error?: string };

      if (!response.ok) {
        throw new Error(getApiError(payload, "Could not verify the payment."));
      }

      const verification = payload as { paid: boolean; resumeHash: string | null };
      if (!verification.paid) {
        setStatusMessage("Stripe has the session, but payment is not complete yet.");
        return;
      }

      setPaidSessionId(sessionId);
      if (window.location.search.includes("session_id=")) {
        window.history.replaceState({}, "", `${window.location.pathname}#premium-rewrite`);
      }

      if (!analysis) {
        setStatusMessage("Payment confirmed. Re-open the same roasted resume on this device.");
        return;
      }

      if (verification.resumeHash !== analysis.resumeHash) {
        setStatusMessage("Payment confirmed, but the stored roast no longer matches this session.");
        return;
      }

      if (!rewrite || paidSessionId !== sessionId) {
        await requestRewrite(sessionId);
        return;
      }

      setStatusMessage("Payment confirmed. Your polished rewrite is already unlocked.");
    } catch (verificationError) {
      setError(
        verificationError instanceof Error
          ? verificationError.message
          : "Could not verify the payment.",
      );
    } finally {
      setIsVerifyingPayment(false);
    }
  });

  useEffect(() => {
    if (!hydrated || !initialSessionId) {
      return;
    }

    if (processedSessionRef.current === initialSessionId) {
      return;
    }

    processedSessionRef.current = initialSessionId;
    void verifySession(initialSessionId);
  }, [hydrated, initialSessionId]);

  async function handleRoastSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedFile) {
      setError("Pick a PDF before asking the app to start swinging.");
      return;
    }

    setIsRoasting(true);
    setError(null);
    setRewrite(null);
    setPaidSessionId(null);
    setStatusMessage("Reading the PDF, judging the layout, and sharpening the jokes...");

    try {
      const formData = new FormData();
      formData.append("resume", selectedFile);

      const response = await fetch("/api/roast", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as RoastResult | { error?: string };

      if (!response.ok) {
        throw new Error(getApiError(payload, "Could not roast that PDF."));
      }

      setAnalysis(payload as RoastResult);
      setResumeName(selectedFile.name);
      setStatusMessage("Roast complete. If it stings in the right places, the rewrite button is live.");
    } catch (roastError) {
      setError(
        roastError instanceof Error ? roastError.message : "Could not roast that PDF.",
      );
    } finally {
      setIsRoasting(false);
    }
  }

  async function handleCheckout() {
    if (!analysis) {
      setError("Run the free roast first so there is something to improve.");
      return;
    }

    setIsCheckingOut(true);
    setError(null);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeText: analysis.normalizedResume,
          resumeHash: analysis.resumeHash,
          resumeName,
        }),
      });
      const payload = (await response.json()) as { url: string } | { error?: string };

      if (!response.ok) {
        throw new Error(getApiError(payload, "Could not open Stripe Checkout."));
      }

      window.location.assign((payload as { url: string }).url);
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Could not open Stripe Checkout.",
      );
    } finally {
      setIsCheckingOut(false);
    }
  }

  async function handleCopy() {
    if (!rewrite) {
      return;
    }

    await navigator.clipboard.writeText(rewrite.polishedResume);
    setDidCopy(true);
    if (copyTimeoutRef.current) {
      window.clearTimeout(copyTimeoutRef.current);
    }
    copyTimeoutRef.current = window.setTimeout(() => setDidCopy(false), 1800);
  }

  const isBusy =
    isRoasting || isCheckingOut || isVerifyingPayment || isRewriting;
  const paidUnlocked = Boolean(paidSessionId);

  return (
    <main className="relative overflow-hidden">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-16 px-6 py-7 md:px-8 lg:px-10">
        <header className="flex flex-col gap-5 rounded-full border border-white/10 bg-white/4 px-5 py-4 backdrop-blur-xl md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-coral/25 bg-coral/12 text-coral">
              <Flame className="h-5 w-5" />
            </div>
            <div>
              <p className="eyebrow text-[11px]">Free roast. Paid redemption.</p>
              <p className="text-lg font-semibold tracking-tight">RoastMyCV</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-muted">
            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">PDF under 5MB</span>
            <span className="rounded-full border border-coral/20 bg-coral/10 px-4 py-2 text-coral">$2.99 rewrite</span>
          </div>
        </header>

        <section className="grid items-start gap-10 pt-4 lg:grid-cols-[1.08fr_0.92fr] lg:pt-10">
          <div className="space-y-8">
            <div className="space-y-6">
              <p className="eyebrow">Dark mode career intervention</p>
              <h1 className="max-w-4xl text-5xl font-semibold leading-none tracking-[-0.06em] sm:text-6xl lg:text-8xl">
                Roast your resume for free.
                <span className="block text-coral">Pay $2.99 for the glow-up.</span>
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-muted md:text-xl">
                Upload a PDF and get a brutally funny, sharply useful teardown of bad formatting,
                cliches, weak verbs, and bullets that say absolutely nothing. If the roast lands,
                unlock a polished rewrite that sounds hireable.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="poster-shell rounded-[28px] p-5">
                <p className="eyebrow text-[11px]">What gets roasted</p>
                <p className="mt-3 text-lg font-semibold">
                  Formatting crimes, ATS misses, empty buzzwords.
                </p>
              </div>
              <div className="poster-shell rounded-[28px] p-5">
                <p className="eyebrow text-[11px]">Why people pay</p>
                <p className="mt-3 text-lg font-semibold">
                  The rewrite keeps your facts and fixes the execution.
                </p>
              </div>
              <div className="poster-shell rounded-[28px] p-5">
                <p className="eyebrow text-[11px]">MVP rule</p>
                <p className="mt-3 text-lg font-semibold">
                  The paid unlock is tied to the exact roasted snapshot.
                </p>
              </div>
            </div>
          </div>

          <section className="poster-shell rounded-[34px] p-6 md:p-8">
            <div className="scan-glow" />
            <div className="relative space-y-6">
              <div className="space-y-3">
                <p className="eyebrow">Upload studio</p>
                <h2 className="text-3xl font-semibold tracking-tight">
                  Start with the free roast.
                </h2>
                <p className="text-sm leading-7 text-muted">
                  PDF only. No account wall. Just direct emotional damage and useful fixes.
                </p>
              </div>

              <form className="space-y-5" onSubmit={handleRoastSubmit}>
                <label
                  htmlFor="resume-upload"
                  className="group block cursor-pointer overflow-hidden rounded-[30px] border border-dashed border-white/16 bg-black/18 p-6 transition hover:border-lime/40 hover:bg-white/6"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/6">
                      <FileUp className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold">
                        {selectedFile?.name || resumeName || "Choose your PDF"}
                      </p>
                      <p className="text-sm text-muted">
                        {selectedFile
                          ? "Fresh file selected. Roast again to replace the current result."
                          : "Click to browse or swap in a new version."}
                      </p>
                    </div>
                  </div>
                </label>
                <input
                  id="resume-upload"
                  type="file"
                  accept="application/pdf"
                  className="sr-only"
                  onChange={(event) => {
                    setSelectedFile(event.target.files?.[0] ?? null);
                    setError(null);
                  }}
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="submit"
                    className={primaryButtonClass}
                    disabled={!selectedFile || isBusy}
                  >
                    {isRoasting ? (
                      <>
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        Roasting...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Roast this resume
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    disabled={!analysis || isBusy}
                    onClick={handleCheckout}
                  >
                    {isCheckingOut ? (
                      <>
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        Opening Stripe...
                      </>
                    ) : paidUnlocked ? (
                      <>
                        <Check className="h-4 w-4" />
                        Rewrite unlocked
                      </>
                    ) : (
                      <>
                        <BadgeDollarSign className="h-4 w-4" />
                        Unlock rewrite for $2.99
                      </>
                    )}
                  </button>
                </div>
              </form>

              <div className="rounded-[26px] border border-white/10 bg-white/4 p-5">
                <p className="eyebrow text-[11px]">Current status</p>
                <p className="mt-3 text-base font-semibold">
                  {statusMessage || "Waiting for a PDF worth arguing with."}
                </p>
                {(isVerifyingPayment || isRewriting) && (
                  <LoaderCircle className="mt-3 h-5 w-5 animate-spin text-lime" />
                )}
                {error && (
                  <div className="mt-4 flex items-start gap-3 rounded-[20px] border border-coral/25 bg-coral/10 p-4 text-sm">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-coral" />
                    <p>{error}</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        </section>

        <section className="space-y-8">
          <div className="space-y-3">
            <p className="eyebrow">Free analysis</p>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              The roast report
            </h2>
            <p className="max-w-xl text-base leading-8 text-muted">
              The first pass is free and intentionally a little mean, but every jab should point
              to a fix worth making.
            </p>
          </div>

          {!analysis ? (
            <div className="poster-shell rounded-[34px] p-8">
              <p className="text-2xl font-semibold tracking-tight">
                Your score, charges, and fixes land here after the upload.
              </p>
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[0.43fr_0.57fr]">
              <div className="poster-shell rounded-[34px] p-7">
                <p className="eyebrow">Scorecard</p>
                <div className="mt-6 flex items-end gap-4">
                  <p className="text-7xl font-semibold leading-none tracking-[-0.08em]">
                    {analysis.score}
                  </p>
                  <div className="pb-2">
                    <p className="text-lg font-semibold text-coral">{analysis.scoreLabel}</p>
                    <p className="text-sm text-muted">Resume health score</p>
                  </div>
                </div>
                <p className="mt-7 text-2xl font-semibold leading-tight">{analysis.lead}</p>
                <p className="mt-4 text-base leading-8 text-muted">{analysis.summary}</p>

                <div className="mt-7 rounded-[26px] border border-white/10 bg-white/4 p-5">
                  <p className="eyebrow text-[11px]">What already works</p>
                  <div className="mt-4 space-y-3">
                    {analysis.wins.map((win) => (
                      <div
                        key={win}
                        className="flex items-start gap-3 rounded-[18px] border border-white/8 bg-white/4 p-3"
                      >
                        <Check className="mt-1 h-4 w-4 shrink-0 text-lime" />
                        <p className="text-sm leading-7 text-foreground/88">{win}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                {analysis.issues.map((issue) => (
                  <IssueRow key={`${issue.category}-${issue.roast}`} issue={issue} />
                ))}
              </div>
            </div>
          )}
        </section>

        <section id="premium-rewrite" className="space-y-8 pb-10">
          <div className="space-y-3">
            <p className="eyebrow">Paid unlock</p>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              The polished rewrite
            </h2>
            <p className="max-w-xl text-base leading-8 text-muted">
              After Stripe confirms the payment, the app rewrites the exact roasted snapshot into
              a cleaner, recruiter-ready version.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-[0.38fr_0.62fr]">
            <div className="poster-shell rounded-[34px] p-7">
              <p className="eyebrow">{analysis?.upgradePitch.eyebrow || "Upgrade"}</p>
              <h3 className="mt-4 text-3xl font-semibold tracking-tight">
                {analysis?.upgradePitch.headline ||
                  "Unlock the polished version when the roast earns your trust."}
              </h3>
              <div className="mt-6 space-y-3">
                {(analysis?.upgradePitch.points || [
                  "Rewrite the summary so it sounds specific instead of ceremonial.",
                  "Turn vague bullets into sharper, more ATS-friendly accomplishments.",
                  "Keep the facts grounded and use placeholders where the evidence is thin.",
                ]).map((point) => (
                  <div
                    key={point}
                    className="rounded-[20px] border border-white/8 bg-white/4 p-4 text-sm leading-7 text-muted-strong"
                  >
                    {point}
                  </div>
                ))}
              </div>

              <div className="mt-7 flex flex-wrap gap-3">
                {!paidUnlocked ? (
                  <button
                    type="button"
                    className={primaryButtonClass}
                    disabled={!analysis || isBusy}
                    onClick={handleCheckout}
                  >
                    {isCheckingOut ? (
                      <>
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        Opening Stripe...
                      </>
                    ) : (
                      <>
                        <BadgeDollarSign className="h-4 w-4" />
                        Pay $2.99
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={primaryButtonClass}
                    disabled={!analysis || isBusy}
                    onClick={() => {
                      if (paidSessionId) {
                        void requestRewrite(paidSessionId);
                      }
                    }}
                  >
                    {isRewriting ? (
                      <>
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        Rewriting...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Regenerate rewrite
                      </>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  className={secondaryButtonClass}
                  disabled={!rewrite}
                  onClick={handleCopy}
                >
                  {didCopy ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Clipboard className="h-4 w-4" />
                      Copy markdown
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="poster-shell rounded-[34px] p-7">
              {!rewrite ? (
                <div className="space-y-5">
                  <p className="text-2xl font-semibold tracking-tight">
                    The premium version appears here after payment.
                  </p>
                  <div className="rounded-[24px] border border-white/10 bg-black/18 p-5 font-mono text-sm text-muted">
                    <p># Candidate Name</p>
                    <p className="mt-3">## Summary</p>
                    <p className="mt-2">ATS-friendly rewrite appears here...</p>
                    <p className="mt-3">## Experience</p>
                    <p className="mt-2">- Stronger action verbs, cleaner bullets, no fluff.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <p className="eyebrow">Unlocked rewrite</p>
                    <h3 className="text-3xl font-semibold tracking-tight">{rewrite.title}</h3>
                    <p className="text-base leading-8 text-muted">{rewrite.positioning}</p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {rewrite.improvements.map((improvement) => (
                      <div
                        key={improvement}
                        className="rounded-[22px] border border-lime/16 bg-lime/8 p-4 text-sm leading-7 text-foreground/88"
                      >
                        {improvement}
                      </div>
                    ))}
                  </div>

                  <div className="rounded-[28px] border border-white/10 bg-black/18 p-5">
                    <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[13px] leading-7 text-foreground/90">
                      {rewrite.polishedResume}
                    </pre>
                  </div>

                  <div className="rounded-[22px] border border-white/10 bg-white/4 p-4 text-sm leading-7 text-muted">
                    {rewrite.finalNote}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
