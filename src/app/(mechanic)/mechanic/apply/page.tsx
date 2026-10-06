import { BadgeCheck, CalendarClock, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageContainer } from "@/components/layout/page-container";
import { GlowCard } from "@/components/motion/glow-card";
import { addDaysToDate, todayInZone } from "@/lib/time";
import type { MechanicApplicationFormValues } from "@/lib/validation/mechanic";
import { requireRole } from "@/server/auth/viewer";
import { createAppContext } from "@/server/context";
import { loadMechanicState } from "@/server/mechanic/access";
import { getMechanicFormOptions } from "@/server/mechanic/form-options";

import { MechanicHero } from "../_components/hud";
import { ApplicationForm } from "./_components/application-form";

export const metadata: Metadata = { title: "Mechanic application" };

const DEFAULT_TIME_ZONE = "America/Phoenix";

function initialValues(displayName: string, email: string, limit: number): MechanicApplicationFormValues {
  return {
    displayName: displayName.slice(0, limit),
    legalName: "",
    businessName: "",
    phone: "",
    contactEmail: email,
    bio: "",
    baseZip: "",
    travelRadiusMiles: "15",
    serviceMode: "",
    garageAddressLine1: "",
    garageCity: "",
    garageState: "",
    garageZip: "",
    yearsExperience: "",
    certifications: "",
    insuranceProvider: "",
    insurancePolicyNumber: "",
    insuranceExpiresOn: "",
    services: [],
    allMakes: true,
    makes: [],
    // Monday to Friday, 8 AM to 5 PM: a starting point the applicant adjusts.
    availability: [1, 2, 3, 4, 5].map((weekday) => ({ weekday: String(weekday), start: "08:00", end: "17:00" })),
    acceptTerms: false,
  };
}

const HIGHLIGHTS = [
  { icon: <BadgeCheck />, title: "Reviewed by a person", text: "An admin checks your ID, insurance and experience." },
  { icon: <CalendarClock />, title: "Jobs that fit your week", text: "Requests match your services, makes, area and hours." },
  { icon: <ShieldCheck />, title: "Private until booked", text: "Your phone, email and garage address stay hidden." },
] as const;

export default async function MechanicApplyPage() {
  const viewer = await requireRole("mechanic", "/mechanic/apply");
  const ctx = createAppContext();
  if (await loadMechanicState(ctx.db, viewer.id)) redirect("/mechanic/profile");
  const options = await getMechanicFormOptions(ctx);
  const tomorrow = addDaysToDate(todayInZone(ctx.now, DEFAULT_TIME_ZONE), 1);

  return (
    <PageContainer>
      <MechanicHero
        eyebrow="Mechanic application"
        title="Apply to receive repair jobs"
        description="Tell us how you work. It takes about 10 minutes; have your photo ID and insurance certificate ready (PDF or photo)."
      >
        <ul className="stagger-children grid grid-cols-1 gap-3 sm:grid-cols-3">
          {HIGHLIGHTS.map((item) => (
            <GlowCard as="li" key={item.title} tilt maxTilt={4} className="glass-lite card-hover flex gap-3 rounded-2xl p-4">
              <span
                aria-hidden="true"
                className="grid size-10 shrink-0 place-items-center rounded-xl bg-neon-cyan/10 text-neon-cyan ring-1 ring-neon-cyan/30 shadow-glow-sm [&_svg]:size-5"
              >
                {item.icon}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg">{item.title}</p>
                <p className="mt-0.5 text-sm text-fg-muted">{item.text}</p>
              </div>
            </GlowCard>
          ))}
        </ul>
      </MechanicHero>
      <div className="mt-8">
        <ApplicationForm
          initialValues={initialValues(viewer.displayName, viewer.email, options.limits.displayNameMax)}
          options={options}
          minInsuranceExpiry={tomorrow}
        />
      </div>
    </PageContainer>
  );
}
