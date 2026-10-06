// Exterior scenes: a reflector headlight at dusk (low beam out with a cracked, blackened bulb,
// or lit), a rainy windshield at night seen from the driver's seat (a torn wiper smearing
// the glass, or a fresh one sweeping it clean), and a car side-on at dusk (a sedan on a
// Phoenix driveway, or a pickup at a job site).
import { arc, between, blur, bokeh, g, linear, n, noiseTexture, photoSvg, polar, r2, radial, rng, roundRect, sector, shade, tint } from "./kit";

// ---------------------------------------------------------------------------------
// Headlight
// ---------------------------------------------------------------------------------

export type HeadlightState = "out" | "on";

const LENS =
  "M 150 470 C 160 360 300 300 520 300 L 1180 300 C 1380 300 1500 380 1500 470 C 1500 560 1460 640 1380 690 C 1250 760 1000 780 760 770 C 500 760 300 720 210 650 C 160 610 140 540 150 470 Z";

/** A faceted chrome reflector bowl. */
function reflector(cx: number, cy: number, rx: number, ry: number, fill: string, lit: boolean): string {
  const rings = [0.92, 0.78, 0.64, 0.5, 0.36]
    .map((k) => `<ellipse cx="${cx}" cy="${cy}" rx="${n(rx * k)}" ry="${n(ry * k)}" fill="none" stroke="${lit ? "#fde68a" : "#0b1220"}" stroke-width="3" opacity="${lit ? 0.35 : 0.55}"/>`)
    .join("");
  const spokes = Array.from({ length: 12 }, (_, index) => {
    const angle = (index * 30 * Math.PI) / 180;
    return `<path d="M ${n(cx + rx * 0.36 * Math.cos(angle))} ${n(cy + ry * 0.36 * Math.sin(angle))} L ${n(cx + rx * Math.cos(angle))} ${n(cy + ry * Math.sin(angle))}" stroke="${lit ? "#fef3c7" : "#0b1220"}" stroke-width="2" opacity="${lit ? 0.3 : 0.45}"/>`;
  }).join("");
  return [
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx + 14}" ry="${ry + 14}" fill="#020617"/>`,
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"/>`,
    rings,
    spokes,
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx + 6}" ry="${ry + 6}" fill="none" stroke="url(#bezel)" stroke-width="10"/>`,
  ].join("");
}

export function headlightScene(state: HeadlightState, seed = 61): string {
  const random = rng(seed);
  const on = state === "on";
  const paint = "#1e3a5f";

  const defs = [
    `<clipPath id="lensClip"><path d="${LENS}"/></clipPath>`,
    linear("paintBody", [0, 0, 0, 1], [
      [0, shade(paint, 0.65)],
      [0.18, tint(paint, 0.15)],
      [0.26, "#f5b8a8"],
      [0.3, tint(paint, 0.25)],
      [0.55, paint],
      [0.75, shade(paint, 0.35)],
      [1, shade(paint, 0.75)],
    ]),
    linear("dusk", [0, 0, 1, 0], [
      [0, "#f472b6", 0.16],
      [0.5, "#818cf8", 0.05],
      [1, "#38bdf8", 0.14],
    ]),
    linear("housing", [0, 0, 0, 1], [
      [0, "#1f2937"],
      [0.5, "#0b1220"],
      [1, "#030712"],
    ]),
    radial("chromeDim", { cx: 0.42, cy: 0.38, r: 0.75 }, [
      [0, "#cbd5e1"],
      [0.35, "#64748b"],
      [0.75, "#1e293b"],
      [1, "#0b1220"],
    ]),
    radial("chromeLit", { cx: 0.5, cy: 0.5, r: 0.6 }, [
      [0, "#ffffff"],
      [0.45, "#fffaf0"],
      [0.75, "#fde9b8"],
      [0.92, "#e9b45a"],
      [1, "#7c4a12"],
    ]),
    radial("chromeHigh", { cx: 0.42, cy: 0.38, r: 0.75 }, [
      [0, "#e2e8f0"],
      [0.4, "#94a3b8"],
      [1, "#1e293b"],
    ]),
    linear("bezel", [0, 0, 1, 1], [
      [0, "#f8fafc"],
      [0.5, "#64748b"],
      [1, "#cbd5e1"],
    ]),
    linear("amber", [0, 0, 1, 1], [
      [0, "#fcd34d"],
      [0.5, "#d97706"],
      [1, "#78350f"],
    ]),
    linear("glare", [0, 0, 1, 0], [
      [0, "#ffffff", 0],
      [0.5, "#ffffff", 0.22],
      [1, "#ffffff", 0],
    ]),
    linear("soot", [0, 0, 1, 0], [
      [0, "#57534e", 0.95],
      [0.6, "#292524", 0.95],
      [1, "#0c0a09", 0.9],
    ]),
    radial("bloom", { cx: 0.5, cy: 0.5, r: 0.5 }, [
      [0, "#ffffff", 0.95],
      [0.25, "#fff7d6", 0.6],
      [0.6, "#fde68a", 0.15],
      [1, "#fde68a", 0],
    ]),
    linear("grille", [0, 0, 0, 1], [
      [0, "#111827"],
      [1, "#020617"],
    ]),
    noiseTexture("flake", { frequency: 1.1, octaves: 2, seed: 9, color: "#ffffff", alpha: 0.1 }),
    noiseTexture("haze", { frequency: "0.008 0.03", octaves: 3, seed: 4, color: "#fde68a", alpha: on ? 0 : 0.35, type: "turbulence", contrast: 2 }),
    blur("soft", 12),
    blur("glow", 10),
    blur("wide", 40),
    blur("tiny", 2.5),
    blur("far", 22),
  ];

  // The halogen bulb in the low-beam bowl, seen from the front at an angle.
  const bulb = on
    ? [
        `<ellipse cx="560" cy="535" rx="190" ry="160" fill="url(#bloom)" filter="url(#glow)"/>`,
        `<path d="${roundRect(500, 508, 140, 54, 26)}" fill="#fffbeb" filter="url(#tiny)"/>`,
        `<path d="M 528 535 l 8 -10 l 8 20 l 8 -20 l 8 20 l 8 -20 l 8 20 l 8 -10" stroke="#ffffff" stroke-width="5" fill="none"/>`,
        `<path d="${roundRect(626, 510, 30, 50, 14)}" fill="#334155"/>`,
      ].join("")
    : [
        `<path d="${roundRect(458, 518, 54, 34, 6)}" fill="#a1a1aa"/>`,
        `<path d="${roundRect(500, 508, 140, 54, 26)}" fill="#e7e5e4" opacity="0.55"/>`,
        `<path d="${roundRect(500, 508, 140, 54, 26)}" fill="url(#soot)"/>`,
        // Snapped filament: two pieces with a gap, one end drooping.
        `<path d="M 526 535 l 7 -9 l 7 18 l 7 -18 l 6 9" stroke="#78716c" stroke-width="4" fill="none"/>`,
        `<path d="M 566 548 l 6 -16 l 7 18 l 7 -18 l 7 11" stroke="#78716c" stroke-width="4" fill="none"/>`,
        // Crack across the glass, with a chipped edge.
        `<path d="M 548 509 l 10 14 l -6 8 l 14 12 l -4 9 l 12 10" stroke="#f8fafc" stroke-width="3" fill="none" stroke-linejoin="round"/>`,
        `<path d="M 590 509 l -4 10 l 8 6" stroke="#e7e5e4" stroke-width="2" fill="none" opacity="0.8"/>`,
        `<path d="M 604 508 L 622 508 L 616 520 Z" fill="#1c1917"/>`,
        `<path d="${roundRect(626, 510, 30, 50, 14)}" fill="#1f2937"/>`,
        `<path d="M 506 516 C 540 510 600 510 630 516" stroke="#ffffff" stroke-width="4" fill="none" opacity="0.35"/>`,
      ].join("");

  const drl = `M 250 392 C 420 334 900 330 1360 352`;
  const city = bokeh(random, 22, { x: 900, y: 0, width: 700, height: 220 }, ["#fbbf24", "#f472b6", "#93c5fd", "#fde68a"], [10, 34], [0.25, 0.6]);

  const body = [
    `<rect width="1600" height="1200" fill="url(#paintBody)"/>`,
    `<rect width="1600" height="1200" fill="#fff" filter="url(#flake)"/>`,
    `<rect width="1600" height="1200" fill="url(#dusk)"/>`,
    // The street beyond the hood, out of focus, top right.
    g([`<path d="M 860 -20 C 1100 60 1400 120 1640 140 V -20 Z" fill="#0b1026"/>`, city], `filter="url(#far)"`),
    // Hood shut line, fender line and the bumper below.
    `<path d="M 120 420 C 160 280 340 240 560 240 L 1240 238 C 1440 240 1560 320 1610 420" stroke="#020617" stroke-width="6" fill="none" opacity="0.8"/>`,
    `<path d="M 120 424 C 160 284 340 244 560 244 L 1240 242" stroke="#cbd5e1" stroke-width="3" fill="none" opacity="0.3"/>`,
    `<path d="M -20 860 C 400 840 1100 860 1640 900" stroke="#020617" stroke-width="5" fill="none" opacity="0.7"/>`,
    `<path d="${roundRect(820, 900, 840, 260, 60)}" fill="url(#grille)"/>`,
    ...Array.from({ length: 9 }, (_, row) =>
      Array.from({ length: 14 }, (__, column) => {
        const x = 860 + column * 56 + (row % 2) * 28;
        const y = 930 + row * 26;
        return `<path d="M ${x} ${y} l 22 -10 l 22 10 l -22 10 Z" fill="#1f2937" opacity="0.8"/>`;
      }).join(""),
    ),
    `<circle cx="330" cy="985" r="96" fill="#020617"/>`,
    `<circle cx="330" cy="985" r="70" fill="url(#chromeDim)"/>`,
    `<circle cx="310" cy="962" r="18" fill="#ffffff" opacity="0.4"/>`,
    // The headlight: shadow, housing, reflectors, bulb, turn signal, DRL strip, lens.
    `<path d="${LENS}" fill="#000" opacity="0.55" filter="url(#soft)" transform="translate(10 18)"/>`,
    `<path d="${LENS}" fill="url(#housing)"/>`,
    `<g clip-path="url(#lensClip)">`,
    reflector(560, 535, 250, 210, on ? "url(#chromeLit)" : "url(#chromeDim)", on),
    reflector(1000, 528, 160, 140, "url(#chromeHigh)", false),
    `<path d="${roundRect(1210, 420, 230, 230, 60)}" fill="url(#amber)" opacity="0.65"/>`,
    ...Array.from({ length: 6 }, (_, index) => `<path d="M ${1230 + index * 36} 430 v 210" stroke="#78350f" stroke-width="3" opacity="0.5"/>`),
    `<g transform="translate(560 535) scale(1.5) translate(-560 -535)">${bulb}</g>`,
    `<path d="${drl}" stroke="#e0f2fe" stroke-width="26" fill="none" opacity="0.55" filter="url(#glow)"/>`,
    `<path d="${drl}" stroke="#f8fafc" stroke-width="9" fill="none" stroke-linecap="round"/>`,
    `<path d="M 200 300 L 420 300 L 160 800 L -60 800 Z" fill="url(#glare)"/>`,
    `<path d="M 980 300 L 1080 300 L 860 800 L 760 800 Z" fill="url(#glare)" opacity="0.6"/>`,
    `<path d="${LENS}" fill="#fff" filter="url(#haze)"/>`,
    `</g>`,
    `<path d="${LENS}" fill="none" stroke="#94a3b8" stroke-width="6" opacity="0.6"/>`,
    `<path d="M 170 450 C 190 360 320 312 520 312 L 1180 312" stroke="#ffffff" stroke-width="5" fill="none" opacity="0.45" filter="url(#tiny)"/>`,
    on ? `<ellipse cx="560" cy="540" rx="560" ry="300" fill="#fde68a" opacity="0.16" filter="url(#wide)"/>` : "",
    on ? `<ellipse cx="560" cy="535" rx="300" ry="240" fill="url(#bloom)" opacity="0.85"/>` : "",
    on ? [0, 35, 80, 145, 200, 250, 300, 330].map((angle) => { const [ex, ey] = polar(560, 535, 420, angle); return `<path d="M 560 535 L ${n(ex)} ${n(ey)}" stroke="#fffbeb" stroke-width="3" opacity="0.35" filter="url(#tiny)"/>`; }).join("") : "",
    on ? `<path d="M 560 535 L 1700 380 L 1700 700 Z" fill="#fff7d6" opacity="0.08" filter="url(#wide)"/>` : "",
  ];
  return photoSvg(defs, body, { vignette: on ? 0.7 : 0.55, grade: on ? "#1e1b4b" : "#7c3aed", gradeOpacity: on ? 0.12 : 0.04 });
}

// ---------------------------------------------------------------------------------
// Rain on the windshield at night, from the driver's seat
// ---------------------------------------------------------------------------------

export type WiperState = "worn" | "new";

export function wiperScene(state: WiperState, seed = 71): string {
  const random = rng(seed);
  const worn = state === "worn";
  const pivot: [number, number] = [250, 1300];
  const inner = 330;
  const outer = 1260;
  const sweepStart = -100;
  const sweepEnd = -12;
  const bladeAngle = -58;

  const defs = [
    linear("night", [0, 0, 0, 1], [
      [0, "#060a1a"],
      [0.45, "#141a3a"],
      [0.75, "#2a1a3a"],
      [1, "#0a0712"],
    ]),
    radial("drop", { cx: 0.5, cy: 0.5, r: 0.5 }, [
      [0, "#ffffff", 0.02],
      [0.7, "#e0e7ff", 0.1],
      [0.92, "#ffffff", 0.35],
      [1, "#000000", 0.25],
    ]),
    linear("arm", [0, 0, 1, 1], [
      [0, "#3f3f46"],
      [0.5, "#111113"],
      [1, "#000000"],
    ]),
    linear("cowl", [0, 0, 0, 1], [
      [0, "#0d0f14"],
      [1, "#030305"],
    ]),
    blur("city", 26),
    blur("near", 14),
    blur("smear", 4),
    blur("tiny", 1.5),
    blur("soft", 8),
  ];

  // City lights beyond the glass.
  const lights = [
    bokeh(random, 30, { x: 0, y: 160, width: 1600, height: 520 }, ["#fbbf24", "#f59e0b", "#fde68a"], [24, 70], [0.25, 0.6]),
    bokeh(random, 14, { x: 100, y: 520, width: 1400, height: 260 }, ["#ef4444", "#f87171"], [18, 46], [0.35, 0.75]),
    bokeh(random, 12, { x: 0, y: 80, width: 1600, height: 360 }, ["#22d3ee", "#a78bfa", "#f472b6", "#34d399"], [20, 60], [0.2, 0.5]),
  ].join("");

  const inSweep = (x: number, y: number) => {
    const dx = x - pivot[0];
    const dy = y - pivot[1];
    const r = Math.hypot(dx, dy);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    return r > inner && r < outer && angle > sweepStart && angle < sweepEnd;
  };

  const drops: string[] = [];
  for (let index = 0; index < 520; index += 1) {
    const x = random() * 1600;
    const y = random() * 1080;
    const swept = inSweep(x, y);
    const r0 = Math.pow(random(), 2.2) * 22 + 3;
    if (swept) {
      if (!worn && random() < 0.94) continue;
      if (worn) {
        const radius = Math.hypot(x - pivot[0], y - pivot[1]);
        // The torn section of rubber leaves a band of water behind.
        const missed = radius > 840 && radius < 930;
        if (!missed && random() < 0.6) continue;
        if (!missed) {
          const angle = (Math.atan2(y - pivot[1], x - pivot[0]) * 180) / Math.PI + 90;
          drops.push(`<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(r0 * 2.6)}" ry="${n(r0 * 0.5)}" transform="rotate(${n(angle)} ${n(x)} ${n(y)})" fill="#c7d2fe" opacity="0.14" filter="url(#tiny)"/>`);
          continue;
        }
      }
    }
    const r = swept && !worn ? r0 * 0.4 : r0;
    const tall = random() < 0.12;
    const ry = tall ? r * 1.9 : r;
    drops.push(
      `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(r)}" ry="${n(ry)}" fill="url(#drop)"/>`,
      `<ellipse cx="${n(x - r * 0.35)}" cy="${n(y - ry * 0.4)}" rx="${n(r * 0.28)}" ry="${n(ry * 0.22)}" fill="#ffffff" opacity="0.75"/>`,
      `<path d="M ${n(x - r * 0.8)} ${n(y + ry * 0.55)} A ${n(r)} ${n(ry)} 0 0 0 ${n(x + r * 0.8)} ${n(y + ry * 0.55)}" stroke="#000" stroke-width="${n(Math.max(1, r * 0.18))}" fill="none" opacity="0.35"/>`,
    );
    if (tall) drops.push(`<path d="M ${n(x)} ${n(y - ry)} l ${n(between(random, -4, 4))} ${n(-between(random, 24, 60))}" stroke="#e0e7ff" stroke-width="${n(r * 0.9)}" opacity="0.08" stroke-linecap="round"/>`);
  }

  // Streaks the torn blade leaves across its sweep, or the crisp clear arc of a new one.
  const sweep = sector(pivot[0], pivot[1], inner, outer, sweepStart, sweepEnd);
  const streaks = worn
    ? Array.from({ length: 60 }, () => {
        const r = between(random, inner + 20, outer - 20);
        const start = between(random, sweepStart + 2, sweepEnd - 30);
        const length = between(random, 18, 70);
        return `<path d="${arc(pivot[0], pivot[1], r, start, start + length)}" stroke="#dbeafe" stroke-width="${n(between(random, 1, 4))}" fill="none" opacity="${r2(between(random, 0.08, 0.28))}"/>`;
      }).join("")
    : "";
  const sharpLights = !worn
    ? Array.from({ length: 26 }, () => {
        let x = 0;
        let y = 0;
        for (let attempt = 0; attempt < 20; attempt += 1) {
          x = random() * 1600;
          y = 160 + random() * 600;
          if (inSweep(x, y)) break;
        }
        const color = ["#fde68a", "#fbbf24", "#f87171", "#67e8f9"][Math.floor(random() * 4)];
        return `<circle cx="${n(x)}" cy="${n(y)}" r="${n(between(random, 3, 8))}" fill="${color}" opacity="0.9"/><circle cx="${n(x)}" cy="${n(y)}" r="${n(between(random, 10, 18))}" fill="${color}" opacity="0.18"/>`;
      }).join("")
    : "";

  // Wiper arm and blade at mid-sweep.
  const [ax, ay] = polar(pivot[0], pivot[1], 180, bladeAngle - 4);
  const [b1x, b1y] = polar(pivot[0], pivot[1], inner - 10, bladeAngle);
  const [b2x, b2y] = polar(pivot[0], pivot[1], outer - 10, bladeAngle);
  const [mx, my] = polar(pivot[0], pivot[1], (inner + outer) / 2, bladeAngle);
  const normal = ((bladeAngle + 90) * Math.PI) / 180;
  const off = (d: number): [number, number] => [Math.cos(normal) * d, Math.sin(normal) * d];
  const [ox, oy] = off(14);
  const torn = worn
    ? (() => {
        const [t1x, t1y] = polar(pivot[0], pivot[1], 840, bladeAngle);
        const [t2x, t2y] = polar(pivot[0], pivot[1], 935, bladeAngle);
        return `<path d="M ${n(t1x + ox)} ${n(t1y + oy)} C ${n(t1x + ox + 40)} ${n(t1y + oy + 30)} ${n(t2x + ox + 60)} ${n(t2y + oy + 50)} ${n(t2x + ox + 30)} ${n(t2y + oy + 70)}" stroke="#18181b" stroke-width="7" fill="none" stroke-linecap="round"/>`;
      })()
    : "";
  const blade = [
    `<path d="M ${pivot[0]} ${pivot[1]} L ${n(ax)} ${n(ay)} L ${n(mx)} ${n(my)}" stroke="#000" stroke-width="40" fill="none" opacity="0.5" filter="url(#soft)" transform="translate(10 14)"/>`,
    `<path d="M ${pivot[0]} ${pivot[1]} L ${n(ax)} ${n(ay)} L ${n(mx)} ${n(my)}" stroke="url(#arm)" stroke-width="30" fill="none" stroke-linejoin="round"/>`,
    `<path d="M ${n(b1x)} ${n(b1y)} L ${n(b2x)} ${n(b2y)}" stroke="#0a0a0b" stroke-width="30" stroke-linecap="round"/>`,
    `<path d="M ${n(b1x - ox * 0.4)} ${n(b1y - oy * 0.4)} L ${n(b2x - ox * 0.4)} ${n(b2y - oy * 0.4)}" stroke="${worn ? "#3f3f46" : "#71717a"}" stroke-width="5" stroke-linecap="round" opacity="${worn ? 0.6 : 0.9}"/>`,
    `<path d="M ${n(b1x + ox)} ${n(b1y + oy)} L ${n(b2x + ox)} ${n(b2y + oy)}" stroke="#18181b" stroke-width="6" stroke-linecap="round"/>`,
    torn,
    `<circle cx="${n(mx)}" cy="${n(my)}" r="16" fill="#27272a" stroke="#52525b" stroke-width="3"/>`,
  ].join("");

  const body = [
    `<rect width="1600" height="1200" fill="url(#night)"/>`,
    g([lights], `filter="url(#city)"`),
    worn
      ? g([`<path d="${sweep}" fill="#c7d2fe" opacity="0.07"/>`, streaks], `filter="url(#smear)"`)
      : g([`<path d="${sweep}" fill="#000" opacity="0.18"/>`], `filter="url(#near)"`),
    sharpLights,
    drops.join(""),
    worn ? streaks : "",
    `<path d="${arc(pivot[0], pivot[1], outer, sweepStart, sweepEnd)}" stroke="#c7d2fe" stroke-width="10" fill="none" opacity="0.16" filter="url(#smear)"/>`,
    `<path d="${arc(pivot[0], pivot[1], outer + 6, sweepStart, sweepEnd)}" stroke="#ffffff" stroke-width="2" fill="none" opacity="0.25"/>`,
    blade,
    // The dashboard top and its faint reflection in the glass.
    `<path d="M -40 1110 C 400 1060 1200 1060 1640 1100 V 1240 H -40 Z" fill="url(#cowl)"/>`,
    `<path d="M -40 1080 C 400 1030 1200 1030 1640 1070" stroke="#93c5fd" stroke-width="3" fill="none" opacity="0.18"/>`,
  ];
  return photoSvg(defs, body, { vignette: 0.6, grade: "#4338ca", gradeOpacity: 0.05 });
}

// ---------------------------------------------------------------------------------
// A car side-on at dusk: a sedan on a driveway, or a pickup at a job site
// ---------------------------------------------------------------------------------

export type Vehicle = "sedan" | "pickup";
export type DrivewaySpec = { vehicle: Vehicle; paint: string; setting: "home" | "jobsite"; hazards?: boolean; seed?: number };

const BODY: Record<Vehicle, { body: string; glass: string; pillars: string[]; wheels: [number, number]; doors: string[]; handles: [number, number][]; head: string; tail: string }> = {
  sedan: {
    body: "M 22 250 C 6 245 2 205 12 182 C 22 168 60 160 120 157 L 330 140 C 380 120 430 84 482 72 C 560 60 640 60 706 72 C 762 86 815 116 852 137 L 975 147 C 992 152 998 176 996 206 L 992 250 L 887 252 A 92 92 0 1 0 713 252 L 277 252 A 92 92 0 1 0 103 252 Z",
    glass: "M 345 146 C 392 124 436 92 486 82 C 560 72 640 72 700 82 C 750 94 798 120 826 138 Z",
    pillars: ["M 586 76 L 600 76 L 604 142 L 590 142 Z"],
    wheels: [190, 800],
    doors: ["M 338 150 L 334 250", "M 596 146 L 598 250", "M 828 140 C 844 170 850 210 846 250"],
    handles: [
      [520, 166],
      [770, 162],
    ],
    head: "M 14 182 C 30 170 70 166 112 166 L 104 186 C 70 190 30 192 14 190 Z",
    tail: "M 958 150 L 994 156 L 996 186 L 956 182 Z",
  },
  pickup: {
    body: "M 22 250 C 6 244 2 196 16 156 C 22 146 60 140 210 132 C 250 110 300 66 330 56 L 506 52 C 516 54 522 64 524 80 L 530 140 L 990 138 C 996 140 998 150 998 160 L 996 250 L 877 252 A 92 92 0 1 0 703 252 L 257 252 A 92 92 0 1 0 83 252 Z",
    glass: "M 226 134 C 268 106 310 74 336 66 L 498 64 C 506 66 510 76 512 90 L 516 134 Z",
    pillars: ["M 398 64 L 412 64 L 414 134 L 400 134 Z"],
    wheels: [170, 790],
    doors: ["M 224 140 L 222 250", "M 404 136 L 404 250", "M 528 84 L 532 250"],
    handles: [
      [350, 150],
      [480, 150],
    ],
    head: "M 12 160 C 30 150 80 146 120 146 L 112 172 C 70 176 30 178 12 176 Z",
    tail: "M 984 146 L 998 148 L 998 200 L 984 198 Z",
  },
};

function wheel(cx: number, cy: number): string {
  const spokes = Array.from({ length: 5 }, (_, index) => {
    const angle = -90 + index * 72;
    return `<path d="M ${cx} ${cy} L ${n(polar(cx, cy, 48, angle - 9)[0])} ${n(polar(cx, cy, 48, angle - 9)[1])} L ${n(polar(cx, cy, 48, angle + 9)[0])} ${n(polar(cx, cy, 48, angle + 9)[1])} Z" fill="url(#rim)"/>`;
  }).join("");
  return [
    `<circle cx="${cx}" cy="${cy}" r="80" fill="#0a0a0c"/>`,
    `<circle cx="${cx}" cy="${cy}" r="78" fill="none" stroke="#2a2a2f" stroke-width="4"/>`,
    `<circle cx="${cx}" cy="${cy}" r="54" fill="#1f2937"/>`,
    `<circle cx="${cx}" cy="${cy}" r="40" fill="#4b5563"/>`,
    spokes,
    `<circle cx="${cx}" cy="${cy}" r="54" fill="none" stroke="url(#rim)" stroke-width="6"/>`,
    `<circle cx="${cx}" cy="${cy}" r="12" fill="url(#rim)"/>`,
    `<path d="${arc(cx, cy, 70, 200, 260)}" stroke="#fcd9b6" stroke-width="4" fill="none" opacity="0.35"/>`,
  ].join("");
}

/** A car in side profile, `length` px long, standing on `groundY`. */
function carSide(kind: Vehicle, x: number, groundY: number, length: number, hazards: boolean): string {
  const s = length / 1000;
  const shape = BODY[kind];
  const [w1, w2] = shape.wheels;
  const glow = (cx: number, cy: number) =>
    `<circle cx="${cx}" cy="${cy}" r="60" fill="#f59e0b" opacity="0.55" filter="url(#lamp)"/><circle cx="${cx}" cy="${cy}" r="14" fill="#fde68a"/>`;
  return [
    `<g transform="translate(${n(x)} ${n(groundY - 300 * s)}) scale(${Number(s.toFixed(3))})">`,
    `<ellipse cx="500" cy="302" rx="520" ry="22" fill="#000" opacity="0.75" filter="url(#carShadow)"/>`,
    ...[w1, w2].map((cx) => `<path d="M ${cx - 88} 252 A 92 92 0 1 1 ${cx + 88} 252 Z" fill="#06060a"/>`),
    `<path d="${shape.body}" fill="url(#carPaint)"/>`,
    `<path d="${shape.body}" fill="url(#carSky)"/>`,
    `<path d="${shape.body}" fill="#fff" filter="url(#flake)" opacity="0.6"/>`,
    `<path d="${shape.glass}" fill="url(#carGlass)"/>`,
    ...shape.pillars.map((d) => `<path d="${d}" fill="#05060a"/>`),
    ...shape.doors.map((d) => `<path d="${d}" stroke="#05060a" stroke-width="2.5" fill="none" opacity="0.7"/>`),
    ...shape.handles.map(([hx, hy]) => `<path d="${roundRect(hx, hy, 38, 8, 4)}" fill="#0b0d12" opacity="0.7"/>`),
    `<path d="M 30 205 C 300 196 700 194 990 200" stroke="#ffffff" stroke-width="3" fill="none" opacity="0.25"/>`,
    `<path d="M 40 236 L 980 236" stroke="#000" stroke-width="10" opacity="0.25"/>`,
    `<path d="${shape.head}" fill="#e2e8f0"/>`,
    `<path d="${shape.tail}" fill="#b91c1c"/>`,
    `<path d="${shape.tail}" fill="#ef4444" opacity="0.6" filter="url(#lampSmall)"/>`,
    wheel(w1, 222),
    wheel(w2, 222),
    hazards ? glow(26, 196) + glow(984, 172) : "",
    `</g>`,
  ].join("");
}

/** A fan palm silhouette. */
function palm(random: () => number, x: number, groundY: number, height: number, lean: number): string {
  const topX = x + lean;
  const topY = groundY - height;
  const trunk = `M ${x - 14} ${groundY} C ${x - 10} ${groundY - height * 0.5} ${topX - 8} ${topY + height * 0.2} ${topX - 6} ${topY} L ${topX + 6} ${topY} C ${topX + 8} ${topY + height * 0.2} ${x + 10} ${groundY - height * 0.5} ${x + 14} ${groundY} Z`;
  const fronds = Array.from({ length: 16 }, (_, index) => {
    const angle = -180 + index * (180 / 15) + between(random, -6, 6);
    const length = between(random, 90, 150);
    const [ex, ey] = polar(topX, topY, length, angle);
    const droop = Math.abs(Math.cos((angle * Math.PI) / 180)) * 50;
    return `<path d="M ${n(topX)} ${n(topY)} Q ${n((topX + ex) / 2)} ${n((topY + ey) / 2 - 30)} ${n(ex)} ${n(ey + droop)}" stroke="#0e0a18" stroke-width="${n(between(random, 7, 12))}" fill="none" stroke-linecap="round"/>`;
  }).join("");
  return `<path d="${trunk}" fill="#0e0a18"/>${fronds}<circle cx="${n(topX)}" cy="${n(topY)}" r="22" fill="#0e0a18"/>`;
}

function agave(cx: number, cy: number, size: number, color: string): string {
  return Array.from({ length: 9 }, (_, index) => {
    const angle = -170 + index * 20;
    const [ex, ey] = polar(cx, cy, size * (0.7 + (index % 3) * 0.15), angle);
    return `<path d="M ${n(cx - 10)} ${n(cy)} Q ${n((cx + ex) / 2)} ${n((cy + ey) / 2 - 10)} ${n(ex)} ${n(ey)} Q ${n((cx + ex) / 2 + 8)} ${n((cy + ey) / 2 + 6)} ${n(cx + 10)} ${n(cy)} Z" fill="${color}"/>`;
  }).join("");
}

export function drivewayScene(spec: DrivewaySpec): string {
  const random = rng(spec.seed ?? 83);
  const jobsite = spec.setting === "jobsite";
  const paint = spec.paint;

  const defs = [
    linear("sky", [0, 0, 0, 1], [
      [0, "#140f3a"],
      [0.35, "#3b2667"],
      [0.62, "#b4497a"],
      [0.78, "#f08a5d"],
      [0.9, "#fcd5a0"],
    ]),
    radial("sun", { cx: 0.5, cy: 0.5, r: 0.5 }, [
      [0, "#fff1c9", 0.85],
      [0.4, "#fdba74", 0.35],
      [1, "#fb923c", 0],
    ]),
    linear("carPaint", [0, 0, 0, 1], [
      [0, tint(paint, 0.35)],
      [0.35, paint],
      [0.6, shade(paint, 0.25)],
      [1, shade(paint, 0.65)],
    ]),
    linear("carSky", [0, 0, 0, 1], [
      [0, "#c4b5fd", 0.35],
      [0.4, "#f9a8d4", 0.18],
      [0.62, "#fdba74", 0.25],
      [0.7, "#000000", 0.1],
      [1, "#000000", 0.35],
    ]),
    linear("carGlass", [0, 0, 1, 1], [
      [0, "#4c3a73"],
      [0.4, "#1b1533"],
      [0.6, "#f9a8d4", 0.6],
      [0.7, "#1b1533"],
      [1, "#0b0a17"],
    ]),
    linear("rim", [0, 0, 1, 1], [
      [0, "#f1f5f9"],
      [0.5, "#94a3b8"],
      [1, "#475569"],
    ]),
    linear("stucco", [0, 0, 0, 1], [
      [0, "#8a6a74"],
      [1, "#5c4553"],
    ]),
    linear("garage", [0, 0, 0, 1], [
      [0, "#9b7f86"],
      [0.85, "#7a616a"],
      [1, "#fcd34d"],
    ]),
    linear("window", [0, 0, 0, 1], [
      [0, "#fde68a"],
      [1, "#f59e0b"],
    ]),
    linear("concrete", [0, 0, 0, 1], [
      [0, "#8f7f8c"],
      [1, "#bfb0b8"],
    ]),
    linear("dirt", [0, 0, 0, 1], [
      [0, "#7c4a3a"],
      [1, "#b9775a"],
    ]),
    linear("trailer", [0, 0, 0, 1], [
      [0, "#e9e4ef"],
      [1, "#a99fb5"],
    ]),
    radial("porch", { cx: 0.5, cy: 0.5, r: 0.5 }, [
      [0, "#fde68a", 0.9],
      [1, "#fde68a", 0],
    ]),
    noiseTexture("flake", { frequency: 1.2, octaves: 2, seed: 6, color: "#ffffff", alpha: 0.08 }),
    noiseTexture("gravel", { frequency: 0.55, octaves: 3, seed: 11, color: "#2b1d24", alpha: 0.6, contrast: 2 }),
    blur("carShadow", 10),
    blur("lamp", 16),
    blur("lampSmall", 6),
    blur("cloud", 10),
    blur("far", 3),
    blur("glowWide", 30),
  ];

  const clouds = Array.from({ length: 6 }, () => {
    const x = between(random, -100, 1500);
    const y = between(random, 120, 420);
    return `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(between(random, 160, 320))}" ry="${n(between(random, 10, 22))}" fill="${random() < 0.5 ? "#f9a8d4" : "#fdba74"}" opacity="${r2(between(random, 0.25, 0.5))}"/>`;
  }).join("");
  const stars = Array.from({ length: 40 }, () => `<circle cx="${n(random() * 1600)}" cy="${n(random() * 260)}" r="${n(between(random, 0.8, 2))}" fill="#ffffff" opacity="${r2(between(random, 0.3, 0.8))}"/>`).join("");
  const mountains = [
    `<path d="M -20 700 L 120 650 L 260 672 L 420 600 L 520 618 L 600 560 L 700 590 L 860 640 L 1020 610 L 1180 650 L 1360 620 L 1500 660 L 1640 640 L 1640 760 L -20 760 Z" fill="#4a2f5a"/>`,
    `<path d="M -20 740 L 200 700 L 360 716 L 520 660 L 600 676 L 700 640 L 760 660 L 900 700 L 1100 690 L 1300 720 L 1640 700 L 1640 800 L -20 800 Z" fill="#2a1d3a"/>`,
  ].join("");

  const setting = jobsite
    ? [
        // Site trailer, chain-link fence with a screen, a tower crane far behind, cones.
        `<path d="M 1180 380 L 1190 380 L 1190 760 L 1180 760 Z" fill="#1a1028"/>`,
        `<path d="M 980 380 L 1500 380 L 1500 392 L 980 392 Z" fill="#1a1028"/>`,
        ...Array.from({ length: 13 }, (_, index) => `<path d="M ${990 + index * 40} 380 l 20 12 l 20 -12" stroke="#1a1028" stroke-width="3" fill="none"/>`),
        `<path d="M 1420 392 L 1420 470" stroke="#1a1028" stroke-width="3"/><rect x="1404" y="470" width="32" height="40" fill="#1a1028"/>`,
        `<path d="${roundRect(60, 640, 620, 300, 10)}" fill="url(#trailer)"/>`,
        `<path d="M 60 690 H 680" stroke="#7c6f8a" stroke-width="4"/>`,
        ...[120, 300, 480].map((x) => `<path d="${roundRect(x, 720, 130, 90, 6)}" fill="url(#window)" opacity="0.85"/><path d="M ${x + 65} 720 v 90" stroke="#a16207" stroke-width="4"/>`),
        `<path d="M 60 940 H 680" stroke="#3b2d4a" stroke-width="10"/>`,
        ...[90, 640].map((x) => `<path d="M ${x} 940 v 70" stroke="#3b2d4a" stroke-width="12"/>`),
        `<path d="M 700 780 H 1640 V 1010 H 700 Z" fill="#14532d" opacity="0.92"/>`,
        ...Array.from({ length: 24 }, (_, index) => `<path d="M ${700 + index * 40} 780 v 230" stroke="#9ca3af" stroke-width="4" opacity="0.7"/>`),
        `<path d="M 700 780 H 1640" stroke="#9ca3af" stroke-width="6"/>`,
        `<path d="M 700 1010 H 1640" stroke="#6b7280" stroke-width="5"/>`,
        ...Array.from({ length: 30 }, (_, index) => `<path d="M ${700 + index * 32} 790 l 32 30 M ${732 + index * 32} 790 l -32 30" stroke="#d1d5db" stroke-width="1.5" opacity="0.25"/>`),
      ].join("")
    : [
        // Flat-roofed stucco house with a garage door, warm windows and a porch light.
        `<path d="M -40 480 H 960 V 1010 H -40 Z" fill="url(#stucco)"/>`,
        `<path d="M -40 470 H 980 V 500 H -40 Z" fill="#4a3542"/>`,
        `<path d="${roundRect(80, 600, 230, 170, 6)}" fill="url(#window)"/>`,
        `<path d="M 195 600 v 170 M 80 685 h 230" stroke="#7c4a1e" stroke-width="6"/>`,
        `<ellipse cx="195" cy="690" rx="200" ry="150" fill="#fde68a" opacity="0.18" filter="url(#glowWide)"/>`,
        `<path d="M 420 620 H 900 V 1010 H 420 Z" fill="url(#garage)"/>`,
        ...[700, 780, 860, 940].map((y) => `<path d="M 420 ${y} H 900" stroke="#5c4553" stroke-width="5"/>`),
        `<path d="M 420 990 H 900 V 1010 H 420 Z" fill="#fde68a" opacity="0.85"/>`,
        `<ellipse cx="660" cy="1010" rx="300" ry="40" fill="#fde68a" opacity="0.35" filter="url(#glowWide)"/>`,
        `<circle cx="365" cy="640" r="70" fill="url(#porch)"/>`,
        `<path d="${roundRect(355, 625, 20, 32, 4)}" fill="#fef3c7"/>`,
        agave(250, 1000, 70, "#1f2a2a"),
        agave(1530, 1000, 60, "#1f2a2a"),
      ].join("");

  const ground = jobsite
    ? [`<path d="M -40 1000 H 1640 V 1240 H -40 Z" fill="url(#dirt)"/>`, `<path d="M -40 1000 H 1640 V 1240 H -40 Z" fill="#fff" filter="url(#gravel)"/>`]
    : [
        `<path d="M -40 1000 H 1640 V 1240 H -40 Z" fill="#6f5a66"/>`,
        `<path d="M -40 1000 H 1640 V 1240 H -40 Z" fill="#fff" filter="url(#gravel)"/>`,
        `<path d="M 300 1000 L 1180 1000 L 1360 1240 L 140 1240 Z" fill="url(#concrete)"/>`,
        `<path d="M 740 1000 L 760 1240" stroke="#6f5f6c" stroke-width="3" opacity="0.6"/>`,
        `<path d="M 220 1120 L 1270 1120" stroke="#6f5f6c" stroke-width="3" opacity="0.5"/>`,
      ];
  const cones = jobsite
    ? [180, 1460].map((x) => `<path d="M ${x} 1090 L ${x + 26} 1010 L ${x + 40} 1010 L ${x + 66} 1090 Z" fill="#f97316"/><path d="M ${x + 12} 1050 L ${x + 54} 1050 L ${x + 50} 1036 L ${x + 16} 1036 Z" fill="#f8fafc"/><path d="${roundRect(x - 10, 1086, 86, 12, 3)}" fill="#c2410c"/>`).join("")
    : "";

  const body = [
    `<rect width="1600" height="1200" fill="url(#sky)"/>`,
    stars,
    `<ellipse cx="1260" cy="690" rx="420" ry="220" fill="url(#sun)"/>`,
    g([clouds], `filter="url(#cloud)"`),
    mountains,
    jobsite ? "" : palm(random, 1240, 1010, 560, 30) + palm(random, 1400, 1010, 470, -20),
    jobsite ? palm(random, 1500, 1010, 430, -10) : "",
    setting,
    ...ground,
    carSide(spec.vehicle, jobsite ? 520 : 470, 1080, jobsite ? 980 : 940, spec.hazards ?? false),
    cones,
    `<rect width="1600" height="1200" fill="#1e1b4b" opacity="0.12"/>`,
  ];
  return photoSvg(defs, body, { vignette: 0.5, grade: "#7c3aed", gradeOpacity: 0.04 });
}

