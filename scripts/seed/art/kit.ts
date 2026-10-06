// Small SVG toolkit for the generated sample pictures (scripts/seed/art/*). Pure string
// builders: no I/O, no server modules, so the art can be previewed outside the seed.
// Photos are authored on a 1600 x 1200 canvas (4:3, like a phone camera) and rendered
// smaller; avatars on 512 x 512; documents at their own size.

export type Stop = readonly [offset: number, color: string, opacity?: number];

/** Compact number formatting for coordinates (one decimal at most). */
export function n(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/** A value rounded to two decimals, for opacities. */
export function r2(value: number): string {
  return String(Math.round(value * 100) / 100);
}

export function esc(text: string): string {
  return text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

/** Deterministic pseudo-random numbers (mulberry32): the same seed draws the same picture. */
export function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable 32-bit seed from a string (FNV-1a). */
export function seedOf(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function between(random: () => number, min: number, max: number): number {
  return min + (max - min) * random();
}

function stopList(list: readonly Stop[]): string {
  return list
    .map(([offset, color, opacity]) =>
      `<stop offset="${n(offset * 100)}%" stop-color="${color}"${opacity === undefined ? "" : ` stop-opacity="${opacity}"`}/>`,
    )
    .join("");
}

type Units = "objectBoundingBox" | "userSpaceOnUse";

/** A linear gradient from (x1, y1) to (x2, y2); bounding-box units by default (0..1). */
export function linear(
  id: string,
  [x1, y1, x2, y2]: readonly [number, number, number, number],
  list: readonly Stop[],
  units: Units = "objectBoundingBox",
): string {
  return `<linearGradient id="${id}" x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}"${
    units === "userSpaceOnUse" ? ' gradientUnits="userSpaceOnUse"' : ""
  }>${stopList(list)}</linearGradient>`;
}

/** Linear gradient in bounding-box units with fractional coordinates (keeps decimals). */
export function linearBox(id: string, [x1, y1, x2, y2]: readonly [number, number, number, number], list: readonly Stop[]): string {
  return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stopList(list)}</linearGradient>`;
}

export function radial(
  id: string,
  geometry: { cx: number; cy: number; r: number; fx?: number; fy?: number },
  list: readonly Stop[],
  options: { units?: Units; transform?: string } = {},
): string {
  const { cx, cy, r, fx, fy } = geometry;
  const box = (options.units ?? "objectBoundingBox") === "objectBoundingBox";
  const value = (v: number) => (box ? String(v) : n(v));
  const focus = `${fx === undefined ? "" : ` fx="${value(fx)}"`}${fy === undefined ? "" : ` fy="${value(fy)}"`}`;
  const units = box ? "" : ' gradientUnits="userSpaceOnUse"';
  const transform = options.transform ? ` gradientTransform="${options.transform}"` : "";
  return `<radialGradient id="${id}" cx="${value(cx)}" cy="${value(cy)}" r="${value(r)}"${focus}${units}${transform}>${stopList(list)}</radialGradient>`;
}

/** Gaussian blur filter with a generous region (so blurred shapes are not clipped). */
export function blur(id: string, deviation: number, margin = 0.6): string {
  const m = `${-margin * 100}%`;
  const size = `${100 + margin * 200}%`;
  return `<filter id="${id}" x="${m}" y="${m}" width="${size}" height="${size}" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${deviation}"/></filter>`;
}

/**
 * A grain/texture filter: fractal noise tinted with `color` at most `alpha` opaque. Applied
 * to a shape, it paints the noise inside the shape's bounding box only (cheap when small).
 */
export function noiseTexture(
  id: string,
  options: { frequency: number | string; octaves?: number; seed?: number; color: string; alpha: number; type?: "fractalNoise" | "turbulence"; contrast?: number },
): string {
  const [r, g, b] = rgb(options.color);
  const contrast = options.contrast ?? 1.6;
  // Alpha = noise luminance stretched by `contrast`, then scaled to at most `alpha`.
  return (
    `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="${options.type ?? "fractalNoise"}" baseFrequency="${options.frequency}" numOctaves="${options.octaves ?? 3}" seed="${options.seed ?? 2}" result="t"/>` +
    `<feColorMatrix in="t" type="matrix" values="0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} ${n(contrast * 0.33)} ${n(contrast * 0.33)} ${n(contrast * 0.33)} 0 ${n(-contrast * 0.5)}" result="c"/>` +
    `<feComponentTransfer in="c"><feFuncA type="linear" slope="${options.alpha}"/></feComponentTransfer>` +
    `<feComposite in2="SourceGraphic" operator="in"/>` +
    `</filter>`
  );
}

/** "#rrggbb" to 0..1 channel values. */
export function rgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  const int = Number.parseInt(full, 16);
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255].map((c) => Math.round(c * 1000) / 1000) as [
    number,
    number,
    number,
  ];
}

/** Mixes two "#rrggbb" colors (t = 0 gives a, 1 gives b). */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  const channel = (x: number, y: number) =>
    Math.round((x + (y - x) * t) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(ar, br)}${channel(ag, bg)}${channel(ab, bb)}`;
}

export const shade = (color: string, amount: number) => mix(color, "#000000", amount);
export const tint = (color: string, amount: number) => mix(color, "#ffffff", amount);

/** A point on a circle (degrees, 0 = 3 o'clock, clockwise because SVG y points down). */
export function polar(cx: number, cy: number, r: number, degrees: number): [number, number] {
  const radians = (degrees * Math.PI) / 180;
  return [cx + r * Math.cos(radians), cy + r * Math.sin(radians)];
}

/** An arc path (stroke it) from `start` to `end` degrees. */
export function arc(cx: number, cy: number, r: number, start: number, end: number): string {
  const [x1, y1] = polar(cx, cy, r, start);
  const [x2, y2] = polar(cx, cy, r, end);
  const large = Math.abs(end - start) > 180 ? 1 : 0;
  const sweep = end > start ? 1 : 0;
  return `M ${n(x1)} ${n(y1)} A ${n(r)} ${n(r)} 0 ${large} ${sweep} ${n(x2)} ${n(y2)}`;
}

/** A closed ring-sector path between radii r1 < r2. */
export function sector(cx: number, cy: number, r1: number, r2: number, start: number, end: number): string {
  const [ax, ay] = polar(cx, cy, r2, start);
  const [bx, by] = polar(cx, cy, r2, end);
  const [cx2, cy2] = polar(cx, cy, r1, end);
  const [dx, dy] = polar(cx, cy, r1, start);
  const large = Math.abs(end - start) > 180 ? 1 : 0;
  return `M ${n(ax)} ${n(ay)} A ${n(r2)} ${n(r2)} 0 ${large} 1 ${n(bx)} ${n(by)} L ${n(cx2)} ${n(cy2)} A ${n(r1)} ${n(r1)} 0 ${large} 0 ${n(dx)} ${n(dy)} Z`;
}

/** A full circle as a path (for even-odd cut-outs). */
export function circlePath(cx: number, cy: number, r: number): string {
  return `M ${n(cx - r)} ${n(cy)} a ${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0 a ${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0 Z`;
}

/** A rounded rectangle path. */
export function roundRect(x: number, y: number, width: number, height: number, radius: number): string {
  const r = Math.min(radius, width / 2, height / 2);
  return `M ${n(x + r)} ${n(y)} H ${n(x + width - r)} A ${n(r)} ${n(r)} 0 0 1 ${n(x + width)} ${n(y + r)} V ${n(y + height - r)} A ${n(r)} ${n(r)} 0 0 1 ${n(x + width - r)} ${n(y + height)} H ${n(x + r)} A ${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + height - r)} V ${n(y + r)} A ${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)} Z`;
}

/** Smooth closed path through points (Catmull-Rom converted to cubic Béziers). */
export function smoothClosed(points: readonly (readonly [number, number])[], tension = 1): string {
  const count = points.length;
  const p = (index: number) => points[(index + count) % count];
  let d = `M ${n(p(0)[0])} ${n(p(0)[1])}`;
  for (let index = 0; index < count; index += 1) {
    const [x0, y0] = p(index - 1);
    const [x1, y1] = p(index);
    const [x2, y2] = p(index + 1);
    const [x3, y3] = p(index + 2);
    const c1x = x1 + ((x2 - x0) / 6) * tension;
    const c1y = y1 + ((y2 - y0) / 6) * tension;
    const c2x = x2 - ((x3 - x1) / 6) * tension;
    const c2y = y2 - ((y3 - y1) / 6) * tension;
    d += ` C ${n(c1x)} ${n(c1y)} ${n(c2x)} ${n(c2y)} ${n(x2)} ${n(y2)}`;
  }
  return `${d} Z`;
}

/** Smooth open path through points. */
export function smoothOpen(points: readonly (readonly [number, number])[], tension = 1): string {
  const count = points.length;
  const p = (index: number) => points[Math.max(0, Math.min(count - 1, index))];
  let d = `M ${n(p(0)[0])} ${n(p(0)[1])}`;
  for (let index = 0; index < count - 1; index += 1) {
    const [x0, y0] = p(index - 1);
    const [x1, y1] = p(index);
    const [x2, y2] = p(index + 1);
    const [x3, y3] = p(index + 2);
    d += ` C ${n(x1 + ((x2 - x0) / 6) * tension)} ${n(y1 + ((y2 - y0) / 6) * tension)} ${n(x2 - ((x3 - x1) / 6) * tension)} ${n(y2 - ((y3 - y1) / 6) * tension)} ${n(x2)} ${n(y2)}`;
  }
  return d;
}

/** An irregular blob around (cx, cy): corrosion crust, grime, dust. */
export function blob(random: () => number, cx: number, cy: number, radius: number, wobble = 0.35, points = 9): string {
  const list: [number, number][] = [];
  for (let index = 0; index < points; index += 1) {
    const angle = (index / points) * Math.PI * 2;
    const r = radius * (1 - wobble / 2 + wobble * random());
    list.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  return smoothClosed(list);
}

export type Canvas = { width: number; height: number };

export const PHOTO_CANVAS: Canvas = { width: 1600, height: 1200 };

/**
 * A complete photo SVG: the scene, then a lens vignette and a faint warm/cool grade.
 * `output` is the rendered pixel size (the viewBox stays 1600 x 1200).
 */
export function photoSvg(
  defs: readonly string[],
  body: readonly string[],
  options: { vignette?: number; grade?: string; gradeOpacity?: number; output?: Canvas } = {},
): string {
  const { width, height } = PHOTO_CANVAS;
  const output = options.output ?? { width: 1200, height: 900 };
  const vignette = options.vignette ?? 0.55;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${output.width}" height="${output.height}" viewBox="0 0 ${width} ${height}">`,
    `<defs>`,
    radial("__vignette", { cx: 0.5, cy: 0.5, r: 0.75 }, [
      [0.55, "#000000", 0],
      [1, "#000000", vignette],
    ]),
    ...defs,
    `</defs>`,
    ...body,
    options.grade ? `<rect width="${width}" height="${height}" fill="${options.grade}" opacity="${options.gradeOpacity ?? 0.06}"/>` : "",
    `<rect width="${width}" height="${height}" fill="url(#__vignette)"/>`,
    `</svg>`,
  ].join("");
}

/** Soft elliptical contact shadow (uses a blur filter id defined by the caller). */
export function shadow(cx: number, cy: number, rx: number, ry: number, opacity: number, filterId: string, color = "#000000"): string {
  return `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${color}" opacity="${opacity}" filter="url(#${filterId})"/>`;
}

/** Out-of-focus background lights (circles with soft edges). */
export function bokeh(
  random: () => number,
  count: number,
  area: { x: number; y: number; width: number; height: number },
  colors: readonly string[],
  size: readonly [number, number],
  opacity: readonly [number, number],
): string {
  const parts: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const color = colors[Math.floor(random() * colors.length)];
    const r = between(random, size[0], size[1]);
    const x = area.x + random() * area.width;
    const y = area.y + random() * area.height;
    parts.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${color}" opacity="${r2(between(random, opacity[0], opacity[1]))}"/>`);
  }
  return parts.join("");
}

/** Joins non-empty fragments. */
export function g(parts: readonly (string | false | null | undefined)[], attributes = ""): string {
  const inner = parts.filter((part): part is string => typeof part === "string" && part.length > 0).join("");
  return attributes ? `<g ${attributes}>${inner}</g>` : inner;
}

export type Font = "sans" | "display" | "mono";

const FONTS: Record<Font, string> = {
  sans: "Segoe UI, Arial, Helvetica, sans-serif",
  display: "Bahnschrift, Segoe UI, Arial, sans-serif",
  mono: "Consolas, Cascadia Mono, Courier New, monospace",
};

export function text(
  x: number,
  y: number,
  content: string,
  style: {
    size: number;
    fill: string;
    weight?: number;
    anchor?: "start" | "middle" | "end";
    opacity?: number;
    font?: Font;
    spacing?: number;
    extra?: string;
  },
): string {
  const attributes = [
    `x="${n(x)}"`,
    `y="${n(y)}"`,
    `font-family="${FONTS[style.font ?? "sans"]}"`,
    `font-size="${style.size}"`,
    style.weight ? `font-weight="${style.weight}"` : "",
    style.anchor ? `text-anchor="${style.anchor}"` : "",
    `fill="${style.fill}"`,
    style.opacity === undefined ? "" : `fill-opacity="${style.opacity}"`,
    style.spacing === undefined ? "" : `letter-spacing="${style.spacing}"`,
    style.extra ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return `<text ${attributes}>${esc(content)}</text>`;
}
