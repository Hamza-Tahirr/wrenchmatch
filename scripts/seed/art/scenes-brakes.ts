// Brake and suspension scenes: a front wheel with the rotor and caliper seen through the
// spokes, the rotor and caliper close up with the wheel off (worn or freshly replaced), and
// the strut, coil spring and sway-bar link in the wheel well (worn or new). Drawn in a 3/4
// view with a work light from the upper left.
import { between, blob, blur, g, linear, n, noiseTexture, photoSvg, polar, r2, radial, rng, sector, shade, smoothOpen, tint } from "./kit";

export type Wear = "worn" | "new";

/** Concentric machining/scoring rings on a rotor's friction surface (face-on coordinates). */
function rotorRings(random: () => number, cx: number, cy: number, rInner: number, rOuter: number, worn: boolean): string {
  const rings: string[] = [];
  const count = worn ? 54 : 34;
  for (let index = 0; index < count; index += 1) {
    const r = between(random, rInner + 4, rOuter - 4);
    const dark = random() < (worn ? 0.62 : 0.4);
    const width = worn && dark ? between(random, 1.5, 6) : between(random, 0.8, 2.4);
    const opacity = worn ? between(random, 0.1, 0.42) : between(random, 0.05, 0.14);
    rings.push(
      `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="none" stroke="${dark ? "#111827" : "#ffffff"}" stroke-width="${n(width)}" opacity="${r2(opacity)}"/>`,
    );
  }
  return rings.join("");
}

/** The anisotropic "bow-tie" highlight a machined disc shows under a single light. */
function bowtie(cx: number, cy: number, r1: number, r2: number, angle: number, id: string, strength: number): string {
  return [
    `<path d="${sector(cx, cy, r1, r2, angle - 14, angle + 14)}" fill="url(#${id})" opacity="${strength}"/>`,
    `<path d="${sector(cx, cy, r1, r2, angle + 166, angle + 194)}" fill="url(#${id})" opacity="${strength * 0.7}"/>`,
  ].join("");
}

/** A hex lug nut seen end on. */
function lugNut(x: number, y: number, size: number, fill: string): string {
  const points = Array.from({ length: 6 }, (_, index) => polar(x, y, size, index * 60 + 30))
    .map(([px, py]) => `${n(px)},${n(py)}`)
    .join(" ");
  return [
    `<polygon points="${points}" fill="#000" opacity="0.45" transform="translate(${n(size * 0.25)} ${n(size * 0.35)})"/>`,
    `<polygon points="${points}" fill="${fill}"/>`,
    `<circle cx="${n(x)}" cy="${n(y)}" r="${n(size * 0.62)}" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="${n(size * 0.12)}"/>`,
    `<circle cx="${n(x - size * 0.25)}" cy="${n(y - size * 0.3)}" r="${n(size * 0.22)}" fill="#ffffff" opacity="0.55"/>`,
  ].join("");
}

// ---------------------------------------------------------------------------------
// The rotor and caliper close up, wheel removed (3/4 view)
// ---------------------------------------------------------------------------------

export type BrakeCloseupSpec = { wear: Wear; caliper?: string; seed?: number };

export function brakeCloseupScene(spec: BrakeCloseupSpec): string {
  const random = rng(spec.seed ?? 13);
  const worn = spec.wear === "worn";
  const cx = 700;
  const cy = 610;
  const R = 410;
  const caliper = spec.caliper ?? "#34363c";
  // Face-on drawing squeezed into a 3/4 view.
  const face = `translate(${cx} ${cy}) matrix(0.72 0.07 0 1 0 0) translate(${-cx} ${-cy})`;
  const depth = 46; // rotor thickness, seen as a band on the right

  const defs = [
    radial("well", { cx: 0.42, cy: 0.38, r: 0.85 }, [
      [0, "#2d2c31"],
      [0.55, "#141317"],
      [1, "#050506"],
    ]),
    radial("torch", { cx: 0.5, cy: 0.5, r: 0.5 }, [
      [0, "#fff6e0", 0.34],
      [0.55, "#fff6e0", 0.1],
      [1, "#fff6e0", 0],
    ]),
    radial("disc", { cx: 0.38, cy: 0.34, r: 0.75 }, worn
      ? [
          [0, "#dfe3e8"],
          [0.45, "#a3abb5"],
          [0.85, "#6b7480"],
          [1, "#4b5260"],
        ]
      : [
          [0, "#f8fafc"],
          [0.45, "#ccd3dc"],
          [0.85, "#8f99a6"],
          [1, "#6b7480"],
        ]),
    linear("edge", [0, 0, 0, 1], [
      [0, worn ? "#57534e" : "#6b7280"],
      [0.5, worn ? "#292524" : "#374151"],
      [1, "#0c0a09"],
    ]),
    radial("hat", { cx: 0.38, cy: 0.32, r: 0.75 }, worn
      ? [
          [0, "#8c5a2e"],
          [0.45, "#5c3317"],
          [1, "#24130a"],
        ]
      : [
          [0, "#e2e8f0"],
          [0.5, "#94a3b8"],
          [1, "#334155"],
        ]),
    radial("stud", { cx: 0.35, cy: 0.3, r: 0.8 }, [
      [0, "#fefce8"],
      [0.45, "#d4a72c"],
      [1, "#6b4a0c"],
    ]),
    linear("bow", [0, 0, 1, 0], [
      [0, "#ffffff", 0],
      [0.5, "#ffffff", 0.95],
      [1, "#ffffff", 0],
    ]),
    linear("cal", [0, 0, 1, 1], [
      [0, tint(caliper, 0.45)],
      [0.4, caliper],
      [1, shade(caliper, 0.65)],
    ]),
    linear("calSide", [0, 0, 1, 0], [
      [0, shade(caliper, 0.35)],
      [1, shade(caliper, 0.8)],
    ]),
    radial("calBoss", { cx: 0.35, cy: 0.3, r: 0.8 }, [
      [0, tint(caliper, 0.4)],
      [0.6, caliper],
      [1, shade(caliper, 0.5)],
    ]),
    linear("bracket", [0, 0, 1, 1], [
      [0, "#b6bec9"],
      [0.5, "#5b6370"],
      [1, "#262b33"],
    ]),
    linear("friction", [0, 0, 0, 1], [
      [0, "#3f3f46"],
      [1, "#18181b"],
    ]),
    linear("tireSide", [0, 0, 1, 0], [
      [0, "#060607"],
      [0.6, "#1f1f23"],
      [1, "#0b0b0d"],
    ]),
    linear("strut", [0, 0, 1, 0], [
      [0, "#111827"],
      [0.45, "#6b7280"],
      [0.6, "#9ca3af"],
      [1, "#0b0f17"],
    ]),
    noiseTexture("rust", { frequency: "0.04 0.07", octaves: 4, seed: 9, color: "#9a3412", alpha: 0.9, type: "turbulence", contrast: 2.4 }),
    noiseTexture("dirt", { frequency: 0.07, octaves: 4, seed: 21, color: "#1c1917", alpha: worn ? 0.5 : 0.1, contrast: 2 }),
    noiseTexture("cast", { frequency: 0.8, octaves: 2, seed: 6, color: "#000000", alpha: 0.4 }),
    noiseTexture("liner", { frequency: "0.015 0.4", octaves: 2, seed: 4, color: "#000000", alpha: 0.45 }),
    blur("bg", 12),
    blur("fg", 9),
    blur("soft", 12),
    blur("tiny", 2.5),
  ];

  // Vent fins between the two friction plates, visible in the edge band.
  const vents = Array.from({ length: 30 }, (_, index) => {
    const angle = -84 + index * 5.8;
    const [x, y] = polar(cx, cy, R, angle);
    const sx = cx + (x - cx) * 0.72;
    const sy = y + (x - cx) * 0.07;
    return `<path d="M ${n(sx + 6)} ${n(sy - 7)} l ${depth - 12} 5" stroke="#0b0b0c" stroke-width="7" stroke-linecap="round"/>`;
  }).join("");
  const studs = Array.from({ length: 5 }, (_, index) => {
    const [x, y] = polar(cx, cy, 128, -90 + index * 72);
    const sx = cx + (x - cx) * 0.72;
    const sy = y + (x - cx) * 0.07;
    // A short threaded cylinder pointing at the camera (toward the left in this view).
    return [
      `<ellipse cx="${n(sx + 6)}" cy="${n(sy + 6)}" rx="20" ry="26" fill="#000" opacity="0.45"/>`,
      `<path d="M ${n(sx)} ${n(sy - 22)} L ${n(sx - 34)} ${n(sy - 25)} L ${n(sx - 34)} ${n(sy + 19)} L ${n(sx)} ${n(sy + 22)} Z" fill="url(#stud)"/>`,
      ...[0, 1, 2].map((k) => `<path d="M ${n(sx - 8 - k * 9)} ${n(sy - 22)} l -3 44" stroke="#5c3d08" stroke-width="2" opacity="0.5"/>`),
      `<ellipse cx="${n(sx - 34)}" cy="${n(sy - 3)}" rx="14" ry="22" fill="#d9b450"/>`,
      `<ellipse cx="${n(sx - 37)}" cy="${n(sy - 8)}" rx="6" ry="9" fill="#fff8db" opacity="0.75"/>`,
    ].join("");
  }).join("");

  const pad = worn ? 8 : 28;
  /** A point on the rotor face (face-on radius and angle) in screen coordinates, shifted by dx. */
  const faceAt = (radius: number, degrees: number, dx = 0): [number, number] => {
    const [x, y] = polar(0, 0, radius, degrees);
    return [cx + dx + 0.72 * x, cy + y + 0.07 * x];
  };
  // The caliper body in face-on coordinates: a rounded ring sector over the rotor edge.
  const [c1x, c1y] = polar(cx, cy, 486, -36);
  const [c2x, c2y] = polar(cx, cy, 486, 36);
  const [c3x, c3y] = polar(cx, cy, 300, 36);
  const [c4x, c4y] = polar(cx, cy, 300, -36);
  const calShape = `M ${n(c4x)} ${n(c4y)} Q ${n(c4x + 60)} ${n(c4y - 60)} ${n((c4x + c1x) / 2 + 40)} ${n((c4y + c1y) / 2 - 30)} L ${n(c1x)} ${n(c1y)} A 486 486 0 0 1 ${n(c2x)} ${n(c2y)} L ${n((c2x + c3x) / 2 + 40)} ${n((c2y + c3y) / 2 + 30)} Q ${n(c3x + 60)} ${n(c3y + 60)} ${n(c3x)} ${n(c3y)} A 300 300 0 0 0 ${n(c4x)} ${n(c4y)} Z`;
  const body = [
    `<rect width="1600" height="1200" fill="url(#well)"/>`,
    `<rect width="1600" height="1200" fill="#fff" filter="url(#liner)" opacity="0.5"/>`,
    // Out of focus: strut and spring above, CV boot behind, driveway below.
    g(
      [
        `<rect x="980" y="-60" width="130" height="380" fill="url(#strut)"/>`,
        ...Array.from({ length: 4 }, (_, index) => {
          const y = -30 + index * 86;
          return `<path d="M 900 ${y} C 1010 ${y + 46} 1110 ${y + 46} 1200 ${y + 20}" stroke="#334155" stroke-width="40" fill="none" stroke-linecap="round"/>`;
        }),
        `<path d="M 300 560 C 230 520 120 560 40 610 L 60 700 C 150 660 240 640 300 660 Z" fill="#111113"/>`,
        ...[0, 1, 2, 3].map((k) => `<path d="M ${250 - k * 50} ${545 + k * 10} l 12 110" stroke="#2a2a2e" stroke-width="10"/>`),
        `<path d="M 0 1010 C 400 980 1100 990 1600 1030 V 1200 H 0 Z" fill="#4a4850"/>`,
      ],
      `filter="url(#bg)"`,
    ),
    `<ellipse cx="720" cy="560" rx="780" ry="640" fill="url(#torch)"/>`,
    // Rotor: the back plate shows as an edge band with vents; then the face.
    `<g transform="${face}"><circle cx="${cx + depth / 0.72}" cy="${cy + 26}" r="${R}" fill="#000" opacity="0.6" filter="url(#soft)"/></g>`,
    `<g transform="${face}"><circle cx="${n(cx + depth / 0.72)}" cy="${cy}" r="${R}" fill="url(#edge)"/></g>`,
    vents,
    `<g transform="${face}">`,
    `<circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#disc)"/>`,
    rotorRings(random, cx, cy, 215, R, worn),
    bowtie(cx, cy, 215, R - 6, -128, "bow", worn ? 0.3 : 0.42),
    worn
      ? [
          `<circle cx="${cx}" cy="${cy}" r="${R - 9}" fill="none" stroke="#5f3a22" stroke-width="14" opacity="0.8"/>`,
          `<circle cx="${cx}" cy="${cy}" r="${R - 9}" fill="none" stroke="#7c2d12" stroke-width="18" filter="url(#rust)"/>`,
          `<circle cx="${cx}" cy="${cy}" r="${R - 20}" fill="none" stroke="#f1f5f9" stroke-width="3" opacity="0.55"/>`,
          `<circle cx="${cx}" cy="${cy}" r="220" fill="none" stroke="#44403c" stroke-width="12" opacity="0.75"/>`,
        ].join("")
      : `<circle cx="${cx}" cy="${cy}" r="${R - 4}" fill="none" stroke="#ffffff" stroke-width="5" opacity="0.45"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${R}" fill="#fff" filter="url(#dirt)"/>`,
    // The hat, raised toward the camera.
    `<circle cx="${cx - 30}" cy="${cy}" r="200" fill="#000" opacity="0.35" filter="url(#soft)"/>`,
    `<circle cx="${cx - 26}" cy="${cy}" r="196" fill="${worn ? "#3b1d0c" : "#475569"}"/>`,
    `<circle cx="${cx - 56}" cy="${cy}" r="190" fill="url(#hat)"/>`,
    worn ? `<circle cx="${cx - 56}" cy="${cy}" r="190" fill="#6b3a1c" filter="url(#rust)" opacity="0.6"/>` : "",
    `<circle cx="${cx - 56}" cy="${cy}" r="72" fill="#1c1917"/>`,
    `<circle cx="${cx - 66}" cy="${cy}" r="58" fill="url(#bracket)"/>`,
    `<circle cx="${cx - 72}" cy="${cy}" r="30" fill="#111"/>`,
    `</g>`,
    studs,
    // Caliper hugging the rotor edge at three o'clock: bracket tabs, pad edges, the body's side
    // and its outer face (closer to the camera, so shifted left), piston boss and guide bolts.
    `<g transform="translate(22 26)"><g transform="${face}"><path d="${calShape}" fill="#000" opacity="0.6" filter="url(#soft)"/></g></g>`,
    `<g transform="${face}">`,
    `<path d="${sector(cx, cy, 300, 486, -50, -37)}" fill="url(#bracket)"/>`,
    `<path d="${sector(cx, cy, 300, 486, 37, 50)}" fill="url(#bracket)"/>`,
    `<path d="${sector(cx, cy, 316, R + 6, -37.5, -36)}" fill="#a1a1aa"/>`,
    `<path d="${sector(cx, cy, 316, R + 6, -36, -36 + pad / 8)}" fill="url(#friction)"/>`,
    `<path d="${calShape}" fill="url(#calSide)"/>`,
    `</g>`,
    `<g transform="translate(-34 0)"><g transform="${face}">`,
    `<path d="${calShape}" fill="url(#cal)"/>`,
    `<path d="${calShape}" fill="#fff" filter="url(#cast)"/>`,
    `<ellipse cx="${cx + 392}" cy="${cy}" rx="62" ry="150" fill="url(#calBoss)"/>`,
    `<ellipse cx="${cx + 380}" cy="${cy - 70}" rx="20" ry="46" fill="#ffffff" opacity="0.18" filter="url(#tiny)"/>`,
    `<path d="${sector(cx, cy, 462, 474, -32, 32)}" fill="#ffffff" opacity="0.16"/>`,
    `</g></g>`,
    lugNut(...faceAt(456, -28, -34), 22, "url(#bracket)"),
    lugNut(...faceAt(456, 28, -34), 22, "url(#bracket)"),
    // Brake hose from the top of the caliper.
    `<path d="M ${n(faceAt(470, -20, -10)[0])} ${n(faceAt(470, -20, -10)[1])} C 1180 300 1120 120 1260 -30" stroke="#09090b" stroke-width="30" fill="none"/>`,
    `<path d="M ${n(faceAt(470, -20, -18)[0])} ${n(faceAt(470, -20, -18)[1])} C 1172 292 1112 112 1252 -38" stroke="#52525b" stroke-width="5" fill="none" opacity="0.7"/>`,
    worn
      ? Array.from({ length: 12 }, () => `<path d="${blob(random, between(random, cx - 260, cx + 220), between(random, cy - 380, cy + 380), between(random, 6, 20))}" fill="#1c1917" opacity="${r2(between(random, 0.25, 0.5))}"/>`).join("")
      : "",
    // The removed tire leaning in the left foreground, out of focus.
    g(
      [
        `<ellipse cx="30" cy="1150" rx="290" ry="320" fill="url(#tireSide)"/>`,
        `<ellipse cx="52" cy="1160" rx="180" ry="205" fill="#9aa3ae"/>`,
        `<ellipse cx="58" cy="1166" rx="150" ry="172" fill="#3f4652"/>`,
        `<path d="M -150 990 C -40 850 140 830 250 910" stroke="#5b5b66" stroke-width="12" fill="none" opacity="0.6"/>`,
      ],
      `filter="url(#fg)"`,
    ),
  ];
  return photoSvg(defs, body, { vignette: 0.62, grade: "#f59e0b", gradeOpacity: 0.035 });
}

// ---------------------------------------------------------------------------------
// The wheel well: strut, coil spring and sway-bar end link
// ---------------------------------------------------------------------------------

/** Front and back halves of a coil spring (a helix seen slightly from above). */
function coilSpring(cx: number, top: number, bottom: number, radius: number, turns: number): { back: string[]; front: string[] } {
  const steps = Math.round(turns * 48);
  const back: [number, number][][] = [];
  const front: [number, number][][] = [];
  let current: [number, number][] = [];
  let currentFront: boolean | null = null;
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const angle = t * turns * Math.PI * 2;
    const x = cx + radius * Math.cos(angle);
    const y = top + (bottom - top) * t + radius * 0.24 * Math.sin(angle);
    const isFront = Math.sin(angle) > 0;
    if (currentFront === null) currentFront = isFront;
    if (isFront !== currentFront) {
      current.push([x, y]);
      (currentFront ? front : back).push(current);
      current = [[x, y]];
      currentFront = isFront;
    } else {
      current.push([x, y]);
    }
  }
  if (current.length > 1 && currentFront !== null) (currentFront ? front : back).push(current);
  return { back: back.map((points) => smoothOpen(points)), front: front.map((points) => smoothOpen(points)) };
}

export type SuspensionSpec = { wear: Wear; seed?: number };

export function suspensionScene(spec: SuspensionSpec): string {
  const random = rng(spec.seed ?? 17);
  const worn = spec.wear === "worn";
  const springColor = worn ? "#3b4250" : "#1d6fd8";
  const linkColor = worn ? "#3a3a40" : "#2563eb";

  const defs = [
    radial("well", { cx: 0.46, cy: 0.42, r: 0.85 }, [
      [0, "#2a292e"],
      [0.55, "#121115"],
      [1, "#040405"],
    ]),
    radial("torch", { cx: 0.5, cy: 0.5, r: 0.5 }, [
      [0, "#fff7e6", 0.3],
      [0.6, "#fff7e6", 0.08],
      [1, "#fff7e6", 0],
    ]),
    linear("strut", [0, 0, 1, 0], [
      [0, "#0b0f17"],
      [0.3, "#4b5563"],
      [0.5, "#d1d5db"],
      [0.62, "#6b7280"],
      [1, "#0b0f17"],
    ]),
    linear("rod", [0, 0, 1, 0], [
      [0, "#374151"],
      [0.45, "#f3f4f6"],
      [1, "#374151"],
    ]),
    linear("springFront", [0, 0, 0, 1], [
      [0, tint(springColor, 0.45)],
      [0.5, springColor],
      [1, shade(springColor, 0.5)],
    ]),
    linear("link", [0, 0, 1, 0], [
      [0, shade(linkColor, 0.55)],
      [0.45, tint(linkColor, 0.45)],
      [1, shade(linkColor, 0.65)],
    ]),
    linear("arm", [0, 0, 0, 1], [
      [0, "#5b5b63"],
      [0.45, "#2a2a30"],
      [1, "#0a0a0c"],
    ]),
    radial("boot", { cx: 0.4, cy: 0.35, r: 0.7 }, [
      [0, "#4b4b52"],
      [0.6, "#18181b"],
      [1, "#050505"],
    ]),
    linear("bar", [0, 0, 0, 1], [
      [0, "#5b6370"],
      [0.45, "#1f2937"],
      [1, "#030712"],
    ]),
    linear("seat", [0, 0, 0, 1], [
      [0, "#71717a"],
      [0.4, "#27272a"],
      [1, "#09090b"],
    ]),
    linear("tire", [0, 0, 1, 0], [
      [0, "#050506"],
      [0.5, "#1c1c20"],
      [1, "#08080a"],
    ]),
    noiseTexture("grime", { frequency: 0.06, octaves: 4, seed: 12, color: "#1c1917", alpha: worn ? 0.6 : 0.12, contrast: 2.2 }),
    noiseTexture("rust", { frequency: "0.05 0.1", octaves: 3, seed: 5, color: "#9a3412", alpha: 0.75, type: "turbulence", contrast: 2.4 }),
    noiseTexture("liner", { frequency: "0.015 0.4", octaves: 2, seed: 4, color: "#000000", alpha: 0.45 }),
    blur("bg", 14),
    blur("fg", 10),
    blur("soft", 10),
    blur("tiny", 2.5),
  ];

  const spring = coilSpring(760, 120, 640, 175, 5.5);
  const top: [number, number] = [1065, 600];
  const bottom: [number, number] = [1210, 930];
  const joint = (x: number, y: number) =>
    [
      `<ellipse cx="${x + 6}" cy="${y + 10}" rx="56" ry="48" fill="#000" opacity="0.5" filter="url(#tiny)"/>`,
      `<ellipse cx="${x}" cy="${y}" rx="54" ry="46" fill="url(#boot)"/>`,
      ...[-18, 0, 18].map((dy) => `<path d="M ${x - 44} ${y + dy} C ${x - 20} ${y + dy - 10} ${x + 20} ${y + dy - 10} ${x + 44} ${y + dy}" stroke="#000" stroke-width="3" fill="none" opacity="0.45"/>`),
      `<ellipse cx="${x - 14}" cy="${y - 16}" rx="20" ry="9" fill="#ffffff" opacity="${worn ? 0.1 : 0.22}"/>`,
      `<circle cx="${x + 50}" cy="${y - 2}" r="20" fill="url(#rod)"/><circle cx="${x + 50}" cy="${y - 2}" r="9" fill="#1f2937"/>`,
    ].join("");
  const torn = worn
    ? [
        `<path d="M ${top[0] - 50} ${top[1] - 4} L ${top[0] - 12} ${top[1] + 34} L ${top[0] - 58} ${top[1] + 30} Z" fill="#0a0a0a"/>`,
        `<path d="${blob(random, top[0] - 22, top[1] + 52, 28, 0.6)}" fill="#4a3415" opacity="0.92"/>`,
        `<path d="${blob(random, top[0] - 8, top[1] + 80, 14, 0.6)}" fill="#6b4c1e" opacity="0.85"/>`,
        `<path d="${blob(random, top[0] - 30, top[1] + 40, 10, 0.5)}" fill="#a07a35" opacity="0.6"/>`,
      ].join("")
    : "";

  const body = [
    `<rect width="1600" height="1200" fill="url(#well)"/>`,
    `<rect width="1600" height="1200" fill="#fff" filter="url(#liner)" opacity="0.55"/>`,
    g(
      [
        `<path d="M -60 1000 C 300 930 700 950 1000 1060 L 1000 1260 L -60 1260 Z" fill="#202024"/>`,
        `<path d="M 1300 80 C 1420 60 1560 120 1640 200 L 1640 1100 L 1340 1000 Z" fill="#17171a"/>`,
      ],
      `filter="url(#bg)"`,
    ),
    `<ellipse cx="800" cy="560" rx="760" ry="640" fill="url(#torch)"/>`,
    // Upper strut mount and spring back half, the strut tube, then the front half.
    `<ellipse cx="760" cy="100" rx="210" ry="48" fill="url(#seat)"/>`,
    ...spring.back.map((d) => `<path d="${d}" stroke="${shade(springColor, 0.7)}" stroke-width="42" fill="none" stroke-linecap="round"/>`),
    `<rect x="728" y="40" width="64" height="200" fill="url(#rod)"/>`,
    `<rect x="690" y="200" width="140" height="840" fill="url(#strut)"/>`,
    `<rect x="690" y="200" width="140" height="840" fill="#fff" filter="url(#grime)"/>`,
    ...spring.front.map((d) => `<path d="${d}" stroke="url(#springFront)" stroke-width="42" fill="none" stroke-linecap="round"/>`),
    ...spring.front.map((d) => `<path d="${d}" stroke="#ffffff" stroke-width="7" fill="none" stroke-linecap="round" opacity="${worn ? 0.12 : 0.38}" transform="translate(-6 -12)"/>`),
    worn ? spring.front.map((d) => `<path d="${d}" stroke="#7c2d12" stroke-width="40" fill="none" filter="url(#rust)" opacity="0.5"/>`).join("") : "",
    `<ellipse cx="760" cy="672" rx="226" ry="46" fill="url(#seat)"/>`,
    // Bracket on the strut and the knuckle below.
    `<path d="M 830 560 L 1030 580 L 1035 640 L 830 650 Z" fill="url(#arm)"/>`,
    `<path d="M 690 900 L 860 900 L 940 980 L 1120 1000 L 1130 1080 L 860 1100 L 700 1060 Z" fill="url(#arm)"/>`,
    worn ? `<path d="M 690 900 L 860 900 L 940 980 L 1120 1000 L 1130 1080 L 860 1100 L 700 1060 Z" fill="#7c2d12" filter="url(#rust)" opacity="0.6"/>` : "",
    // Sway bar coming in from the right, and the end link.
    `<path d="M 1700 1010 C 1460 980 1300 950 1240 945" stroke="url(#bar)" stroke-width="54" fill="none" stroke-linecap="round"/>`,
    `<path d="M ${top[0]} ${top[1]} L ${bottom[0]} ${bottom[1]}" stroke="#000" stroke-width="44" opacity="0.45" filter="url(#soft)" transform="translate(16 18)"/>`,
    `<path d="M ${top[0]} ${top[1]} L ${bottom[0]} ${bottom[1]}" stroke="url(#link)" stroke-width="32" stroke-linecap="round"/>`,
    `<path d="M ${top[0] - 8} ${top[1] + 10} L ${bottom[0] - 8} ${bottom[1] - 10}" stroke="#ffffff" stroke-width="5" opacity="${worn ? 0.1 : 0.35}"/>`,
    worn ? `<path d="M ${top[0]} ${top[1]} L ${bottom[0]} ${bottom[1]}" stroke="#7c2d12" stroke-width="32" filter="url(#rust)" stroke-linecap="round" opacity="0.8"/>` : "",
    joint(top[0], top[1]),
    joint(bottom[0], bottom[1]),
    torn,
    worn
      ? Array.from({ length: 9 }, () => `<path d="${blob(random, between(random, 300, 1300), between(random, 150, 1000), between(random, 8, 24))}" fill="#1c1917" opacity="${r2(between(random, 0.2, 0.45))}"/>`).join("")
      : "",
    // Tire edge in the left foreground, out of focus.
    g([`<path d="M -100 -40 C 120 100 200 600 120 1240 L -100 1240 Z" fill="url(#tire)"/>`], `filter="url(#fg)"`),
  ];
  return photoSvg(defs, body, { vignette: 0.66, grade: "#f59e0b", gradeOpacity: 0.03 });
}
