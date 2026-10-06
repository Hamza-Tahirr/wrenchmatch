"use client";

import { ArrowLeft, ArrowRight, Send } from "lucide-react";
import { m } from "motion/react";
import { useEffect, useRef, useState, type MouseEvent } from "react";

import { UploadBudgetGuard } from "@/components/media/upload-budget-guard";
import { Callout } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { FileInput } from "@/components/ui/file-input";
import { FormErrorSummary } from "@/components/ui/form-error-summary";
import { SubmitButton } from "@/components/ui/submit-button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import type { MechanicApplicationFormValues } from "@/lib/validation/mechanic";
import type { MechanicFormOptions } from "@/server/mechanic/form-options";

import { availabilityFieldLabels, AvailabilityEditor } from "../../_components/availability-editor";
import { FormSection } from "../../_components/form-section";
import { AboutYouFields, InsuranceFields, PROFILE_FIELD_LABELS, ServiceAreaFields } from "../../_components/profile-fields";
import { SERVICES_FIELD_LABELS, ServicesFields } from "../../_components/services-fields";
import { isPlainClick, jumpTo } from "@/components/ui/jump-link";
import { BAR_CLEARANCE, CHECK_ROWS } from "../../_components/tap";
import { useVersionedActionState } from "../../_components/use-versioned-action-state";
import { submitApplicationAction, type ApplicationFormState } from "../actions";
import { ApplicationStepper } from "./application-stepper";

const SECTIONS = [
  { id: "about", label: "About you" },
  { id: "area", label: "Where you work" },
  { id: "services", label: "What you service" },
  { id: "documents", label: "Insurance & documents" },
  { id: "availability", label: "Availability" },
  { id: "terms", label: "Terms" },
] as const;

/** Short titles for the mechanic terms, keyed by MECHANIC_TERMS key. */
const TERM_TITLES: Readonly<Record<string, string>> = {
  independent_contractor: "Independent contractor",
  quote_commitment: "A submitted quote commits the offered time slot until it expires",
  booking_acceptance: "A selected and paid quote becomes a booking automatically",
  accurate_information: "Accurate details and current insurance",
};

const UPLOAD_LABELS: Readonly<Record<string, string>> = {
  idDocument: "Photo ID",
  insuranceDocument: "Insurance certificate",
  certificationDocs: "Certification documents",
  profilePhoto: "Profile photo",
  acceptTerms: "Mechanic terms",
};

type ApplicationFormProps = {
  initialValues: MechanicApplicationFormValues;
  options: MechanicFormOptions;
  /** Earliest insurance expiry the date picker offers (tomorrow). */
  minInsuranceExpiry: string;
};

/**
 * Highlights the section the reader is in, for the progress steps: the last section whose top
 * has passed 40% of the viewport (the last one once the page is scrolled to the end). Measured
 * once per frame while scrolling, so jumps (links, find in page) land on the right step too.
 */
function useCurrentSection(): number {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const line = window.innerHeight * 0.4;
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      let index = 0;
      SECTIONS.forEach((section, position) => {
        const element = document.getElementById(section.id);
        if (element && element.getBoundingClientRect().top <= line) index = position;
      });
      setCurrent(atEnd && window.scrollY > 0 ? SECTIONS.length - 1 : index);
    };
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(measure);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);
  return current;
}

/**
 * The progress steps are plain "#section" anchors: jump in place with jumpTo (no history
 * entry, so the top progress bar stays idle) and move focus to the section heading.
 */
function jumpToSection(event: MouseEvent<HTMLElement>) {
  if (!isPlainClick(event)) return;
  const link = event.target instanceof Element ? event.target.closest("a") : null;
  const href = link?.getAttribute("href");
  const section = href?.startsWith("#") ? document.getElementById(href.slice(1)) : null;
  if (!section) return;
  event.preventDefault();
  jumpTo(section, section.querySelector<HTMLElement>("h2"));
}

/** Scrolls to a section (from the phone step bar) and moves focus to its heading. */
function goToSection(index: number) {
  const section = SECTIONS[index] ? document.getElementById(SECTIONS[index].id) : null;
  if (section) jumpTo(section, section.querySelector<HTMLElement>("h2"));
}

export function ApplicationForm({ initialValues, options, minInsuranceExpiry }: ApplicationFormProps) {
  const [state, dispatch, version] = useVersionedActionState<ApplicationFormState>(submitApplicationAction, {
    ok: false,
  });
  const current = useCurrentSection();
  const values = !state.ok && state.values ? state.values : initialValues;
  const errors = state.ok ? {} : (state.fieldErrors ?? {});
  const labels = {
    ...PROFILE_FIELD_LABELS,
    ...SERVICES_FIELD_LABELS,
    ...UPLOAD_LABELS,
    ...availabilityFieldLabels(values.availability),
  };
  const uploads = options.uploads;
  // The error summary lists what to fix (and takes focus); a toast flags the refusal too.
  const toasted = useRef(0);
  useEffect(() => {
    if (version === 0 || toasted.current === version || state.ok) return;
    toasted.current = version;
    toast.error("Your application wasn't submitted", { description: "The list at the top of the form says what to fix." });
  }, [version, state]);

  return (
    <div className="space-y-6">
      {/* From sm: the sticky stepper under the header. Phones use the step bar at the bottom. */}
      <div onClickCapture={jumpToSection} className="glass-strong sticky top-16 z-10 hidden rounded-2xl px-5 py-4 sm:block">
        <ApplicationStepper sections={SECTIONS} current={current} />
      </div>

      <form key={version} action={dispatch} noValidate className={cn("space-y-6", BAR_CLEARANCE)}>
        <FormErrorSummary
          title="Your application wasn't submitted"
          formError={state.ok ? null : state.formError}
          fieldErrors={errors}
          labels={labels}
          focusKey={version}
        />

        <FormSection
          id="about"
          step={1}
          title="About you"
          description="Your public name and the private contact details admins and booked customers use."
        >
          <AboutYouFields values={values} errors={errors} options={options} />
        </FormSection>

        <FormSection
          id="area"
          step={2}
          title="Where you work"
          description="Matching uses your base ZIP, how you work and how far you travel."
        >
          <ServiceAreaFields values={values} errors={errors} options={options} />
        </FormSection>

        <FormSection
          id="services"
          step={3}
          title="What you service"
          description="Choose the repair categories you offer and the vehicle makes you work on."
        >
          <ServicesFields values={values} errors={errors} options={options} />
        </FormSection>

        <FormSection
          id="documents"
          step={4}
          title="Insurance & documents"
          description="Admins verify your ID and insurance before approving you. Documents are private: only you and admins can open them."
        >
          <InsuranceFields values={values} errors={errors} options={options} minExpiry={minInsuranceExpiry} />
          <div className="grid grid-cols-1 gap-x-6 gap-y-5 border-t border-line pt-6 sm:grid-cols-2">
            <Field label="Photo ID" hint="Driver's license or other government photo ID." error={errors.idDocument} required>
              <FileInput
                name="idDocument"
                accept={uploads.document.accept}
                acceptLabel={uploads.document.acceptLabel}
                limitLabel={uploads.document.limitLabel}
                maxFiles={1}
                maxFileSizeBytes={uploads.document.maxBytes}
                budget={uploads.document.budget}
              />
            </Field>
            <Field
              label="Insurance certificate"
              hint="Proof of liability insurance showing the provider and expiry date."
              error={errors.insuranceDocument}
              required
            >
              <FileInput
                name="insuranceDocument"
                accept={uploads.document.accept}
                acceptLabel={uploads.document.acceptLabel}
                limitLabel={uploads.document.limitLabel}
                maxFiles={1}
                maxFileSizeBytes={uploads.document.maxBytes}
                budget={uploads.document.budget}
              />
            </Field>
            <Field label="Certification documents" hint="ASE or other certificates." error={errors.certificationDocs} optional>
              <FileInput
                name="certificationDocs"
                multiple
                accept={uploads.document.accept}
                acceptLabel={uploads.document.acceptLabel}
                limitLabel={uploads.certificationDocsLimitLabel}
                maxFiles={uploads.certificationDocsMax}
                maxFileSizeBytes={uploads.document.maxBytes}
                budget={uploads.document.budget}
              />
            </Field>
            <Field
              label="Profile photo"
              hint="Shown to customers you quote. Location data is removed from photos."
              error={errors.profilePhoto}
              optional
            >
              <FileInput
                name="profilePhoto"
                accept={uploads.profilePhoto.accept}
                acceptLabel={uploads.profilePhoto.acceptLabel}
                limitLabel={uploads.profilePhoto.limitLabel}
                maxFiles={1}
                maxFileSizeBytes={uploads.profilePhoto.maxBytes}
                budget={uploads.profilePhoto.budget}
              />
            </Field>
          </div>
          <UploadBudgetGuard
            budget={uploads.document.budget}
            advice="Choose smaller files: photos are resized for you, PDFs are sent as they are. You can add more documents from your profile after applying."
          />
        </FormSection>

        <FormSection
          id="availability"
          step={5}
          title="Availability"
          description="Your usual weekly hours. Requests are matched when the customer's preferred time overlaps them."
        >
          <AvailabilityEditor
            rows={values.availability}
            errors={errors}
            hint="Choose the days you work and your hours, in 30-minute steps. Add a second window for split shifts."
          />
        </FormSection>

        <FormSection
          id="terms"
          step={6}
          title="Terms"
          description="Please read these before you apply. They apply to every quote and booking."
        >
          <ol className="space-y-3">
            {options.terms.items.map((term, index) => (
              <li key={term.key} className="flex gap-3 rounded-xl border border-line bg-surface-2/50 p-4">
                <span
                  aria-hidden="true"
                  className="grid size-7 shrink-0 place-items-center rounded-full bg-neon-cyan/10 font-mono text-xs font-semibold text-neon-cyan ring-1 ring-neon-cyan/40"
                >
                  {index + 1}
                </span>
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-fg">{TERM_TITLES[term.key] ?? `Term ${index + 1}`}</p>
                  <p className="text-sm text-pretty text-fg-muted">{term.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <Checkbox
            name="acceptTerms"
            className={CHECK_ROWS}
            required
            defaultChecked={values.acceptTerms}
            error={errors.acceptTerms}
            label="I have read and accept all of the mechanic terms above"
            hint={`Provisional terms, version ${options.terms.version}. Your acceptance is recorded with the date and time.`}
          />
        </FormSection>

        <div className="glass relative space-y-4 overflow-hidden rounded-2xl p-4 sm:p-6">
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-neon-violet/70 to-transparent" />
          <Callout tone="info" title="What happens next">
            <p>
              An admin reviews your details and documents. You&rsquo;ll get a notification when your application is
              decided, and you&rsquo;ll start receiving matched jobs after approval. Brake and suspension work needs a
              separate safety approval.
            </p>
          </Callout>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-fg-muted">You can update your profile while it&rsquo;s being reviewed.</p>
            {/* Phones submit from the step bar below, which rests right here at the end. */}
            <div className="hidden sm:block">
              <SubmitButton size="lg" leadingIcon={<Send />} pendingText="Submitting application…">
                Submit application
              </SubmitButton>
            </div>
          </div>
        </div>

        <PhoneStepBar current={current} />
      </form>
    </div>
  );
}

/**
 * Phones: the steps at the bottom, in thumb reach. Back and Next jump between sections (Next
 * names the section it opens); on the last section Next becomes Submit application. It sticks
 * to the bottom of the screen above the safe area and rests at the end of the form.
 */
function PhoneStepBar({ current }: { current: number }) {
  const last = current >= SECTIONS.length - 1;
  const previous = current > 0 ? SECTIONS[current - 1] : null;
  const next = last ? null : SECTIONS[current + 1];
  return (
    <div className="glass-strong sticky bottom-0 z-20 -mx-4 flex items-center gap-2.5 rounded-none border-x-0 border-b-0 px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:hidden">
      <button
        type="button"
        onClick={() => goToSection(current - 1)}
        disabled={!previous}
        aria-label={previous ? `Back to ${previous.label}` : "Back"}
        className="grid size-11 shrink-0 place-items-center rounded-xl text-fg-muted ring-1 ring-line-strong transition-[color,background-color,transform] ring-inset hover:bg-fg/5 hover:text-fg active:scale-95 disabled:pointer-events-none disabled:opacity-40"
      >
        <ArrowLeft aria-hidden="true" className="size-5" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-1.5 text-sm leading-tight">
          <span className="shrink-0 font-mono text-xs text-fg-subtle tabular">
            {current + 1}/{SECTIONS.length}
          </span>
          <span className="truncate font-semibold text-fg">{SECTIONS[current]?.label}</span>
        </p>
        <div aria-hidden="true" className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2 ring-1 ring-line">
          <m.div
            className="h-full origin-left rounded-full bg-gradient-to-r from-neon-cyan to-neon-violet"
            initial={false}
            animate={{ scaleX: (current + 1) / SECTIONS.length }}
            transition={{ type: "spring", stiffness: 160, damping: 26 }}
          />
        </div>
      </div>
      {next ? (
        <Button
          variant="secondary"
          onClick={() => goToSection(current + 1)}
          trailingIcon={<ArrowRight />}
          aria-label={`Next: ${next.label}`}
          className="min-h-11 shrink-0"
        >
          Next
        </Button>
      ) : (
        <SubmitButton leadingIcon={<Send />} pendingText="Submitting…" className="min-h-11 shrink-0">
          Submit application
        </SubmitButton>
      )}
    </div>
  );
}
