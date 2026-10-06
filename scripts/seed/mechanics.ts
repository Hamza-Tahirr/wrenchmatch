// Mechanics apply and an admin reviews them, through the same domain commands the app uses:
// submitApplication (profile, private details, services, makes, availability, documents,
// profile photo), then reviewDocument, setSafetyApproval and setMechanicStatus. So every
// notification, dev-mailbox email and audit event of those steps is genuine.
import { addDaysToDate } from "@/lib/time";
import { setMechanicStatus } from "@/server/admin/mechanic-status";
import { reviewDocument, setSafetyApproval } from "@/server/admin/mechanic-review";
import { addMinutes } from "@/server/clock";
import type { Viewer } from "@/server/context";
import { submitApplication, type SubmitApplicationResult } from "@/server/mechanic/application";
import type { ApplicationUploads } from "@/server/mechanic/uploads";

import { EMAIL } from "./accounts";
import { idDocument, insuranceCertificate, monogramPicture, samplePdf } from "./images";
import { MECHANIC_PLANS, type MechanicPlan } from "./mechanic-plans";
import type { SeedAccounts, SeedRun } from "./types";

/** Sign-up time of each mechanic account: shortly before they applied. */
export function mechanicSignupTimes(run: Pick<SeedRun, "clock">): Record<string, Date> {
  return Object.fromEntries(
    MECHANIC_PLANS.map((plan) => [plan.email, addMinutes(run.clock.resolve(plan.appliedAt), -35)]),
  );
}

function slug(displayName: string): string {
  return displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function prepareUploads(plan: MechanicPlan, insuranceExpiresOn: string): Promise<ApplicationUploads> {
  const name = slug(plan.application.displayName);
  const [photo, idDoc, insurance, certification] = await Promise.all([
    monogramPicture(plan.avatar, "mechanic_profile_photo", `${name}-profile.png`),
    idDocument({
      fullName: plan.application.legalName,
      documentNumber: plan.idDocumentNumber,
      expiresOn: addDaysToDate(insuranceExpiresOn, 1460),
      fileName: `${name}-photo-id.png`,
      blurred: plan.idDocumentBlurred,
    }),
    insuranceCertificate({
      insuredName: plan.application.businessName ?? plan.application.legalName,
      provider: plan.application.insuranceProvider,
      policyNumber: plan.application.insurancePolicyNumber,
      effectiveOn: addDaysToDate(insuranceExpiresOn, -365),
      expiresOn: insuranceExpiresOn,
      fileName: `${name}-insurance-certificate.png`,
    }),
    plan.certificationPdf ? samplePdf({ lines: plan.certificationPdf, fileName: `${name}-training-record.pdf` }) : null,
  ]);
  return {
    profilePhoto: photo,
    idDocument: idDoc,
    insuranceDocument: insurance,
    certificationDocs: certification ? [certification] : [],
  };
}

/** The admin's decisions, a few minutes apart, as the review plan says. */
async function review(
  run: SeedRun,
  admin: Viewer,
  mechanic: Viewer,
  plan: MechanicPlan,
  application: SubmitApplicationResult,
): Promise<void> {
  const decision = plan.review;
  if (decision.outcome === "pending") return;

  let at = run.clock.resolve(decision.outcome === "approved" ? decision.at : decision.reviewStartedAt);
  const next = () => {
    const ctx = run.ctxAt(at);
    at = addMinutes(at, 4);
    return ctx;
  };

  if (decision.outcome === "approved") {
    for (const documentId of application.documentIds) {
      await reviewDocument(next(), admin, { documentId, status: "verified", note: null });
    }
    for (const approval of decision.safetyApprovals) {
      await setSafetyApproval(next(), admin, {
        mechanicId: mechanic.id,
        categoryId: approval.categoryId,
        approved: true,
        reason: approval.reason,
      });
    }
    await setMechanicStatus(next(), admin, { mechanicId: mechanic.id, status: "approved", reason: decision.note ?? null });
    if (decision.suspended) {
      await setMechanicStatus(run.ctxAt(run.clock.resolve(decision.suspended.at)), admin, {
        mechanicId: mechanic.id,
        status: "suspended",
        reason: decision.suspended.reason,
      });
    }
    return;
  }

  const [idDocumentId, insuranceDocumentId] = application.documentIds;
  await setMechanicStatus(next(), admin, { mechanicId: mechanic.id, status: "under_review", reason: null });
  at = run.clock.resolve(decision.at);
  await reviewDocument(next(), admin, { documentId: idDocumentId, status: "rejected", note: decision.idDocumentNote });
  await reviewDocument(next(), admin, {
    documentId: insuranceDocumentId,
    status: "rejected",
    note: decision.insuranceDocumentNote,
  });
  await setMechanicStatus(next(), admin, { mechanicId: mechanic.id, status: "rejected", reason: decision.reason });
}

/**
 * Every mechanic applies (oldest first) with generated documents marked SAMPLE and a profile
 * photo, then the admin verifies, approves, suspends or rejects as planned. Alex's
 * application stays pending.
 */
export async function seedMechanics(run: SeedRun, accounts: SeedAccounts): Promise<void> {
  const admin = accounts.viewer(EMAIL.admin);
  const plans = [...MECHANIC_PLANS].sort(
    (a, b) => run.clock.resolve(a.appliedAt).getTime() - run.clock.resolve(b.appliedAt).getTime(),
  );
  // sharp is slow per image but parallelizes well: prepare every file before the commands.
  const uploads = await Promise.all(plans.map((plan) => prepareUploads(plan, plan.insuranceExpiresOn(run.clock))));

  const outcomes: string[] = [];
  for (const [index, plan] of plans.entries()) {
    const mechanic = accounts.viewer(plan.email);
    const application = await submitApplication(
      run.ctxAt(run.clock.resolve(plan.appliedAt)),
      mechanic,
      { ...plan.application, insuranceExpiresOn: plan.insuranceExpiresOn(run.clock), acceptedTerms: true },
      uploads[index],
    );
    await review(run, admin, mechanic, plan, application);
    const outcome = plan.review.outcome === "approved" && plan.review.suspended ? "suspended" : plan.review.outcome;
    outcomes.push(`${plan.application.displayName} (${outcome})`);
  }
  run.log(`Mechanics: ${outcomes.join(", ")}.`);
}
