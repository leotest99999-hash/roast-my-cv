import Link from "next/link";
import { ArrowLeft, Flame, Sparkles } from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import { AuthControls } from "@/components/auth-controls";
import { RoastHistoryList } from "@/components/roast-history-list";
import { listRoastHistory } from "@/lib/roast-history";

export default async function HistoryPage() {
  const { userId, redirectToSignIn } = await auth();

  if (!userId) {
    return redirectToSignIn({
      returnBackUrl: "/history",
    });
  }

  const entries = await listRoastHistory(userId);

  return (
    <main className="relative overflow-hidden">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-10 px-4 py-5 sm:gap-12 sm:px-6 sm:py-7 md:px-8 lg:px-10">
        <header className="motion-enter motion-delay-1 flex flex-col gap-5 rounded-[30px] border border-white/10 bg-white/4 px-4 py-4 backdrop-blur-xl sm:px-5 md:flex-row md:items-center md:justify-between md:rounded-full">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-coral/25 bg-coral/12 text-coral">
              <Flame className="h-5 w-5" />
            </div>
            <div>
              <p className="eyebrow text-[11px]">Private roast archive</p>
              <p className="text-lg font-semibold tracking-tight">RoastMyCV History</p>
            </div>
          </div>

          <div className="flex flex-col items-start gap-3 md:items-end">
            <AuthControls />
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-semibold text-muted transition hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to the main roast flow
            </Link>
          </div>
        </header>

        <section className="motion-enter motion-delay-2 grid gap-6 lg:grid-cols-[0.38fr_0.62fr]">
          <div className="space-y-4">
            <p className="eyebrow">Signed-in perk</p>
            <h1 className="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
              Your past roasts, saved in one place.
            </h1>
            <p className="max-w-xl text-base leading-8 text-muted">
              Every roast created while signed in gets tucked into your private history so
              you can revisit the damage, compare scores, and decide whether the newer resume
              actually got less embarrassing.
            </p>
          </div>

          <div className="poster-shell motion-enter motion-delay-3 rounded-[30px] p-5 sm:rounded-[34px] sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-[24px] border border-white/10 bg-white/4 p-4">
                <p className="eyebrow text-[10px]">Saved roasts</p>
                <p className="mt-3 text-5xl font-semibold tracking-[-0.07em] text-foreground">
                  {entries.length}
                </p>
                <p className="mt-2 text-sm leading-7 text-muted">
                  Private snapshots attached to this signed-in account.
                </p>
              </div>

              <div className="rounded-[24px] border border-lime/16 bg-lime/8 p-4">
                <p className="eyebrow text-[10px] text-lime">Why this matters</p>
                <p className="mt-3 text-lg font-semibold text-foreground">
                  You can finally compare old damage against new damage.
                </p>
                <p className="mt-2 text-sm leading-7 text-foreground/82">
                  No more relying on one browser tab to remember what the app already roasted.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-6 pb-10">
          <div className="motion-enter motion-delay-4 space-y-3">
            <p className="eyebrow">Roast archive</p>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              History
            </h2>
            <p className="max-w-2xl text-base leading-8 text-muted">
              Expand any card to review the full summary, issues, fixes, wins, and upgrade pitch
              that came back from that roast.
            </p>
          </div>

          {entries.length === 0 ? (
            <div className="poster-shell motion-enter motion-delay-5 rounded-[30px] p-6 sm:rounded-[34px] sm:p-8">
              <div className="max-w-2xl space-y-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-gold/25 bg-gold/12 text-gold">
                  <Sparkles className="h-5 w-5" />
                </div>
                <h3 className="text-2xl font-semibold tracking-tight">
                  No saved roasts yet.
                </h3>
                <p className="text-base leading-8 text-muted">
                  Generate a roast while you’re signed in and it will show up here automatically.
                </p>
                <Link
                  href="/"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-coral/40 bg-coral px-5 py-3 text-sm font-semibold text-[#180f0a] transition hover:bg-[#ff7f65]"
                >
                  Roast a resume now
                </Link>
              </div>
            </div>
          ) : (
            <RoastHistoryList entries={entries} />
          )}
        </section>
      </div>
    </main>
  );
}
