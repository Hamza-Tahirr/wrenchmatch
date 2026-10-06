import type { Metadata } from "next";

import { Benefits } from "./_landing/benefits";
import { ClosingCta } from "./_landing/closing-cta";
import { Coverage } from "./_landing/coverage";
import { FaqTeaser } from "./_landing/faq-teaser";
import { ForMechanics } from "./_landing/for-mechanics";
import { Hero } from "./_landing/hero";
import { HowItWorks } from "./_landing/how-it-works";
import { MediaFeature } from "./_landing/media-feature";
import { MobileCta } from "./_landing/mobile-cta";
import { Safety } from "./_landing/safety";
import { TrustStrip } from "./_landing/trust-strip";

const TITLE = "WrenchMatch · Itemized car repair quotes from approved mechanics";
const DESCRIPTION =
  "Describe a car problem, add photos or a short video, and compare itemized quotes from approved local mechanics. Now piloting in select ZIP codes; online payments are coming soon.";

// Origin for the absolute social-card URLs: the production domain when built on Vercel (a system
// environment variable), this computer otherwise.
const SITE_ORIGIN = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "WrenchMatch",
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: "/images/og.png",
        width: 1200,
        height: 630,
        alt: "WrenchMatch: a mobile mechanic's van and an electric car on a glowing city map, with an example itemized quote.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/images/og.png"],
  },
};

export default function LandingPage() {
  return (
    <>
      <Hero />
      <TrustStrip />
      <HowItWorks />
      <Benefits />
      <Coverage />
      <ForMechanics />
      <Safety />
      <MediaFeature />
      <FaqTeaser />
      <ClosingCta />
      <MobileCta />
    </>
  );
}
