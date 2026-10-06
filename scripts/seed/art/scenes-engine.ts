// Engine-bay scenes, drawn in a parallel 3/4 projection under a warm work light: the battery
// (crusted terminals, an original battery past its best, or a fresh replacement), the coil
// packs on top of an inline-four (one cracked, or all new) and the engine air filter (a dirty
// one in the airbox, or the old one next to the new one).
import { between, blob, blur, g, linear, n, noiseTexture, photoSvg, r2, radial, rng, roundRect, shade, text, tint } from "./kit";

type Pt = readonly [number, number];

/** Parallel projection: local x along `w`, y along `d` (away from the camera), z straight up. */
type Projector = {
  (x: number, y: number, z?: number): [number, number];
  /** An SVG transform drawing the local x/y plane at height z (circles become ellipses). */
  plane(z?: number): string;
  /** An SVG transform drawing the face y = y0 (local x right, local v downward from height top). */
  front(y0: number, top: number): string;
};

function projector(origin: Pt, w: Pt, d: Pt, length: number, depth: number): Projector {
  const a = w[0] / length;
  const b = w[1] / length;
  const c = d[0] / depth;
  const e = d[1] / depth;
  const f = (value: number) => Number(value.toFixed(4));
  const project = ((x: number, y: number, z = 0): [number, number] => [
    origin[0] + a * x + c * y,
    origin[1] + b * x + e * y - z,
  ]) as Projector;
  project.plane = (z = 0) => `matrix(${f(a)} ${f(b)} ${f(c)} ${f(e)} ${n(origin[0])} ${n(origin[1] - z)})`;
  project.front = (y0, top) => {
    const [x, y] = project(0, y0, top);
    return `matrix(${f(a)} ${f(b)} 0 1 ${n(x)} ${n(y)})`;
  };
  return project;
}

function poly(points: readonly Pt[]): string {
  return `M ${points.map(([x, y]) => `${n(x)} ${n(y)}`).join(" L ")} Z`;
}

/** The three visible faces of a box (top, front y = y0, right x = x1). */
function boxFaces(p: Projector, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number) {
  return {
    top: poly([p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)]),
    front: poly([p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1), p(x0, y0, z1)]),
    right: poly([p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), p(x1, y0, z1)]),
  };
}

/** A vertical cylinder standing on the plane: its side silhouette and its top cap. */
function cylinder(p: Projector, cx: number, cy: number, r: number, z0: number, height: number): { side: string; cap: string } {
  const steps = 40;
  const ring = (z: number) =>
    Array.from({ length: steps }, (_, index) => {
      const t = (index / steps) * Math.PI * 2;
      return p(cx + r * Math.cos(t), cy + r * Math.sin(t), z);
    });
  const base = ring(z0);
  const top = ring(z0 + height);
  let left = 0;
  let right = 0;
  base.forEach(([x], index) => {
    if (x < base[left][0]) left = index;
    if (x > base[right][0]) right = index;
  });
  // The half of the base ellipse nearer the camera (lower on screen) closes the silhouette.
  const walk = (from: number, to: number, step: 1 | -1) => {
    const points: Pt[] = [];
    for (let index = from; ; index = (index + step + steps) % steps) {
      points.push(base[index]);
      if (index === to) break;
    }
    return points;
  };
  const forward = walk(left, right, 1);
  const backward = walk(left, right, -1);
  const meanY = (points: readonly Pt[]) => points.reduce((sum, [, y]) => sum + y, 0) / points.length;
  const near = meanY(forward) > meanY(backward) ? forward : backward;
  return { side: poly([top[left], ...near, top[right]]), cap: poly(top) };
}

/** Crystalline battery-acid crust: white powder and blue-green copper salts. */
function crust(random: () => number, cx: number, cy: number, size: number, amount: number, blurId: string): string {
  if (amount <= 0) return "";
  // Mostly white powder, with pale blue-green copper salts mixed in.
  const colors = ["#f8fafc", "#f1f5f9", "#e2f3f1", "#d5f5ef", "#b8ece3", "#9ddfd5", "#e6edf3", "#c9e9e4"];
  const shadow: string[] = [];
  const powder: string[] = [];
  const count = Math.round(26 * amount) + 6;
  for (let index = 0; index < count; index += 1) {
    const angle = random() * Math.PI * 2;
    const distance = Math.pow(random(), 0.8) * size;
    const x = cx + Math.cos(angle) * distance;
    const y = cy + Math.sin(angle) * distance * 0.65;
    const r = between(random, size * 0.08, size * 0.26) * (0.7 + amount * 0.4);
    shadow.push(`<path d="${blob(random, x + 4, y + 6, r * 1.1, 0.6)}" fill="#0b2a28" opacity="0.5"/>`);
    powder.push(`<path d="${blob(random, x, y, r, 0.6)}" fill="${colors[Math.floor(random() * colors.length)]}" opacity="${r2(between(random, 0.8, 1))}"/>`);
  }
  const specks: string[] = [];
  for (let index = 0; index < Math.round(140 * amount); index += 1) {
    const angle = random() * Math.PI * 2;
    const distance = Math.pow(random(), 0.55) * size * 1.15;
    const x = cx + Math.cos(angle) * distance;
    const y = cy + Math.sin(angle) * distance * 0.65;
    const roll = random();
    const fill = roll < 0.55 ? "#ffffff" : roll < 0.8 ? "#5eead4" : roll < 0.92 ? "#0f766e" : "#1e3a8a";
    specks.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(between(random, 1, 3.2))}" fill="${fill}" opacity="${r2(between(random, 0.45, 1))}"/>`);
  }
  return [
    `<g filter="url(#${blurId})">${shadow.join("")}</g>`,
    `<g filter="url(#${blurId})">${powder.join("")}</g>`,
    `<g opacity="0.85">${powder.slice(0, Math.ceil(powder.length / 2)).join("")}</g>`,
    specks.join(""),
  ].join("");
}

// ---------------------------------------------------------------------------------
// The battery
// ---------------------------------------------------------------------------------

export type BatteryState = "corroded" | "worn" | "new";

export function batteryScene(state: BatteryState, seed = 31): string {
  const random = rng(seed);
  const corrosion = state === "corroded" ? 1 : state === "worn" ? 0.3 : 0;
  const fresh = state === "new";
  const p = projector([430, 980], [650, -55], [175, -235], 650, 290);
  const H = 360;
  const caseColor = fresh ? "#16181d" : "#2b2d33";

  const defs = [
    radial("bay", { cx: 0.38, cy: 0.3, r: 0.9 }, [
      [0, "#262a31"],
      [0.5, "#14171c"],
      [1, "#06070a"],
    ]),
    radial("work", { cx: 0.5, cy: 0.5, r: 0.5 }, [
      [0, "#ffe7c2", 0.32],
      [0.6, "#ffe7c2", 0.08],
      [1, "#ffe7c2", 0],
    ]),
    linear("lid", [0, 1, 1, 0], fresh
      ? [
          [0, "#2a2d35"],
          [0.45, "#3d414b"],
          [0.55, "#5b606c"],
          [0.62, "#2f323a"],
          [1, "#1a1c21"],
        ]
      : [
          [0, "#3a3c42"],
          [0.5, "#4a4c53"],
          [1, "#2c2e33"],
        ]),
    linear("caseFront", [0, 0, 0, 1], [
      [0, tint(caseColor, 0.18)],
      [0.5, caseColor],
      [1, shade(caseColor, 0.55)],
    ]),
    linear("caseSide", [0, 0, 1, 0], [
      [0, shade(caseColor, 0.25)],
      [1, shade(caseColor, 0.7)],
    ]),
    linear("label", [0, 0, 1, 1], fresh
      ? [
          [0, "#111318"],
          [0.6, "#1d2028"],
          [1, "#0b0c10"],
        ]
      : [
          [0, "#2f5fd0"],
          [0.55, "#1e40af"],
          [1, "#172f7a"],
        ]),
    linear("stripe", [0, 0, 1, 0], [
      [0, "#f97316"],
      [1, "#ef4444"],
    ]),
    linear("lead", [0, 0, 1, 0], [
      [0, "#6b6f78"],
      [0.35, "#d4d7dd"],
      [0.6, "#9ca1ab"],
      [1, "#4a4e57"],
    ]),
    linear("clamp", [0, 0, 1, 0], [
      [0, "#5d6470"],
      [0.4, "#c9ced6"],
      [1, "#3c424c"],
    ]),
    linear("redCap", [0, 0, 1, 1], [
      [0, "#f87171"],
      [0.5, "#dc2626"],
      [1, "#7f1d1d"],
    ]),
    linear("redCable", [0, 0, 0, 1], [
      [0, "#ef4444"],
      [0.5, "#991b1b"],
      [1, "#450a0a"],
    ]),
    linear("blackCable", [0, 0, 0, 1], [
      [0, "#4b5563"],
      [0.5, "#111827"],
      [1, "#030712"],
    ]),
    linear("bar", [0, 0, 0, 1], [
      [0, "#9aa1ab"],
      [1, "#3b4048"],
    ]),
    linear("tray", [0, 0, 0, 1], [
      [0, "#202227"],
      [1, "#0a0b0d"],
    ]),
    linear("reservoir", [0, 0, 1, 0], [
      [0, "#d9dde3", 0.55],
      [0.5, "#f5f7fa", 0.75],
      [1, "#c7ccd4", 0.5],
    ]),
    linear("coolant", [0, 0, 0, 1], [
      [0, "#f472b6", 0.9],
      [1, "#be185d", 0.95],
    ]),
    linear("cover", [0, 0, 1, 1], [
      [0, "#4b5059"],
      [0.5, "#2a2e35"],
      [1, "#14161a"],
    ]),
    linear("hose", [0, 0, 0, 1], [
      [0, "#3f3f46"],
      [0.5, "#111113"],
      [1, "#020203"],
    ]),
    linear("gloss", [0, 0, 1, 0], [
      [0, "#ffffff", 0],
      [0.5, "#ffffff", fresh ? 0.32 : 0.1],
      [1, "#ffffff", 0],
    ]),
    noiseTexture("grime", { frequency: 0.05, octaves: 4, seed: 14, color: "#1c1917", alpha: fresh ? 0.08 : 0.55, contrast: 2.2 }),
    noiseTexture("dust", { frequency: 0.9, octaves: 2, seed: 3, color: "#d6d3d1", alpha: fresh ? 0.04 : 0.16 }),
    noiseTexture("stain", { frequency: "0.02 0.035", octaves: 3, seed: 8, color: "#78350f", alpha: 0.5 * corrosion, type: "turbulence", contrast: 2.6 }),
    blur("bg", 14),
    blur("fg", 11),
    blur("soft", 10),
    blur("tiny", 2),
    blur("glow", 6),
  ];

  const battery = boxFaces(p, 0, 0, 650, 290, 0, H);
  const lidLine = poly([p(0, 0, H - 34), p(650, 0, H - 34), p(650, 290, H - 34), p(650, 290, H - 40), p(650, 0, H - 40), p(0, 0, H - 40)]);
  const tray = boxFaces(p, -30, -26, 690, 320, -28, 0);

  // Terminal posts with clamps; the positive one on the left.
  const posts = [
    { x: 92, y: 118, positive: true },
    { x: 558, y: 118, positive: false },
  ];
  const terminals = posts
    .map(({ x, y, positive }) => {
      const post = cylinder(p, x, y, 24, H, 44);
      const clamp = cylinder(p, x, y, 40, H + 6, 26);
      const [bx, by] = p(x + (positive ? -58 : 58), y - 6, H + 20);
      const bolt = positive ? [bx - 14, by] : [bx + 4, by];
      const parts = [
        `<path d="${clamp.side}" fill="#000" opacity="0.5" filter="url(#tiny)" transform="translate(10 12)"/>`,
        `<path d="${post.side}" fill="url(#lead)"/>`,
        `<path d="${post.cap}" fill="#c5c9d0"/>`,
        `<path d="${clamp.side}" fill="url(#clamp)"/>`,
        `<path d="${clamp.cap}" fill="#9aa0aa"/>`,
        `<path d="${cylinder(p, x, y, 25, H + 6, 26).cap}" fill="#5a606b"/>`,
        `<path d="${post.cap}" fill="url(#lead)" transform="translate(0 -8)"/>`,
        `<path d="${roundRect(bolt[0], bolt[1] - 13, 22, 26, 5)}" fill="url(#clamp)"/>`,
        `<circle cx="${n(bolt[0] + 11)}" cy="${n(bolt[1])}" r="7" fill="#2f343c"/>`,
      ];
      if (positive && fresh) {
        // A red rubber boot over the positive clamp.
        const boot = cylinder(p, x - 6, y, 52, H + 4, 40);
        parts.push(`<path d="${boot.side}" fill="url(#redCap)"/>`, `<path d="${boot.cap}" fill="#ef4444"/>`);
        parts.push(`<path d="${boot.cap}" fill="#fff" opacity="0.18" transform="translate(-6 -4) scale(1)"/>`);
        const [tx, ty] = p(x - 6, y, H + 44);
        parts.push(text(tx, ty + 12, "+", { size: 46, fill: "#fff5f5", weight: 700, anchor: "middle", font: "display" }));
      }
      return parts.join("");
    })
    .join("");

  // Felt anti-corrosion washers on a fresh install.
  const washers = fresh
    ? posts
        .map(({ x, y, positive }) => `<g transform="${p.plane(H + 1)}"><circle cx="${x}" cy="${y}" r="46" fill="${positive ? "#b91c1c" : "#15803d"}"/><circle cx="${x}" cy="${y}" r="30" fill="#0b0c0f"/></g>`)
        .join("")
    : "";

  const [px, py] = p(30, 112, H + 26);
  const [nx, ny] = p(626, 112, H + 26);
  const cables = [
    `<path d="M ${n(px)} ${n(py)} C ${n(px - 120)} ${n(py + 10)} 210 ${n(py + 200)} 60 ${n(py + 330)} S -80 ${n(py + 470)} -120 ${n(py + 520)}" stroke="#000" stroke-width="58" fill="none" opacity="0.5" filter="url(#soft)" transform="translate(16 22)"/>`,
    `<path d="M ${n(px)} ${n(py)} C ${n(px - 120)} ${n(py + 10)} 210 ${n(py + 200)} 60 ${n(py + 330)} S -80 ${n(py + 470)} -120 ${n(py + 520)}" stroke="url(#redCable)" stroke-width="50" fill="none" stroke-linecap="round"/>`,
    `<path d="M ${n(px - 6)} ${n(py - 14)} C ${n(px - 120)} ${n(py - 6)} 200 ${n(py + 182)} 50 ${n(py + 312)}" stroke="#fecaca" stroke-width="6" fill="none" opacity="0.35"/>`,
    `<path d="M ${n(nx)} ${n(ny)} C ${n(nx + 140)} ${n(ny - 20)} 1330 ${n(ny - 150)} 1460 ${n(ny - 200)} S 1620 ${n(ny - 250)} 1700 ${n(ny - 260)}" stroke="url(#blackCable)" stroke-width="46" fill="none" stroke-linecap="round"/>`,
    `<path d="M ${n(nx + 4)} ${n(ny - 14)} C ${n(nx + 140)} ${n(ny - 34)} 1330 ${n(ny - 164)} 1460 ${n(ny - 214)}" stroke="#9ca3af" stroke-width="4" fill="none" opacity="0.35"/>`,
  ].join("");

  // Hold-down bar across the back of the lid, with its J-bolt on the right.
  const bar = boxFaces(p, -24, 214, 674, 244, H, H + 14);
  const [jx1, jy1] = p(674, 229, H + 10);
  const [jx2, jy2] = p(674, 229, 30);
  const holdDown = [
    `<path d="${bar.top}" fill="url(#bar)"/>`,
    `<path d="${bar.front}" fill="#3a3f47"/>`,
    `<path d="${bar.right}" fill="#2a2e35"/>`,
    `<path d="M ${n(jx1)} ${n(jy1)} L ${n(jx2)} ${n(jy2)}" stroke="#6b7280" stroke-width="11" stroke-linecap="round"/>`,
    `<path d="M ${n(jx1 - 3)} ${n(jy1)} L ${n(jx2 - 3)} ${n(jy2)}" stroke="#d1d5db" stroke-width="3" opacity="0.5"/>`,
  ].join("");

  // On the lid: vent caps (old flooded battery) or a sticker (new AGM), and the charge eye.
  const lidDetails = fresh
    ? [
        `<g transform="${p.plane(H)}">`,
        `<path d="${roundRect(180, 150, 290, 52, 10)}" fill="#0b0c10"/>`,
        `<path d="${roundRect(186, 156, 278, 40, 8)}" fill="url(#stripe)"/>`,
        // The plane's y axis points away from the camera, so text is flipped back upright.
        `<g transform="translate(325 176) scale(1 -1)">${text(0, 9, "AGM  ·  SPILL-PROOF", { size: 24, fill: "#fff7ed", weight: 700, anchor: "middle", font: "display", spacing: 2 })}</g>`,
        `<circle cx="325" cy="64" r="20" fill="#052e16"/><circle cx="325" cy="64" r="13" fill="#22c55e"/><circle cx="320" cy="59" r="5" fill="#bbf7d0"/>`,
        `</g>`,
      ].join("")
    : [
        `<g transform="${p.plane(H)}">`,
        `<path d="${roundRect(170, 146, 310, 58, 14)}" fill="#24262b"/>`,
        ...Array.from({ length: 6 }, (_, index) => `<circle cx="${198 + index * 51}" cy="175" r="17" fill="#3b3e45" stroke="#17181c" stroke-width="4"/><path d="M ${188 + index * 51} 175 h 20" stroke="#17181c" stroke-width="4"/>`),
        `<circle cx="325" cy="64" r="20" fill="#0c0d10"/><circle cx="325" cy="64" r="13" fill="#1f2937"/><circle cx="321" cy="60" r="4" fill="#6b7280"/>`,
        `</g>`,
      ].join("");

  // Front label (front-face coordinates: x right, v down from the lid seam).
  const label = [
    `<g transform="${p.front(0, H - 48)}">`,
    `<path d="${roundRect(26, 14, 598, 250, 12)}" fill="url(#label)"/>`,
    fresh ? `<path d="${roundRect(26, 14, 598, 34, 12)}" fill="url(#stripe)"/>` : `<path d="M 26 220 H 624 V 252 C 624 259 618 264 612 264 H 38 C 32 264 26 259 26 252 Z" fill="#facc15"/>`,
    fresh
      ? text(325, 42, "PREMIUM START", { size: 24, fill: "#fff7ed", weight: 700, anchor: "middle", font: "display", spacing: 6 })
      : "",
    `<path d="M 74 ${fresh ? 82 : 60} l -26 64 h 26 l -14 52 l 46 -74 h -28 l 18 -42 Z" fill="${fresh ? "#fb923c" : "#facc15"}"/>`,
    text(140, fresh ? 132 : 112, "12V", { size: 74, fill: "#ffffff", weight: 700, font: "display" }),
    text(300, fresh ? 116 : 96, fresh ? "AGM  GROUP 35" : "GROUP 35", { size: 30, fill: "#e0e7ff", weight: 700, font: "display" }),
    text(300, fresh ? 154 : 134, "650 CCA  ·  100 RC", { size: 28, fill: fresh ? "#cbd5e1" : "#bfdbfe", weight: 600, font: "display" }),
    text(140, fresh ? 206 : 178, fresh ? "Cold-cranking amps tested · 3-year replacement" : "MAINTENANCE FREE · KEEP UPRIGHT", { size: 21, fill: fresh ? "#94a3b8" : "#dbeafe", font: "sans" }),
    fresh ? "" : text(325, 248, "DANGER: EXPLOSIVE GASES · CORROSIVE ACID", { size: 19, fill: "#422006", weight: 700, anchor: "middle", font: "sans" }),
    `<path d="${roundRect(520, fresh ? 222 : 182, 88, 32, 6)}" fill="${fresh ? "#e2e8f0" : "#f1f5f9"}"/>`,
    text(564, fresh ? 245 : 205, fresh ? "08/26" : "05/19", { size: 20, fill: "#0f172a", weight: 700, anchor: "middle", font: "mono" }),
    `</g>`,
  ].join("");

  // Molded ribs on the right face.
  const ribs = Array.from({ length: 6 }, (_, index) => {
    const y = 40 + index * 40;
    const [x1, y1] = p(650, y, 60);
    const [x2, y2] = p(650, y, H - 70);
    return `<path d="M ${n(x1)} ${n(y1)} L ${n(x2)} ${n(y2)}" stroke="#000" stroke-width="9" opacity="0.28"/><path d="M ${n(x1 + 5)} ${n(y1 - 4)} L ${n(x2 + 5)} ${n(y2 - 4)}" stroke="#fff" stroke-width="2" opacity="0.08"/>`;
  }).join("");

  // Fuse box to the left of the battery.
  const fuse = boxFaces(p, -500, 30, -80, 250, 0, 240);
  const fuseBox = [
    `<path d="${fuse.front}" fill="#121318"/>`,
    `<path d="${fuse.right}" fill="#0b0c0f"/>`,
    `<path d="${fuse.top}" fill="#24262d"/>`,
    `<g transform="${p.plane(240)}">`,
    `<path d="${roundRect(-470, 60, 360, 160, 14)}" fill="#2f323a"/>`,
    ...Array.from({ length: 5 }, (_, index) => `<path d="M ${-450 + index * 70} 80 v 120" stroke="#1a1b20" stroke-width="10"/>`),
    `<path d="${roundRect(-430, 104, 110, 44, 6)}" fill="#e5e7eb" opacity="0.6"/>`,
    `</g>`,
  ].join("");

  const crustParts = corrosion > 0
    ? [
        crust(random, ...p(92, 108, H + 34), 92 * (0.5 + corrosion * 0.5), corrosion, "tiny"),
        crust(random, ...p(40, 70, H + 6), 60 * corrosion, corrosion * 0.8, "tiny"),
        crust(random, ...p(558, 112, H + 30), 54 * corrosion, corrosion * 0.6, "tiny"),
      ].join("")
    : "";

  const body = [
    `<rect width="1600" height="1200" fill="url(#bay)"/>`,
    // Background, out of focus: coolant reservoir, engine cover, strut tower, intake tube.
    g(
      [
        `<path d="${roundRect(40, 30, 360, 300, 60)}" fill="url(#reservoir)"/>`,
        `<path d="M 40 190 H 400 V 270 C 400 303 373 330 340 330 H 100 C 67 330 40 303 40 270 Z" fill="url(#coolant)" opacity="0.85"/>`,
        `<circle cx="300" cy="40" r="56" fill="#f3f4f6"/>`,
        `<path d="M 980 -40 L 1660 -60 L 1660 300 L 1100 330 Z" fill="url(#cover)"/>`,
        ...[0, 1, 2, 3, 4].map((index) => `<path d="M ${1120 + index * 100} 40 l 40 230" stroke="#16181c" stroke-width="16"/>`),
        `<path d="M 1380 300 C 1500 420 1520 600 1640 760" stroke="url(#hose)" stroke-width="130" fill="none"/>`,
        ...[0, 1, 2, 3, 4, 5, 6].map((index) => `<path d="M ${1400 + index * 30} ${330 + index * 64} l 110 -40" stroke="#000" stroke-width="10" opacity="0.5"/>`),
        `<path d="M 420 -20 C 600 60 820 70 1000 30" stroke="#18181b" stroke-width="54" fill="none"/>`,
        `<path d="M 470 40 l 40 -30 M 620 70 l 30 -36" stroke="#facc15" stroke-width="14"/>`,
      ],
      `filter="url(#bg)"`,
    ),
    `<ellipse cx="640" cy="470" rx="820" ry="620" fill="url(#work)"/>`,
    fuseBox,
    // The tray and the battery.
    `<path d="${tray.front}" fill="url(#tray)"/>`,
    `<path d="${tray.right}" fill="#08090b"/>`,
    `<path d="${tray.top}" fill="#1b1d22"/>`,
    `<path d="${poly([p(0, 0, 0), p(650, 0, 0), p(650, 290, 0), p(0, 290, 0)])}" fill="#000" opacity="0.7" filter="url(#soft)" transform="translate(14 16)"/>`,
    `<path d="${battery.front}" fill="url(#caseFront)"/>`,
    `<path d="${battery.right}" fill="url(#caseSide)"/>`,
    ribs,
    `<path d="${battery.top}" fill="url(#lid)"/>`,
    `<path d="${lidLine}" fill="#000" opacity="0.35"/>`,
    label,
    `<path d="${battery.front}" fill="url(#gloss)" opacity="0.6"/>`,
    `<path d="${battery.front}" fill="#fff" filter="url(#dust)"/>`,
    `<path d="${battery.top}" fill="#fff" filter="url(#grime)"/>`,
    `<path d="${battery.top}" fill="#fff" filter="url(#stain)"/>`,
    `<path d="M ${n(p(0, 0, H)[0])} ${n(p(0, 0, H)[1])} L ${n(p(650, 0, H)[0])} ${n(p(650, 0, H)[1])}" stroke="#ffffff" stroke-width="3" opacity="${fresh ? 0.45 : 0.18}"/>`,
    `<path d="M ${n(p(650, 0, H)[0])} ${n(p(650, 0, H)[1])} L ${n(p(650, 290, H)[0])} ${n(p(650, 290, H)[1])}" stroke="#93c5fd" stroke-width="3" opacity="0.3"/>`,
    lidDetails,
    washers,
    holdDown,
    cables,
    terminals,
    crustParts,
    // Foreground: the radiator support, out of focus.
    g([`<path d="M -60 1090 C 400 1050 1100 1060 1660 1110 L 1660 1260 L -60 1260 Z" fill="#0b0c0f"/>`, `<path d="M -60 1090 C 400 1050 1100 1060 1660 1110" stroke="#3f4249" stroke-width="10" fill="none"/>`], `filter="url(#fg)"`),
  ];
  return photoSvg(defs, body, { vignette: 0.6, grade: "#f59e0b", gradeOpacity: 0.035 });
}


/**
 * A slab with rounded corners standing on the plane (z0 to z1): its bottom outline and the
 * band between its extreme corners make the sides, then the top.
 */
function slab(p: Projector, x: number, y: number, w: number, d: number, z0: number, z1: number, r: number, top: string, side: string): string {
  const corners = [p(x, y, z1), p(x + w, y, z1), p(x + w, y + d, z1), p(x, y + d, z1)];
  const bottoms = [p(x, y, z0), p(x + w, y, z0), p(x + w, y + d, z0), p(x, y + d, z0)];
  let left = 0;
  let right = 0;
  corners.forEach(([cx], index) => {
    if (cx < corners[left][0]) left = index;
    if (cx > corners[right][0]) right = index;
  });
  return [
    `<g transform="${p.plane(z0)}"><path d="${roundRect(x, y, w, d, r)}" fill="${side}"/></g>`,
    `<path d="${poly([corners[left], bottoms[left], bottoms[right], corners[right]])}" fill="${side}"/>`,
    `<g transform="${p.plane(z1)}"><path d="${roundRect(x, y, w, d, r)}" fill="${top}"/></g>`,
  ].join("");
}

/** The soft contact shadow of a slab footprint on the plane. */
function slabShadow(p: Projector, x: number, y: number, w: number, d: number, z: number, r: number, offset: Pt, opacity: number): string {
  return `<g transform="translate(${offset[0]} ${offset[1]})"><g transform="${p.plane(z)}"><path d="${roundRect(x, y, w, d, r)}" fill="#000" opacity="${opacity}" filter="url(#soft)"/></g></g>`;
}

/** Upright text on a plane whose y axis points away from the camera. */
function planeText(p: Projector, z: number, x: number, y: number, content: string, style: Parameters<typeof text>[3]): string {
  return `<g transform="${p.plane(z)}"><g transform="translate(${n(x)} ${n(y)}) scale(1 -1)">${text(0, 0, content, style)}</g></g>`;
}

// ---------------------------------------------------------------------------------
// Coil packs on top of an inline-four
// ---------------------------------------------------------------------------------

export type CoilState = "cracked" | "new";

export function coilPackScene(state: CoilState, seed = 41): string {
  const random = rng(seed);
  const fresh = state === "new";
  const p = projector([150, 1060], [1240, -120], [250, -500], 1240, 400);

  const defs = [
    radial("bay", { cx: 0.5, cy: 0.35, r: 0.95 }, [
      [0, "#2b2e35"],
      [0.6, "#121418"],
      [1, "#040506"],
    ]),
    radial("work", { cx: 0.5, cy: 0.5, r: 0.5 }, [
      [0, "#fff1d6", 0.34],
      [0.6, "#fff1d6", 0.08],
      [1, "#fff1d6", 0],
    ]),
    linear("cover", [0, 0, 1, 1], [
      [0, "#c3c8cf"],
      [0.35, "#8e949d"],
      [0.6, "#6b717a"],
      [1, "#3f444b"],
    ]),
    linear("coverSide", [0, 0, 1, 0], [
      [0, "#3b3f46"],
      [1, "#15171a"],
    ]),
    linear("plateau", [0, 0, 1, 1], [
      [0, "#d7dbe0"],
      [0.5, "#a3a9b1"],
      [1, "#6f757e"],
    ]),
    linear("coilTop", [0, 0, 1, 1], fresh
      ? [
          [0, "#4a4f5a"],
          [0.4, "#262930"],
          [1, "#0d0e11"],
        ]
      : [
          [0, "#3b3d43"],
          [0.5, "#222429"],
          [1, "#101114"],
        ]),
    linear("coilSide", [0, 0, 1, 0], [
      [0, "#1c1e22"],
      [1, "#060607"],
    ]),
    linear("plug", [0, 0, 1, 1], [
      [0, fresh ? "#93c5fd" : "#d1d5db"],
      [0.5, fresh ? "#2563eb" : "#8b929c"],
      [1, fresh ? "#1e3a8a" : "#4b5563"],
    ]),
    linear("loom", [0, 0, 0, 1], [
      [0, "#52525b"],
      [0.35, "#18181b"],
      [1, "#000000"],
    ]),
    linear("brace", [0, 0, 0, 1], [
      [0, "#f1f5f9"],
      [0.4, "#94a3b8"],
      [1, "#334155"],
    ]),
    linear("runner", [0, 0, 1, 0], [
      [0, "#141518"],
      [0.5, "#3a3d44"],
      [1, "#0c0d10"],
    ]),
    linear("cap", [0, 0, 1, 1], [
      [0, "#fde68a"],
      [0.5, "#eab308"],
      [1, "#854d0e"],
    ]),
    linear("paint", [0, 0, 1, 1], [
      [0, "#ef4444"],
      [0.5, "#991b1b"],
      [1, "#450a0a"],
    ]),
    radial("well", { cx: 0.5, cy: 0.5, r: 0.5 }, [
      [0.55, "#000000", 0.95],
      [1, "#000000", 0],
    ]),
    noiseTexture("cast", { frequency: 0.65, octaves: 2, seed: 7, color: "#000000", alpha: 0.32 }),
    noiseTexture("grime", { frequency: 0.04, octaves: 4, seed: 19, color: "#1c1917", alpha: fresh ? 0.12 : 0.4, contrast: 2.2 }),
    blur("bg", 13),
    blur("fg", 10),
    blur("soft", 9),
    blur("tiny", 2),
    blur("glow", 5),
  ];

  const bolts = [
    [40, 40],
    [330, 30],
    [620, 30],
    [910, 30],
    [1200, 40],
    [40, 360],
    [330, 370],
    [620, 370],
    [910, 370],
    [1200, 360],
  ]
    .map(([x, y]) => {
      const bolt = cylinder(p, x, y, 14, 60, 12);
      return `<path d="${bolt.side}" fill="#4b5563"/><path d="${bolt.cap}" fill="#cbd5e1"/>`;
    })
    .join("");

  const coils = [0, 1, 2, 3]
    .map((index) => {
      const x = 240 + index * 255;
      const y = 200;
      const cracked = !fresh && index === 1;
      const parts: string[] = [];
      parts.push(`<g transform="${p.plane(76)}"><ellipse cx="${x}" cy="${y}" rx="86" ry="80" fill="url(#well)"/></g>`);
      parts.push(slabShadow(p, x - 66, y - 54, 132, 108, 76, 18, [18, 14], 0.6));
      parts.push(slab(p, x - 66, y - 54, 132, 108, 76, 136, 18, "url(#coilTop)", "url(#coilSide)"));
      // Mounting tab and bolt on the right.
      parts.push(slab(p, x + 50, y - 30, 64, 40, 76, 90, 10, "#3a3d44", "#15171a"));
      const bolt = cylinder(p, x + 92, y - 10, 13, 90, 14);
      parts.push(`<path d="${bolt.side}" fill="#6b7280"/><path d="${bolt.cap}" fill="#e5e7eb"/>`);
      // A white part-number label with a barcode on the coil.
      parts.push(
        `<g transform="${p.plane(136)}"><path d="${roundRect(x - 46, y - 36, 72, 46, 5)}" fill="${fresh ? "#f8fafc" : "#cbd5e1"}" opacity="${fresh ? 0.95 : 0.6}"/>${[0, 1, 2, 3, 4, 5, 6, 7, 8]
          .map((k) => `<path d="M ${x - 38 + k * 6.5} ${y - 28} v 20" stroke="#111827" stroke-width="${k % 3 === 0 ? 3 : 1.5}"/>`)
          .join("")}</g>`,
      );
      parts.push(planeText(p, 136, x + 36, y + 22, String(index + 1), { size: 30, fill: "#e5e7eb", weight: 700, anchor: "middle", font: "display", opacity: 0.75 }));
      // Connector at the back and its pigtail into the loom.
      parts.push(slab(p, x - 34, y + 50, 68, 44, 104, 146, 8, "url(#plug)", fresh ? "#1e3a8a" : "#374151"));
      parts.push(slab(p, x - 12, y + 44, 24, 12, 130, 152, 3, fresh ? "#dbeafe" : "#e5e7eb", "#6b7280"));
      const [lx, ly] = p(x, y + 94, 128);
      const [mx, my] = p(x + 10, 360, 150);
      parts.push(`<path d="M ${n(lx)} ${n(ly)} C ${n(lx)} ${n(ly - 40)} ${n(mx)} ${n(my + 40)} ${n(mx)} ${n(my)}" stroke="#09090b" stroke-width="20" fill="none" stroke-linecap="round"/>`);
      const [ax, ay] = p(x - 50, y - 54, 136);
      const [bx, by] = p(x + 50, y - 54, 136);
      parts.push(`<path d="M ${n(ax)} ${n(ay)} L ${n(bx)} ${n(by)}" stroke="#ffffff" stroke-width="3" opacity="${fresh ? 0.45 : 0.22}"/>`);
      if (cracked) {
        // A hairline crack with white carbon tracking down the coil, and oil seeping in the well.
        const [k1x, k1y] = p(x - 30, y - 54, 134);
        const crack = `M ${n(k1x)} ${n(k1y)} l 6 10 l -5 9 l 9 12 l -3 11 l 8 10`;
        parts.push(
          `<path d="${crack}" stroke="#bae6fd" stroke-width="12" fill="none" opacity="0.35" filter="url(#glow)"/>`,
          `<path d="${crack}" stroke="#f8fafc" stroke-width="3.5" fill="none" stroke-linejoin="round"/>`,
          `<g transform="${p.plane(136)}"><path d="${blob(random, x - 20, y - 20, 26, 0.6)}" fill="#7c2d12" opacity="0.35" filter="url(#tiny)"/></g>`,
          `<g transform="${p.plane(76)}"><path d="${blob(random, x - 80, y - 66, 34, 0.5)}" fill="#3b2208" opacity="0.9"/><path d="${blob(random, x - 88, y - 70, 15, 0.5)}" fill="#ca8a04" opacity="0.55"/></g>`,
        );
      }
      return parts.join("");
    })
    .join("");

  const loomPoints = [-120, 160, 420, 680, 940, 1200, 1400].map((x, index) => p(x, 362 + (index % 2) * 10, 150));
  const loomPath = `M ${loomPoints.map(([x, y]) => `${n(x)} ${n(y)}`).join(" L ")}`;
  const loomRidges = Array.from({ length: 64 }, (_, index) => {
    const [x, y] = p(-100 + index * 24, 366, 150);
    return `<path d="M ${n(x - 6)} ${n(y - 20)} q 4 20 0 40" stroke="#3f3f46" stroke-width="3" fill="none" opacity="0.6"/>`;
  }).join("");

  const filler = cylinder(p, 1130, 330, 52, 76, 30);
  const body = [
    `<rect width="1600" height="1200" fill="url(#bay)"/>`,
    g(
      [
        ...[0, 1, 2, 3].map((index) => `<path d="M ${300 + index * 290} 330 C ${330 + index * 290} 150 ${460 + index * 290} 70 ${620 + index * 290} 40" stroke="url(#runner)" stroke-width="110" fill="none"/>`),
        `<path d="M -40 120 L 1640 10" stroke="url(#brace)" stroke-width="64"/>`,
        `<path d="M 1380 -40 C 1460 60 1560 90 1660 90 V -40 Z" fill="url(#paint)"/>`,
        `<path d="M 1220 1240 C 1300 1060 1460 990 1660 970 V 1260 Z" fill="#131418"/>`,
      ],
      `filter="url(#bg)"`,
    ),
    `<ellipse cx="720" cy="560" rx="840" ry="620" fill="url(#work)"/>`,
    // Valve cover with a raised center plateau, its bolts and the oil filler cap.
    slabShadow(p, 0, 0, 1240, 400, 0, 70, [16, 34], 0.55),
    slab(p, 0, 0, 1240, 400, 0, 60, 70, "url(#cover)", "url(#coverSide)"),
    `<g transform="${p.plane(60)}"><path d="${roundRect(0, 0, 1240, 400, 70)}" fill="#fff" filter="url(#cast)"/><path d="${roundRect(0, 0, 1240, 400, 70)}" fill="#fff" filter="url(#grime)"/></g>`,
    slab(p, 90, 96, 1060, 210, 60, 76, 40, "url(#plateau)", "#4b5059"),
    `<g transform="${p.plane(76)}"><path d="${roundRect(90, 96, 1060, 210, 40)}" fill="#fff" filter="url(#cast)"/></g>`,
    planeText(p, 60, 150, 58, "DOHC 16V", { size: 34, fill: "#4b5563", weight: 700, font: "display", spacing: 8 }),
    planeText(p, 60, 150, 56, "DOHC 16V", { size: 34, fill: "#e5e7eb", weight: 700, font: "display", spacing: 8, opacity: 0.5 }),
    bolts,
    `<path d="${filler.side}" fill="#713f12"/><path d="${filler.cap}" fill="url(#cap)"/>`,
    `<g transform="${p.plane(106)}"><path d="M 1100 330 h 60 M 1130 300 v 60" stroke="#713f12" stroke-width="10"/></g>`,
    // Harness loom behind the coils.
    `<path d="${loomPath}" stroke="#000" stroke-width="60" fill="none" opacity="0.5" filter="url(#soft)" transform="translate(12 24)"/>`,
    `<path d="${loomPath}" stroke="url(#loom)" stroke-width="50" fill="none" stroke-linejoin="round"/>`,
    loomRidges,
    `<path d="${loomPath}" stroke="#a1a1aa" stroke-width="4" fill="none" opacity="0.25" transform="translate(0 -14)"/>`,
    coils,
    g([`<path d="M -80 1140 C 300 1000 520 1120 900 1260" stroke="url(#loom)" stroke-width="120" fill="none"/>`], `filter="url(#fg)"`),
  ];
  return photoSvg(defs, body, { vignette: 0.6, grade: "#f59e0b", gradeOpacity: 0.03 });
}

// ---------------------------------------------------------------------------------
// Engine air filter
// ---------------------------------------------------------------------------------

export type FilterState = "dirty" | "compare";

/** A pleated panel filter with a urethane frame, lying flat (local box x0..x0+w, y0..y0+d). */
function panelFilter(p: Projector, x0: number, y0: number, w: number, d: number, dirty: boolean, prefix: string, random: () => number): string {
  const rim = 30;
  const inner = { x: x0 + rim, y: y0 + rim, w: w - 2 * rim, d: d - 2 * rim };
  const pleats: string[] = [];
  const count = 15;
  const valley = 30;
  const ridge = 54;
  for (let index = 0; index < count; index += 1) {
    const ya = inner.y + (inner.d * index) / count;
    const yb = inner.y + (inner.d * (index + 0.5)) / count;
    const yc = inner.y + (inner.d * (index + 1)) / count;
    const left = inner.x;
    const right = inner.x + inner.w;
    pleats.push(`<path fill="url(#${prefix}Lit)" d="${poly([p(left, ya, valley), p(right, ya, valley), p(right, yb, ridge), p(left, yb, ridge)])}"/>`);
    pleats.push(`<path fill="url(#${prefix}Shade)" d="${poly([p(left, yb, ridge), p(right, yb, ridge), p(right, yc, valley), p(left, yc, valley)])}"/>`);
    const [r1x, r1y] = p(left, yb, ridge);
    const [r2x, r2y] = p(right, yb, ridge);
    pleats.push(`<path d="M ${n(r1x)} ${n(r1y)} L ${n(r2x)} ${n(r2y)}" stroke="#ffffff" stroke-width="2" opacity="${dirty ? 0.12 : 0.55}"/>`);
  }
  const media = poly([p(inner.x, inner.y, ridge), p(inner.x + inner.w, inner.y, ridge), p(inner.x + inner.w, inner.y + inner.d, ridge), p(inner.x, inner.y + inner.d, ridge)]);
  const debris: string[] = [];
  if (dirty) {
    for (let index = 0; index < 7; index += 1) {
      // Dry leaf fragments with a midrib.
      const [x, y] = p(between(random, inner.x + 40, inner.x + inner.w - 40), between(random, inner.y + 30, inner.y + inner.d - 30), ridge + 2);
      const angle = between(random, -60, 60);
      const length = between(random, 26, 46);
      const color = random() < 0.5 ? "#7c4a1e" : "#9a6a2f";
      debris.push(
        `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(angle)})"><ellipse cx="0" cy="0" rx="${n(length)}" ry="${n(length * 0.38)}" fill="${color}"/><path d="M ${n(-length)} 0 L ${n(length)} 0" stroke="#3b2208" stroke-width="2"/><ellipse cx="${n(-length * 0.3)}" cy="${n(-length * 0.12)}" rx="${n(length * 0.4)}" ry="${n(length * 0.1)}" fill="#ffffff" opacity="0.12"/></g>`,
      );
    }
    for (let index = 0; index < 40; index += 1) {
      const [x, y] = p(between(random, inner.x + 20, inner.x + inner.w - 20), between(random, inner.y + 20, inner.y + inner.d - 20), ridge + 1);
      const bug = random() < 0.3;
      debris.push(
        bug
          ? `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(between(random, 4, 7))}" ry="${n(between(random, 2, 4))}" fill="#0c0a09"/><ellipse cx="${n(x - 2)}" cy="${n(y - 2)}" rx="3" ry="1.4" fill="#d6d3d1" opacity="0.5"/>`
          : `<circle cx="${n(x)}" cy="${n(y)}" r="${n(between(random, 1.5, 3.5))}" fill="#292524" opacity="0.75"/>`,
      );
    }
  }
  return [
    slabShadow(p, x0, y0, w, d, 0, 26, [20, 26], 0.45),
    slab(p, x0, y0, w, d, 0, 56, 26, dirty ? "#33353b" : "url(#frameNew)", dirty ? "#141518" : "#9a3412"),
    `<g transform="${p.plane(56)}"><path d="${roundRect(inner.x - 4, inner.y - 4, inner.w + 8, inner.d + 8, 10)}" fill="#000" opacity="0.4"/></g>`,
    pleats.join(""),
    dirty ? `<path d="${media}" fill="url(#${prefix}Soot)"/>` : `<path d="${media}" fill="url(#sheen)"/>`,
    dirty ? `<path d="${media}" fill="#fff" filter="url(#dust)"/>` : "",
    debris.join(""),
  ].join("");
}

export function airFilterScene(state: FilterState, seed = 53): string {
  const random = rng(seed);
  const compare = state === "compare";

  const pleatDefs = (prefix: "old" | "new", light: string, dark: string) => [
    linear(`${prefix}Lit`, [0, 0, 1, 0], [
      [0, shade(light, 0.08)],
      [0.45, tint(light, 0.15)],
      [1, shade(light, 0.18)],
    ]),
    linear(`${prefix}Shade`, [0, 0, 1, 0], [
      [0, shade(dark, 0.25)],
      [1, shade(dark, 0.5)],
    ]),
  ];
  const defs = [
    radial("bench", { cx: 0.45, cy: 0.3, r: 0.95 }, [
      [0, compare ? "#24364f" : "#2a2d33"],
      [0.6, compare ? "#111c2c" : "#121418"],
      [1, "#04060a"],
    ]),
    radial("work", { cx: 0.5, cy: 0.5, r: 0.5 }, [
      [0, "#fff3dc", 0.32],
      [1, "#fff3dc", 0],
    ]),
    ...pleatDefs("new", "#f4f1ec", "#c9c3ba"),
    ...pleatDefs("old", "#8f877d", "#4f4943"),
    linear("oldSoot", [0, 0, 1, 1], [
      [0, "#0c0a09", 0.7],
      [0.5, "#292524", 0.35],
      [1, "#44403c", 0.12],
    ]),
    linear("sheen", [0, 0, 1, 1], [
      [0, "#ffffff", 0.18],
      [0.5, "#ffffff", 0],
      [1, "#ffffff", 0.06],
    ]),
    linear("frameNew", [0, 0, 1, 1], [
      [0, "#fdba74"],
      [0.5, "#f97316"],
      [1, "#c2410c"],
    ]),
    linear("airbox", [0, 0, 1, 1], [
      [0, "#3a3d44"],
      [1, "#101114"],
    ]),
    linear("cloth", [0, 0, 1, 1], [
      [0, "#2c5fd6"],
      [0.6, "#1e3a8a"],
      [1, "#14234f"],
    ]),
    linear("clip", [0, 0, 1, 0], [
      [0, "#6b7280"],
      [0.5, "#e5e7eb"],
      [1, "#4b5563"],
    ]),
    noiseTexture("dust", { frequency: 0.75, octaves: 3, seed: 5, color: "#3f3a35", alpha: 0.7, contrast: 1.8 }),
    noiseTexture("weave", { frequency: "0.9 0.06", octaves: 2, seed: 2, color: "#000000", alpha: 0.3 }),
    noiseTexture("plastic", { frequency: 0.9, octaves: 2, seed: 12, color: "#000000", alpha: 0.25 }),
    blur("bg", 14),
    blur("soft", 10),
    blur("fold", 22),
    blur("tiny", 2),
  ];

  const body: string[] = [`<rect width="1600" height="1200" fill="url(#bench)"/>`];
  if (compare) {
    // Old and new filters side by side on a blue fender cover in front of the engine bay.
    body.push(
      g(
        [
          `<path d="M -40 -40 H 1660 V 300 C 1200 340 400 340 -40 300 Z" fill="#0d1117"/>`,
          `<path d="M 980 60 C 1160 20 1420 40 1660 120 V 300 C 1400 320 1150 310 980 280 Z" fill="#1f2937"/>`,
          `<circle cx="260" cy="140" r="90" fill="#fbbf24" opacity="0.18"/>`,
          `<circle cx="1300" cy="180" r="60" fill="#60a5fa" opacity="0.14"/>`,
        ],
        `filter="url(#bg)"`,
      ),
      `<path d="M -40 470 C 400 400 1200 390 1660 450 V 1240 H -40 Z" fill="url(#cloth)"/>`,
      `<path d="M -40 470 C 400 400 1200 390 1660 450 V 1240 H -40 Z" fill="#fff" filter="url(#weave)"/>`,
      `<path d="M -40 470 C 400 400 1200 390 1660 450" stroke="#93c5fd" stroke-width="5" fill="none" stroke-dasharray="16 12" opacity="0.5"/>`,
      g(
        [
          `<path d="M 100 700 C 400 640 600 760 820 700" stroke="#0b1533" stroke-width="40" fill="none" opacity="0.35"/>`,
          `<path d="M 820 1000 C 1000 940 1300 1030 1600 960" stroke="#0b1533" stroke-width="50" fill="none" opacity="0.3"/>`,
          `<path d="M 300 1120 C 500 1060 700 1140 900 1100" stroke="#5b8af0" stroke-width="30" fill="none" opacity="0.2"/>`,
        ],
        `filter="url(#fold)"`,
      ),
      `<ellipse cx="760" cy="700" rx="780" ry="520" fill="url(#work)"/>`,
    );
    const pOld = projector([80, 1010], [660, -50], [230, -330], 660, 420);
    const pNew = projector([820, 960], [660, -50], [230, -330], 660, 420);
    body.push(panelFilter(pOld, 0, 0, 660, 420, true, "old", random));
    body.push(panelFilter(pNew, 0, 0, 660, 420, false, "new", random));
    body.push(
      text(410, 1110, "OLD", { size: 40, fill: "#e2e8f0", weight: 700, anchor: "middle", font: "display", spacing: 6, opacity: 0.8 }),
      text(1150, 1070, "NEW", { size: 40, fill: "#e2e8f0", weight: 700, anchor: "middle", font: "display", spacing: 6, opacity: 0.8 }),
    );
  } else {
    // The dirty filter still seated in the lower half of the airbox, lid set aside.
    const p = projector([300, 980], [940, -70], [250, -380], 940, 440);
    body.push(
      g(
        [
          `<path d="M -40 -40 H 1660 V 180 C 1100 240 400 230 -40 200 Z" fill="#0c0d10"/>`,
          `<path d="M 1320 260 C 1470 470 1500 760 1660 860" stroke="#1f2023" stroke-width="170" fill="none"/>`,
          `<path d="M 60 200 L 520 150 L 560 330 L 90 380 Z" fill="#2a2c31"/>`,
          `<circle cx="1250" cy="120" r="70" fill="#fbbf24" opacity="0.12"/>`,
        ],
        `filter="url(#bg)"`,
      ),
      `<ellipse cx="760" cy="600" rx="820" ry="580" fill="url(#work)"/>`,
      // Intake duct leaving the airbox on the left.
      `<path d="M 310 820 C 200 840 90 900 -60 1000" stroke="#0b0c0e" stroke-width="170" fill="none"/>`,
      ...[0, 1, 2, 3, 4].map((index) => `<path d="M ${250 - index * 60} ${800 + index * 40} l 30 150" stroke="#27272a" stroke-width="12" opacity="0.8"/>`),
      slabShadow(p, -60, -50, 1060, 540, -150, 40, [18, 30], 0.55),
      slab(p, -60, -50, 1060, 540, -150, 0, 40, "url(#airbox)", "#0e0f12"),
      `<g transform="${p.plane(0)}"><path d="${roundRect(-60, -50, 1060, 540, 40)}" fill="#fff" filter="url(#plastic)"/><path d="${roundRect(-28, -20, 996, 480, 26)}" fill="#08090b"/></g>`,
      panelFilter(p, 0, 0, 940, 440, true, "old", random),
      // Spring clips on the front edge.
      ...[180, 760].map((x) => {
        const [cx, cy] = p(x, -50, -20);
        return `<path d="${roundRect(cx - 26, cy - 60, 52, 88, 10)}" fill="url(#clip)"/><path d="M ${n(cx - 16)} ${n(cy - 40)} h 32" stroke="#374151" stroke-width="6"/>`;
      }),
    );
  }
  return photoSvg(defs, body, { vignette: 0.58, grade: "#f59e0b", gradeOpacity: 0.03 });
}
