"use client";

import { Check, Shield, ShieldOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const primaryButtonClass =
  "inline-flex w-full items-center justify-center gap-2 rounded-full border border-coral/40 bg-coral px-5 py-3 text-sm font-semibold text-[#180f0a] transition hover:bg-[#ff7f65] sm:w-auto disabled:cursor-not-allowed disabled:opacity-45";
const secondaryButtonClass =
  "inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/12 bg-white/4 px-5 py-3 text-sm font-semibold text-foreground transition hover:border-lime/35 hover:bg-white/8 sm:w-auto disabled:cursor-not-allowed disabled:opacity-45";

export function OwnerPreviewAccess() {
  const [token, setToken] = useState("");
  const [isEnabled, setIsEnabled] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      try {
        const response = await fetch("/api/owner-preview", {
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { enabled: boolean };

        if (!cancelled) {
          setIsEnabled(payload.enabled);
          if (payload.enabled) {
            setStatusMessage("Owner preview is active on this browser.");
          }
        }
      } catch {
        // Silent on purpose. This page still works as a token form.
      }
    }

    void loadStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleEnable(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token.trim()) {
      setError("Enter your owner preview code first.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/owner-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });

      if (!response.ok) {
        throw new Error("That access code was not accepted.");
      }

      setIsEnabled(true);
      setToken("");
      setStatusMessage("Owner preview is active. Head back to the homepage to use the preview panel.");
    } catch {
      setError("That access code was not accepted.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDisable() {
    setIsSubmitting(true);
    setError(null);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/owner-preview", {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Unable to disable owner preview.");
      }

      setIsEnabled(false);
      setStatusMessage("Owner preview is off for this browser.");
    } catch {
      setError("Unable to disable owner preview right now.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="relative overflow-hidden">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-8 px-4 py-8 sm:px-6">
        <section className="poster-shell rounded-[34px] p-6 sm:p-8">
          <div className="space-y-6">
            <div className="space-y-3">
              <p className="eyebrow">Owner Preview</p>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Private state switcher for the live site.
              </h1>
              <p className="max-w-2xl text-base leading-8 text-muted">
                This page is for you only. Enter the owner preview code to reveal a hidden
                panel on the homepage where you can force unpaid, rewrite-unlocked, or
                full-premium states without changing the experience for anyone else.
              </p>
            </div>

            <form className="space-y-4" onSubmit={handleEnable}>
              <input
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Owner preview code"
                className="w-full rounded-[26px] border border-white/16 bg-black/18 px-4 py-4 text-base text-foreground outline-none transition placeholder:text-muted focus:border-lime/40 focus:bg-white/6 sm:px-5"
                autoComplete="off"
              />

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <button
                  type="submit"
                  className={primaryButtonClass}
                  disabled={isSubmitting}
                >
                  <Shield className="h-4 w-4" />
                  {isSubmitting ? "Checking..." : "Enable owner preview"}
                </button>
                <button
                  type="button"
                  className={secondaryButtonClass}
                  disabled={isSubmitting || !isEnabled}
                  onClick={() => void handleDisable()}
                >
                  <ShieldOff className="h-4 w-4" />
                  Disable
                </button>
                <Link href="/" className={secondaryButtonClass}>
                  <Check className="h-4 w-4" />
                  Back to homepage
                </Link>
              </div>
            </form>

            {(statusMessage || error) && (
              <div className="rounded-[24px] border border-white/10 bg-white/4 p-4">
                {statusMessage && (
                  <p className="text-sm leading-7 text-lime">{statusMessage}</p>
                )}
                {error && (
                  <p className="text-sm leading-7 text-coral">{error}</p>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
