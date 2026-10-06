// The sample mechanics: application details (fictional people and businesses, 555-01xx phone
// numbers, @example.com emails, sample insurers, self-reported certifications) and what the
// admin decided. Seed data only. Bases are spread across the Phoenix metro so matching shows
// every outcome: see docs/DEMO_DATA.md for which mechanic each request reaches and why the
// others don't.
import type { VehicleMake } from "@/lib/domain";
import type { AvailabilityWindowInput, MechanicApplicationCommand } from "@/lib/validation/mechanic";

import { EMAIL, type SampleEmail } from "./accounts";
import type { AvatarPalette } from "./art/portraits";
import type { SeedClock, SeedTime } from "./clock";
import type { PdfLine } from "./images";

export type SafetyApprovalPlan = { categoryId: "brake_work" | "suspension_work"; reason: string };

export type ReviewPlan =
  | {
      outcome: "approved";
      at: SeedTime;
      safetyApprovals: readonly SafetyApprovalPlan[];
      /** Shown to the mechanic with the approval. */
      note?: string;
      suspended?: { at: SeedTime; reason: string };
    }
  | {
      outcome: "rejected";
      reviewStartedAt: SeedTime;
      at: SeedTime;
      idDocumentNote: string;
      insuranceDocumentNote: string;
      reason: string;
    }
  | { outcome: "pending" };

export type MechanicPlan = {
  email: SampleEmail;
  appliedAt: SeedTime;
  application: Omit<MechanicApplicationCommand, "insuranceExpiresOn" | "acceptedTerms">;
  insuranceExpiresOn: (clock: SeedClock) => string;
  avatar: { initials: string; palette: AvatarPalette };
  idDocumentNumber: string;
  /** Render the photo ID out of focus (it gets rejected as unreadable). */
  idDocumentBlurred?: boolean;
  /** An optional certification document, uploaded as a tiny PDF. */
  certificationPdf?: readonly PdfLine[];
  review: ReviewPlan;
};

const MONDAY_TO_FRIDAY = [1, 2, 3, 4, 5] as const;

function minutes(time: string): number {
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + mins;
}

/** Weekly windows on `weekdays` (0 = Sunday), local time "HH:mm"-"HH:mm". */
function on(weekdays: readonly number[], start: string, end: string): AvailabilityWindowInput[] {
  return weekdays.map((weekday) => ({ weekday, startMinute: minutes(start), endMinute: minutes(end) }));
}

const JAPANESE_AND_KOREAN: VehicleMake[] = [
  "Acura",
  "Honda",
  "Hyundai",
  "Infiniti",
  "Kia",
  "Lexus",
  "Mazda",
  "Mitsubishi",
  "Nissan",
  "Subaru",
  "Toyota",
];

const DOMESTIC: VehicleMake[] = ["Buick", "Cadillac", "Chevrolet", "Chrysler", "Dodge", "Ford", "GMC", "Jeep", "Lincoln", "Ram"];

export const MECHANIC_PLANS: readonly MechanicPlan[] = [
  {
    email: EMAIL.sam,
    appliedAt: { day: -300, time: "11:20" },
    application: {
      displayName: "Sam's Garage",
      legalName: "Samuel Ortega",
      businessName: "Sam's Garage LLC",
      phone: "480-555-0118",
      contactEmail: "bookings.samsgarage@example.com",
      bio: "Family-run two-bay garage in Mesa. Brakes, suspension and maintenance; we show you the worn parts before replacing anything.",
      baseZip: "85201",
      travelRadiusMiles: 10,
      serviceMode: "garage",
      garageAddress: { line1: "845 E Quartzite Wash Rd, Unit B", city: "Mesa", state: "AZ", zip: "85201" },
      yearsExperience: 22,
      certifications: "ASE Master Automobile Technician, A4 Suspension & Steering, A5 Brakes (self-reported)",
      insuranceProvider: "Saguaro Ridge Casualty (sample)",
      insurancePolicyNumber: "SMPL-GP-200417",
      services: [
        "diagnostic_visit",
        "cel_code_read",
        "oil_change",
        "filters",
        "basic_maintenance",
        "minor_engine_sensor",
        "brake_work",
        "suspension_work",
      ],
      allMakes: true,
      makes: [],
      windows: [...on(MONDAY_TO_FRIDAY, "07:00", "17:30"), ...on([6], "08:00", "12:00")],
    },
    insuranceExpiresOn: (clock) => clock.date(210),
    avatar: { initials: "SG", palette: "copper" },
    idDocumentNumber: "SMPL-ID-1003",
    review: {
      outcome: "approved",
      at: { day: -296, time: "10:05" },
      safetyApprovals: [
        { categoryId: "brake_work", reason: "Shop brake work for 20+ years; brake certification and shop references checked." },
        { categoryId: "suspension_work", reason: "Suspension and steering certification checked with the shop's references." },
      ],
    },
  },
  {
    email: EMAIL.marco,
    appliedAt: { day: -240, time: "18:40" },
    application: {
      displayName: "Marco R.",
      legalName: "Marco Reyes",
      businessName: "Reyes Mobile Auto LLC",
      phone: "480-555-0142",
      contactEmail: "marco.reyes.auto@example.com",
      bio: "Mobile mechanic with a small shop in Tempe. I explain what I find before fixing anything and hand you the old parts.",
      baseZip: "85282",
      travelRadiusMiles: 15,
      serviceMode: "both",
      garageAddress: { line1: "2150 W Ironwood Spur Dr, Bay 4", city: "Tempe", state: "AZ", zip: "85282" },
      yearsExperience: 12,
      certifications: "ASE A5 Brakes, A6 Electrical, A8 Engine Performance (self-reported)",
      insuranceProvider: "Copper Mesa Mutual (sample)",
      insurancePolicyNumber: "SMPL-GL-482150",
      services: [
        "diagnostic_visit",
        "cel_code_read",
        "battery_replacement",
        "battery_no_start",
        "oil_change",
        "filters",
        "bulbs",
        "wipers",
        "basic_maintenance",
        "minor_engine_sensor",
        "brake_work",
      ],
      allMakes: true,
      makes: [],
      windows: [...on(MONDAY_TO_FRIDAY, "07:30", "18:00"), ...on([6], "08:00", "14:00"), ...on([0], "10:00", "14:00")],
    },
    insuranceExpiresOn: (clock) => clock.date(290),
    avatar: { initials: "MR", palette: "cyan" },
    idDocumentNumber: "SMPL-ID-1001",
    review: {
      outcome: "approved",
      at: { day: -237, time: "09:40" },
      safetyApprovals: [{ categoryId: "brake_work", reason: "Twelve years of brake work; brake certification and two customer references checked." }],
    },
  },
  {
    email: EMAIL.priya,
    appliedAt: { day: -180, time: "21:10" },
    application: {
      displayName: "Priya S.",
      legalName: "Priya Shah",
      businessName: null,
      phone: "602-555-0167",
      contactEmail: "priya.shah.mobile@example.com",
      bio: "Mobile mechanic covering central Phoenix, Tempe and Chandler. Japanese and Korean makes are my specialty.",
      baseZip: "85016",
      travelRadiusMiles: 20,
      serviceMode: "mobile",
      garageAddress: null,
      yearsExperience: 8,
      certifications: "ASE A1 Engine Repair, A5 Brakes (self-reported)",
      insuranceProvider: "Ocotillo Indemnity (sample)",
      insurancePolicyNumber: "SMPL-GL-516720",
      services: [
        "diagnostic_visit",
        "cel_code_read",
        "battery_replacement",
        "battery_no_start",
        "oil_change",
        "filters",
        "minor_engine_sensor",
        "brake_work",
      ],
      allMakes: false,
      makes: JAPANESE_AND_KOREAN,
      windows: [
        ...on(MONDAY_TO_FRIDAY, "08:00", "12:00"),
        ...on(MONDAY_TO_FRIDAY, "13:00", "17:00"),
        ...on([6], "09:00", "13:00"),
      ],
    },
    // Renewal due soon: shows in the admin's "insurance expiring within 30 days" list.
    insuranceExpiresOn: (clock) => clock.date(24),
    avatar: { initials: "PS", palette: "violet" },
    idDocumentNumber: "SMPL-ID-1002",
    review: {
      outcome: "approved",
      at: { day: -178, time: "14:15" },
      safetyApprovals: [{ categoryId: "brake_work", reason: "Brake certification and references checked." }],
    },
  },
  {
    email: EMAIL.jordan,
    appliedAt: { day: -75, time: "19:55" },
    application: {
      displayName: "Jordan T.",
      legalName: "Jordan Tran",
      businessName: null,
      phone: "602-555-0153",
      contactEmail: "jordan.tran.mobile@example.com",
      bio: "Evening and weekend mobile mechanic based in central Phoenix. Batteries, fluids and routine maintenance.",
      baseZip: "85012",
      travelRadiusMiles: 20,
      serviceMode: "mobile",
      garageAddress: null,
      yearsExperience: 4,
      certifications: "ASE G1 Maintenance & Light Repair (self-reported)",
      insuranceProvider: "Copper Mesa Mutual (sample)",
      insurancePolicyNumber: "SMPL-GL-733081",
      services: [
        "cel_code_read",
        "battery_replacement",
        "battery_no_start",
        "oil_change",
        "filters",
        "bulbs",
        "wipers",
        "basic_maintenance",
        "brake_work",
      ],
      allMakes: false,
      makes: ["Chevrolet", "Chrysler", "Dodge", "Ford", "GMC", "Honda", "Jeep", "Nissan", "Ram", "Subaru", "Toyota"],
      windows: [...on(MONDAY_TO_FRIDAY, "15:00", "20:00"), ...on([6], "08:00", "16:00"), ...on([0], "10:00", "16:00")],
    },
    insuranceExpiresOn: (clock) => clock.date(150),
    avatar: { initials: "JT", palette: "blue" },
    idDocumentNumber: "SMPL-ID-1004",
    review: {
      outcome: "approved",
      at: { day: -72, time: "11:30" },
      // Brake work is listed but deliberately not safety-approved.
      safetyApprovals: [],
      note: "Approved for maintenance and battery work. Brake work stays unapproved until you can show brake-specific experience.",
    },
  },
  {
    email: EMAIL.morgan,
    appliedAt: { day: -399, time: "08:50" },
    application: {
      displayName: "Morgan L.",
      legalName: "Morgan Lee",
      businessName: null,
      phone: "480-555-0136",
      contactEmail: "morgan.lee.auto@example.com",
      bio: "Mobile engine-performance and electrical work around Tempe and Chandler.",
      baseZip: "85283",
      travelRadiusMiles: 15,
      serviceMode: "mobile",
      garageAddress: null,
      yearsExperience: 9,
      certifications: "ASE A8 Engine Performance (self-reported)",
      insuranceProvider: "Ocotillo Indemnity (sample)",
      insurancePolicyNumber: "SMPL-GL-390552",
      services: ["diagnostic_visit", "cel_code_read", "battery_replacement", "battery_no_start", "oil_change", "minor_engine_sensor"],
      allMakes: true,
      makes: [],
      windows: on(MONDAY_TO_FRIDAY, "08:00", "17:00"),
    },
    // Expired last month: still approved, but matching leaves Morgan out (insurance_expired).
    insuranceExpiresOn: (clock) => clock.sameDayLastMonth(),
    avatar: { initials: "ML", palette: "amber" },
    idDocumentNumber: "SMPL-ID-1005",
    review: { outcome: "approved", at: { day: -396, time: "15:20" }, safetyApprovals: [] },
  },
  {
    email: EMAIL.taylor,
    appliedAt: { day: -150, time: "07:45" },
    application: {
      displayName: "Taylor M.",
      legalName: "Taylor Mason",
      businessName: null,
      phone: "480-555-0181",
      contactEmail: "taylor.mason.mobile@example.com",
      bio: "Mobile maintenance in Scottsdale and Tempe.",
      baseZip: "85257",
      travelRadiusMiles: 20,
      serviceMode: "mobile",
      garageAddress: null,
      yearsExperience: 6,
      certifications: "ASE G1 Maintenance & Light Repair (self-reported)",
      insuranceProvider: "Desert Lantern Insurance (sample)",
      insurancePolicyNumber: "SMPL-GL-611904",
      services: ["battery_replacement", "battery_no_start", "oil_change", "filters", "bulbs", "wipers", "basic_maintenance"],
      allMakes: false,
      makes: ["Chevrolet", "Ford", "Honda", "Hyundai", "Kia", "Toyota"],
      windows: on([1, 2, 3, 4, 5, 6], "08:00", "18:00"),
    },
    insuranceExpiresOn: (clock) => clock.date(120),
    avatar: { initials: "TM", palette: "sky" },
    idDocumentNumber: "SMPL-ID-1006",
    review: {
      outcome: "approved",
      at: { day: -147, time: "10:50" },
      safetyApprovals: [],
      suspended: {
        at: { day: -9, time: "14:20" },
        reason: "Several customers reported quotes withdrawn at the last minute. Suspended while we review the reports with you.",
      },
    },
  },
  {
    email: EMAIL.casey,
    appliedAt: { day: -28, time: "10:30" },
    application: {
      displayName: "Casey D.",
      legalName: "Casey Diaz",
      businessName: null,
      phone: "623-555-0129",
      contactEmail: "casey.diaz.auto@example.com",
      bio: "Weekend mobile oil changes, wipers and bulbs in the West Valley.",
      baseZip: "85302",
      travelRadiusMiles: 15,
      serviceMode: "mobile",
      garageAddress: null,
      yearsExperience: 1,
      certifications: null,
      insuranceProvider: "Desert Lantern Insurance (sample)",
      insurancePolicyNumber: "SMPL-GL-904418",
      services: ["cel_code_read", "oil_change", "filters", "bulbs", "wipers"],
      allMakes: false,
      makes: ["Honda", "Nissan", "Toyota"],
      windows: on([0, 6], "08:00", "17:00"),
    },
    insuranceExpiresOn: (clock) => clock.date(330),
    avatar: { initials: "CD", palette: "rose" },
    idDocumentNumber: "SMPL-ID-1007",
    idDocumentBlurred: true,
    review: {
      outcome: "rejected",
      reviewStartedAt: { day: -27, time: "09:30" },
      at: { day: -26, time: "09:10" },
      idDocumentNote: "The photo ID is too blurry to read. Please upload a sharp photo of the whole card.",
      insuranceDocumentNote: "The named insured doesn't match the name on the application.",
      reason: "The photo ID is unreadable and the insurance certificate names someone else. Upload clear, matching documents and resubmit.",
    },
  },
  {
    email: EMAIL.alex,
    // Before every sample request that ran matching, so his evaluations on them aren't anachronistic.
    appliedAt: { day: -9, time: "21:40" },
    application: {
      displayName: "Alex K.",
      legalName: "Alex Kim",
      businessName: null,
      phone: "602-555-0194",
      contactEmail: "alex.kim.mechanic@example.com",
      bio: "Mobile diagnostics and suspension work in north Phoenix.",
      baseZip: "85020",
      travelRadiusMiles: 20,
      serviceMode: "mobile",
      garageAddress: null,
      yearsExperience: 5,
      certifications: "ASE A4 Suspension & Steering, A6 Electrical (self-reported)",
      insuranceProvider: "Copper Mesa Mutual (sample)",
      insurancePolicyNumber: "SMPL-GL-857326",
      services: ["diagnostic_visit", "cel_code_read", "battery_no_start", "minor_engine_sensor", "suspension_work"],
      allMakes: true,
      makes: [],
      windows: [...on(MONDAY_TO_FRIDAY, "16:00", "20:00"), ...on([6], "08:00", "17:00")],
    },
    insuranceExpiresOn: (clock) => clock.date(350),
    avatar: { initials: "AK", palette: "emerald" },
    idDocumentNumber: "SMPL-ID-1008",
    certificationPdf: [
      { text: "SAMPLE - NOT A REAL DOCUMENT", size: 24 },
      { text: "Training record for Alex K., a fictional applicant", size: 14 },
      { text: "Self-reported: ASE A4 Suspension & Steering, A6 Electrical", size: 12 },
      { text: "Not issued, checked or endorsed by ASE or anyone else.", size: 12 },
      { text: "Generated by the WrenchMatch sample-data seed.", size: 12 },
    ],
    review: { outcome: "pending" },
  },
  // ---- Supporting cast: more approved mechanics across the metro ----
  {
    email: EMAIL.rosa,
    appliedAt: { day: -210, time: "07:10" },
    application: {
      displayName: "Rosa M.",
      legalName: "Rosa Medina",
      businessName: "Medina Mobile Service",
      phone: "623-555-0191",
      contactEmail: "rosa.medina.mobile@example.com",
      bio: "Early-start mobile service across Peoria and Glendale: oil and filters, batteries, bulbs and quick diagnostics before your workday begins.",
      baseZip: "85382",
      travelRadiusMiles: 15,
      serviceMode: "mobile",
      garageAddress: null,
      yearsExperience: 7,
      certifications: "ASE G1 Maintenance & Light Repair, A6 Electrical (self-reported)",
      insuranceProvider: "Saguaro Ridge Casualty (sample)",
      insurancePolicyNumber: "SMPL-GL-270318",
      services: [
        "diagnostic_visit",
        "cel_code_read",
        "battery_replacement",
        "battery_no_start",
        "oil_change",
        "filters",
        "bulbs",
        "wipers",
        "basic_maintenance",
      ],
      allMakes: true,
      makes: [],
      windows: on([1, 2, 3, 4, 5, 6], "07:00", "15:00"),
    },
    insuranceExpiresOn: (clock) => clock.date(240),
    avatar: { initials: "RM", palette: "magenta" },
    idDocumentNumber: "SMPL-ID-1009",
    review: { outcome: "approved", at: { day: -207, time: "13:45" }, safetyApprovals: [] },
  },
  {
    email: EMAIL.valley,
    appliedAt: { day: -330, time: "16:05" },
    application: {
      displayName: "Valley Auto Care",
      legalName: "Daniel Okafor",
      businessName: "Valley Auto Care LLC",
      phone: "480-555-0105",
      contactEmail: "frontdesk.valleyautocare@example.com",
      bio: "Three-bay shop in Chandler with a comfortable waiting room. Check-engine lights, brakes and scheduled maintenance, with photos of every finding.",
      baseZip: "85224",
      travelRadiusMiles: 10,
      serviceMode: "garage",
      garageAddress: { line1: "1480 N Copperleaf Commerce Pkwy, Suite 3", city: "Chandler", state: "AZ", zip: "85224" },
      yearsExperience: 15,
      certifications: "ASE A5 Brakes, A8 Engine Performance, L1 Advanced Engine Performance (self-reported)",
      insuranceProvider: "Desert Lantern Insurance (sample)",
      insurancePolicyNumber: "SMPL-GP-118842",
      services: ["diagnostic_visit", "cel_code_read", "minor_engine_sensor", "oil_change", "filters", "basic_maintenance", "bulbs", "brake_work"],
      allMakes: true,
      makes: [],
      windows: [...on(MONDAY_TO_FRIDAY, "07:30", "18:00"), ...on([6], "08:00", "13:00")],
    },
    insuranceExpiresOn: (clock) => clock.date(180),
    avatar: { initials: "VA", palette: "lime" },
    idDocumentNumber: "SMPL-ID-1010",
    review: {
      outcome: "approved",
      at: { day: -326, time: "11:15" },
      safetyApprovals: [{ categoryId: "brake_work", reason: "Shop brake certification checked; brake lathe and lift inspected on a site visit." }],
    },
  },
  {
    email: EMAIL.kenji,
    appliedAt: { day: -120, time: "20:30" },
    application: {
      displayName: "Kenji W.",
      legalName: "Kenji Watanabe",
      businessName: null,
      phone: "480-555-0157",
      contactEmail: "kenji.w.electrical@example.com",
      bio: "Mobile battery and electrical specialist in north Scottsdale: no-starts, charging problems, sensors and lighting. I test before I replace.",
      baseZip: "85260",
      travelRadiusMiles: 16,
      serviceMode: "mobile",
      garageAddress: null,
      yearsExperience: 10,
      certifications: "ASE A6 Electrical/Electronic Systems, A8 Engine Performance (self-reported)",
      insuranceProvider: "Copper Mesa Mutual (sample)",
      insurancePolicyNumber: "SMPL-GL-645509",
      services: ["diagnostic_visit", "cel_code_read", "battery_replacement", "battery_no_start", "minor_engine_sensor", "bulbs"],
      allMakes: true,
      makes: [],
      windows: [...on(MONDAY_TO_FRIDAY, "09:00", "19:00"), ...on([0], "10:00", "15:00")],
    },
    insuranceExpiresOn: (clock) => clock.date(265),
    avatar: { initials: "KW", palette: "sky" },
    idDocumentNumber: "SMPL-ID-1011",
    review: { outcome: "approved", at: { day: -117, time: "10:20" }, safetyApprovals: [] },
  },
  {
    email: EMAIL.elena,
    appliedAt: { day: -160, time: "12:40" },
    application: {
      displayName: "Elena V.",
      legalName: "Elena Vasquez",
      businessName: "Vasquez Auto Works",
      phone: "480-555-0113",
      contactEmail: "elena.vasquez.autoworks@example.com",
      bio: "Brakes and suspension done right, at your home or in my Gilbert bay. Former dealership technician; I send photos of everything I replace.",
      baseZip: "85296",
      travelRadiusMiles: 20,
      serviceMode: "both",
      garageAddress: { line1: "1960 E Desert Finch Dr, Bay 2", city: "Gilbert", state: "AZ", zip: "85296" },
      yearsExperience: 14,
      certifications: "ASE A4 Suspension & Steering, A5 Brakes, G1 Maintenance (self-reported)",
      insuranceProvider: "Saguaro Ridge Casualty (sample)",
      insurancePolicyNumber: "SMPL-GL-381276",
      services: ["diagnostic_visit", "oil_change", "filters", "bulbs", "wipers", "basic_maintenance", "brake_work", "suspension_work"],
      allMakes: true,
      makes: [],
      windows: [...on(MONDAY_TO_FRIDAY, "08:00", "17:00"), ...on([6], "09:00", "14:00")],
    },
    insuranceExpiresOn: (clock) => clock.date(305),
    avatar: { initials: "EV", palette: "rose" },
    idDocumentNumber: "SMPL-ID-1012",
    review: {
      outcome: "approved",
      at: { day: -156, time: "09:50" },
      safetyApprovals: [
        { categoryId: "brake_work", reason: "Dealership brake training record and references checked." },
        { categoryId: "suspension_work", reason: "Suspension and alignment experience confirmed with a former employer." },
      ],
    },
  },
  {
    email: EMAIL.andre,
    appliedAt: { day: -90, time: "06:15" },
    application: {
      displayName: "Andre B.",
      legalName: "Andre Brooks",
      businessName: null,
      phone: "602-555-0122",
      contactEmail: "andre.brooks.mobile@example.com",
      bio: "Early-morning mobile maintenance in Ahwatukee and south Tempe for domestic cars and trucks: oil, filters, wipers, bulbs and batteries.",
      baseZip: "85044",
      travelRadiusMiles: 12,
      serviceMode: "mobile",
      garageAddress: null,
      yearsExperience: 6,
      certifications: "ASE G1 Maintenance & Light Repair (self-reported)",
      insuranceProvider: "Ocotillo Indemnity (sample)",
      insurancePolicyNumber: "SMPL-GL-502981",
      services: ["cel_code_read", "battery_replacement", "oil_change", "filters", "bulbs", "wipers", "basic_maintenance"],
      allMakes: false,
      makes: DOMESTIC,
      windows: [...on(MONDAY_TO_FRIDAY, "06:30", "11:30"), ...on([6], "07:00", "12:00")],
    },
    insuranceExpiresOn: (clock) => clock.date(140),
    avatar: { initials: "AB", palette: "amber" },
    idDocumentNumber: "SMPL-ID-1013",
    review: { outcome: "approved", at: { day: -88, time: "15:40" }, safetyApprovals: [] },
  },
  {
    email: EMAIL.westside,
    appliedAt: { day: -270, time: "09:25" },
    application: {
      displayName: "Westside Garage & Tire",
      legalName: "Min-jun Park",
      businessName: "Westside Garage & Tire LLC",
      phone: "623-555-0144",
      contactEmail: "service.westsidegarage@example.com",
      bio: "Glendale garage for brakes, diagnostics and maintenance. Same-day appointments most weekdays; free brake inspection with any service.",
      baseZip: "85304",
      travelRadiusMiles: 10,
      serviceMode: "garage",
      garageAddress: { line1: "6020 W Pinion Ridge Rd", city: "Glendale", state: "AZ", zip: "85304" },
      yearsExperience: 18,
      certifications: "ASE A5 Brakes, A8 Engine Performance (self-reported)",
      insuranceProvider: "Copper Mesa Mutual (sample)",
      insurancePolicyNumber: "SMPL-GP-930117",
      services: [
        "diagnostic_visit",
        "cel_code_read",
        "minor_engine_sensor",
        "oil_change",
        "filters",
        "basic_maintenance",
        "brake_work",
        "suspension_work",
      ],
      allMakes: true,
      makes: [],
      windows: on([1, 2, 3, 4, 5, 6], "08:00", "18:00"),
    },
    insuranceExpiresOn: (clock) => clock.date(160),
    avatar: { initials: "WG", palette: "emerald" },
    idDocumentNumber: "SMPL-ID-1014",
    review: {
      outcome: "approved",
      at: { day: -266, time: "14:30" },
      // Suspension work is listed but not safety-approved yet.
      safetyApprovals: [{ categoryId: "brake_work", reason: "Shop brake certification checked." }],
      note: "Approved. Suspension work stays unapproved until we have checked your suspension and alignment certification.",
    },
  },
];
