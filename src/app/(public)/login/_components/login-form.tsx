"use client";

import { Eye, EyeOff, LogIn } from "lucide-react";
import Link from "next/link";
import { useActionState, useRef, useState } from "react";

import { Field } from "@/components/ui/field";
import { FormErrorSummary } from "@/components/ui/form-error-summary";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { loginAction } from "../actions";
import { INITIAL_LOGIN_STATE } from "../form-state";
import { SampleAccounts, type SampleAccount, type SampleLoginData } from "./sample-accounts";

type LoginFormProps = {
  /** Safe same-site path to return to after logging in, or null. */
  next: string | null;
  signupHref: string;
  /** Sample logins to offer (DEMO_MODE only). */
  samples: SampleLoginData | null;
};

const textLink = "rounded-sm font-semibold text-neon-cyan underline-offset-4 hover:underline";

/** Email + password login (with a show-password toggle) and, when enabled, the sample accounts. */
export function LoginForm({ next, signupHref, samples }: LoginFormProps) {
  const [state, formAction] = useActionState(loginAction, INITIAL_LOGIN_STATE);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const [chosen, setChosen] = useState<SampleAccount | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const errors = state.fieldErrors ?? {};

  function fillIn(account: SampleAccount) {
    if (!samples) return;
    if (emailRef.current) emailRef.current.value = account.email;
    if (passwordRef.current) passwordRef.current.value = samples.password;
    setChosen(account);
    // Keyboard users can press Enter straight away; nothing is submitted automatically.
    submitRef.current?.focus();
  }

  const form = (
    <div className="glass-strong relative overflow-hidden rounded-[1.75rem] p-5 sm:p-7">
      <div aria-hidden="true" className="pointer-events-none absolute -top-20 -left-16 size-56 rounded-full bg-neon-cyan/15 blur-3xl" />
      <form action={formAction} noValidate className="relative space-y-5">
        <FormErrorSummary
          title="We couldn't log you in"
          formError={state.formError}
          fieldErrors={errors}
          labels={{ email: "Email", password: "Password" }}
          focusKey={state}
        />
        <input type="hidden" name="next" value={next ?? ""} />
        <Field label="Email" name="email" error={errors.email} required>
          <Input
            ref={emailRef}
            type="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@example.com"
            defaultValue={state.values?.email ?? ""}
          />
        </Field>
        <Field label="Password" name="password" error={errors.password} required>
          {(control) => (
            <div className="relative">
              <Input {...control} ref={passwordRef} type={showPassword ? "text" : "password"} autoComplete="current-password" className="pr-12" />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-pressed={showPassword}
                aria-controls={control.id}
                className="absolute inset-y-0 right-1 my-auto grid size-10 place-items-center rounded-lg text-fg-subtle transition-colors hover:text-fg"
              >
                {showPassword ? <EyeOff aria-hidden="true" className="size-4.5" /> : <Eye aria-hidden="true" className="size-4.5" />}
                <span className="sr-only">Show password</span>
              </button>
            </div>
          )}
        </Field>
        <SubmitButton ref={submitRef} size="lg" fullWidth leadingIcon={<LogIn />} pendingText="Logging in…">
          Log in
        </SubmitButton>
      </form>
      <p role="status" className="sr-only">
        {chosen ? `Filled in the login for ${chosen.displayName}. Select Log in to continue.` : ""}
      </p>
      <p className="relative mt-6 border-t border-line pt-5 text-sm text-fg-muted">
        New to WrenchMatch?{" "}
        <Link href={signupHref} className={textLink}>
          Create an account
        </Link>
      </p>
    </div>
  );

  if (!samples) return <div className="w-full max-w-md">{form}</div>;

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] xl:gap-8">
      {form}
      <SampleAccounts
        password={samples.password}
        tabs={samples.tabs}
        initialTab={samples.initialTab}
        next={next}
        selectedEmail={chosen?.email ?? null}
        onFill={fillIn}
      />
    </div>
  );
}
