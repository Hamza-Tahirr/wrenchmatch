import type { ReactNode } from "react";

import { AuthArt } from "@/components/illustrations";
import { PointerTracker } from "@/components/parallax";
import { cn } from "@/lib/cn";
import styles from "./auth-shell.module.css";

type AuthShellProps = {
  /** Short line over the art on large screens. */
  artEyebrow: string;
  artTitle: string;
  artBody: string;
  children: ReactNode;
};

/**
 * Split auth layout: animated AuthArt on the left (pinned while the form column scrolls on
 * large screens, a cropped banner on phones) and the form column on the right. The art
 * follows the mouse in depth layers and stays still under reduced motion. The art is always
 * a night scene, so its overlay text keeps light colours in both themes; in the light theme
 * the panel becomes a rounded window (see auth-shell.module.css).
 */
export function AuthShell({ artEyebrow, artTitle, artBody, children }: AuthShellProps) {
  return (
    <div className="relative lg:grid lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-start xl:grid-cols-[minmax(0,0.6fr)_minmax(0,1.4fr)]">
      <div aria-hidden="true" className={styles.art}>
        <PointerTracker className="absolute inset-0">
          <div className="absolute top-1/2 left-1/2 w-[max(100cqw,80cqh)] -translate-x-1/2 -translate-y-1/2 lg:top-[43%]">
            <AuthArt decorative className="w-full" />
          </div>
        </PointerTracker>
        <div className={cn(styles.fade, "pointer-events-none absolute inset-0")} />
        <div className="absolute inset-x-0 bottom-0 hidden p-8 lg:block xl:p-10">
          <p className="font-mono text-xs font-semibold tracking-[0.24em] text-[#5ee6f7] uppercase">{artEyebrow}</p>
          <p className="mt-3 font-display text-[1.75rem] leading-tight font-semibold tracking-tight text-balance text-[#f2f6ff]">{artTitle}</p>
          <p className="mt-2 max-w-sm text-[0.95rem]/6 text-[#bcc6e4]">{artBody}</p>
        </div>
      </div>
      <div className="relative px-4 pt-7 pb-16 sm:px-6 sm:pt-12 lg:px-10 lg:pt-14 xl:px-14">{children}</div>
    </div>
  );
}
