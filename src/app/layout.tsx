import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/(public)/login/actions";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { AmbientPauser } from "@/components/motion/ambient-pauser";
import { MotionProvider } from "@/components/motion/motion-provider";
import { NavigationProgress } from "@/components/motion/navigation-progress";
import { parseTheme, THEME_COLORS, THEME_COOKIE, type Theme } from "@/components/theme/theme";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/toast";
import { getViewer } from "@/server/auth/viewer";
import { getHeaderAvatarSrc } from "@/server/media/avatar";
import { createAppContext } from "@/server/context";
import { unreadCount } from "@/server/notifications/queries";
import "./globals.css";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk", display: "swap" });

export const metadata: Metadata = {
  title: {
    template: "%s · WrenchMatch",
    default: "WrenchMatch · Compare local car repair quotes",
  },
  description:
    "Describe a car problem, compare itemized quotes from approved local mechanics and reserve the one that fits. Online payments are coming soon.",
  // A pilot build: keep it out of search engines.
  robots: { index: false, follow: false },
};

/** The theme chosen with the header toggle (cookie `wm_theme`); dark by default. */
async function readTheme(): Promise<Theme> {
  return parseTheme((await cookies()).get(THEME_COOKIE)?.value);
}

export async function generateViewport(): Promise<Viewport> {
  const theme = await readTheme();
  return {
    colorScheme: theme,
    themeColor: THEME_COLORS[theme],
    // Lets pages draw under notches and the home indicator; globals.css pads the body and
    // fixed bars with the safe-area insets.
    viewportFit: "cover",
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The session cookie makes every page render per request, so the header always shows
  // who is signed in and their unread notifications.
  const theme = await readTheme();
  const viewer = await getViewer();
  const unread = viewer ? await unreadCount(createAppContext(), viewer) : 0;
  const avatarSrc = viewer ? await getHeaderAvatarSrc(createAppContext(), viewer) : null;

  return (
    // Browser extensions (translators, dark-mode and grammar tools) add attributes to
    // <html>/<body> before React hydrates; suppress only those top-level attribute warnings.
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable}`}
      data-scroll-behavior="smooth"
      data-theme={theme}
      suppressHydrationWarning
    >
      <body className="flex min-h-dvh flex-col font-sans" suppressHydrationWarning>
        <noscript>
          {/* Without JavaScript, scroll reveals must not hide content. */}
          <style>{"[data-reveal]{opacity:1!important;transform:none!important}"}</style>
        </noscript>
        <a
          href="#main-content"
          className="sr-only rounded-lg bg-elevated px-4 py-2 text-sm font-semibold text-fg shadow-glow focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[80]"
        >
          Skip to content
        </a>
        <ThemeProvider theme={theme}>
          <MotionProvider>
            <NavigationProgress />
            <SiteHeader
              viewer={viewer ? { role: viewer.role, displayName: viewer.displayName, avatarSrc } : null}
              unreadCount={unread}
              logoutAction={viewer ? logoutAction : undefined}
            />
            {/* At least one screen tall (small-viewport units, stable while phone toolbars
              collapse), so the footer starts below the fold and never jumps as content streams in. */}
            <main id="main-content" tabIndex={-1} className="min-h-[calc(100svh-4rem)] flex-1 focus:outline-none">
              {children}
            </main>
            <SiteFooter />
            <Toaster />
            <AmbientPauser />
          </MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
