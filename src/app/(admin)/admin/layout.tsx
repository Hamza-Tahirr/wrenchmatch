import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ParallaxLayer, ParallaxScene } from "@/components/parallax";
import { requireRoleForSubtree } from "@/server/auth/viewer";

import { AdminNav } from "./_components/admin-nav";
import { adminPage } from "./_lib/page-context";

export const metadata: Metadata = {
  title: { template: "%s · Admin · WrenchMatch", default: "Admin · WrenchMatch" },
  robots: { index: false, follow: false },
};

/**
 * The admin area's frame: the operations console navigation (confirmation toasts use the
 * app-wide Toaster in the root layout). The role check runs here, before the pages' loading
 * states stream, so signed-out visitors get a real redirect to log in and back to the exact
 * page (the path comes from src/proxy.ts) and other roles a real redirect to the
 * access-denied page. Layouts are not a security boundary: every admin page, Server Action
 * and domain function still checks the role itself.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireRoleForSubtree("admin", "/admin");
  const { shell } = await adminPage("/admin");
  return (
    <div className="relative isolate">
      {/* Decorative backdrop: a faint console grid and an aurora glow that drift slower than the
          page as it scrolls (transforms only; still under reduced motion). */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[30rem] overflow-hidden">
        <ParallaxScene anchor="top" distance={180} className="h-full">
          <ParallaxLayer depth={0.3}>
            <div className="aurora h-72 opacity-45" />
          </ParallaxLayer>
          <ParallaxLayer depth={0.55}>
            <div className="grid-bg h-full opacity-70" />
          </ParallaxLayer>
        </ParallaxScene>
      </div>
      <div className="mx-auto w-full max-w-[88rem] px-4 py-6 sm:px-6 sm:py-8 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8 lg:px-8 lg:py-10 xl:gap-10">
        <AdminNav counts={shell.counts} />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
