import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="relative overflow-hidden">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-8 px-4 py-8 sm:px-6">
        <section className="poster-shell motion-enter motion-delay-1 rounded-[34px] p-6 sm:p-8">
          <div className="space-y-4 text-center">
            <p className="eyebrow">Optional account</p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Log in if you want your future upgrades tied to an account.
            </h1>
            <p className="mx-auto max-w-2xl text-base leading-8 text-muted">
              The roast stays usable without an account. Sign in with email now, and any social
              providers enabled for this app will appear here too.
            </p>
          </div>

          <div className="mt-8 flex justify-center">
            <SignIn signUpUrl="/sign-up" fallbackRedirectUrl="/" />
          </div>
        </section>
      </div>
    </main>
  );
}
