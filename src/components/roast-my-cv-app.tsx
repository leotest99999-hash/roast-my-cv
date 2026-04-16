"use client";

import {
  BadgeDollarSign,
  Check,
  Clipboard,
  Download,
  FileUp,
  Flame,
  LoaderCircle,
  Share2,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type {
  CheckoutVerificationResult,
  PremiumProduct,
} from "@/lib/premium-session-types";
import type {
  CoverLetterResult,
  RoastIssue,
  RoastResult,
  RewriteResult,
} from "@/lib/schemas";

type RoastMyCvAppProps = {
  initialSessionId: string | null;
};

type StoredSession = {
  analysis: RoastResult | null;
  rewrite: RewriteResult | null;
  coverLetter: string | null;
  coverLetterSessionId: string | null;
  paidSessionId: string | null;
  resumeName: string | null;
};

const storageKey = "roastmycv-session-v1";
const emailStorageKey = "roastmycv-email";
const genericFrontendErrorMessage =
  "Something went wrong, please try again in a moment.";
const roastLoadingMessages = [
  "Reading your resume...",
  "Cringing at the buzzwords...",
  "Sharpening the jokes...",
  "Checking the ATS damage...",
  "Almost done roasting...",
] as const;
const primaryButtonClass =
  "inline-flex w-full items-center justify-center gap-2 rounded-full border border-coral/40 bg-coral px-5 py-3 text-sm font-semibold text-[#180f0a] transition hover:bg-[#ff7f65] sm:w-auto disabled:cursor-not-allowed disabled:opacity-45";
const secondaryButtonClass =
  "inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/12 bg-white/4 px-5 py-3 text-sm font-semibold text-foreground transition hover:border-lime/35 hover:bg-white/8 sm:w-auto disabled:cursor-not-allowed disabled:opacity-45";

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

function getFriendlyFrontendError() {
  return genericFrontendErrorMessage;
}

function getAtsScoreClassName(atsScore: number) {
  if (atsScore < 50) {
    return "text-coral";
  }

  if (atsScore < 75) {
    return "text-gold";
  }

  return "text-lime";
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
  const [email, setEmail] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [analysis, setAnalysis] = useState<RoastResult | null>(null);
  const [rewrite, setRewrite] = useState<RewriteResult | null>(null);
  const [coverLetter, setCoverLetter] = useState<string | null>(null);
  const [coverLetterSessionId, setCoverLetterSessionId] = useState<string | null>(null);
  const [paidSessionId, setPaidSessionId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [didCopy, setDidCopy] = useState(false);
  const [didCopyCoverLetter, setDidCopyCoverLetter] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isRoasting, setIsRoasting] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const [isGeneratingCoverLetter, setIsGeneratingCoverLetter] = useState(false);
  const [roastLoadingIndex, setRoastLoadingIndex] = useState(0);
  const [roastProgress, setRoastProgress] = useState(0);
  const processedSessionRef = useRef<string | null>(null);
  const copyTimeoutRef = useRef<number | null>(null);
  const coverLetterCopyTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      const storedEmail = window.localStorage.getItem(emailStorageKey);
      if (raw) {
        const stored = JSON.parse(raw) as StoredSession;
        setAnalysis(stored.analysis ?? null);
        setRewrite(stored.rewrite ?? null);
        setCoverLetter(stored.coverLetter ?? null);
        setCoverLetterSessionId(stored.coverLetterSessionId ?? null);
        setPaidSessionId(stored.paidSessionId ?? null);
        setResumeName(stored.resumeName ?? null);
      }

      if (storedEmail) {
        setEmail(storedEmail);
        setEmailSubmitted(true);
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
      JSON.stringify({
        analysis,
        rewrite,
        coverLetter,
        coverLetterSessionId,
        paidSessionId,
        resumeName,
      } satisfies StoredSession),
    );
  }, [
    analysis,
    coverLetter,
    coverLetterSessionId,
    hydrated,
    paidSessionId,
    resumeName,
    rewrite,
  ]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }

      if (coverLetterCopyTimeoutRef.current) {
        window.clearTimeout(coverLetterCopyTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isRoasting) {
      setRoastLoadingIndex(0);
      setRoastProgress(0);
      return;
    }

    setRoastLoadingIndex(0);
    setRoastProgress(12);

    const messageInterval = window.setInterval(() => {
      setRoastLoadingIndex(
        (currentIndex) => (currentIndex + 1) % roastLoadingMessages.length,
      );
    }, 2300);

    const progressInterval = window.setInterval(() => {
      setRoastProgress((currentProgress) => {
        if (currentProgress >= 94) {
          return currentProgress;
        }

        return Math.min(
          94,
          currentProgress + Math.max(1.25, (100 - currentProgress) * 0.045),
        );
      });
    }, 180);

    return () => {
      window.clearInterval(messageInterval);
      window.clearInterval(progressInterval);
    };
  }, [isRoasting]);

  async function requestRewrite(
    sessionId: string,
    options?: {
      resumeHash?: string | null;
      resumeText?: string | null;
    },
  ) {
    setIsRewriting(true);
    setError(null);
    setStatusMessage("Paid unlock verified. Rewriting the resume now...");

    try {
      const body: {
        sessionId: string;
        resumeHash?: string;
        resumeText?: string;
      } = {
        sessionId,
      };
      const resumeHash = analysis?.resumeHash ?? options?.resumeHash ?? null;
      const resumeText =
        analysis?.normalizedResume ?? options?.resumeText ?? null;

      if (resumeHash) {
        body.resumeHash = resumeHash;
      }

      if (resumeText) {
        body.resumeText = resumeText;
      }

      const response = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(getFriendlyFrontendError());
      }

      const payload = (await response.json()) as RewriteResult;
      setRewrite(payload);
      setPaidSessionId(sessionId);
      setStatusMessage("Polished rewrite ready. Copy it and tailor it before sending.");
      window.setTimeout(() => {
        document
          .getElementById("premium-rewrite")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    } catch {
      setError(getFriendlyFrontendError());
    } finally {
      setIsRewriting(false);
    }
  }

  async function requestCoverLetter(
    sessionId: string,
    options?: {
      resumeHash?: string | null;
      resumeText?: string | null;
    },
  ) {
    setIsGeneratingCoverLetter(true);
    setCoverLetterSessionId(sessionId);
    setError(null);
    setStatusMessage("Payment confirmed. Drafting your matching cover letter now...");

    try {
      const body: {
        sessionId: string;
        resumeHash?: string;
        resumeText?: string;
      } = {
        sessionId,
      };
      const resumeHash = analysis?.resumeHash ?? options?.resumeHash ?? null;
      const resumeText =
        analysis?.normalizedResume ?? options?.resumeText ?? null;

      if (resumeHash) {
        body.resumeHash = resumeHash;
      }

      if (resumeText) {
        body.resumeText = resumeText;
      }

      const response = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(getFriendlyFrontendError());
      }

      const payload = (await response.json()) as CoverLetterResult;
      setCoverLetter(payload.coverLetter);
      setStatusMessage("Matching cover letter ready. Copy it, tweak the company details, and send.");
      window.setTimeout(() => {
        document
          .getElementById("cover-letter")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    } catch {
      setError(getFriendlyFrontendError());
    } finally {
      setIsGeneratingCoverLetter(false);
    }
  }

  const verifySession = useEffectEvent(async (sessionId: string) => {
    setIsVerifyingPayment(true);
    setError(null);
    setStatusMessage("Checking whether Stripe finished the payment...");

    try {
      const response = await fetch(
        `/api/checkout/verify?session_id=${encodeURIComponent(sessionId)}`,
      );

      if (!response.ok) {
        throw new Error(getFriendlyFrontendError());
      }

      const verification =
        (await response.json()) as CheckoutVerificationResult;
      if (!verification.paid) {
        setStatusMessage("Stripe has the session, but payment is not complete yet.");
        return;
      }

      if (verification.analysis) {
        setAnalysis(verification.analysis);
      }

      if (verification.resumeName) {
        setResumeName(verification.resumeName);
      }

      if (verification.rewrite) {
        setRewrite(verification.rewrite);
      }

      if (verification.coverLetter) {
        setCoverLetter(verification.coverLetter);
      }

      if (window.location.search.includes("session_id=")) {
        const nextHash =
          verification.product === "cover_letter" ? "#cover-letter" : "#premium-rewrite";
        window.history.replaceState({}, "", `${window.location.pathname}${nextHash}`);
      }

      const activeResumeHash = analysis?.resumeHash ?? verification.analysis?.resumeHash ?? null;
      if (
        activeResumeHash &&
        verification.resumeHash &&
        verification.resumeHash !== activeResumeHash
      ) {
        setStatusMessage("Payment confirmed, but the stored roast no longer matches this session.");
        return;
      }

      if (verification.product === "cover_letter") {
        setCoverLetterSessionId(sessionId);
        if (verification.rewriteSessionId) {
          setPaidSessionId(verification.rewriteSessionId);
        }

        if (verification.coverLetter) {
          setStatusMessage("Payment confirmed. Your matching cover letter is already unlocked.");
          return;
        }

        await requestCoverLetter(sessionId, {
          resumeHash: verification.resumeHash,
        });
        return;
      }

      setPaidSessionId(verification.rewriteSessionId ?? sessionId);
      if (verification.rewrite) {
        setStatusMessage("Payment confirmed. Your polished rewrite is already unlocked.");
        return;
      }

      await requestRewrite(sessionId, {
        resumeHash: verification.resumeHash,
      });
    } catch {
      setError(getFriendlyFrontendError());
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
    setCoverLetter(null);
    setCoverLetterSessionId(null);
    setPaidSessionId(null);
    setStatusMessage("Reading the PDF, judging the layout, and sharpening the jokes...");

    try {
      const formData = new FormData();
      formData.append("resume", selectedFile);

      const response = await fetch("/api/roast", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(getFriendlyFrontendError());
      }

      const payload = (await response.json()) as RoastResult;
      setRoastProgress(100);
      setAnalysis(payload);
      setResumeName(selectedFile.name);
      setStatusMessage("Roast complete. If it stings in the right places, the rewrite button is live.");
    } catch {
      setError(getFriendlyFrontendError());
    } finally {
      setIsRoasting(false);
    }
  }

  async function handleCheckout(product: PremiumProduct = "polished_rewrite") {
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
          product,
          rewriteSessionId: paidSessionId,
          analysis,
          rewrite,
        }),
      });

      if (!response.ok) {
        throw new Error(getFriendlyFrontendError());
      }

      const payload = (await response.json()) as { url: string };
      window.location.assign(payload.url);
    } catch {
      setError(getFriendlyFrontendError());
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

  async function handleDownloadPdf() {
    if (!rewrite) {
      return;
    }

    setIsDownloadingPdf(true);
    setError(null);

    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({
        unit: "pt",
        format: "letter",
        compress: true,
      });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const marginX = 54;
      const topMargin = 56;
      const bottomMargin = 54;
      const contentWidth = pageWidth - marginX * 2;
      const markdownLines = rewrite.polishedResume.replace(/\r\n/g, "\n").split("\n");
      let cursorY = topMargin;

      const ensureSpace = (blockHeight: number) => {
        if (cursorY + blockHeight <= pageHeight - bottomMargin) {
          return;
        }

        pdf.addPage();
        cursorY = topMargin;
      };

      const writeWrappedText = ({
        text,
        fontSize,
        lineHeight,
        after,
        style = "normal",
        x = marginX,
        width = contentWidth,
      }: {
        text: string;
        fontSize: number;
        lineHeight: number;
        after: number;
        style?: "normal" | "bold";
        x?: number;
        width?: number;
      }) => {
        pdf.setFont("helvetica", style);
        pdf.setFontSize(fontSize);

        const lines = pdf.splitTextToSize(text, width);
        const blockHeight = lines.length * lineHeight;

        ensureSpace(blockHeight);
        pdf.text(lines, x, cursorY, { baseline: "top" });
        cursorY += blockHeight + after;
      };

      pdf.setProperties({
        title: rewrite.title,
        subject: "RoastMyCV polished resume",
      });
      pdf.setTextColor(18, 20, 24);

      for (const rawLine of markdownLines) {
        const line = rawLine.trim();

        if (!line) {
          cursorY += 10;
          continue;
        }

        if (line.startsWith("# ")) {
          writeWrappedText({
            text: line.slice(2).trim(),
            fontSize: 22,
            lineHeight: 24,
            after: 18,
            style: "bold",
          });
          continue;
        }

        if (line.startsWith("## ")) {
          cursorY += 4;
          writeWrappedText({
            text: line.slice(3).trim().toUpperCase(),
            fontSize: 11,
            lineHeight: 14,
            after: 8,
            style: "bold",
          });
          continue;
        }

        if (line.startsWith("- ")) {
          const bulletIndent = 16;
          const bulletText = line.slice(2).trim();

          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(11);

          const bulletLines = pdf.splitTextToSize(
            bulletText,
            contentWidth - bulletIndent,
          );
          const blockHeight = bulletLines.length * 16;

          ensureSpace(blockHeight);
          pdf.text("-", marginX, cursorY, { baseline: "top" });
          pdf.text(bulletLines, marginX + bulletIndent, cursorY, {
            baseline: "top",
          });
          cursorY += blockHeight + 6;
          continue;
        }

        writeWrappedText({
          text: line,
          fontSize: 11,
          lineHeight: 16,
          after: 8,
        });
      }

      const safeBaseName =
        resumeName
          ?.replace(/\.pdf$/i, "")
          .replace(/[^a-zA-Z0-9-_]+/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "")
          .toLowerCase() || "resume";

      pdf.save(`${safeBaseName}-rewrite.pdf`);
      setStatusMessage("PDF downloaded. Give it one last proofread before sending.");
    } catch {
      setError(getFriendlyFrontendError());
    } finally {
      setIsDownloadingPdf(false);
    }
  }

  async function handleCopyCoverLetter() {
    if (!coverLetter) {
      return;
    }

    await navigator.clipboard.writeText(coverLetter);
    setDidCopyCoverLetter(true);
    if (coverLetterCopyTimeoutRef.current) {
      window.clearTimeout(coverLetterCopyTimeoutRef.current);
    }
    coverLetterCopyTimeoutRef.current = window.setTimeout(
      () => setDidCopyCoverLetter(false),
      1800,
    );
  }

  function handleEmailGateSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      return;
    }

    window.localStorage.setItem(emailStorageKey, normalizedEmail);
    setEmail(normalizedEmail);
    setEmailSubmitted(true);
  }

  function handleShareRoast() {
    if (!analysis) {
      return;
    }

    const tweetText = `My resume scored ${analysis.score}/100 on RoastMyCV \u{1F480} "${analysis.lead}" - get yours roasted free at roast-my-cv-beige.vercel.app`;
    const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;

    window.open(shareUrl, "_blank", "noopener,noreferrer");
  }

  const currentRoastLoadingMessage = roastLoadingMessages[roastLoadingIndex];
  const isBusy =
    isRoasting ||
    isCheckingOut ||
    isVerifyingPayment ||
    isRewriting ||
    isGeneratingCoverLetter;
  const paidUnlocked = Boolean(paidSessionId);
  const shouldShowEmailGate =
    Boolean(analysis) &&
    !emailSubmitted &&
    !paidUnlocked &&
    !coverLetterSessionId;

  return (
    <main className="relative overflow-hidden">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-12 px-4 py-5 sm:gap-16 sm:px-6 sm:py-7 md:px-8 lg:px-10">
        <header className="flex flex-col gap-5 rounded-[30px] border border-white/10 bg-white/4 px-4 py-4 backdrop-blur-xl sm:px-5 md:flex-row md:items-center md:justify-between md:rounded-full">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-coral/25 bg-coral/12 text-coral">
              <Flame className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="eyebrow text-[11px]">Free roast. Paid redemption.</p>
              <p className="text-lg font-semibold tracking-tight">RoastMyCV</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-sm text-muted sm:gap-3">
            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">PDF under 5MB</span>
            <span className="rounded-full border border-coral/20 bg-coral/10 px-4 py-2 text-coral">$2.99 rewrite</span>
          </div>
        </header>

        <section className="grid items-start gap-8 pt-2 sm:gap-10 sm:pt-4 lg:grid-cols-[1.08fr_0.92fr] lg:pt-10">
          <div className="space-y-8">
            <div className="space-y-6">
              <p className="eyebrow">Dark mode career intervention</p>
              <h1 className="max-w-4xl text-4xl font-semibold leading-[0.94] tracking-[-0.06em] sm:text-6xl sm:leading-none lg:text-8xl">
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

          <section className="poster-shell rounded-[30px] p-5 sm:rounded-[34px] sm:p-6 md:p-8">
            <div className="scan-glow" />
            <div className="relative space-y-6">
              <div className="space-y-3">
                <p className="eyebrow">Upload studio</p>
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  Start with the free roast.
                </h2>
                <p className="text-sm leading-7 text-muted">
                  PDF only. No account wall. Just direct emotional damage and useful fixes.
                </p>
              </div>

              <form className="space-y-5" onSubmit={handleRoastSubmit}>
                <label
                  htmlFor="resume-upload"
                  className="group block cursor-pointer overflow-hidden rounded-[26px] border border-dashed border-white/16 bg-black/18 p-5 transition hover:border-lime/40 hover:bg-white/6 sm:rounded-[30px] sm:p-6"
                >
                  <div className="flex items-start gap-3 sm:items-center">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/6 sm:h-12 sm:w-12">
                      <FileUp className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="break-words text-base font-semibold sm:text-lg">
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
                    onClick={() => void handleCheckout("polished_rewrite")}
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

              <div className="rounded-[24px] border border-white/10 bg-white/4 p-4 sm:rounded-[26px] sm:p-5">
                <p className="eyebrow text-[11px]">Current status</p>
                <p className="mt-3 text-base font-semibold">
                  {isRoasting
                    ? "Premium roast in progress"
                    : statusMessage || "Waiting for a PDF worth arguing with."}
                </p>
                {isRoasting && (
                  <div className="mt-4 rounded-[20px] border border-lime/18 bg-lime/7 p-4">
                    <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-lime">
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Roast engine live
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-coral via-gold to-lime transition-[width] duration-700 ease-out"
                        style={{ width: `${roastProgress}%` }}
                      />
                    </div>
                    <p className="mt-3 text-sm leading-7 text-foreground/88">
                      {currentRoastLoadingMessage}
                    </p>
                  </div>
                )}
                {(isVerifyingPayment || isRewriting || isGeneratingCoverLetter) && !isRoasting && (
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
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
              The roast report
            </h2>
            <p className="max-w-xl text-base leading-8 text-muted">
              The first pass is free and intentionally a little mean, but every jab should point
              to a fix worth making.
            </p>
          </div>

          {!analysis ? (
            <div className="poster-shell rounded-[30px] p-6 sm:rounded-[34px] sm:p-8">
              <p className="text-xl font-semibold tracking-tight sm:text-2xl">
                Your score, charges, and fixes land here after the upload.
              </p>
            </div>
          ) : shouldShowEmailGate ? (
            <div className="poster-shell rounded-[30px] p-6 sm:rounded-[34px] sm:p-8">
              <div className="max-w-xl space-y-5">
                <div className="space-y-3">
                  <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                    Your roast is ready. Where should we send updates?
                  </h3>
                  <p className="text-base leading-8 text-muted">
                    Drop your email to unlock the results. No spam, just product updates.
                  </p>
                </div>

                <form className="space-y-4" onSubmit={handleEmailGateSubmit}>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@careercomeback.com"
                    required
                    className="w-full rounded-[24px] border border-white/16 bg-black/18 px-4 py-4 text-base text-foreground outline-none transition placeholder:text-muted focus:border-lime/40 focus:bg-white/6 sm:rounded-[30px] sm:px-5"
                  />
                  <button type="submit" className={primaryButtonClass}>
                    Show my roast
                  </button>
                </form>

                <button
                  type="button"
                  className="text-sm text-muted transition hover:text-foreground"
                  onClick={() => setEmailSubmitted(true)}
                >
                  Skip
                </button>
              </div>
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[0.43fr_0.57fr]">
              <div className="poster-shell rounded-[30px] p-5 sm:rounded-[34px] sm:p-7">
                <p className="eyebrow">Scorecard</p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
                  <p className="text-6xl font-semibold leading-none tracking-[-0.08em] sm:text-7xl">
                    {analysis.score}
                  </p>
                  <div className="sm:pb-2">
                    <p className="text-lg font-semibold text-coral">{analysis.scoreLabel}</p>
                    <p className="text-sm text-muted">Resume health score</p>
                  </div>
                </div>
                <div className="mt-6 rounded-[22px] border border-white/10 bg-white/4 p-4 sm:rounded-[24px] sm:p-5">
                  <p className="eyebrow text-[11px]">ATS score</p>
                  <p
                    className={`mt-3 text-6xl font-semibold leading-none tracking-[-0.08em] sm:text-7xl ${getAtsScoreClassName(
                      analysis.atsScore,
                    )}`}
                  >
                    {analysis.atsScore}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-muted">
                    {analysis.atsVerdict}
                  </p>
                </div>
                <p className="mt-7 text-xl font-semibold leading-tight sm:text-2xl">{analysis.lead}</p>
                <p className="mt-4 text-base leading-8 text-muted">{analysis.summary}</p>
                <button
                  type="button"
                  className={`${secondaryButtonClass} mt-5`}
                  onClick={handleShareRoast}
                >
                  <Share2 className="h-4 w-4" />
                  Share your roast
                </button>

                <div className="mt-7 rounded-[24px] border border-white/10 bg-white/4 p-4 sm:rounded-[26px] sm:p-5">
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
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
              The polished rewrite
            </h2>
            <p className="max-w-xl text-base leading-8 text-muted">
              After Stripe confirms the payment, the app rewrites the exact roasted snapshot into
              a cleaner, recruiter-ready version.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-[0.38fr_0.62fr]">
            <div className="poster-shell rounded-[30px] p-5 sm:rounded-[34px] sm:p-7">
              <p className="eyebrow">{analysis?.upgradePitch.eyebrow || "Upgrade"}</p>
              <h3 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
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

              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                {!paidUnlocked ? (
                  <button
                    type="button"
                    className={primaryButtonClass}
                    disabled={!analysis || isBusy}
                    onClick={() => void handleCheckout("polished_rewrite")}
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
                {rewrite && (
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    disabled={isDownloadingPdf}
                    onClick={() => void handleDownloadPdf()}
                  >
                    {isDownloadingPdf ? (
                      <>
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        Building PDF...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" />
                        Download as PDF
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-4 sm:space-y-5">
              <div className="poster-shell rounded-[30px] p-5 sm:rounded-[34px] sm:p-7">
                {!rewrite ? (
                  <div className="space-y-5">
                    <p className="text-xl font-semibold tracking-tight sm:text-2xl">
                      The premium version appears here after payment.
                    </p>
                    <div className="rounded-[22px] border border-white/10 bg-black/18 p-4 font-mono text-sm text-muted sm:rounded-[24px] sm:p-5">
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
                      <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">{rewrite.title}</h3>
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

                    <div className="rounded-[24px] border border-white/10 bg-black/18 p-4 sm:rounded-[28px] sm:p-5">
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

              {rewrite && !coverLetterSessionId && (
                <div className="poster-shell rounded-[30px] p-5 sm:rounded-[34px] sm:p-7">
                  <div className="space-y-4">
                    <p className="eyebrow">One more thing</p>
                    <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                      Want a matching cover letter?
                    </h3>
                    <p className="text-base leading-8 text-muted">
                      We already know your resume. A tailored cover letter takes 10 seconds and costs $1.99.
                    </p>
                    <button
                      type="button"
                      className={primaryButtonClass}
                      disabled={isBusy}
                      onClick={() => void handleCheckout("cover_letter")}
                    >
                      {isCheckingOut ? (
                        <>
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                          Opening Stripe...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          Get cover letter - $1.99
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {rewrite && coverLetterSessionId && (
                <div id="cover-letter" className="poster-shell rounded-[30px] p-5 sm:rounded-[34px] sm:p-7">
                  {!coverLetter ? (
                    <div className="space-y-5">
                      <div className="space-y-3">
                        <p className="eyebrow">Matching cover letter</p>
                        <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                          Your cover letter is on deck.
                        </h3>
                        <p className="text-base leading-8 text-muted">
                          We&apos;re shaping a short, tailored letter from the same resume snapshot.
                        </p>
                      </div>
                      {isGeneratingCoverLetter ? (
                        <div className="flex items-center gap-3 text-sm text-lime">
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                          Generating cover letter...
                        </div>
                      ) : (
                        <button
                          type="button"
                          className={primaryButtonClass}
                          onClick={() => void requestCoverLetter(coverLetterSessionId)}
                        >
                          <Sparkles className="h-4 w-4" />
                          Generate cover letter
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="space-y-3">
                          <p className="eyebrow">Matching cover letter</p>
                          <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                            Ready to send with the rewrite.
                          </h3>
                        </div>
                        <button
                          type="button"
                          className={secondaryButtonClass}
                          onClick={handleCopyCoverLetter}
                        >
                          {didCopyCoverLetter ? (
                            <>
                              <Check className="h-4 w-4" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Clipboard className="h-4 w-4" />
                              Copy cover letter
                            </>
                          )}
                        </button>
                      </div>

                      <div className="rounded-[24px] border border-white/10 bg-black/18 p-4 sm:rounded-[28px] sm:p-5">
                        <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[13px] leading-7 text-foreground/90">
                          {coverLetter}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
