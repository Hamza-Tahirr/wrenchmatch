"use client";

import { Eye, EyeOff, UserPlus } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { FormErrorSummary } from "@/components/ui/form-error-summary";
import { Input } from "@/components/ui/input";
import { RadioGroup, type RadioOption } from "@/components/ui/radio-group";
import { SubmitButton } from "@/components/ui/submit-button";
import { signupAction } from "../actions";
import { INITIAL_SIGNUP_STATE } from "../form-state";

type SignupRole = "customer" | "mechanic";

type SignupFormProps = {
  /** Preselected account type (from ?role=). */
  defaultRole: SignupRole;
  /** Safe same-site path to continue to after signing up as a customer, or null. */
  next: string | null;
  loginHref: string;
  passwordMinLength: number;
  displayNameMaxLength: number;
};

const ROLE_OPTIONS: readonly RadioOption[] = [
  {
    value: "customer",
    label: "I need a car repair",
    hint: "Describe a problem, compare itemized quotes and reserve a mechanic.",
  },
  {
    value: "mechanic",
    label: "I'm a mechanic",
    hint: "Apply to receive matched repair requests. An admin reviews every application.",
  },
];

const NAME_FIELD: Record<SignupRole, { label: string; hint: string }> = {
  customer: {
    label: "Your name",
    hint: "Shown to mechanics with your requests, for example “Dana” or “Dana P.”",
  },
  mechanic: {
    label: "Name customers will see",
    hint: "Shown on your quotes, for example “Marco R.” or your business name.",
  },
};

const FIELD_LABELS = {
  role: "Account type",
  displayName: "Name",
  email: "Email",
  password: "Password",
  confirmPassword: "Confirm password",
  acceptTerms: "Terms",
};

const textLink = "rounded-sm font-semibold text-neon-cyan underline-offset-4 hover:underline";

function toRole(value: string | undefined, fallback: SignupRole): SignupRole {
  return value === "customer" || value === "mechanic" ? value : fallback;
}

export function SignupForm({ defaultRole, next, loginHref, passwordMinLength, displayNameMaxLength }: SignupFormProps) {
  const [state, formAction] = useActionState(signupAction, INITIAL_SIGNUP_STATE);
  const values = state.values;
  const submittedRole = toRole(values?.role, defaultRole);
  // Follows the radio buttons so the name field's label and hint fit the account type.
  const [role, setRole] = useState<SignupRole>(defaultRole);
  const [showPasswords, setShowPasswords] = useState(false);
  const errors = state.fieldErrors ?? {};
  // Passwords are never sent back, so after a failed submit both fields are empty again.
  const failed = Boolean(state.formError) || Object.keys(errors).length > 0;
  const passwordType = showPasswords ? "text" : "password";

  return (
    <div className="glass-strong relative overflow-hidden rounded-[1.75rem] p-5 sm:p-8">
      <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-neon-violet/18 blur-3xl" />
      <form action={formAction} noValidate className="relative space-y-6">
        <FormErrorSummary formError={state.formError} fieldErrors={errors} labels={FIELD_LABELS} focusKey={state} />
        <input type="hidden" name="next" value={next ?? ""} />
        <RadioGroup
          name="role"
          legend="Account type"
          variant="cards"
          columns={2}
          required
          defaultValue={submittedRole}
          onValueChange={(value) => setRole(toRole(value, role))}
          options={ROLE_OPTIONS}
          error={errors.role}
        />
        <Field label={NAME_FIELD[role].label} name="displayName" hint={NAME_FIELD[role].hint} error={errors.displayName} required>
          <Input autoComplete="name" maxLength={displayNameMaxLength} defaultValue={values?.displayName ?? ""} />
        </Field>
        <Field
          label="Email"
          name="email"
          hint="We don't send email yet, so your address is marked as verified straight away."
          error={errors.email}
          required
        >
          <Input
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@example.com"
            defaultValue={values?.email ?? ""}
          />
        </Field>
        <div className="grid gap-6 sm:grid-cols-2 sm:gap-4">
          <Field
            label="Password"
            name="password"
            hint={
              failed
                ? `Enter it again; it isn't kept after a failed attempt. At least ${passwordMinLength} characters.`
                : `At least ${passwordMinLength} characters. A short phrase is easy to remember.`
            }
            error={errors.password}
            required
          >
            <Input type={passwordType} autoComplete="new-password" />
          </Field>
          <Field label="Confirm password" name="confirmPassword" error={errors.confirmPassword} required>
            <Input type={passwordType} autoComplete="new-password" />
          </Field>
        </div>
        <button
          type="button"
          onClick={() => setShowPasswords((value) => !value)}
          aria-pressed={showPasswords}
          className="-mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-fg-muted transition-colors hover:text-fg sm:min-h-9"
        >
          {showPasswords ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
          Show passwords
        </button>
        <Checkbox
          name="acceptTerms"
          required
          defaultChecked={values?.acceptTerms ?? false}
          error={errors.acceptTerms}
          label={
            <>
              I agree to the{" "}
              <Link href="/help#terms" className={textLink}>
                terms
              </Link>{" "}
              and{" "}
              <Link href="/help#privacy" className={textLink}>
                privacy notice
              </Link>
            </>
          }
          hint="Pilot terms: placeholder text for now, not a final policy."
        />
        <SubmitButton size="lg" fullWidth leadingIcon={<UserPlus />} pendingText="Creating account…">
          Create account
        </SubmitButton>
      </form>
      <p className="relative mt-6 border-t border-line pt-5 text-sm text-fg-muted">
        Already have an account?{" "}
        <Link href={loginHref} className={textLink}>
          Log in
        </Link>
      </p>
    </div>
  );
}
