import {
  ArrowRight,
  BadgeCheck,
  Camera,
  CarFront,
  CreditCard,
  FileText,
  LifeBuoy,
  LogIn,
  MapPinned,
  Rocket,
  ScrollText,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { GlowCard } from "@/components/motion/glow-card";
import { Stagger } from "@/components/motion/stagger";
import { Callout } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { sampleLoginsAvailable } from "@/app/(public)/login/sample-logins";
import { CoverageSection } from "./_components/coverage-section";
import { FaqSearch, type FaqItem } from "./_components/faq-search";

export const metadata: Metadata = {
  title: "Help Center",
  description:
    "How requests, itemized quotes, reservations, photos and privacy work on WrenchMatch. Online payments are coming soon.",
};

const contents = [
  { id: "getting-started", label: "Getting started" },
  { id: "faq", label: "Questions and answers" },
  { id: "payments", label: "Quotes and payments" },
  { id: "coverage", label: "Where we work" },
  { id: "privacy", label: "Privacy notice" },
  { id: "terms", label: "Terms" },
] as const;

const topics: ReadonlyArray<{ href: string; title: string; body: string; icon: ReactNode; tone: string }> = [
  {
    href: "#getting-started",
    title: "Getting started",
    body: "First steps for customers, mechanics and admins.",
    icon: <Rocket />,
    tone: "text-neon-cyan",
  },
  {
    href: "#faq",
    title: "Quotes and booking",
    body: "How matching, itemized quotes and reservations work.",
    icon: <FileText />,
    tone: "text-neon-violet",
  },
  {
    href: "#payments",
    title: "Payments",
    body: "Online payments are coming soon. Nothing is charged.",
    icon: <CreditCard />,
    tone: "text-neon-blue",
  },
  {
    href: "#privacy",
    title: "Privacy and safety",
    body: "Approximate locations, private contact details, clean photos.",
    icon: <ShieldCheck />,
    tone: "text-success-600",
  },
];

const inlineLink = "font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800";

export default async function HelpPage() {
  const sampleLogins = await sampleLoginsAvailable();
  return (
    <PageContainer>
      <PageHeader
        aurora
        eyebrow="Help Center"
        title="How can we help?"
        description="Everything about requests, itemized quotes, reservations, photos and privacy on WrenchMatch."
      />

      <Stagger as="ul" className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {topics.map((topic) => (
          <li key={topic.href}>
            <a
              href={topic.href}
              className="glass-lite card-hover group grid h-full grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-1 rounded-2xl p-4 sm:p-5 lg:flex lg:flex-col lg:gap-3"
            >
              <span
                aria-hidden="true"
                className={`row-span-2 grid size-11 place-items-center rounded-xl border border-line-strong bg-fg/[0.04] shadow-[0_0_24px_-10px_currentColor] transition-transform duration-300 group-hover:scale-110 [&_svg]:size-5 ${topic.tone}`}
              >
                {topic.icon}
              </span>
              <span className="font-display font-semibold text-fg">{topic.title}</span>
              <span className="text-sm text-fg-muted">{topic.body}</span>
              <span className="mt-auto hidden items-center gap-1 text-sm font-semibold text-brand-700 lg:inline-flex">
                Read
                <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-1" />
              </span>
            </a>
          </li>
        ))}
      </Stagger>

      <div className="mt-12 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
        <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
          <p className="font-mono text-xs font-semibold tracking-[0.16em] text-fg-subtle uppercase">On this page</p>
          <ul className="mt-3 flex flex-wrap gap-2 lg:flex-col lg:gap-0.5 lg:border-l lg:border-line">
            {contents.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="inline-flex rounded-full border border-line bg-fg/[0.03] px-3 py-1.5 text-sm font-medium text-fg-muted transition-colors hover:border-neon-cyan/40 hover:text-fg lg:-ml-px lg:flex lg:rounded-none lg:border-0 lg:border-l-2 lg:border-transparent lg:bg-transparent lg:px-3 lg:hover:border-neon-cyan"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-10 max-w-3xl space-y-16 lg:mt-0">
          <GettingStartedSection sampleLogins={sampleLogins} />
          <Section id="faq" title="Questions and answers" description="Search, or open a question to read the answer.">
            <FaqSearch items={faqs} />
          </Section>
          <PaymentsSection />
          <CoverageSection />
          <PrivacySection />
          <TermsSection />
          <StillNeedHelp />
        </div>
      </div>
    </PageContainer>
  );
}

const roles: ReadonlyArray<{
  id: string;
  title: string;
  icon: ReactNode;
  accent: string;
  steps: readonly string[];
  cta: { href: string; label: string };
}> = [
  {
    id: "customers",
    title: "Customers",
    icon: <CarFront />,
    accent: "from-neon-cyan to-neon-blue",
    steps: [
      "Describe the problem, your car and your ZIP code. Add photos if they help.",
      "Approved mechanics who cover your area and that repair send itemized quotes.",
      "Compare labor, parts, fees, time slot and expiry side by side.",
      "Select a quote to reserve it. It is held as pending payment until online payments launch.",
    ],
    cta: { href: "/request", label: "Find a Mechanic" },
  },
  {
    id: "mechanics",
    title: "Mechanics",
    icon: <Wrench />,
    accent: "from-neon-violet to-neon-pink",
    steps: [
      "Sign up as a mechanic and complete your application with your services and service area.",
      "Upload your ID and insurance documents. An admin reviews every application.",
      "Once approved, matching jobs appear on your job board with an approximate area.",
      "Send one itemized quote per job, and add photos of your work to your gallery.",
    ],
    cta: { href: "/signup?role=mechanic", label: "Apply as a mechanic" },
  },
  {
    id: "admins",
    title: "Admins",
    icon: <BadgeCheck />,
    accent: "from-success-500 to-neon-cyan",
    steps: [
      "Review mechanic applications and documents, and approve safety-critical services.",
      "See why each mechanic did or did not match a request, and re-run matching.",
      "Manage pilot ZIP codes and settings; every sensitive view is in the audit log.",
      "Answer help requests from customers and mechanics.",
    ],
    cta: { href: "/admin", label: "Open the dashboard" },
  },
];

function GettingStartedSection({ sampleLogins }: { sampleLogins: boolean }) {
  return (
    <Section
      id="getting-started"
      title="Getting started"
      description="WrenchMatch connects drivers with approved local mechanics. Pick your role to see the first steps."
    >
      {/* Older links pointed at #demo; keep them landing here. */}
      <span id="demo" aria-hidden="true" className="block scroll-mt-28" />
      <div className="grid gap-4 md:grid-cols-3">
        {roles.map((role) => (
          <GlowCard
            key={role.id}
            as="article"
            aria-labelledby={`role-${role.id}`}
            className="glass-lite reveal flex flex-col rounded-2xl p-5 transition-[border-color] duration-300 hover:border-line-strong"
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={`grid size-10 place-items-center rounded-xl bg-linear-to-br text-on-brand shadow-glow-sm [&_svg]:size-5 ${role.accent}`}
              >
                {role.icon}
              </span>
              <h3 id={`role-${role.id}`} className="font-display text-lg font-semibold text-fg">
                {role.title}
              </h3>
            </div>
            <ol className="mt-4 space-y-3">
              {role.steps.map((step, index) => (
                <li key={step} className="flex gap-3 text-sm text-fg-muted">
                  <span
                    aria-hidden="true"
                    className="grid size-6 shrink-0 place-items-center rounded-full border border-line-strong font-mono text-[11px] font-semibold text-brand-800"
                  >
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-auto pt-5">
              <ButtonLink href={role.cta.href} variant="secondary" size="sm" trailingIcon={<ArrowRight />}>
                {role.cta.label}
              </ButtonLink>
            </div>
          </GlowCard>
        ))}
      </div>
      <Callout tone="info" title="Explore with sample accounts" icon={<LogIn />}>
        <p>
          The pilot comes with sample customer, mechanic and admin accounts. Open the{" "}
          <Link href="/login" className={inlineLink}>
            log in page
          </Link>{" "}
          {sampleLogins
            ? "and pick one to look around."
            : "and sign in with the sample email and password you were given."}{" "}
          Their requests, bookings and reviews are sample records: no repair was done and no money changed hands, and
          their reviews never count toward a rating.
        </p>
      </Callout>
    </Section>
  );
}

const faqs: readonly FaqItem[] = [
  {
    id: "faq-quotes",
    question: "How do quotes work?",
    keywords: "matching mechanics itemized labor parts compare select slot expire",
    answer: (
      <>
        <p>
          When you send a request, we look for approved mechanics who cover your ZIP code area, offer that type of
          repair, work on your make, offer the service type you chose (mobile or at a garage) and are available around
          your preferred time. Up to five of the closest are notified, and your request page shows exactly how many
          were.
        </p>
        <p>
          Each interested mechanic sends one itemized quote: labor, parts, taxes and any fees as separate lines, plus
          the scope of work, an offered time slot, the estimated duration and when the quote expires. Compare them side
          by side and select the one that fits.
        </p>
      </>
    ),
  },
  {
    id: "faq-pending-payment",
    question: "What does “pending payment” mean?",
    keywords: "reservation reserve select quote checkout pay card online payments coming soon",
    answer: (
      <>
        <p>
          When you select a quote, its terms and your consent are saved and a reservation is created with the status{" "}
          <strong>pending payment</strong>. A booking is confirmed only after payment.
        </p>
        <p>
          <strong>Online payments are coming soon</strong>, so checkout is not open yet: no card details are collected
          and nothing is charged. Your reservation shows the full price breakdown, including the platform fee, and you
          can cancel it.
        </p>
      </>
    ),
  },
  {
    id: "faq-contact",
    question: "Who can see my contact details and address?",
    keywords: "privacy phone email address private contact share mechanic",
    answer: (
      <>
        <p>
          Before a booking is confirmed, matched mechanics see your vehicle, the problem description, your photos (with
          location data removed), an approximate area and your preferred time. They do not see your phone number,
          email, exact address or video.
        </p>
        <p>
          Likewise, you see a mechanic&rsquo;s display name, experience, services, approximate area and genuine rating
          (or &ldquo;New&rdquo;), but not their phone number, email or garage address. Contact details are shared only
          with the booked mechanic, after the booking is confirmed.
        </p>
      </>
    ),
  },
  {
    id: "faq-maps",
    question: "How exact are the maps and distances?",
    keywords: "map location distance miles zip area approximate centroid",
    answer: (
      <p>
        They are approximate on purpose. Maps and distances use the center of a ZIP code area, never an exact address,
        so you will see wording such as &ldquo;about 6 mi&rdquo; and shaded areas instead of pins on a house.
      </p>
    ),
  },
  {
    id: "faq-photos",
    question: "Can I add my own photos?",
    keywords: "photos pictures upload images gallery profile picture before after jpeg png",
    answer: (
      <>
        <p>
          Yes. Customers can add photos of the problem to a request (and more later while it is open), and a profile
          picture. Mechanics can show photos of their work in a gallery, and both sides can add before and after photos
          to a confirmed booking.
        </p>
        <p>
          Use JPEG, PNG or WebP files up to 8 MB. Every picture is re-encoded with its location and camera data
          removed, and only the people who need it can see it.
        </p>
      </>
    ),
  },
  {
    id: "faq-ratings",
    question: "How are ratings calculated?",
    keywords: "rating reviews stars new genuine",
    answer: (
      <p>
        Ratings come only from genuine reviews that customers leave after a completed booking. A mechanic without any
        shows &ldquo;New&rdquo;. Sample reviews included with the pilot are never counted.
      </p>
    ),
  },
  {
    id: "faq-safety",
    question: "Why do brake and suspension requests reach fewer mechanics?",
    keywords: "brakes suspension safety critical approved",
    answer: (
      <p>
        Brakes and suspension are safety-critical. Requests in these categories only go to mechanics an admin has
        specifically approved for that work. If no approved mechanic covers your area, the request page says so
        instead of sending it to someone who is not approved.
      </p>
    ),
  },
  {
    id: "faq-code-read",
    question: "Is a check-engine-light code read a full diagnosis?",
    keywords: "check engine light obd code scan diagnosis",
    answer: (
      <p>
        No. In a code read, a mechanic reads the stored trouble codes with a scan tool and explains what they generally
        point to. Codes point to a system, not always to the failed part, so you may still need a diagnostic visit.
      </p>
    ),
  },
  {
    id: "faq-no-match",
    question: "What happens if no mechanic is matched?",
    keywords: "no match nobody notified zero",
    answer: (
      <p>
        Your request page says that no mechanics were notified; it never shows a made-up number. An admin can see why
        each mechanic did not match and follow up.
      </p>
    ),
  },
  {
    id: "faq-cancel",
    question: "Can I cancel a request or a reservation?",
    keywords: "cancel withdraw stop request reservation",
    answer: (
      <p>
        Yes. You can cancel an open or quoted request (mechanics who quoted are told), and a reservation that is still
        pending payment. Mechanics can withdraw a quote until you select it.
      </p>
    ),
  },
  {
    id: "faq-mechanic",
    question: "How do I join as a mechanic?",
    keywords: "mechanic apply join signup approval documents insurance",
    answer: (
      <p>
        <Link href="/signup?role=mechanic">Sign up as a mechanic</Link>, complete your application (services, makes,
        service area, availability) and upload your ID and insurance documents. An admin reviews it; once approved,
        matching jobs appear on your job board.
      </p>
    ),
  },
  {
    id: "faq-email",
    question: "Will I get emails?",
    keywords: "email notifications bell updates",
    answer: (
      <p>
        Updates appear in the app under notifications (the bell icon). During the pilot, emails are captured inside the
        app for admins instead of being sent over the internet.
      </p>
    ),
  },
];

const journey: ReadonlyArray<{ title: string; body: string; status?: "soon" }> = [
  { title: "Request", body: "You describe the problem; matching approved mechanics are notified." },
  { title: "Quotes", body: "Mechanics send itemized quotes you can compare." },
  { title: "Reserve", body: "You select one; the reservation is held as pending payment." },
  { title: "Confirm and pay", body: "Payment confirms the booking and shares contact details.", status: "soon" },
];

function PaymentsSection() {
  return (
    <Section
      id="payments"
      title="Quotes and payments"
      description="How a quote becomes a booking, and what the price breakdown shows."
    >
      <Callout tone="info" title="Online payments are coming soon" icon={<CreditCard />}>
        <p>
          Checkout is not open yet. No card details are collected, nothing is charged, and no payouts or refunds are
          made. Selected quotes are held as reservations with the status pending payment.
        </p>
      </Callout>
      <ol className="relative grid gap-3 sm:grid-cols-4">
        <span
          aria-hidden="true"
          className="absolute top-5 right-[12%] left-[12%] hidden h-px bg-linear-to-r from-neon-cyan via-neon-blue to-neon-violet/30 sm:block"
        />
        {journey.map((step, index) => (
          <li key={step.title} className="relative flex gap-3 sm:flex-col sm:items-center sm:text-center">
            <span
              aria-hidden="true"
              className={
                step.status === "soon"
                  ? "relative grid size-10 shrink-0 place-items-center rounded-full border border-dashed border-neon-violet/60 bg-canvas font-mono text-sm font-semibold text-neon-violet"
                  : "relative grid size-10 shrink-0 place-items-center rounded-full bg-linear-to-br from-neon-cyan to-neon-blue font-mono text-sm font-semibold text-on-brand shadow-glow-sm"
              }
            >
              {index + 1}
            </span>
            <div className="min-w-0 space-y-1">
              <p className="flex flex-wrap items-center gap-2 font-semibold text-fg sm:justify-center">
                {step.title}
                {step.status === "soon" ? <Badge tone="info">Coming soon</Badge> : null}
              </p>
              <p className="text-sm text-fg-muted">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="glass-lite rounded-2xl p-5">
          <h3 className="font-display font-semibold text-fg">What the breakdown shows</h3>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-fg-muted marker:text-neon-cyan">
            <li>Labor, parts, taxes and fees as separate lines, and the total.</li>
            <li>The platform fee, provisionally 10% of the labor price, included in the total (not added on top).</li>
            <li>The time slot and the consent you gave, with timestamps.</li>
          </ul>
        </div>
        <div className="glass-lite rounded-2xl p-5">
          <h3 className="font-display font-semibold text-fg">Waiting for online payments</h3>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-fg-muted marker:text-neon-violet">
            <li>Paying for a reservation, so it stays &ldquo;pending payment&rdquo;.</li>
            <li>Sharing contact details for new reservations.</li>
            <li>Paying for approved change orders, refunds and mechanic payouts.</li>
          </ul>
        </div>
      </div>
    </Section>
  );
}

function DraftBadge() {
  return <Badge tone="warning">Draft for the pilot</Badge>;
}

function LegalItem({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex gap-4">
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-fg/[0.04] text-neon-cyan [&_svg]:size-[1.125rem]"
      >
        {icon}
      </span>
      <div className="min-w-0 space-y-1">
        <h3 className="font-semibold text-fg">{title}</h3>
        <p className="text-fg-muted">{children}</p>
      </div>
    </div>
  );
}

function PrivacySection() {
  return (
    <Section id="privacy" title="Privacy notice" actions={<DraftBadge />}>
      <p className="text-sm text-fg-subtle">
        A draft written for the pilot. It is not legal advice and will be reviewed before a public launch.
      </p>
      <div className="glass-lite space-y-6 rounded-2xl p-5 sm:p-6">
        <LegalItem title="What is stored" icon={<FileText />}>
          Account details, repair requests, quotes, uploaded pictures and activity logs, stored by the service running
          this pilot.
        </LegalItem>
        <LegalItem title="Photos, video and documents" icon={<Camera />}>
          Pictures are re-encoded with their location and camera data removed. Request videos stay private until a
          booking is confirmed. Mechanic ID and insurance documents are visible only to that mechanic and to admins, and
          every admin view is logged.
        </LegalItem>
        <LegalItem title="Locations" icon={<MapPinned />}>
          Maps and distances use approximate ZIP code areas. Exact addresses are never shown on a map.
        </LegalItem>
        <LegalItem title="Contact details" icon={<ShieldCheck />}>
          Phone numbers, email addresses and exact addresses are shared with the other party only after a confirmed
          booking. Admins can reveal them when needed to run the service, and each reveal is recorded in the audit log.
        </LegalItem>
        <LegalItem title="Email" icon={<ScrollText />}>
          During the pilot, emails are captured inside the app and are not sent.
        </LegalItem>
      </div>
    </Section>
  );
}

function TermsSection() {
  return (
    <Section id="terms" title="Terms" actions={<DraftBadge />}>
      <p className="text-sm text-fg-subtle">
        A draft written for the pilot. Final terms of service, mechanic terms, and cancellation and refund policies
        will be written and reviewed before a public launch.
      </p>
      <div className="glass-lite space-y-6 rounded-2xl p-5 sm:p-6">
        <LegalItem title="The pilot" icon={<Rocket />}>
          WrenchMatch is in a pilot. It connects customers with independent mechanics; WrenchMatch itself does not
          perform repairs.
        </LegalItem>
        <LegalItem title="Quotes and extra work" icon={<FileText />}>
          Mechanics set their own prices. A quote commits the mechanic to its scope and time slot until it expires.
          Extra work needs the customer&rsquo;s approval through a change order before it is done.
        </LegalItem>
        <LegalItem title="Payments" icon={<CreditCard />}>
          Online payments are coming soon. Until then no charges, refunds or payouts take place through WrenchMatch.
        </LegalItem>
        <LegalItem title="Accounts" icon={<BadgeCheck />}>
          Keep your login details private. Mechanics are approved by an admin before they receive jobs, and accounts
          that break the rules can be suspended.
        </LegalItem>
      </div>
    </Section>
  );
}

function StillNeedHelp() {
  return (
    <section
      aria-labelledby="still-need-help"
      className="glass relative isolate overflow-hidden rounded-3xl p-6 text-center sm:p-10"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 opacity-70">
        <div className="aurora size-full" />
      </div>
      <span
        aria-hidden="true"
        className="mx-auto grid size-12 place-items-center rounded-2xl bg-linear-to-br from-neon-cyan to-neon-violet text-on-brand shadow-glow"
      >
        <LifeBuoy className="size-6" />
      </span>
      <h2 id="still-need-help" className="mt-4 font-display text-2xl font-semibold tracking-tight text-fg">
        Still need help?
      </h2>
      <p className="mx-auto mt-2 max-w-md text-fg-muted">
        Signed-in customers and mechanics can open a help request, optionally about a specific request or booking.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/support" trailingIcon={<ArrowRight />}>
          Contact support
        </ButtonLink>
        <ButtonLink href="/" variant="secondary">
          Back to home
        </ButtonLink>
      </div>
    </section>
  );
}
