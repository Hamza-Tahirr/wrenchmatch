// Profile pictures for the sample accounts: neon gradient monograms on a deep-space disc
// with a HUD-style ring (no pictures of real people). Mechanics get a small wrench badge.
import { blur, linear, n, polar, r2, radial, rng, text, tint } from "./kit";

export const AVATAR_PALETTES = {
  cyan: ["#22d3ee", "#6366f1"],
  violet: ["#a78bfa", "#ec4899"],
  amber: ["#fbbf24", "#f97316"],
  emerald: ["#34d399", "#06b6d4"],
  rose: ["#fb7185", "#a855f7"],
  blue: ["#60a5fa", "#22d3ee"],
  lime: ["#a3e635", "#14b8a6"],
  magenta: ["#f472b6", "#8b5cf6"],
  sky: ["#38bdf8", "#818cf8"],
  copper: ["#fb923c", "#e11d48"],
} as const;

export type AvatarPalette = keyof typeof AVATAR_PALETTES;

export type MonogramSpec = { initials: string; palette: AvatarPalette; badge: boolean; seed?: number };

const WRENCH =
  "M 71 10 C 58 7 45 16 44 30 C 44 33 44 35 45 38 L 13 70 C 8 75 8 83 13 88 C 18 93 26 93 31 88 L 63 56 C 66 57 68 57 71 57 C 85 56 94 43 91 30 L 79 42 L 66 39 L 63 26 Z";

export function monogramAvatar(spec: MonogramSpec): string {
  const [a, b] = AVATAR_PALETTES[spec.palette];
  const random = rng(spec.seed ?? spec.initials.charCodeAt(0) * 97 + (spec.initials.charCodeAt(1) || 7));
  const size = spec.initials.length > 1 ? 168 : 206;
  const ticks = Array.from({ length: 72 }, (_, index) => {
    const angle = index * 5;
    const major = index % 18 === 0;
    const [x1, y1] = polar(256, 256, major ? 226 : 230, angle);
    const [x2, y2] = polar(256, 256, 238, angle);
    return `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${major ? a : "#c7d2fe"}" stroke-width="${major ? 4 : 1.5}" opacity="${major ? 0.95 : 0.3}"/>`;
  }).join("");
  const grid = Array.from({ length: 17 }, (_, index) => {
    const p = index * 32;
    return `<path d="M ${p} 0 V 512 M 0 ${p} H 512" stroke="#ffffff" stroke-width="1"/>`;
  }).join("");
  const particles = Array.from({ length: 22 }, () => {
    const [x, y] = polar(256, 256, 120 + random() * 130, random() * 360);
    return `<circle cx="${n(x)}" cy="${n(y)}" r="${n(0.8 + random() * 2.2)}" fill="${random() < 0.5 ? a : "#ffffff"}" opacity="${r2((0.3 + random() * 0.6))}"/>`;
  }).join("");
  const arcs = [
    [200, 250],
    [20, 70],
    [110, 140],
  ]
    .map(([start, end]) => {
      const [x1, y1] = polar(256, 256, 214, start);
      const [x2, y2] = polar(256, 256, 214, end);
      return `<path d="M ${n(x1)} ${n(y1)} A 214 214 0 0 1 ${n(x2)} ${n(y2)}" stroke="${b}" stroke-width="10" fill="none" stroke-linecap="round" opacity="0.9"/>`;
    })
    .join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">`,
    `<defs>`,
    radial("space", { cx: 0.5, cy: 0.42, r: 0.75 }, [
      [0, "#141c3d"],
      [0.6, "#0a0f24"],
      [1, "#04060f"],
    ]),
    radial("fade", { cx: 0.5, cy: 0.5, r: 0.5 }, [
      [0, "#ffffff", 0.9],
      [1, "#ffffff", 0],
    ]),
    `<mask id="gridMask"><rect width="512" height="512" fill="url(#fade)"/></mask>`,
    linear("ring", [0, 0, 1, 1], [
      [0, a],
      [1, b],
    ]),
    radial("disc", { cx: 0.5, cy: 0.35, r: 0.75 }, [
      [0, "#1d2752"],
      [0.7, "#0d1330"],
      [1, "#070b1d"],
    ]),
    linear("glass", [0, 0, 0, 1], [
      [0, "#ffffff", 0.22],
      [1, "#ffffff", 0],
    ]),
    linear("ink", [0, 0, 0, 1], [
      [0, "#ffffff"],
      [0.55, tint(a, 0.55)],
      [1, a],
    ]),
    linear("badge", [0, 0, 1, 1], [
      [0, a],
      [1, b],
    ]),
    blur("glow", 14, 1),
    blur("halo", 30, 1),
    blur("textGlow", 10, 1),
    `</defs>`,
    `<rect width="512" height="512" fill="url(#space)"/>`,
    `<circle cx="120" cy="110" r="150" fill="${a}" opacity="0.35" filter="url(#halo)"/>`,
    `<circle cx="410" cy="420" r="160" fill="${b}" opacity="0.35" filter="url(#halo)"/>`,
    `<g mask="url(#gridMask)" opacity="0.07">${grid}</g>`,
    particles,
    `<circle cx="256" cy="256" r="214" fill="none" stroke="url(#ring)" stroke-width="16" opacity="0.7" filter="url(#glow)"/>`,
    `<circle cx="256" cy="256" r="214" fill="none" stroke="url(#ring)" stroke-width="5"/>`,
    arcs,
    ticks,
    `<circle cx="256" cy="256" r="192" fill="url(#disc)"/>`,
    `<circle cx="256" cy="256" r="192" fill="none" stroke="#ffffff" stroke-opacity="0.14" stroke-width="2"/>`,
    `<ellipse cx="256" cy="150" rx="150" ry="80" fill="url(#glass)"/>`,
    `<g filter="url(#textGlow)" opacity="0.85">${text(256, 256 + size * 0.35, spec.initials, { size, fill: a, weight: 700, anchor: "middle", font: "display", spacing: 2 })}</g>`,
    text(256, 256 + size * 0.35, spec.initials, { size, fill: "url(#ink)", weight: 700, anchor: "middle", font: "display", spacing: 2 }),
    spec.badge
      ? [
          `<circle cx="392" cy="392" r="58" fill="#070b1d"/>`,
          `<circle cx="392" cy="392" r="50" fill="url(#badge)"/>`,
          `<circle cx="392" cy="392" r="50" fill="none" stroke="#ffffff" stroke-opacity="0.5" stroke-width="2"/>`,
          `<g transform="translate(362 362) scale(0.6)"><path d="${WRENCH}" fill="#ffffff"/></g>`,
        ].join("")
      : "",
    `</svg>`,
  ].join("");
}
