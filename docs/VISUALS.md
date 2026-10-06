# WrenchMatch visuals: illustrations and parallax

Original, hand-made vector art (no stock photos, no external images, no AI services) in one
style: neon-lit, semi-isometric shapes on deep-space navy, glass panels with luminous 1px
edges, soft bloom and volumetric light. Everything is SVG, so it is crisp at any size.

- Illustrations: `src/components/illustrations` (import from `@/components/illustrations`)
- Parallax primitives: `src/components/parallax` (import from `@/components/parallax`)
- Raster exports: `public/images` (`hero.webp`, `og.png`, about 230 KB together)

## Spot illustrations (empty, success and error states)

Server Components (pure SVG + CSS loops); they also work inside Client Components (error
boundaries, dropzones). viewBox `240 x 180` (4:3). Size them with a **width** class; the
height follows.

| Component | Use it for | Tone |
| --- | --- | --- |
| `NoRequests` | customer has no repair requests | cyan |
| `NoQuotes` | a request has no quotes yet | violet |
| `NoJobs` | mechanic job board is empty | cyan |
| `NoBookings` | no bookings / reservations | violet |
| `NoNotifications` | empty notification list | cyan |
| `NoResults` | a filter or search found nothing | violet |
| `Success` | a finished action (sent, saved, approved) | emerald |
| `NotFound` | 404 pages and missing records | violet |
| `ServerError` | error boundaries | amber |
| `UploadPhotos` | the media dropzone / "add photos" prompts | cyan |
| `AccessDenied` | wrong-role pages | violet + amber lock |
| `MobileServiceArt` | "mobile or garage" feature tiles | violet |
| `ApproximateAreaArt` | "approximate areas only" privacy notes | cyan |

```tsx
import { NoQuotes } from "@/components/illustrations";

<EmptyState
  icon={<NoQuotes decorative className="w-40 sm:w-48" />}
  title="No quotes yet"
  body="We notified 3 mechanics. You'll get a notification when a quote arrives."
/>
```

Props (every illustration): `className` (sizing/layout), `decorative` (aria-hidden; use it
when nearby text already says the same thing, as in empty states), `title` and `desc`
(override the accessible name/description; each has a sensible default, rendered as SVG
`<title>`/`<desc>` with `role="img"`), `animated` (default `true`: gentle float/twinkle
loops). Data-driven: `<SpotIllustration name="no-quotes" />` with `SpotIllustrationName`
(`"no-requests" | "no-quotes" | "no-jobs" | "no-bookings" | "no-notifications" |
"no-results" | "success" | "not-found" | "server-error" | "upload-photos" |
"access-denied" | "mobile-service" | "approximate-area"`).

Notes: the art is made for dark surfaces (it carries its own glow, no background box) and
reads on the light theme too (dark-glass objects with tinted halos). Each instance generates
its own SVG ids (`useId`), so several copies on one page never clash.

Light theme (`<html data-theme="light">`): the night scenes are never faded into the light
canvas. The hero and auth art sit in a rounded "poster" window with a soft shadow (CSS
modules `landing.module.css`, `auth-shell.module.css`), story and feature scenes keep their
own dark stage cards, and `CoverageArt daylight` drops its night backdrop and stars to become
a light blueprint terrain (`.wmi-daylight` rules in `ambient.tsx`).
The ambient loops come from one tiny stylesheet that React 19 hoists into `<head>` once
(`<style href precedence>` in `ambient.tsx`), so the art needs no CSS import and works the
same in Server and Client Components.

## Big scenes (layered, parallax-ready)

Each scene is a stack of depth layers. `variant="layered"` (default) renders every layer as
its own GPU-composited plane (moving only with transforms), cropped to its content box;
`variant="flat"` renders one static `<svg>` (thumbnails, exports). Props: `title`, `desc`,
`decorative`, `className` (width), `animated`, `variant`. Wrap a layered scene in a
`ParallaxScene` (scroll), `PointerTracker`/`Tilt` (mouse) or `StickyScrollStory` (pinned
story) and its layers drift at different depths; anywhere else it simply renders still.
Floating cards loop on HTML wrappers (compositor only, no SVG repaints); loops that must
live inside the SVG (pulses, flowing routes) sit in filter-free layers.

| Component | viewBox | What it shows | Used on |
| --- | --- | --- | --- |
| `HeroScene` | 1600 x 1000 | night city, holographic map floor, glowing routes and pins, a sleek EV, a mobile-mechanic van, floating cards (example quote, approved-mechanic badge with "New", time slot). The left ~42% stays calm for overlaid text. | landing hero |
| `HowItWorksDescribe` | 1000 x 800 | phone photographing an amber check-engine light, holographic request form | landing story step 1 |
| `HowItWorksMatch` | 1000 x 800 | isometric neon map, radius rings, matched pins, "Approved" shield, match criteria chips | step 2 |
| `HowItWorksCompare` | 1000 x 800 | three itemized example quotes, the chosen one glowing ("Your pick") | step 3 |
| `HowItWorksFixed` | 1000 x 800 | mechanic with a tablet at a car under a light rig, scan beam, reserved slot card, check | step 4 |
| `MechanicsScene` | 1200 x 900 | futuristic garage: two-post lift, tool wall, mechanic, holographic job board | "For mechanics" |
| `SafetyScene` | 1000 x 800 | drilled brake disc (slowly spinning) with a hot edge, caliper, emerald shield, "Brakes / Suspension gated" chips | safety section |
| `CoverageArt` | 1600 x 900 | holographic terrain grid with contour lines and pulsing pins (decorative by default) | full-bleed band behind the "Where we operate" section; the live `MapView` floats over it |
| `AuthArt` | 800 x 1000 | rotating neon portal with a car on a platform, approved-mechanic badge, time slot. Cards stay inside x 150-650 because the side panel crops the art to its centre. | `/login`, `/signup` |

Honesty in the art: prices are labelled "Example quote"; mechanic badges show "New" instead
of invented ratings; there are no statistics, testimonials or logos.

```tsx
import { HeroScene } from "@/components/illustrations";
import { ParallaxScene, PointerTracker, Tilt } from "@/components/parallax";

<PointerTracker className="relative">
  <ParallaxScene anchor="top" distance={220}>
    <Tilt max={2.5}>
      <HeroScene />
    </Tilt>
  </ParallaxScene>
</PointerTracker>
```

### Raster exports (`public/images`)

| File | Size | Use |
| --- | --- | --- |
| `hero.webp` | 1600 x 1000, ~100 KB | `HeroScene` as a picture: slides, emails, anywhere inline SVG is not possible |
| `og.png` | 1200 x 630, ~130 KB | social card, referenced by the landing page metadata (`openGraph`, `twitter`) |

They are rendered from the flat scene with sharp by a throwaway script (render the component
with `react-dom/server`, rasterize, compose the card). Re-render them after changing the
hero art.

## Parallax primitives (`@/components/parallax`, Client Components)

All motion is transform/opacity only (motion's `useScroll`/`useTransform`, no scroll
listeners of our own), layers are GPU-composited (`will-change: transform`), and under
`prefers-reduced-motion` everything renders in place. Touch screens get no pointer effects.

### `ParallaxScene` + `ParallaxLayer`

```tsx
import { ParallaxLayer, ParallaxScene } from "@/components/parallax";

<ParallaxScene className="aspect-[16/10] overflow-hidden" distance={160}>
  <ParallaxLayer depth={0.5}>{/* far background, lags behind the scroll */}</ParallaxLayer>
  <ParallaxLayer depth={0.2}>{/* mid ground */}</ParallaxLayer>
  <ParallaxLayer depth={0}>{/* moves with the page */}</ParallaxLayer>
  <ParallaxLayer depth={-0.25}>{/* foreground, moves faster */}</ParallaxLayer>
</ParallaxScene>
```

- `ParallaxScene` props: `anchor` (`"center"` default: layers line up when the section is
  centred in the viewport; `"top"` for a hero at the top of the page, so nothing jumps on
  hydration), `distance` (px a depth-1 layer travels over the whole scroll range, default
  160), `as` (`div`/`section`/`figure`), `id`, `className`, `aria-label(ledby)`. It is
  `position: relative` unless `className` sets `absolute`, `fixed` or `sticky`.
- `ParallaxLayer` props: `depth` (0 = with the page, positive = background, negative =
  foreground), `pointer` (multiplier for the mouse shift inside a `PointerTracker`),
  `fill` (default `true`: absolute, full-size, non-interactive art plane; `false`: normal
  block for drifting text or cards).
- `useMotionFactor()` returns a MotionValue that is 1 normally and 0 under reduced motion.

### `PointerTracker`, `Tilt`, `PointerTilt`

```tsx
import { PointerTilt, PointerTracker, Tilt } from "@/components/parallax";

<PointerTilt max={6} className="rounded-3xl">{card}</PointerTilt>

// One tracking area for a whole section, tilt only the art:
<PointerTracker className="relative">
  <h1>…</h1>
  <Tilt max={4}>{scene}</Tilt>
</PointerTracker>
```

`PointerTracker` normalises the mouse position over its area (-1 → 1, spring-smoothed);
`Tilt` rotates its content in 3D (max degrees); `ParallaxLayer`s inside a tracker also
shift by depth for a subtle 3D look. Off on touch screens and under reduced motion.

### `StickyScrollStory`

```tsx
import { StickyScrollStory } from "@/components/parallax";

<StickyScrollStory
  label="How WrenchMatch works"
  steps={[
    { id: "step-describe", title: "Describe the problem", label: "Describe",
      body: <p>…</p>, scene: (variant) => <HowItWorksDescribe decorative animated={variant === "panel"} /> },
    // …
  ]}
/>
```

From `lg` (with motion allowed) the scene panel stays pinned while the steps scroll past:
scenes cross-fade and slide, each scene's layers drift by depth, a glowing rail with
numbered markers fills with progress, and a counter ("02 / 04") tracks the active step. On
phones and tablets it is a vertical story: each step's chip leads, then its scene card rises
into view while its layers arrive one depth at a time (backdrop, middle ground, floating
cards) and keep drifting, then the text. Under reduced motion it is a calm list (two columns
from `lg`). Native scrolling only, semantic `<ol>` with headings (`headingLevel`, default 3),
anchors on every step (`#step-…`). `scene` is called twice ("panel" and "inline") so each
copy gets its own SVG ids; only the copy the current layout shows is ever mounted.

### Performance rules (phones first)

- `LazyMount` keeps big art out of the server HTML: it mounts when the box is within ~1
  screen (or in idle time, never mid-scroll), and releases it again when it is more than ~6
  screens away. Give the box its size (`aspect-*`, `size-full`) so nothing shifts.
- Loops inside an SVG (twinkle, pulse, dash, scan, spin) repaint the whole scene, glow
  filters included, so they pause while the page scrolls (`html[data-scrolling]`) and do not
  run at all on touch devices; loops on HTML layer wrappers (`ambient.float`/`bob`) run on the
  compositor and stay. `AmbientPauser` pauses every loop that is off screen.
- Animate only transform/opacity; no CSS `filter`, blur or drop-shadow on moving layers.

## Where it is used

- Landing (`src/app/(public)/page.tsx` + `_landing/**`): cinematic hero (layered scene,
  scroll parallax, pointer tilt, the design-system `aurora` glow and animated `grid-bg` HUD grid
  behind the headline, word-by-word headline reveal that animates transform only so the
  headline stays the LCP element), trust strip, "How it works" story, benefits bento with
  tilt/glow cards (mini illustrations plus small HTML mocks: example quote lines, a change
  order, and the real in-app notification types bobbing under a ringing bell), live coverage
  map floating over the `CoverageArt` terrain band, "For mechanics", safety, photos and video
  highlight, FAQ teaser, closing call to action. Social card: `og.png`.
- `/login`, `/signup`: split layout with `AuthArt` (pinned on large screens, banner on
  phones), glass forms, "Explore with a sample account" (role tabs, one-click "Log in as …",
  the shared password inside the "Use the form instead" disclosure). A failed one-click login
  comes back as `/login?sample_error=<reason>`.
- `/access-denied`: `AccessDenied` spot over a faint animated grid.

## Art direction

- Ground: near-black navy `#03050f → #0d1536`, subtle radial glows.
- Neon accents (sparingly): cyan `#22d3ee` / `#67e8f9`, violet `#8b5cf6` / `#b4a2ff`,
  blue `#3b82f6`; amber `#fbbf24` only for warning lights and heat, emerald `#34d399` for
  success and safety.
- Glass: translucent navy fill, top sheen, 1px gradient edge (cyan → violet), HUD corner
  brackets on hero cards.
- Bloom: small Gaussian-blur glows on light sources only; large glows are radial gradients
  (cheap to paint). Depth comes from layering, haze near the horizon and light pools.
- People: stylised technicians in a 3/4 view (`MechanicFigure` in `parts.tsx`): fitted
  jumpsuit with a reflective band, AR visor, cap, knee pads, a wrench in one hand and a tablet
  projecting a small hologram in the other; cyan rim light on one side, violet on the other.
  No faces or identities, so the same figure fits any mechanic.
- Type in art inherits the page font (Geist); prices use the mono stack.
- Performance: CSS gradients paint first and the art fades in; transforms/opacity only;
  layers are cropped to their content; nothing moves under reduced motion.
