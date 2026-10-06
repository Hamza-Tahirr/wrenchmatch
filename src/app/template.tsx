import type { ReactNode } from "react";

import { PageTransition } from "@/components/motion/page-transition";

// Page transition: the content fades and lifts in after client-side navigations.
export default function Template({ children }: { children: ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
