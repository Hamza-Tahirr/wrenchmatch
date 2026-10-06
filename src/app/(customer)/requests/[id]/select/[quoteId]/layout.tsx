import type { ReactNode } from "react";

import { requireRoleForSubtree } from "@/server/auth/viewer";
import { createAppContext } from "@/server/context";
import { assertOwnQuote } from "@/server/customer/ownership";

import { loadOr404, recordIdOr404 } from "../../../../_lib/load";

/** A real 404 for a quote that isn't on one of the viewer's requests, before the page streams. */
export default async function SelectQuoteLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string; quoteId: string }>;
}) {
  const raw = await params;
  const requestId = recordIdOr404(raw.id);
  const quoteId = recordIdOr404(raw.quoteId);
  const viewer = await requireRoleForSubtree("customer", `/requests/${requestId}/select/${quoteId}`);
  await loadOr404(() => assertOwnQuote(createAppContext(), viewer, { requestId, quoteId }));
  return children;
}
