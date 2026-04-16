"use client";

import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";

const loginButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-full border border-white/12 bg-white/4 px-4 py-2.5 text-sm font-semibold text-foreground transition duration-200 hover:-translate-y-0.5 hover:border-lime/35 hover:bg-white/8";
const signupButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-full border border-coral/35 bg-coral px-4 py-2.5 text-sm font-semibold text-[#180f0a] transition duration-200 hover:-translate-y-0.5 hover:bg-[#ff7f65]";

export function AuthControls() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Show
        when="signed-out"
        fallback={
          <div className="inline-flex items-center gap-3 rounded-full border border-white/12 bg-white/4 px-3 py-2 text-sm text-foreground">
            <div className="hidden min-w-0 sm:block">
              <p className="eyebrow text-[10px]">Optional Account</p>
              <p className="truncate text-sm font-semibold text-foreground">
                Signed in
              </p>
            </div>
            <UserButton showName userProfileMode="modal" />
          </div>
        }
      >
        <SignInButton mode="redirect">
          <button type="button" className={loginButtonClass}>
            Log in
          </button>
        </SignInButton>
        <SignUpButton mode="redirect">
          <button type="button" className={signupButtonClass}>
            Create account
          </button>
        </SignUpButton>
      </Show>
    </div>
  );
}
