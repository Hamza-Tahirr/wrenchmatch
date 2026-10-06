# WrenchMatch UI kit

Design system: `src/components/ui` (components), `src/components/layout` (app shell),
`src/components/motion` (motion kit), `src/components/map` (maps), `src/lib/format.ts`
(formatting) and `src/lib/cn.ts`. Tokens live in `src/app/globals.css` (Tailwind CSS 4,
CSS-first `@theme`). Import each UI component from its own file, e.g.
`import { Button } from "@/components/ui/button"`.

Related docs: `docs/VISUALS.md` (illustrations, parallax) and `docs/MEDIA.md`
(uploads, galleries).

## Futuristic theme (read first)

The app is **dark first**: deep-space navy canvas with soft neon glows, glass panels, neon
accents used sparingly, holographic headings, motion everywhere (honouring reduced motion).
Readability wins over effects: body text is near-white on dark surfaces (WCAG AA everywhere),
neon is for accents, glows and focus, and forms stay calm.

### Light theme ("futuristic light") and the theme toggle

There is a second, opt-in **light theme**: white cards on a very light blue-grey canvas, crisp
hairline borders, soft layered shadows, frosted glass that works on light, and deeper accents
(teal / indigo / violet instead of neon) so accent text stays AA. Dark stays the default.

- **How it is selected:** `<html data-theme="light">` (or `"dark"`). The root layout reads the
  `wm_theme` cookie (`light` | `dark`, 1 year, `SameSite=Lax`) with `cookies()` and renders the
  attribute, `color-scheme` and `theme-color` on the server, so a reload never flashes.
- **Every token is redefined for light** in `:root[data-theme="light"]` (`src/app/globals.css`):
  surfaces, ink, lines, `control`, the neon accents, `brand-*`, `success-*`, `warning-*`,
  `danger-*`, the legacy `white`/`slate-*` palette, the shadows (`shadow-glow*`,
  `shadow-elevated`) and the effect utilities (`glass*`, `holo-text`, `aurora`, `grid-bg`,
  `noise`, `shimmer`, `card-hover`, `text-glow`, map chrome, dialog scrim). Code written with
  the semantic tokens works in both themes without per-page edits. The scales keep their
  **roles**: `50–200` tinted fills/borders, `600–950` readable ink, `on-brand` the ink on
  brand/neon/tone fills (dark ink in dark, white in light), `bg-fg/[0.06]` a hover tint.
- **Things that do not adapt by themselves:** hard-coded colours (`oklch(...)`, `#hex`,
  `rgba(...)` in classes, inline styles, SVG `fill`/`stroke` literals, canvas/WebGL colours) and
  `black`/`white` used as "always dark/always light". Prefer tokens; when a value must differ
  per theme, use the **`light:` / `dark:` variants** (they follow `data-theme`, not the OS):
  `className="shadow-glow light:shadow-elevated"`, `"bg-canvas/60 light:bg-white/80"`. For CSS
  or SVG, read the token: `fill="var(--color-neon-cyan)"`, or scope a rule with
  `:root[data-theme="light"] .my-thing { … }`. In client code, `useTheme()` from
  `@/components/theme/theme-provider` returns `"light" | "dark"` (re-renders on switch).
- **Glows on light** become soft coloured shadows (`shadow-glow`), and `drop-shadow-[…neon…]` /
  `text-glow` are much subtler. Dark-only art (night skylines, starfields) should get a light
  variant or sit inside a deliberately dark panel.
- **ThemeToggle** (`import { ThemeToggle } from "@/components/theme/theme-toggle"`, client): a
  small icon button (moon in dark ↔ sun in light, morphing) with a circular reveal from the
  button (View Transitions API; quick cross-fade without it; instant under reduced motion).
  `aria-label` "Switch to light theme" / "Switch to dark theme", `aria-pressed` = light theme
  on, 44×44 below `lg` (40×40 above). Props: `className` (layout only). It is already in the
  header: next to **Log out** (desktop), next to **Sign up** (signed out), and in the
  small-screen menu's pinned footer beside **Log out** / **Sign up** (`site-header.tsx` passes
  them as `MobileMenu`'s `footer`; the menu puts the toggle beside it). Do not add another.
- **Testing both themes:** set the cookie before loading, e.g. Playwright
  `await context.addCookies([{ name: "wm_theme", value: "light", url: "http://127.0.0.1:3000" }])`,
  or click the toggle (`getByRole("button", { name: "Switch to light theme" })`). In DevTools:
  `document.documentElement.dataset.theme = "light"` (not persisted). Check text contrast,
  badges, alerts, focus rings and form controls in both, at 390 and 1280.

| Light value (selected) | |
| --- | --- |
| canvas `#f2f6fb`, surface/elevated `#ffffff`, surface-2 `#eef3f9` | fg `#131a2b` (16:1), fg-muted `#434d61` (≥ 7.6:1), fg-subtle `#596475` (≥ 5.3:1) |
| neon-cyan `#00718e`, neon-blue `#2858cd`, neon-violet `#6d3bcd`, neon-pink `#c9237b` | all ≥ 4.8:1 as text on every surface and on their `/10` tints |
| brand-700 links `#005f8e` (≥ 6:1), tone-600 ink ≥ 4.6:1, badges ≥ 7:1 | white on brand/neon/tone-600 fills ≥ 4.8:1; `control` borders ≥ 3.5:1 |

### Tokens (Tailwind utilities: `bg-*`, `text-*`, `border-*`, `ring-*`, `from-*`…)

| Token | Use |
| --- | --- |
| `canvas` | page background (the body already has it, with fixed glows) |
| `surface` | cards and panels (prefer the `glass-lite` / `glass` utilities) |
| `surface-2` | insets inside a card: price breakdowns, code-ish boxes, hover fills |
| `elevated` | menus, popovers, dialogs, toasts (prefer `glass-strong`) |
| `line` / `line-strong` | hairline borders and dividers / emphasized borders |
| `fg` / `fg-muted` / `fg-subtle` | primary text / secondary text / hints, meta, captions (all AA on every surface) |
| `on-brand` | ink on neon or brand fills (filled buttons, numbered dots): dark in dark, white in light |
| `control` | form-control borders (3:1) |
| `neon-cyan`, `neon-blue`, `neon-violet`, `neon-pink` | accents, glows, focus, chart lines; use `/10`–`/30` alpha for tints |
| `brand-50…950` | cyan→blue scale, dark first: `50–200` tinted fills/borders, `600–950` light ink (`text-brand-700` = links) |
| `success-*`, `warning-*`, `danger-*` (`50…950`) | same dark-first shape: `bg-success-50 text-success-700 border-success-200` |

Shadows: `shadow-glow-sm`, `shadow-glow`, `shadow-glow-lg`, `shadow-glow-violet`,
`shadow-glow-success`, `shadow-glow-danger`, `shadow-elevated`.
Sticky header (per theme): `bg-(--wm-header-bg)`, `bg-(--wm-header-bg-scrolled)` (more opaque
on light, so dark art scrolling underneath does not smudge it) and `shadow-(--wm-shadow-header)`.
Fonts: `font-sans` (Geist), `font-mono` (Geist Mono: prices, IDs, codes), `font-display`
(Space Grotesk: hero and page titles).
Easing: `ease-out-expo`, `ease-spring`.
Animations: `animate-fade-in`, `animate-slide-up`, `animate-slide-down`, `animate-scale-in`,
`animate-float`, `animate-pulse-ring`, `animate-glow-pulse`, `animate-spin-slow`, `animate-holo`.

### Utilities (in `globals.css`)

| Utility | What it does |
| --- | --- |
| `glass` | frosted panel: translucent fill, backdrop blur, 1px luminous border, soft shadow (header, hero cards) |
| `glass-strong` | denser glass for menus, dialogs, toasts, map overlays |
| `glass-lite` | glass look **without** blur: use for cards in lists (cheap to scroll) |
| `glow` | neon cyan glow ring (`box-shadow`) |
| `glow-border` | animated conic neon border (needs a `rounded-*`; adds `position: relative`) |
| `holo-text` | animated holographic gradient text for headings; put it on an **inline** element (`<h2><span className="holo-text">…</span></h2>`) or a `w-fit` block so the gradient spans the words; falls back in forced colors |
| `text-glow` | soft neon text shadow (sparingly, short labels/numbers) |
| `aurora` | animated aurora gradient-mesh behind a section's content (`::before`, adds `relative isolate`) |
| `grid-bg` | faint animated grid behind a section's content (`::after`, edges fade) |
| `noise` | film grain for a decorative layer: `<div aria-hidden className="noise absolute inset-0" />` |
| `shimmer` | shimmering placeholder (skeletons) |
| `card-hover` | hover lift + neon edge glow for clickable cards (transform/shadow only) |
| `reveal` / `reveal-scale` | scroll-linked reveal (CSS scroll timeline; static where unsupported) |
| `stagger-children` / `stagger-reveal` | staggered entrance of direct children on mount / while scrolling |
| `tabular` | tabular numbers (prices, counts, tables) |

All animations stop under `prefers-reduced-motion: reduce` (content shows in its final state).

### Migrating light-theme classes

Old light classes keep working: in the dark theme Tailwind's `white` and `slate-*` are
**remapped as an inverted dark palette**, so every pair that had contrast still has it
(`bg-white` is a dark surface, `text-slate-900` near-white, `border-slate-200` a subtle line,
and `text-white` is **dark ink** meant for neon fills like `bg-brand-700`); the light theme
maps them back to the normal palette (`bg-white` white, `text-white` white ink on deep brand
fills). Do not write new code with `white` or `slate-*`; migrate as you touch a page:

| Old | New |
| --- | --- |
| `bg-white` (card/panel) | `glass-lite` (lists) or `glass` (hero/feature) or `bg-surface` |
| `bg-white` (input) | use `Input`/`Select`/`Textarea` (they are styled) or `bg-surface-2` |
| `bg-slate-50`, `bg-slate-100` | `bg-surface-2` (insets), `bg-fg/5` (hover), `bg-canvas` (page) |
| `border-slate-200`, `divide-slate-200`, `ring-slate-200` | `border-line`, `divide-line`, `ring-line` |
| `border-slate-300` | `border-line-strong` |
| `text-slate-900`, `text-slate-800` | `text-fg` |
| `text-slate-700`, `text-slate-600` | `text-fg-muted` |
| `text-slate-500`, `text-slate-400` | `text-fg-subtle` |
| `bg-brand-700 text-white` (filled chip/dot) | `bg-brand-600 text-on-brand shadow-glow-sm` or `bg-linear-to-br from-neon-cyan to-neon-blue text-on-brand` |
| `bg-brand-50 text-brand-800 ring-brand-100` | unchanged (dark tints) or `bg-neon-cyan/10 text-brand-800 ring-neon-cyan/25` |
| `bg-slate-900` (dark band) | `glass` + `aurora`, or `bg-canvas` |
| `text-white` on a photo/illustration | `text-fg` |
| `shadow-xs`, `shadow-sm` | `shadow-elevated` (floating), nothing (flat glass) |
| `hover:bg-slate-50` | `hover:bg-fg/5` |
| `<span className="font-mono">` | keep; add `tabular` for numbers |

Recipes:

```tsx
// Glass card in a list, clickable with lift + glow
<li className="glass-lite card-hover rounded-2xl p-5">…</li>

// Section with aurora and grid behind it
<section className="aurora grid-bg overflow-hidden rounded-3xl px-6 py-12">…</section>

// Holographic heading
<h2 className="font-display text-3xl font-semibold tracking-tight"><span className="holo-text">Compare quotes</span></h2>

// Price
<span className="font-mono tabular text-lg text-fg">$232.12</span>
```

## Motion kit (`src/components/motion`)

Motion 14 (`motion/react`). The root layout renders `MotionProvider` (LazyMotion with
`domAnimation`, non-strict, and `MotionConfig reducedMotion="user"`). In your own client
components use `m.div` etc. (`import { m } from "motion/react"`); `layout` animations and
drag are not loaded. Keep animations to transform/opacity, 150–400 ms for UI feedback.

| Component | Kind | Notes |
| --- | --- | --- |
| `FadeIn`, `SlideUp`, `ScaleIn` | server-safe (CSS) | entrance on mount; props `as`, `delay`/`duration` (seconds), `inView` (scroll-linked reveal instead), plus any HTML attributes |
| `Stagger` + `StaggerItem` | server-safe (CSS) | `trigger="mount"` (60 ms steps) or `"inView"`; applies to direct children |
| `InView` | client | `variant="slide-up" \| "fade" \| "scale" \| "slide-left" \| "slide-right"`, `delay`, `amount`, `as` |
| `AnimatedNumber` | client | `value`, `format="integer" \| "decimal" \| "cents" \| "percent" \| "compact"`, `prefix`, `suffix`; counts up in view **only the first time a value appears in the tab** (no re-count after navigating back); money (`"cents"`) never counts up from zero, it only tweens when the amount changes in place (live totals); SR and server get the final value |
| `AnimatedCheck` | server-safe | self-drawing check (`size`, `tone`, `label`) for success states |
| `PresenceSwap` | client | `swapKey` + children: animates old content out and new in (form → success) |
| `GlowCard`, `TiltCard` | client | pointer-following neon spotlight; `TiltCard` adds 3D tilt (mouse only). Style via `className` |
| `PageTransition` | client | used by `src/app/template.tsx` only |
| `NavigationProgress` | client | root layout only: slim neon bar at the top while an in-app navigation is pending (link clicks, back/forward); hidden for navigations under ~120 ms; static under reduced motion |
| `AmbientPauser` | client | root layout only: pauses infinite CSS loops (aurora, grid, holo text, glow borders, illustration twinkles) while off screen via the Web Animations API (no class changes, so late-hydrating content never mismatches) and in hidden tabs |

```tsx
import { SlideUp } from "@/components/motion/entrance";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { AnimatedNumber } from "@/components/motion/animated-number";

<SlideUp as="section" delay={0.1}>…</SlideUp>
<Stagger as="ul" className="grid gap-4 sm:grid-cols-2">
  {quotes.map((q) => <StaggerItem as="li" key={q.id} className="glass-lite card-hover rounded-2xl p-5">…</StaggerItem>)}
</Stagger>
<AnimatedNumber value={quote.totalCents} format="cents" className="font-mono text-2xl" />
```

The first page load never hides content while JavaScript loads (entrances are CSS; scroll
reveals use CSS scroll timelines). **Screenshots:** content below the fold reveals as you
scroll, so for full-page screenshots emulate reduced motion
(`browser.newContext({ reducedMotion: "reduce" })`) or scroll through the page first.

## Toasts (`src/components/ui/toast.tsx`, client)

The root layout renders one `<Toaster />`. From any Client Component:

```tsx
import { toast, useActionStateToast } from "@/components/ui/toast";

toast.success("Quote sent", { description: "The customer can compare it now." });
toast.error("Could not save", { description: "Check the highlighted fields." });
toast.info("Copied"); toast.warning("Quote expires in 2 hours");
toast.success("Booked", { action: { label: "View booking", href: "/bookings/abc" } });

// With useActionState: toasts state.message on success, state.formError on failure.
const [state, formAction] = useActionState(saveAction, initialState);
useActionStateToast(state, { success: "Profile saved" });
```

`<ToastOnMount title="Profile saved" tone="success" />` fires once on mount (e.g. after a
redirect). On phones the stack spans the width above the home indicator (safe-area inset) and
the dismiss button is 44×44. Toasts are announced via live regions, pause on hover/focus, auto-hide (5 s, errors
8 s). Keep inline errors and `FormErrorSummary` as the source of truth: a toast is a
confirmation, not the only copy of an error.

## Maps (`src/components/map`)

`MapView` (client) draws a MapLibre map that **follows the theme**: OpenFreeMap `dark` tinted
deep navy, or `positron` tinted light blue-grey (`MAP_STYLE_URLS`); a theme switch swaps the style
live and re-adds the rings, lines and clusters. It preconnects to `tiles.openfreemap.org`,
initialises when it comes within ~600 px of the viewport, keeps the skeleton until the first
complete render, retries the style once on slow or failed loads (20 s, then a second try) before
showing "Map unavailable", keeps marker label chips and popups inside the map (fitted content
keeps clear of the corner buttons and the attribution; selecting a point on a short map lands it
below the centre so its popup opens upwards), and on phones shows
a **Full-screen map** button (top layer, one-finger panning, Escape or "Close map" returns;
`expandable={false}` turns it off, and it hides inside a wrapper that sets `--wm-map-h` with its
own button). WebGL layer colours: `MAP_TONE_HEX` (dark) / `MAP_TONE_HEX_LIGHT`; HTML swatches use
`mapToneVar(tone)` (`var(--wm-map-<tone>)`, follows the theme). `geo.ts` helpers and `MapLegend`
are server-safe.
**Privacy:** pass approximate points only: request ZIP centroids and mechanics' base-ZIP
centroids, and only for records the viewer may see (ARCHITECTURE section 8). Never an
address. `approximateArea(point)` turns a centroid into a ~1.5 mi area ring.

```tsx
import { MapView } from "@/components/map/map-view";
import { MapLegend } from "@/components/map/map-legend";
import { approximateArea, milesBetween } from "@/components/map/geo";

<MapView
  label="Mechanics near your request (approximate areas)"
  height="22rem"
  points={[
    { id: "req", lat, lng, label: "Your request", description: "Tempe, AZ 85281", kind: "home", tone: "cyan", pulse: true },
    { id: m.id, lat: m.lat, lng: m.lng, label: m.displayName, description: `about ${miles} mi`, tone: "violet", href: `/…`, hrefLabel: "View quote" },
  ]}
  circles={[approximateArea({ lat, lng }, { label: "Your approximate area" }), { id: "r1", lat: m.lat, lng: m.lng, radiusMiles: 25, tone: "violet", label: "Marco travels up to 25 mi" }]}
  lines={[{ id: "l1", from: m, to: { lat, lng }, tone: "violet", label: "about 6 mi" }]}
  legend={<MapLegend items={[{ tone: "cyan", label: "Your area", kind: "home" }, { tone: "violet", label: "Mechanics" }, { tone: "violet", label: "Travel radius", kind: "ring" }]} />}
/>
```

Props: `label` (required), `points` (`id`, `lat`, `lng`, `label`, `description`, `tone`
`"cyan" | "blue" | "violet" | "success" | "warning" | "danger" | "neutral"`, `kind`
`"pin" | "home"`, `pulse`, `hideLabel`, `href`, `hrefLabel`), `circles` (`radiusMiles`,
`dashed`, `label`), `lines` (`from`, `to`, `label`), `selectedId` + `onSelect` (client
callers), `cluster` (default on above 30 points), `height` (CSS length, default `20rem`),
`legend`, `list` (`"toggle"` List view disclosure by default, `"sr-only"`, `"none"`), `labels`
(`"auto"` default: label chips always shown up to 6 points, otherwise on hover/focus/selection;
`"always"`, `"hover"`),
`center`/`zoom` (when empty), `fitMaxZoom` (default 11.5), `interactive`. Markers are buttons
(keyboard: Tab, Enter opens the popup, Escape closes it); gestures are cooperative
(Ctrl/⌘ + scroll); a skeleton shows while loading and a fallback card (plus the list) when
WebGL or the network is unavailable. MapLibre 6 starts its web worker from a URL: the route
`src/app/(public)/vendor/maplibre-gl/[version]/[file]/route.ts` serves the installed package's worker
files (bump `MAPLIBRE_VERSION` in `map-view.tsx` with the package). Other helpers: `milesBetween(a, b)`, `circleRing`,
`contentBounds`, `MAP_TONE_HEX`. Coverage data for "where we operate" maps:
`getCoverage(ctx)` in `src/server/catalog/coverage.ts` → `{ zips: [{ zip, city, state,
areaLabel, metroLabel, lat, lng }], metros: [{ metroLabel, lat, lng, zipCount, cities,
radiusMiles }] }`.

**Testing maps with Playwright:** do not set `extraHTTPHeaders` (e.g. `x-forwarded-for`) on a
context that loads a map. Playwright adds them to every request, so the cross-origin style and tile
requests to tiles.openfreemap.org become CORS preflights, which the tile server rejects ("blocked by
CORS policy"). Use a separate context with extra headers only for signups or failed-login tests.
A real browser sends no such headers.

## Ground rules

- **Server Components by default.** Every component works in a Server Component except the
  ones marked *client* below. Client components accept only serializable props from a server
  page: pass icons as elements (`leadingIcon={<Plus />}`), never as component functions, and
  pass Server Actions (`"use server"`) rather than plain functions.
- **Colors.** Use the semantic tokens above. Tones: `success`, `warning`, `danger`; info uses
  `brand`. Body text `text-fg`, secondary `text-fg-muted`, hints `text-fg-subtle`.
- **Focus.** `:focus-visible` gets a 2px neon-cyan outline globally; do not remove it.
- **`className` is for layout** (margins, widths, grid placement). `cn()` does not resolve
  Tailwind conflicts, so do not try to override a component's own colors, padding or display
  through it. To hide/show a component responsively, wrap it:
  `<div className="hidden sm:block"><ButtonLink … /></div>`.
- **Mobile first.** Everything must work at 360px with 16px gutters (`PageContainer` does
  this). Form controls use 16px text on phones to avoid iOS zoom.
- **Money** is integer cents everywhere; format it with `<Money>` or `formatCents`. Never
  compute totals in components; show what `src/server/pricing.ts` produced.
- **Presentation mode, honest copy.** No "demo" wording, badges or banners anywhere
  (`DemoBadge` renders nothing and is deprecated). Never imply payments are taken online
  ("Online payments are coming soon"), or that licensing, insurance verification or email
  delivery are real. Ratings only from genuine reviews, otherwise "New". Identity/insurance
  images stay marked "SAMPLE". No invented statistics, testimonials or partner logos.

## App shell (`src/components/layout`)

| Component | Notes |
| --- | --- |
| `SiteHeader` | `viewer: { role: "customer" \| "mechanic" \| "admin"; displayName: string } \| null`, `unreadCount?: number`, `logoutAction?: () => Promise<void>` (a Server Action; renders a "Log out" button). Role-aware nav from `nav-items.ts`, bell link to `/notifications` with an unread badge, keyboard-accessible small-screen menu (animated glass sheet). Glass bar that deepens its shadow and shows a neon hairline once the page scrolls (`HeaderScrollEffect`); the current link gets a glowing indicator. |
| `SiteFooter` | Rendered by the root layout, together with `MotionProvider` (wraps the app) and `Toaster`. `src/app/template.tsx` adds the page transition. |
| `PageContainer` | Page column: `size="narrow" \| "default" \| "wide"` (3xl / 6xl / 7xl), `padY={false}` for full-bleed sections. |
| `NavLink` *(client)* | `next/link` that sets `aria-current="page"` from `usePathname()`. Optional `match` prefixes. Style the current state with `aria-[current=page]:…`. |
| `nav-items.ts` | `roleNavItems`, `roleLabels`, `isActivePath(pathname, href, match?)`. Add role links here. |

Typical page:

```tsx
import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Quotes" }; // → "Quotes · WrenchMatch"

export default async function QuotesPage() {
  return (
    <PageContainer>
      <PageHeader title="Your requests" description="Quotes appear here as mechanics respond." />
      <div className="mt-8 space-y-8">{/* sections */}</div>
    </PageContainer>
  );
}
```

## Actions

**Button** — 44px tall on phones for every size (touch targets), `sm` 36px / `md` 40px from
`sm` up. In the light theme `secondary` is a crisp white button with a hairline and soft shadow.
`variant="primary" | "secondary" | "ghost" | "danger"`, `size="sm" | "md" | "lg"`,
`fullWidth`, `leadingIcon`, `trailingIcon`, `loading` (spinner + `aria-busy` + disabled),
`loadingText`. Defaults to `type="button"`. `buttonClasses({ variant, size, fullWidth })`
returns the classes for anything else that must look like a button.

```tsx
<Button variant="secondary" leadingIcon={<Plus />}>Add part</Button>
```

**ButtonLink** — a `next/link` styled as a button (same style props). Use it for navigation.

```tsx
<ButtonLink href="/request" size="lg" trailingIcon={<ArrowRight />}>Find a Mechanic</ButtonLink>
```

**SubmitButton** *(client)* — submit button for a form with an action. While the action runs
it shows a spinner, sets `aria-busy` and is disabled. Must be inside the form.

```tsx
<SubmitButton pendingText="Sending request…">Send request</SubmitButton>
```

## Forms

`Field` wires `id`, `name`, `required`, `aria-describedby` (hint + error) and `aria-invalid`
onto its single child control. The id defaults to `fieldId(name)` (`field-zip`), which is
what `FormErrorSummary` links to. `error` takes a string or Zod's `string[]`.

```tsx
<Field label="ZIP code" hint="5 digits, e.g. 85004" error={errors.zip} required>
  <Input name="zip" inputMode="numeric" autoComplete="postal-code" defaultValue={values.zip} />
</Field>
<Field label="Labor price (USD)" name="laborDollars" error={errors.laborDollars}>
  <Input leadingText="$" inputMode="decimal" />
</Field>
<Field label="Make" name="make" required>
  <Select placeholder="Choose a make" defaultValue={values.make ?? ""}>
    {makes.map((make) => <option key={make}>{make}</option>)}
  </Select>
</Field>
<Field label="Describe the problem" name="description" hint="What happens, and when?">
  <Textarea rows={5} />
</Field>
<Field label="Photos" name="photos" hint="Show the problem area.">
  <FileInput accept="image/jpeg,image/png,image/webp" multiple acceptLabel="JPEG, PNG or WebP"
    limitLabel="Up to 5 photos, 8 MB each" maxFiles={5} maxFileSizeBytes={8 * 1024 * 1024} />
</Field>
```

- `Input` (native; `leadingText` / `trailingText` adornments are `aria-hidden`, so keep the
  unit in the label), `Textarea`, `Select` (native, `placeholder` adds an empty first option;
  `className` goes on its wrapper), `FileInput` *(client: lists chosen files, warns early about
  count/size, clears when the form resets; the server still validates)*.
- Field props: `label`, `name`, `id`, `hint`, `error`, `required` (adds * and `required`),
  `optional` (adds "(optional)"), `hideLabel`. For custom markup pass a render function:
  `<Field label="…">{(control) => <input {...control} type="range" />}</Field>`.

**Checkbox** (single, with its own label/hint/error; id defaults to `fieldId(name)`):

```tsx
<Checkbox name="consentTerms" required label="I agree to the pilot terms" error={errors.consentTerms} />
```

**CheckboxGroup** (fieldset; read with `formData.getAll(name)`; "at least one" is a server rule):

```tsx
<CheckboxGroup name="makes" legend="Makes you service" columns={3} required
  options={makes.map((m) => ({ value: m, label: m }))} defaultValues={values.makes} error={errors.makes} />
```

**RadioGroup** (fieldset with `role="radiogroup"`; `variant="cards"` for big tiles):

```tsx
<RadioGroup name="serviceMode" legend="Where should the work happen?" variant="cards" columns={3} required
  defaultValue={values.serviceMode} error={errors.serviceMode}
  options={[
    { value: "mobile", label: "Mobile", hint: "A mechanic comes to you" },
    { value: "garage", label: "Garage", hint: "You drive to a garage" },
    { value: "either", label: "Either", hint: "Whichever is available" },
  ]} />
```

Controlled use from a Client Component: `value` + `onValueChange`.

**FormErrorSummary** *(client)* — renders nothing without errors; otherwise `role="alert"`, takes
focus, and links each error to its field (radio/checkbox groups focus their first option).
Pass `focusKey={state}` so it refocuses after every failed submit.

```tsx
"use client";
const [state, formAction] = useActionState(submitRequest, { ok: false });
const errors = state.ok ? {} : (state.fieldErrors ?? {});
const values = state.ok ? {} : (state.values ?? {});

<form action={formAction} noValidate className="space-y-6">
  <FormErrorSummary formError={state.ok ? null : state.formError} fieldErrors={errors}
    labels={{ zip: "ZIP code" }} focusKey={state} />
  {/* fields */}
  <SubmitButton pendingText="Sending request…">Send request</SubmitButton>
</form>
```

Notes: React 19 resets uncontrolled fields after a form action finishes, so return the
submitted `values` in the error state and feed them back as `defaultValue`. File inputs cannot
be refilled; say so in the error ("choose your photos again"). Use `noValidate` so the server's
Zod messages are the single source of errors; `required` still marks fields for assistive tech.

**Steps** — progress for multi-section forms (text + glowing bar on phones, neon stepper from `sm`).
`#section` hrefs render as plain `<a>` (native in-page scrolling); other hrefs use `next/link`:

```tsx
<Steps label="Request form" current={1}
  steps={[{ label: "Vehicle", href: "#vehicle" }, { label: "Problem", href: "#problem" }, { label: "Contact" }]} />
```

## Feedback

**Alert** — a message caused by the user's action; announced (`danger`/`warning` →
`role="alert"`, `info`/`success` → `role="status"`). **Callout** — static guidance, not
announced. Both: `tone="info" | "success" | "warning" | "danger"`, `title`, `icon` (element or
`false`), `actions`.

```tsx
<Callout tone="warning" title="Payments coming soon">Stripe is not connected in this build. Nothing is charged.</Callout>
<Alert tone="success" title="Quote sent">The customer can now compare it.</Alert>
```

**Badge** — neon chip: `tone="neutral" | "info" | "success" | "warning" | "danger"`, optional `icon`,
`dot` (glowing status dot; `dot="pulse"` animates it for live states such as "Unread"). Always
text, never color alone. **DemoBadge** is deprecated and renders nothing (presentation mode); remove it
from pages as you touch them.

```tsx
<Badge tone="warning">Pending payment</Badge>
```

Suggested tones: pending/under review/pending payment → `warning`; approved/confirmed/
completed → `success`; rejected/suspended/cancelled/expired → `danger` or `neutral`;
submitted/open/quoted → `info`.

**EmptyState** — `icon` (glyph in a neon chip), `illustration` (a spot illustration from
`@/components/illustrations`, e.g. `<NoQuotes decorative />`, sized for you; a sized
illustration passed as `icon`, e.g. `className="w-40"`, is also shown as art), `title`, body
(`body` or children), `action`, `headingLevel`.

```tsx
<EmptyState icon={<Inbox />} title="No quotes yet"
  action={<ButtonLink href="/requests/abc" variant="secondary">View request</ButtonLink>}>
  We notified 3 mechanics. You will get a notification when a quote arrives.
</EmptyState>
```

**Loading** — `Skeleton` (size with className), `SkeletonText lines={3}`, and `LoadingState`
(`role="status"` with a screen-reader label) for `loading.tsx` files:

```tsx
export default function Loading() {
  return (
    <PageContainer>
      <LoadingState label="Loading quotes…" className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <SkeletonText lines={4} />
      </LoadingState>
    </PageContainer>
  );
}
```

**Spinner** — decorative by default; `label` makes it a status message.

## Layout and data display

**PageHeader** — the page's single `h1`: `title`, `description`, `actions`, `back={{ href, label }}`,
`eyebrow` (mono neon kicker), `meta` (badge row), `holo` (animated holographic title, default
`true`; pass `false` when the title contains icons or badges), `aurora` (aurora + grid glow band
behind the header, for landing-like pages and dashboards), `art` (decorative illustration at the
end on `lg`). Title, meta, description and actions slide in on mount.

```tsx
<PageHeader back={{ href: "/quotes", label: "All requests" }} title="2016 Honda Civic · Battery replacement"
  meta={<Badge tone="info">Quoted</Badge>} actions={<ButtonLink href="/request" variant="secondary">New request</ButtonLink>} />
```

**Section** — titled block (`h2` by default, `headingLevel={3}` when nested), `description`,
`actions`, `id` for in-page links.

**Card** + `CardHeader` (`title`, `description`, `actions`, `titleAs`) + `CardBody` + `CardFooter`
(actions stack full-width on phones). `Card as="li"` inside lists. `variant="glass"` (default,
no blur: cheap in lists), `"frosted"` (backdrop blur) or `"glow"` (animated neon border: one
highlight per screen, e.g. the recommended quote); `interactive` adds hover lift + glow, and
`interactive="tilt"` a 3D tilt with a pointer-following spotlight (mouse only; client island).

```tsx
<Card>
  <CardHeader title="Quote from Marco R." titleAs="h3" description="Expires Oct 3, 2026, 5:00 PM MST" />
  <CardBody><DescriptionList items={facts} /></CardBody>
  <CardFooter><Button>Select this quote</Button></CardFooter>
</Card>
```

**DescriptionList** — `items: { term, description, key? }[]`, `layout="rows"` (label left/value
right from `sm`) or `"grid"` (compact two-column facts).

**DataTable** — semantic table with `caption` (`captionHidden` for screen-reader-only), inside a
focusable horizontal-scroll region; below 640px it becomes stacked cards (`mobile="scroll"`
keeps the table). Columns: `key`, `header`, `cell(row)`, `align`, `primary` (row header + card
title; defaults to the first column), `actions` (shown last in cards), `hideOnMobile`.
`empty` renders instead of an empty table. Glass rows with hover highlight, mono column heads, a
`position: relative` scroll region, and `maxHeight` (CSS length) to scroll inside the region with
a sticky header.

```tsx
<DataTable caption="Mechanic applications" rows={rows} getRowKey={(r) => r.id}
  empty={<EmptyState title="No applications" />}
  columns={[
    { key: "name", header: "Mechanic", primary: true, cell: (r) => r.displayName },
    { key: "status", header: "Status", cell: (r) => <Badge tone="warning">{r.statusLabel}</Badge> },
    { key: "submitted", header: "Submitted", cell: (r) => formatDate(r.submittedAt, "America/Phoenix") },
    { key: "open", header: <span className="sr-only">Actions</span>, actions: true, align: "right",
      cell: (r) => <ButtonLink href={`/admin/mechanics/${r.id}`} size="sm" variant="secondary">Review</ButtonLink> },
  ]} />
```

**Tabs** — link-based view switcher (`aria-current="page"`), e.g. filters in the URL. A glass segmented
bar: the current tab glows and its neon indicator grows in; on narrow screens it scrolls sideways
and keeps the current tab centered:

```tsx
<Tabs label="Application status" current={status}
  items={[{ key: "applied", href: "?status=applied", label: "Applied", count: 3 }, { key: "all", href: "?", label: "All" }]} />
```

**Pagination** — `prevHref`, `nextHref` (omit at the ends), `page`, `totalPages`.
**StatCard** — glass KPI card: `label`, `value` (always computed from data; a **number** counts up
with `AnimatedNumber`, formatted by `format="integer" | "cents" | "percent" | "decimal" |
"compact"`), `hint`, `icon`, `href` (whole card links, hover lift), `trend` (real recent values,
oldest first, drawn as a glowing sparkline), `tone="cyan" | "violet" | "success" | "warning" |
"danger"`.
**Avatar** — `name`, optional `src` (e.g. `/api/files/<id>`; lazy-loaded, falls back to initials
if missing or broken), `size="sm" | "md" | "lg" | "xl"`, `glow` (neon ring, default true), `decorative={false}`
when no name is shown next to it. **Money** — `<Money cents={quote.totalCents} />`.
**VisuallyHidden** — screen-reader-only text.

## Dialogs *(client)*

**Dialog** — below 640px it slides up as a full-width **bottom sheet** (rounded top, clears the
home indicator, 44px close button); from `sm` a centred card. Native `<dialog>`: modal, Escape and the close button dismiss it (and a backdrop
click in Chrome), focus returns to the trigger, labelled by `title`, described by
`description`. Content renders only while open. Uncontrolled with a trigger button, or
controlled with `open` + `onOpenChange` from a Client Component. Put `data-autofocus` on the
element that should get focus first. `DialogClose` closes it; `useDialog()` gives `close()`.

```tsx
<Dialog trigger="Propose a change" triggerVariant="secondary" title="Propose a change order"
  description="The customer must approve it before you do the work.">
  <ChangeOrderForm />
</Dialog>
```

**ConfirmDialog** — confirmation around an action. Focus starts on Cancel; the confirm button
shows a pending state; it closes when the action resolves, or stays open and shows the message
if the action returns `{ ok: false, formError }`. Children are extra form fields. On success it
shows a toast with the result's `message` or the `successToast` prop (e.g. `successToast="Quote withdrawn"`).

```tsx
<ConfirmDialog trigger="Withdraw quote" tone="danger" title="Withdraw this quote?"
  description="The customer will no longer be able to select it." confirmLabel="Withdraw quote"
  pendingLabel="Withdrawing…" action={withdrawQuoteAction} hiddenFields={{ quoteId: quote.id }} />

<ConfirmDialog trigger="Reject" tone="danger" title="Reject Alex K.?" confirmLabel="Reject application"
  action={rejectMechanicAction} hiddenFields={{ mechanicId }}>
  <Field label="Reason (shown to the mechanic)" name="reason" required><Textarea /></Field>
</ConfirmDialog>
```

## Formatting (`src/lib/format.ts`, safe on server and client)

| Function | Example |
| --- | --- |
| `formatCents(cents, currency = "USD")` | `formatCents(23212)` → `"$232.12"`; throws on non-integers |
| `formatDate(isoOrDate, timeZone?)` | `"Oct 1, 2026"`; `"YYYY-MM-DD"` calendar dates never shift zones |
| `formatDateTime(isoOrDate, timeZone?)` | `"Oct 1, 2026, 2:30 PM MST"`; pass the request's IANA zone |
| `formatMiles(n)` | `formatMiles(5.8)` → `"about 6 mi"`, under 1 → `"less than 1 mi"` |
| `pluralize(n, singular, plural?)` | `pluralize(3, "mechanic")` → `"3 mechanics"` (includes the count) |
| `formatBytes(n)` | `formatBytes(8 * 1024 * 1024)` → `"8 MB"` |

`cn(...classes)` joins truthy class names.

## Routes owned by this kit

`/help` (Help Center: FAQ, getting started by role, `#payments`, `#privacy`, `#terms`), `/notifications`,
the root `not-found`, `error` (with Try again), `global-error` and `template` (page transition). The landing,
login, signup and access-denied pages are covered in docs/VISUALS.md.
