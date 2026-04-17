"use client";

import {
  ArrowRight,
  BadgeDollarSign,
  Check,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Download,
  FileUp,
  Flame,
  History,
  LoaderCircle,
  RotateCcw,
  Share2,
  Shield,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { AuthControls } from "@/components/auth-controls";
import {
  isOwnerPreviewMode,
  ownerPreviewModeStorageKey,
  type OwnerPreviewMode,
} from "@/lib/owner-preview";
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

type HomeTab = "main" | "learn" | "account";

type StoredSession = {
  analysis: RoastResult | null;
  rewrite: RewriteResult | null;
  coverLetter: string | null;
  coverLetterSessionId: string | null;
  paidSessionId: string | null;
  resumeName: string | null;
};

type ProStatus = {
  signedIn: boolean;
  isProActive: boolean;
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  freeLimit: number;
  windowHours: number;
  remainingRoasts: number | null;
  resetAt: string | null;
  portalAvailable: boolean;
};

type RoastLimitPopupState = {
  message: string;
  resetAt: string | null;
  windowHours: number;
  limit: number;
};

const storageKey = "roastmycv-session-v1";
const emailStorageKey = "roastmycv-email";
const ownerPreviewPanelStorageKey = "roastmycv-owner-preview-panel-open";
const genericFrontendErrorMessage =
  "Something went wrong, please try again in a moment.";
const roastLoadingMessages = [
  "Reading your resume...",
  "Cringing at the buzzwords...",
  "Sharpening the jokes...",
  "Checking the ATS damage...",
  "Almost done roasting...",
] as const;
const heroTrustPoints = [
  "No signup",
  "PDF only",
  "Roast in under 30 seconds",
] as const;
const homeTabs: Array<{
  value: HomeTab;
  label: string;
  description: string;
}> = [
  {
    value: "main",
    label: "Main",
    description: "Upload, roast, and unlock the rewrite.",
  },
  {
    value: "learn",
    label: "How it works",
    description: "See the flow, proof, and before-vs-after.",
  },
  {
    value: "account",
    label: "Account",
    description: "History, sign-in, and saved roast perks.",
  },
] as const;
const howItWorksSteps = [
  {
    number: "01",
    title: "Drop in the PDF",
    body: "Upload the resume exactly as you send it now, awkward formatting and all.",
  },
  {
    number: "02",
    title: "Get the free roast",
    body: "The app calls out weak verbs, vague buzzwords, ATS misses, and layout crimes.",
  },
  {
    number: "03",
    title: "Upgrade to Pro if it helps",
    body: "Pro removes the roast cap and unlocks unlimited rewrites plus matching cover letters.",
  },
] as const;
const proofExamples = [
  {
    label: "Weak verbs become sharper",
    before: "Responsible for managing marketing campaigns across social channels.",
    after:
      "Directed multi-channel marketing campaigns across LinkedIn, Instagram, and email to keep launches on schedule and visible.",
  },
  {
    label: "Buzzwords turn into substance",
    before: "Results-driven team player with excellent communication skills and a passion for innovation.",
    after:
      "Cross-functional operator who kept launches moving by aligning design, ops, and stakeholders on deadlines and deliverables.",
  },
  {
    label: "ATS-hostile formatting gets cleaned up",
    before: "Dense paragraphs, decorative symbols, and headings that a parser can barely read.",
    after:
      "Straightforward section labels, plain text hierarchy, and bullets that survive both recruiters and software.",
  },
] as const;
const coverLetterSellingPoints = [
  "Built from the same rewrite you already unlocked.",
  "Three short paragraphs with a confident, specific opener.",
  "Easy to customize for company name, role, and mission.",
] as const;
const coverLetterPreviewLines = [
  "I like roles where the work has to be clear, measurable, and useful on day one.",
  "That is exactly why this role stands out: it rewards people who can bring order to messy information and make it read like impact.",
  "I would bring the same sharper positioning from the rewrite into a cover letter that actually sounds like a person.",
] as const;
const ownerPreviewOptions: Array<{
  mode: OwnerPreviewMode;
  label: string;
  description: string;
}> = [
  {
    mode: "actual",
    label: "Actual",
    description: "Show the real live state for this browser.",
  },
  {
    mode: "unpaid",
    label: "Free",
    description: "Hide Pro access so you can review the free-tier paywall flow.",
  },
  {
    mode: "rewrite_paid",
    label: "Rewrite",
    description: "Preview the Pro rewrite state without changing the real account.",
  },
  {
    mode: "full_paid",
    label: "Full Pro",
    description: "Preview unlimited rewrite plus cover letter as if Pro were active.",
  },
];
const ownerPreviewRewriteSample: RewriteResult = {
  title: "Sharper, ATS-ready rewrite",
  positioning:
    "This preview version shows the kind of cleaner positioning, stronger verbs, and tighter structure the Pro tools are meant to reveal.",
  improvements: [
    "Lead with role-defining strengths instead of generic personality traits.",
    "Turn soft responsibility bullets into outcome-driven statements.",
    "Keep the layout plain enough for ATS while still sounding premium.",
    "Use placeholders only where real metrics still need to be added.",
  ],
  polishedResume: `# Candidate Name

## Summary
Operations-minded professional with experience organizing cross-functional work, tightening processes, and improving day-to-day execution. Known for turning vague responsibilities into clear ownership, readable structure, and stronger business communication.

## Experience
- Coordinated multi-step projects across internal teams, keeping deliverables aligned to deadlines and stakeholder expectations.
- Improved documentation and workflow clarity so recurring tasks were easier to hand off, track, and complete accurately.
- Supported reporting, scheduling, and follow-through across fast-moving priorities while maintaining a high standard of detail.

## Skills
- Project coordination
- Process improvement
- Stakeholder communication
- Reporting and documentation`,
  finalNote:
    "Before sending, swap in exact metrics, tools, and outcomes wherever you can prove them.",
};
const ownerPreviewCoverLetterSample = `Dear Hiring Team,

Your role stands out because it calls for someone who can turn messy information into clear, useful action. That has been a recurring theme in my work, whether I was coordinating priorities, tightening documentation, or helping teams move faster with better structure.

I am strongest when expectations are high and the details matter. I bring a practical writing style, strong follow-through, and a bias toward making work easier to understand, easier to hand off, and easier to trust. That combination is exactly what I would bring to this role.

I would welcome the chance to contribute that same clarity and execution to your team. Thank you for your time and consideration.`;
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

function formatResetTime(resetAt: string | null) {
  if (!resetAt) {
    return null;
  }

  const parsed = new Date(resetAt);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function pickPreviewLine(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    lines.find((line) => /^[-*]\s+/.test(line)) ??
    lines.find(
      (line) =>
        !line.startsWith("#") &&
        !line.endsWith(":") &&
        line.length >= 44,
    ) ??
    null
  );
}

function formatPreviewLine(text: string | null, maxLength = 180) {
  if (!text) {
    return null;
  }

  const normalizedText = text.replace(/^[-*]\s+/, "").trim();

  if (normalizedText.length <= maxLength) {
    return normalizedText;
  }

  return `${normalizedText.slice(0, maxLength).trimEnd()}...`;
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
  const { isSignedIn } = useAuth();
  const [hydrated, setHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<HomeTab>("main");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [resumeName, setResumeName] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [ownerPreviewEnabled, setOwnerPreviewEnabled] = useState(false);
  const [ownerPreviewMode, setOwnerPreviewMode] =
    useState<OwnerPreviewMode>("actual");
  const [isOwnerPreviewPanelOpen, setIsOwnerPreviewPanelOpen] = useState(true);
  const [analysis, setAnalysis] = useState<RoastResult | null>(null);
  const [rewrite, setRewrite] = useState<RewriteResult | null>(null);
  const [coverLetter, setCoverLetter] = useState<string | null>(null);
  const [coverLetterSessionId, setCoverLetterSessionId] = useState<string | null>(null);
  const [paidSessionId, setPaidSessionId] = useState<string | null>(null);
  const [proStatus, setProStatus] = useState<ProStatus | null>(null);
  const [limitPopup, setLimitPopup] = useState<RoastLimitPopupState | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [didCopy, setDidCopy] = useState(false);
  const [didCopyCoverLetter, setDidCopyCoverLetter] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isRoasting, setIsRoasting] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isOpeningBillingPortal, setIsOpeningBillingPortal] = useState(false);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const [isGeneratingCoverLetter, setIsGeneratingCoverLetter] = useState(false);
  const [roastLoadingIndex, setRoastLoadingIndex] = useState(0);
  const [roastProgress, setRoastProgress] = useState(0);
  const processedSessionRef = useRef<string | null>(null);
  const copyTimeoutRef = useRef<number | null>(null);
  const coverLetterCopyTimeoutRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      const storedEmail = window.localStorage.getItem(emailStorageKey);
      const storedOwnerPreviewMode = window.localStorage.getItem(
        ownerPreviewModeStorageKey,
      );
      const storedOwnerPreviewPanelState = window.localStorage.getItem(
        ownerPreviewPanelStorageKey,
      );
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

      if (
        storedOwnerPreviewMode &&
        isOwnerPreviewMode(storedOwnerPreviewMode)
      ) {
        setOwnerPreviewMode(storedOwnerPreviewMode);
      }

      if (storedOwnerPreviewPanelState === "closed") {
        setIsOwnerPreviewPanelOpen(false);
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
    if (!hydrated) {
      return;
    }

    let cancelled = false;

    async function loadOwnerPreviewStatus() {
      try {
        const response = await fetch("/api/owner-preview", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Owner preview check failed.");
        }

        const payload = (await response.json()) as { enabled: boolean };
        if (cancelled) {
          return;
        }

        setOwnerPreviewEnabled(payload.enabled);

        if (!payload.enabled) {
          setOwnerPreviewMode("actual");
          setIsOwnerPreviewPanelOpen(true);
          window.localStorage.removeItem(ownerPreviewModeStorageKey);
          window.localStorage.removeItem(ownerPreviewPanelStorageKey);
        }
      } catch {
        if (cancelled) {
          return;
        }

        setOwnerPreviewEnabled(false);
        setOwnerPreviewMode("actual");
        setIsOwnerPreviewPanelOpen(true);
        window.localStorage.removeItem(ownerPreviewModeStorageKey);
        window.localStorage.removeItem(ownerPreviewPanelStorageKey);
      }
    }

    void loadOwnerPreviewStatus();

    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (!ownerPreviewEnabled) {
      window.localStorage.removeItem(ownerPreviewModeStorageKey);
      return;
    }

    window.localStorage.setItem(ownerPreviewModeStorageKey, ownerPreviewMode);
  }, [hydrated, ownerPreviewEnabled, ownerPreviewMode]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (!ownerPreviewEnabled) {
      window.localStorage.removeItem(ownerPreviewPanelStorageKey);
      return;
    }

    window.localStorage.setItem(
      ownerPreviewPanelStorageKey,
      isOwnerPreviewPanelOpen ? "open" : "closed",
    );
  }, [hydrated, ownerPreviewEnabled, isOwnerPreviewPanelOpen]);

  async function refreshProStatus() {
    try {
      const response = await fetch("/api/pro/status", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Pro status check failed.");
      }

      const payload = (await response.json()) as ProStatus;
      setProStatus(payload);
    } catch {
      setProStatus(null);
    }
  }

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    void refreshProStatus();
  }, [hydrated, isSignedIn]);

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
    sessionId?: string | null,
    options?: {
      resumeHash?: string | null;
      resumeText?: string | null;
      forceRegenerate?: boolean;
    },
  ) {
    setIsRewriting(true);
    setError(null);
    setStatusMessage(
      sessionId
        ? "Payment verified. Rewriting the resume now..."
        : "Pro is active. Rewriting the resume now...",
    );

    try {
      const body: {
        sessionId?: string;
        feature: "rewrite";
        resumeHash?: string;
        resumeText?: string;
        forceRegenerate?: boolean;
        analysis?: RoastResult | null;
      } = {
        feature: "rewrite",
      };
      const resumeHash = analysis?.resumeHash ?? options?.resumeHash ?? null;
      const resumeText =
        analysis?.normalizedResume ?? options?.resumeText ?? null;

      if (sessionId) {
        body.sessionId = sessionId;
      }

      if (resumeHash) {
        body.resumeHash = resumeHash;
      }

      if (resumeText) {
        body.resumeText = resumeText;
      }

      if (options?.forceRegenerate) {
        body.forceRegenerate = true;
      }

      if (analysis) {
        body.analysis = analysis;
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
      if (sessionId) {
        setPaidSessionId(sessionId);
      }
      setStatusMessage("Sharper rewrite ready. Copy it, tailor it, and send the stronger version.");
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
    sessionId?: string | null,
    options?: {
      resumeHash?: string | null;
      resumeText?: string | null;
    },
  ) {
    setIsGeneratingCoverLetter(true);
    if (sessionId) {
      setCoverLetterSessionId(sessionId);
    }
    setError(null);
    setStatusMessage(
      sessionId
        ? "Payment confirmed. Drafting your matching cover letter now..."
        : "Pro is active. Drafting your matching cover letter now...",
    );

    try {
      const body: {
        sessionId?: string;
        feature: "cover_letter";
        resumeHash?: string;
        resumeText?: string;
        analysis?: RoastResult | null;
      } = {
        feature: "cover_letter",
      };
      const resumeHash = analysis?.resumeHash ?? options?.resumeHash ?? null;
      const resumeText =
        analysis?.normalizedResume ?? options?.resumeText ?? null;

      if (sessionId) {
        body.sessionId = sessionId;
      }

      if (resumeHash) {
        body.resumeHash = resumeHash;
      }

      if (resumeText) {
        body.resumeText = resumeText;
      }

      if (analysis) {
        body.analysis = analysis;
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

      if (verification.product === "pro_subscription") {
        await refreshProStatus();

        if (window.location.search.includes("session_id=")) {
          window.history.replaceState({}, "", `${window.location.pathname}#premium-rewrite`);
        }

        setStatusMessage(
          "Pro is live. Unlimited roasts, rewrites, and cover letters are unlocked.",
        );
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
        const payload = (await response.json().catch(() => null)) as
          | {
              error?: string;
              limitReached?: boolean;
              resetAt?: string | null;
              windowHours?: number;
              limit?: number;
            }
          | null;
        const message =
          payload?.error && payload.error.trim().length > 0
            ? payload.error
            : getFriendlyFrontendError();

        setError(message);

        if (payload?.limitReached) {
          setLimitPopup({
            message,
            resetAt: payload.resetAt ?? null,
            windowHours: payload.windowHours ?? 5,
            limit: payload.limit ?? 3,
          });
        }

        return;
      }

      const payload = (await response.json()) as RoastResult;
      setRoastProgress(100);
      setAnalysis(payload);
      setResumeName(selectedFile.name);
      await refreshProStatus();
      setStatusMessage("Roast complete. The report is ready, and Pro tools are standing by if you want the full cleanup.");
    } catch {
      setError(getFriendlyFrontendError());
    } finally {
      setIsRoasting(false);
    }
  }

  async function handleCheckout(product: PremiumProduct = "pro_subscription") {
    if (product !== "pro_subscription" && !analysis) {
      setError("Run the free roast first so there is something to improve.");
      return;
    }

    if (product === "pro_subscription" && !isSignedIn) {
      setActiveTab("account");
      setError("Create a free account first so your Pro plan stays tied to you across devices.");
      return;
    }

    setIsCheckingOut(true);
    setError(null);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeText: analysis?.normalizedResume,
          resumeHash: analysis?.resumeHash,
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

  async function handleOpenBillingPortal() {
    setIsOpeningBillingPortal(true);
    setError(null);

    try {
      const response = await fetch("/api/pro/portal", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(getFriendlyFrontendError());
      }

      const payload = (await response.json()) as { url: string };
      window.location.assign(payload.url);
    } catch {
      setError("We couldn't open billing management right now. Please try again in a moment.");
    } finally {
      setIsOpeningBillingPortal(false);
    }
  }

  async function handleCopy() {
    if (!visibleRewrite) {
      return;
    }

    await navigator.clipboard.writeText(visibleRewrite.polishedResume);
    setDidCopy(true);
    if (copyTimeoutRef.current) {
      window.clearTimeout(copyTimeoutRef.current);
    }
    copyTimeoutRef.current = window.setTimeout(() => setDidCopy(false), 1800);
  }

  async function handleDownloadPdf() {
    if (!visibleRewrite) {
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
      const topMargin = 72;
      const bottomMargin = 54;
      const contentWidth = pageWidth - marginX * 2;
      const accent = { r: 255, g: 118, b: 91 };
      const accentSoft = { r: 255, g: 213, b: 194 };
      const muted = { r: 102, g: 107, b: 115 };
      const markdownLines = visibleRewrite.polishedResume
        .replace(/\r\n/g, "\n")
        .split("\n");
      let cursorY = topMargin;

      const drawPageChrome = () => {
        pdf.setFillColor(accent.r, accent.g, accent.b);
        pdf.rect(0, 0, pageWidth, 18, "F");
        pdf.setDrawColor(accentSoft.r, accentSoft.g, accentSoft.b);
        pdf.setLineWidth(1);
        pdf.line(marginX, 40, pageWidth - marginX, 40);
      };

      const ensureSpace = (blockHeight: number) => {
        if (cursorY + blockHeight <= pageHeight - bottomMargin) {
          return;
        }

        pdf.addPage();
        cursorY = topMargin;
        drawPageChrome();
      };

      const isLikelyContactLine = (line: string) =>
        line.includes("@") ||
        line.includes("|") ||
        line.toLowerCase().includes("linkedin") ||
        line.toLowerCase().includes("portfolio") ||
        line.toLowerCase().includes("github") ||
        /https?:\/\//i.test(line) ||
        /\+?\d[\d\s().-]{6,}/.test(line);

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

      drawPageChrome();
      pdf.setProperties({
        title: visibleRewrite.title,
        subject: "RoastMyCV polished resume",
      });
      pdf.setTextColor(18, 20, 24);

      let wroteName = false;
      let canRenderContactLine = false;

      for (const rawLine of markdownLines) {
        const line = rawLine.trim();

        if (!line) {
          cursorY += 10;
          continue;
        }

        if (line.startsWith("# ")) {
          wroteName = true;
          canRenderContactLine = true;
          writeWrappedText({
            text: line.slice(2).trim(),
            fontSize: 28,
            lineHeight: 30,
            after: 14,
            style: "bold",
          });
          continue;
        }

        if (wroteName && canRenderContactLine && isLikelyContactLine(line)) {
          pdf.setTextColor(muted.r, muted.g, muted.b);
          writeWrappedText({
            text: line,
            fontSize: 10,
            lineHeight: 13,
            after: 16,
          });
          pdf.setTextColor(18, 20, 24);
          canRenderContactLine = false;
          continue;
        }

        if (line.startsWith("## ")) {
          cursorY += 6;
          ensureSpace(18);
          pdf.setFillColor(accent.r, accent.g, accent.b);
          pdf.roundedRect(marginX, cursorY + 2, 6, 12, 2, 2, "F");
          pdf.setTextColor(18, 20, 24);
          writeWrappedText({
            text: line.slice(3).trim().toUpperCase(),
            fontSize: 11,
            lineHeight: 14,
            after: 10,
            style: "bold",
            x: marginX + 16,
            width: contentWidth - 16,
          });
          continue;
        }

        if (line.startsWith("- ")) {
          const bulletIndent = 18;
          const bulletText = line.slice(2).trim();

          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(11);

          const bulletLines = pdf.splitTextToSize(
            bulletText,
            contentWidth - bulletIndent,
          );
          const blockHeight = bulletLines.length * 16;

          ensureSpace(blockHeight);
          pdf.setFillColor(accent.r, accent.g, accent.b);
          pdf.roundedRect(marginX, cursorY + 6, 6, 6, 1.5, 1.5, "F");
          pdf.setTextColor(18, 20, 24);
          pdf.text(bulletLines, marginX + bulletIndent, cursorY, {
            baseline: "top",
          });
          cursorY += blockHeight + 6;
          continue;
        }

        canRenderContactLine = false;
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
    if (!visibleCoverLetter) {
      return;
    }

    await navigator.clipboard.writeText(visibleCoverLetter);
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

  function handleResetResumeFlow() {
    setSelectedFile(null);
    setResumeName(null);
    setAnalysis(null);
    setRewrite(null);
    setCoverLetter(null);
    setCoverLetterSessionId(null);
    setPaidSessionId(null);
    setStatusMessage(null);
    setError(null);
    setLimitPopup(null);
    setDidCopy(false);
    setDidCopyCoverLetter(false);
    setRoastLoadingIndex(0);
    setRoastProgress(0);
    processedSessionRef.current = null;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    window.localStorage.removeItem(storageKey);

    if (window.location.search.includes("session_id=") || window.location.hash) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }

  function handlePreviewRewriteAction() {
    setStatusMessage(
      "Owner preview is showing the unlocked Pro rewrite state. Real regeneration still needs Pro access.",
    );
    document
      .getElementById("premium-rewrite")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handlePreviewCoverLetterAction() {
    setStatusMessage(
      "Owner preview is showing the full Pro state. Real cover-letter generation still needs a real Pro subscription.",
    );
    document
      .getElementById("cover-letter")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const currentRoastLoadingMessage = roastLoadingMessages[roastLoadingIndex];
  const isBusy =
    isRoasting ||
    isCheckingOut ||
    isOpeningBillingPortal ||
    isVerifyingPayment ||
    isRewriting ||
    isGeneratingCoverLetter;
  const isProActive = Boolean(proStatus?.isProActive);
  const paidUnlocked = Boolean(paidSessionId);
  const ownerForcesUnpaid =
    ownerPreviewEnabled && ownerPreviewMode === "unpaid";
  const ownerForcesRewriteUnlocked =
    ownerPreviewEnabled &&
    (ownerPreviewMode === "rewrite_paid" || ownerPreviewMode === "full_paid");
  const ownerForcesFullPremium =
    ownerPreviewEnabled && ownerPreviewMode === "full_paid";
  const effectiveProUnlocked = ownerForcesUnpaid
    ? false
    : ownerForcesRewriteUnlocked
      ? true
      : isProActive;
  const effectivePaidUnlocked = ownerForcesUnpaid
    ? false
    : ownerForcesRewriteUnlocked
      ? true
      : isProActive || paidUnlocked;
  const effectiveCoverLetterUnlocked = ownerForcesUnpaid
    ? false
    : ownerForcesFullPremium
      ? true
      : isProActive || Boolean(coverLetterSessionId);
  const usingPreviewRewriteSample =
    ownerForcesRewriteUnlocked && !rewrite;
  const usingPreviewCoverLetterSample =
    ownerForcesFullPremium && !coverLetter;
  const visibleRewrite = ownerForcesUnpaid
    ? null
    : rewrite ?? (ownerForcesRewriteUnlocked ? ownerPreviewRewriteSample : null);
  const visibleCoverLetter = ownerForcesUnpaid
    ? null
    : coverLetter ??
      (ownerForcesFullPremium ? ownerPreviewCoverLetterSample : null);
  const canRequestRewrite = effectiveProUnlocked || Boolean(paidSessionId);
  const canRequestCoverLetter =
    effectiveProUnlocked || Boolean(coverLetterSessionId);
  const remainingRoasts = proStatus?.remainingRoasts ?? null;
  const freeTierResetTime = formatResetTime(proStatus?.resetAt ?? null);
  const shouldShowEmailGate =
    Boolean(analysis) &&
    !emailSubmitted &&
    !effectivePaidUnlocked &&
    !effectiveCoverLetterUnlocked;
  const liveBeforePreview = formatPreviewLine(
    analysis ? pickPreviewLine(analysis.normalizedResume) : null,
  );
  const liveAfterPreview = formatPreviewLine(
    visibleRewrite ? pickPreviewLine(visibleRewrite.polishedResume) : null,
  );
  const showMainTab = activeTab === "main";
  const showLearnTab = activeTab === "learn";
  const showAccountTab = activeTab === "account";

  return (
    <main className="relative overflow-hidden">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-12 px-4 py-5 sm:gap-16 sm:px-6 sm:py-7 md:px-8 lg:px-10">
        <header className="motion-enter motion-delay-1 flex flex-col gap-5 rounded-[30px] border border-white/10 bg-white/4 px-4 py-4 backdrop-blur-xl sm:px-5 md:flex-row md:items-center md:justify-between md:rounded-full">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-coral/25 bg-coral/12 text-coral">
              <Flame className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="eyebrow text-[11px]">Free tier plus Pro tools</p>
              <p className="text-lg font-semibold tracking-tight">RoastMyCV</p>
            </div>
          </div>
          <div className="flex flex-col items-start gap-3 md:items-end">
            <AuthControls />
            <div className="flex flex-wrap gap-2 text-sm text-muted sm:gap-3">
              <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">PDF under 5MB</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">
                Free: 3 roasts / 5h
              </span>
              <span className="rounded-full border border-coral/20 bg-coral/10 px-4 py-2 text-coral">
                Pro: $10/mo
              </span>
            </div>
          </div>
        </header>

        <section className="motion-enter motion-delay-2">
          <div className="poster-shell rounded-[28px] p-3 sm:rounded-[30px] sm:p-4">
            <div className="grid gap-3 md:grid-cols-3">
              {homeTabs.map((tab) => {
                const isActive = activeTab === tab.value;

                return (
                  <button
                    key={tab.value}
                    type="button"
                    className={`rounded-[22px] border px-4 py-4 text-left transition ${
                      isActive
                        ? "border-lime/22 bg-lime/10"
                        : "border-white/10 bg-white/4 hover:border-white/18 hover:bg-white/7"
                    }`}
                    onClick={() => setActiveTab(tab.value)}
                  >
                    <p className="text-sm font-semibold text-foreground">{tab.label}</p>
                    <p className="mt-2 text-sm leading-7 text-muted">
                      {tab.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {showMainTab && (
          <>
        <section className="grid items-start gap-8 pt-2 sm:gap-10 sm:pt-4 lg:grid-cols-[1.08fr_0.92fr] lg:pt-10">
          <div className="space-y-8">
            <div className="poster-shell motion-enter motion-delay-2 motion-float rounded-[34px] px-5 py-6 sm:px-7 sm:py-8 lg:px-9 lg:py-10">
              <div className="relative space-y-7">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="eyebrow rounded-full border border-white/10 bg-white/6 px-3 py-2 text-[11px]">
                    Dark mode career intervention
                  </span>
                  <span className="rounded-full border border-lime/20 bg-lime/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-lime">
                    Free roast first
                  </span>
                </div>

                <div className="space-y-5">
                  <h1 className="max-w-5xl text-4xl font-semibold leading-[0.92] tracking-[-0.07em] sm:text-6xl sm:leading-none lg:text-[5.5rem]">
                    Find out why your resume feels
                    <span className="block text-coral">forgettable in 30 seconds.</span>
                  </h1>
                  <p className="max-w-2xl text-lg leading-8 text-muted md:text-xl">
                    Upload the PDF you actually send to employers. RoastMyCV tears into
                    weak verbs, empty buzzwords, missing metrics, ATS-hostile formatting,
                    and bullets that somehow say nothing. Free users get 3 roasts every
                    5 hours. Pro unlocks unlimited roasts, rewrites, and cover letters.
                  </p>
                </div>

                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
                  <a href="#upload-studio" className={primaryButtonClass}>
                    Drop a PDF now
                    <ArrowRight className="h-4 w-4" />
                  </a>
                  <button
                    type="button"
                    className="text-sm font-semibold text-muted transition hover:text-foreground"
                    onClick={() => setActiveTab("learn")}
                  >
                    See what gets fixed
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {heroTrustPoints.map((point) => (
                    <span
                      key={point}
                      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-muted-strong"
                    >
                      {point}
                    </span>
                  ))}
                </div>

                <div className="noise-line" />

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-[24px] border border-white/10 bg-black/18 p-4">
                    <p className="eyebrow text-[11px]">What gets roasted</p>
                    <p className="mt-3 text-lg font-semibold">
                      Weak verbs, ATS misses, weird formatting, fluff.
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-white/10 bg-black/18 p-4">
                    <p className="eyebrow text-[11px]">Why people pay</p>
                    <p className="mt-3 text-lg font-semibold">
                      Pro bundles the rewrite, cover letter, and unlimited uploads in one plan.
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-white/10 bg-black/18 p-4">
                    <p className="eyebrow text-[11px]">Built for trust</p>
                    <p className="mt-3 text-lg font-semibold">
                      One clear path: try the free tier, then upgrade if you want the full toolkit.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <section
            id="upload-studio"
            className="poster-shell motion-enter motion-delay-3 rounded-[30px] p-5 sm:rounded-[34px] sm:p-6 md:p-8"
          >
            <div className="scan-glow" />
            <div className="relative space-y-6">
              <div className="space-y-3">
                <p className="eyebrow">Upload studio</p>
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  Start with the free roast.
                </h2>
                <p className="text-sm leading-7 text-muted">
                  PDF only. Free users get 3 roasts every 5 hours. Pro removes the limit and unlocks the full toolkit.
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
                  ref={fileInputRef}
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
                    disabled={isBusy}
                    onClick={() => {
                      if (effectiveProUnlocked) {
                        document
                          .getElementById("premium-rewrite")
                          ?.scrollIntoView({ behavior: "smooth", block: "start" });
                        return;
                      }

                      void handleCheckout("pro_subscription");
                    }}
                  >
                    {isCheckingOut ? (
                      <>
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        Opening Stripe...
                      </>
                    ) : effectiveProUnlocked ? (
                      <>
                        {isProActive ? (
                          <>
                            <Check className="h-4 w-4" />
                            Pro active
                          </>
                        ) : (
                          <>
                            <Shield className="h-4 w-4" />
                            Pro preview on
                          </>
                        )}
                      </>
                    ) : !isSignedIn ? (
                      <>
                        <Shield className="h-4 w-4" />
                        Sign in for Pro
                      </>
                    ) : (
                      <>
                        <BadgeDollarSign className="h-4 w-4" />
                        Go Pro - $10/mo
                      </>
                    )}
                  </button>
                </div>

                {(analysis || resumeName || selectedFile) && (
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    disabled={isBusy}
                    onClick={handleResetResumeFlow}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Start over with a new PDF
                  </button>
                )}
              </form>

              <div className="rounded-[24px] border border-white/10 bg-white/4 p-4 sm:rounded-[26px] sm:p-5">
                <p className="eyebrow text-[11px]">Current status</p>
                <p className="mt-3 text-base font-semibold">
                  {isRoasting
                    ? "Roast in progress"
                    : statusMessage || "Waiting for a PDF worth arguing with."}
                </p>
                {proStatus && (
                  <p className="mt-3 text-sm leading-7 text-muted">
                    {proStatus.isProActive
                      ? "Pro is active. Upload as many resumes as you want and use the rewrite plus cover-letter tools without limits."
                      : remainingRoasts !== null
                        ? remainingRoasts > 0
                          ? `${remainingRoasts} free roast${remainingRoasts === 1 ? "" : "s"} left in this ${proStatus.windowHours}-hour window${freeTierResetTime ? `, resets around ${freeTierResetTime}` : ""}.`
                          : `Free limit reached for now${freeTierResetTime ? `, resets around ${freeTierResetTime}` : ""}.`
                        : `Free users get ${proStatus.freeLimit} roasts every ${proStatus.windowHours} hours.`}
                  </p>
                )}
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

        <section className="motion-enter motion-delay-6 space-y-8">
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

        <section id="premium-rewrite" className="motion-enter motion-delay-8 space-y-8 pb-10">
          <div className="space-y-3">
            <p className="eyebrow">Pro toolkit</p>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
              Unlimited rewrites and cover letters
            </h2>
            <p className="max-w-xl text-base leading-8 text-muted">
              One Pro plan unlocks unlimited roasts, stronger resume rewrites, and matching
              cover letters built from the same resume snapshot.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-[0.38fr_0.62fr]">
            <div className="poster-shell rounded-[30px] p-5 sm:rounded-[34px] sm:p-7">
              <p className="eyebrow">{analysis?.upgradePitch.eyebrow || "Go Pro"}</p>
              <h3 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
                {analysis?.upgradePitch.headline ||
                  "Unlock the full Pro toolkit when the roast earns your trust."}
              </h3>
              <div className="mt-6 space-y-3">
                {(analysis?.upgradePitch.points || [
                  "Rewrite the summary so it sounds specific instead of ceremonial.",
                  "Turn vague bullets into sharper, more ATS-friendly accomplishments.",
                  "Generate a matching cover letter and keep roasting new versions without the free-tier limit.",
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
                {!effectiveProUnlocked ? (
                  <button
                    type="button"
                    className={primaryButtonClass}
                    disabled={isBusy}
                    onClick={() => void handleCheckout("pro_subscription")}
                  >
                    {isCheckingOut ? (
                      <>
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        Opening Stripe...
                      </>
                    ) : !isSignedIn ? (
                      <>
                        <Shield className="h-4 w-4" />
                        Sign in for Pro
                      </>
                    ) : (
                      <>
                        <BadgeDollarSign className="h-4 w-4" />
                        Go Pro - $10/mo
                      </>
                    )}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className={primaryButtonClass}
                      disabled={!analysis || isBusy}
                      onClick={() => {
                        if (paidSessionId) {
                          void requestRewrite(paidSessionId, {
                            forceRegenerate: true,
                          });
                          return;
                        }

                        if (effectiveProUnlocked) {
                          void requestRewrite(undefined, {
                            forceRegenerate: true,
                          });
                          return;
                        }

                        handlePreviewRewriteAction();
                      }}
                    >
                      {isRewriting ? (
                        <>
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                          Rewriting...
                        </>
                      ) : canRequestRewrite ? (
                        <>
                          <Sparkles className="h-4 w-4" />
                          Regenerate rewrite
                        </>
                      ) : (
                        <>
                          <Shield className="h-4 w-4" />
                          Preview rewrite
                        </>
                      )}
                    </button>
                    {isProActive && (
                      <button
                        type="button"
                        className={secondaryButtonClass}
                        disabled={isOpeningBillingPortal}
                        onClick={() => void handleOpenBillingPortal()}
                      >
                        {isOpeningBillingPortal ? (
                          <>
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                            Opening billing...
                          </>
                        ) : (
                          <>
                            <BadgeDollarSign className="h-4 w-4" />
                            Manage Pro
                          </>
                        )}
                      </button>
                    )}
                  </>
                )}
                <button
                  type="button"
                  className={secondaryButtonClass}
                  disabled={!visibleRewrite}
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
                {visibleRewrite && (
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
              {ownerPreviewEnabled && ownerPreviewMode !== "actual" && (
                <p className="mt-4 text-sm leading-7 text-muted">
                  Owner preview is changing this section only for your browser. It does not
                  create a fake Stripe subscription or run Pro generation by itself.
                </p>
              )}
            </div>

            <div className="space-y-4 sm:space-y-5">
              <div className="poster-shell rounded-[30px] p-5 sm:rounded-[34px] sm:p-7">
                {!visibleRewrite ? (
                  <div className="space-y-5">
                    <p className="text-xl font-semibold tracking-tight sm:text-2xl">
                      The rewrite appears here after Pro is active.
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
                      <p className="eyebrow">Pro rewrite</p>
                      <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                        {visibleRewrite.title}
                      </h3>
                      <p className="text-base leading-8 text-muted">
                        {visibleRewrite.positioning}
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {visibleRewrite.improvements.map((improvement) => (
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
                        {visibleRewrite.polishedResume}
                      </pre>
                    </div>

                    <div className="rounded-[22px] border border-white/10 bg-white/4 p-4 text-sm leading-7 text-muted">
                      {visibleRewrite.finalNote}
                    </div>
                    {usingPreviewRewriteSample && (
                      <div className="rounded-[22px] border border-gold/18 bg-gold/10 p-4 text-sm leading-7 text-gold">
                        Owner preview is showing a sample rewrite here so you can inspect the
                        unlocked Pro layout before subscribing.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {!effectiveCoverLetterUnlocked && (
                <div className="poster-shell rounded-[30px] p-5 sm:rounded-[34px] sm:p-7">
                  <div className="grid gap-6 lg:grid-cols-[0.52fr_0.48fr]">
                    <div className="space-y-5">
                      <div className="space-y-3">
                        <p className="eyebrow">Included with Pro</p>
                        <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                          Want a matching cover letter?
                        </h3>
                        <p className="text-base leading-8 text-muted">
                          Pro turns the same resume snapshot into a short, sharper cover letter
                          without asking you to buy a second add-on.
                        </p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                        {coverLetterSellingPoints.map((point) => (
                          <div
                            key={point}
                            className="rounded-[20px] border border-white/10 bg-white/4 p-4 text-sm leading-7 text-muted-strong"
                          >
                            {point}
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                        <button
                          type="button"
                          className={primaryButtonClass}
                          disabled={isBusy}
                          onClick={() => void handleCheckout("pro_subscription")}
                        >
                          {isCheckingOut ? (
                            <>
                              <LoaderCircle className="h-4 w-4 animate-spin" />
                              Opening Stripe...
                            </>
                          ) : !isSignedIn ? (
                            <>
                              <Shield className="h-4 w-4" />
                              Sign in for Pro
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4" />
                              Go Pro - $10/mo
                            </>
                          )}
                        </button>
                        <p className="text-sm leading-7 text-muted">
                          Same resume snapshot. Unlimited roasts, unlimited rewrites, and the cover letter included.
                        </p>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-white/10 bg-black/18 p-4 sm:p-5">
                      <p className="eyebrow text-[11px]">Mini preview</p>
                      <div className="mt-4 space-y-4">
                        {coverLetterPreviewLines.map((line, index) => (
                          <p
                            key={`${index}-${line.slice(0, 12)}`}
                            className="font-mono text-[13px] leading-7 text-foreground/88"
                          >
                            {line}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {effectiveCoverLetterUnlocked && (
                <div id="cover-letter" className="poster-shell rounded-[30px] p-5 sm:rounded-[34px] sm:p-7">
                  {!visibleCoverLetter ? (
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
                          disabled={!analysis || isGeneratingCoverLetter}
                          onClick={() => {
                            if (coverLetterSessionId) {
                              void requestCoverLetter(coverLetterSessionId);
                              return;
                            }

                            if (effectiveProUnlocked) {
                              void requestCoverLetter();
                              return;
                            }

                            handlePreviewCoverLetterAction();
                          }}
                        >
                          {canRequestCoverLetter ? (
                            <>
                              <Sparkles className="h-4 w-4" />
                              Generate cover letter
                            </>
                          ) : (
                            <>
                              <Shield className="h-4 w-4" />
                              Preview cover letter
                            </>
                          )}
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
                          disabled={!visibleCoverLetter}
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
                          {visibleCoverLetter}
                        </pre>
                      </div>
                      {usingPreviewCoverLetterSample && (
                        <div className="rounded-[22px] border border-gold/18 bg-gold/10 p-4 text-sm leading-7 text-gold">
                          Owner preview is showing a sample cover letter here so you can inspect
                          the full Pro state before subscribing.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
          </>
        )}

        {showLearnTab && (
          <>
        <section className="motion-enter motion-delay-4 grid gap-6 lg:grid-cols-[0.34fr_0.66fr]">
          <div className="space-y-3">
            <p className="eyebrow">How it works</p>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
              One flow. Zero guesswork.
            </h2>
            <p className="max-w-lg text-base leading-8 text-muted">
              A good landing page should answer the first questions fast: what this does,
              what happens next, and why the Pro version is worth it.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {howItWorksSteps.map((step) => (
              <div key={step.number} className="poster-shell interactive-lift rounded-[28px] p-5">
                <p className="font-mono text-sm tracking-[0.24em] text-coral">{step.number}</p>
                <h3 className="mt-4 text-xl font-semibold tracking-tight">{step.title}</h3>
                <p className="mt-3 text-sm leading-7 text-muted">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="proof-lab" className="motion-enter motion-delay-5 space-y-8">
          <div className="space-y-3">
            <p className="eyebrow">Proof Of Output</p>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
              What gets fixed, in plain sight.
            </h2>
            <p className="max-w-2xl text-base leading-8 text-muted">
              Instead of vague “AI optimization,” the page now shows the exact kinds of
              changes the Pro rewrite is supposed to make.
            </p>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            {proofExamples.map((example) => (
              <article key={example.label} className="poster-shell interactive-lift rounded-[30px] p-5 sm:p-6">
                <p className="eyebrow text-[11px]">{example.label}</p>
                <div className="mt-5 space-y-4">
                  <div className="rounded-[22px] border border-coral/18 bg-coral/8 p-4">
                    <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-coral">
                      Before
                    </p>
                    <p className="mt-3 text-sm leading-7 text-foreground/84">{example.before}</p>
                  </div>
                  <div className="rounded-[22px] border border-lime/18 bg-lime/8 p-4">
                    <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-lime">
                      After
                    </p>
                    <p className="mt-3 text-sm leading-7 text-foreground/92">{example.after}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="motion-enter motion-delay-7 grid gap-5 lg:grid-cols-[0.34fr_0.66fr]">
          <div className="space-y-3">
            <p className="eyebrow">Before Vs After</p>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
              The Pro glow-up should feel obvious.
            </h2>
            <p className="max-w-lg text-base leading-8 text-muted">
              People convert faster when they can see the shape of the upgrade. This block
              shows the “before” energy against the “after” version the app is aiming for.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="poster-shell rounded-[30px] p-5 sm:p-6">
              <p className="eyebrow text-[11px]">Before</p>
              <p className="mt-4 text-xl font-semibold tracking-tight text-coral">
                Reads like effort, not impact.
              </p>
              <div className="mt-5 rounded-[22px] border border-coral/18 bg-coral/8 p-4">
                <p className="font-mono text-[13px] leading-7 text-foreground/84">
                  {liveBeforePreview ?? proofExamples[0].before}
                </p>
              </div>
              <p className="mt-4 text-sm leading-7 text-muted">
                Too generic, too soft, and not nearly specific enough to survive a skim.
              </p>
            </div>

            <div className="poster-shell rounded-[30px] p-5 sm:p-6">
              <p className="eyebrow text-[11px]">After</p>
              <p className="mt-4 text-xl font-semibold tracking-tight text-lime">
                Sounds sharper, cleaner, and more hireable.
              </p>
              <div className="mt-5 rounded-[22px] border border-lime/18 bg-lime/8 p-4">
                <p className="font-mono text-[13px] leading-7 text-foreground/92">
                  {liveAfterPreview ?? proofExamples[0].after}
                </p>
              </div>
              <p className="mt-4 text-sm leading-7 text-muted">
                Better verbs, clearer positioning, and enough structure to help both ATS and
                recruiters keep reading.
              </p>
            </div>
          </div>
        </section>

          </>
        )}

        {showAccountTab && (
          <section className="grid gap-5 lg:grid-cols-[0.42fr_0.58fr]">
            <div className="poster-shell motion-enter motion-delay-4 rounded-[30px] p-6 sm:rounded-[34px] sm:p-8">
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full border border-lime/18 bg-lime/10 text-lime">
                    <History className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="eyebrow text-[11px]">Account</p>
                    <p className="text-lg font-semibold tracking-tight">
                      {isSignedIn
                        ? "Your roast history lives here."
                        : "Optional sign-in, real perks."}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
                    {isSignedIn
                      ? "Keep every roast, rewrite, and comeback plan in one place."
                      : "You can use RoastMyCV without an account, but signing in makes it stick."}
                  </h2>
                  <p className="text-base leading-8 text-muted">
                    {isSignedIn
                      ? "Signed-in roasts are saved to your history, Pro can stay tied to your account across devices, and the free-tier roast limit follows your account instead of only this browser."
                      : "The free roast still works without login. An account gives you saved history and is required only if you want the Pro plan attached to you across devices."}
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  {isSignedIn ? (
                    <Link href="/history" className={primaryButtonClass}>
                      <History className="h-4 w-4" />
                      Open history
                    </Link>
                  ) : (
                    <Link href="/sign-up" className={primaryButtonClass}>
                      <Sparkles className="h-4 w-4" />
                      Create account
                    </Link>
                  )}
                  {isSignedIn ? (
                    isProActive ? (
                      <button
                        type="button"
                        className={secondaryButtonClass}
                        disabled={isOpeningBillingPortal}
                        onClick={() => void handleOpenBillingPortal()}
                      >
                        <BadgeDollarSign className="h-4 w-4" />
                        {isOpeningBillingPortal ? "Opening billing..." : "Manage Pro"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={secondaryButtonClass}
                        disabled={isBusy}
                        onClick={() => void handleCheckout("pro_subscription")}
                      >
                        <BadgeDollarSign className="h-4 w-4" />
                        Go Pro - $10/mo
                      </button>
                    )
                  ) : (
                    <Link href="/sign-in" className={secondaryButtonClass}>
                      <Shield className="h-4 w-4" />
                      Log in
                    </Link>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div className="poster-shell motion-enter motion-delay-5 rounded-[30px] p-5 sm:rounded-[34px] sm:p-7">
                <p className="eyebrow">What this unlocks</p>
                <div className="mt-5 grid gap-3">
                  {[
                    isSignedIn
                      ? "Every signed-in roast is saved to your private history page so you can revisit older feedback."
                      : "Sign in if you want each roast saved to a private history page instead of living only in browser storage.",
                    "Pro bundles unlimited roasts, unlimited rewrites, and unlimited cover letters in one monthly plan.",
                    "Free users get 3 roasts every 5 hours per account or guest browser to protect the app and model spend.",
                  ].map((item) => (
                    <div
                      key={item}
                      className="rounded-[20px] border border-white/10 bg-white/4 p-4 text-sm leading-7 text-muted-strong"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div className="poster-shell motion-enter motion-delay-6 rounded-[30px] p-5 sm:rounded-[34px] sm:p-7">
                <p className="eyebrow">{isSignedIn ? "History next" : "Why sign in later"}</p>
                <h3 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
                  {isSignedIn
                    ? "Review past roasts without digging through old tabs."
                    : "Keep the first experience fast, then add history when it helps."}
                </h3>
                <p className="mt-4 text-base leading-8 text-muted">
                  {isSignedIn
                    ? "Your History page shows the timestamp, score, ATS score, lead line, and expandable details for every saved roast."
                    : "The account is optional on purpose. You can still test the product first, then sign in when you want saved feedback or the Pro plan."}
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {isSignedIn ? (
                    <>
                      <Link href="/history" className={secondaryButtonClass}>
                        <History className="h-4 w-4" />
                        View roast history
                      </Link>
                      <button
                        type="button"
                        className={secondaryButtonClass}
                        onClick={() => setActiveTab("main")}
                      >
                        <Sparkles className="h-4 w-4" />
                        Roast another resume
                      </button>
                    </>
                  ) : (
                    <>
                      <Link href="/sign-up" className={primaryButtonClass}>
                        <Sparkles className="h-4 w-4" />
                        Create account
                      </Link>
                      <Link href="/sign-in" className={secondaryButtonClass}>
                        <Shield className="h-4 w-4" />
                        Log in
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {limitPopup && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
            <div className="poster-shell w-full max-w-xl rounded-[30px] p-6 sm:rounded-[34px] sm:p-8">
              <div className="space-y-5">
                <div className="space-y-3">
                  <p className="eyebrow">Free limit hit</p>
                  <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                    You used all {limitPopup.limit} free roasts in this {limitPopup.windowHours}-hour window.
                  </h3>
                  <p className="text-base leading-8 text-muted">
                    {limitPopup.message}
                  </p>
                  <p className="text-sm leading-7 text-muted">
                    {limitPopup.resetAt
                      ? `Your free uploads open back up around ${formatResetTime(limitPopup.resetAt)}.`
                      : "The free-tier counter resets automatically after the window passes."}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    className={primaryButtonClass}
                    disabled={isCheckingOut}
                    onClick={() => {
                      setLimitPopup(null);
                      void handleCheckout("pro_subscription");
                    }}
                  >
                    {isCheckingOut ? (
                      <>
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        Opening Stripe...
                      </>
                    ) : !isSignedIn ? (
                      <>
                        <Shield className="h-4 w-4" />
                        Sign in for Pro
                      </>
                    ) : (
                      <>
                        <BadgeDollarSign className="h-4 w-4" />
                        Go Pro - $10/mo
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    onClick={() => setLimitPopup(null)}
                  >
                    Maybe later
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {ownerPreviewEnabled && (
          <div className="fixed bottom-4 right-4 z-40 w-[min(22rem,calc(100vw-2rem))]">
            {isOwnerPreviewPanelOpen ? (
              <div className="poster-shell rounded-[28px] p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="eyebrow text-[11px]">Owner Preview</p>
                    <p className="mt-2 text-lg font-semibold tracking-tight">
                      Private state switcher
                    </p>
                  </div>
                  <button
                    type="button"
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-lime/18 bg-lime/10 text-lime transition hover:border-lime/30 hover:bg-lime/15"
                    onClick={() => setIsOwnerPreviewPanelOpen(false)}
                    aria-label="Collapse owner preview"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 grid gap-2">
                  {ownerPreviewOptions.map((option) => {
                    const isActive = ownerPreviewMode === option.mode;

                    return (
                      <button
                        key={option.mode}
                        type="button"
                        className={`rounded-[20px] border p-3 text-left transition ${
                          isActive
                            ? "border-lime/25 bg-lime/10"
                            : "border-white/10 bg-white/4 hover:border-white/18 hover:bg-white/7"
                        }`}
                        onClick={() => setOwnerPreviewMode(option.mode)}
                      >
                        <p className="text-sm font-semibold text-foreground">{option.label}</p>
                        <p className="mt-1 text-xs leading-6 text-muted">
                          {option.description}
                        </p>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs leading-6 text-muted">
                    Only this browser sees the forced state.
                  </p>
                  <Link
                    href="/owner-preview"
                    className="text-sm font-semibold text-lime transition hover:text-foreground"
                  >
                    Manage access
                  </Link>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="poster-shell flex w-full items-center justify-between rounded-[24px] px-4 py-3 text-left transition hover:border-white/18"
                onClick={() => setIsOwnerPreviewPanelOpen(true)}
              >
                <div className="min-w-0">
                  <p className="eyebrow text-[11px]">Owner Preview</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    Reopen state switcher
                  </p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-lime/18 bg-lime/10 text-lime">
                  <ChevronUp className="h-4 w-4" />
                </div>
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
