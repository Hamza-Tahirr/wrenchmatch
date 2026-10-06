// WrenchMatch illustration system: original neon-on-deep-space vector art.
// Every component is a Server Component (pure SVG + CSS loops) and also works inside
// Client Components. See docs/VISUALS.md for the catalogue, sizes and usage.

export type { IllustrationProps } from "./svg-kit";
export type { Tone } from "./palette";
export type { SceneProps } from "./layered-scene";

// Big layered scenes (parallax-ready; `variant="flat"` renders one static <svg>).
export { HeroScene } from "./hero-scene";
export { HowItWorksCompare, HowItWorksDescribe, HowItWorksFixed, HowItWorksMatch } from "./how-it-works";
export { AuthArt, CoverageArt, MechanicsScene, SafetyScene } from "./feature-scenes";

// Spot illustrations (empty, success and error states). viewBox 240 x 180.
export {
  AccessDenied,
  ApproximateAreaArt,
  MobileServiceArt,
  NoBookings,
  NoJobs,
  NoNotifications,
  NoQuotes,
  NoRequests,
  NoResults,
  NotFound,
  ServerError,
  SpotIllustration,
  Success,
  UploadPhotos,
  spotIllustrations,
  type SpotIllustrationName,
} from "./spots";
