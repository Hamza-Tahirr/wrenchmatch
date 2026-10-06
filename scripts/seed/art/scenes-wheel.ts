// The front wheel of a parked car at dusk, in a 3/4 view: tread, sidewall, a recessed alloy
// rim and the brake rotor and caliper seen through the spokes. "worn" adds brake dust and a
// scored, rust-edged rotor; "new" shows a clean wheel and a fresh rotor.
import { between, blur, circlePath, linear, n, noiseTexture, photoSvg, polar, r2, radial, rng, sector, shade, tint } from "./kit";

export type WheelSpec = { paint: string; wear: "worn" | "new"; seed?: number };

const K = 0.8; // horizontal squeeze of the wheel face (3/4 view)
const TILT = 0.05;

export function wheelScene(spec: WheelSpec): string {
  const random = rng(spec.seed ?? 5);
  const worn = spec.wear === "worn";
  const paint = spec.paint;
  const cx = 700;
  const cy = 590;
  const tireR = 420;
  const rimR = 286;
  const tread = 128; // how much of the tread shows on the right, in screen px
  const groundY = cy + tireR;
  const face = (dx = 0) => `translate(${n(cx + dx)} ${cy}) matrix(${K} ${TILT} 0 1 0 0) translate(${-cx} ${-cy})`;
  /** A point on the wheel face (face-on angle and radius) in screen coordinates. */
  const onFace = (radius: number, degrees: number, dx = 0): [number, number] => {
    const [x, y] = polar(0, 0, radius, degrees);
    return [cx + dx + K * x, cy + y + TILT * x];
  };

  const defs = [
    linear("paint", [0, 0, 0, 1], [
      [0, tint(paint, 0.5)],
      [0.3, tint(paint, 0.2)],
      [0.52, paint],
      [0.525, shade(paint, 0.55)],
      [0.8, shade(paint, 0.35)],
      [1, shade(paint, 0.7)],
    ]),
    linear("dusk", [0, 0, 1, 0], [
      [0, "#ffb27a", 0.28],
      [0.45, "#ffb27a", 0.05],
      [1, "#7aa7ff", 0.18],
    ]),
    linear("bumper", [0, 0, 1, 0], [
      [0, "#000000", 0],
      [1, "#000000", 0.55],
    ]),
    linear("ground", [0, 0, 0, 1], [
      [0, "#4a4750"],
      [1, "#8f8b94"],
    ]),
    radial("sidewall", { cx: 0.36, cy: 0.3, r: 0.8 }, [
      [0, "#45454b"],
      [0.55, "#2a2a2f"],
      [0.9, "#1d1d21"],
      [1, "#2b2b31"],
    ]),
    linear("tread", [0, 0, 1, 0], [
      [0, "#09090a"],
      [0.5, "#202024"],
      [0.85, "#2c2c33"],
      [1, "#5a6a8a"],
    ]),
    linear("barrel", [0, 0, 1, 0], [
      [0, "#e5e9ef"],
      [0.5, "#8a95a5"],
      [1, "#3b4352"],
    ]),
    linear("spoke", [0, 0, 1, 1], [
      [0, "#ffffff"],
      [0.3, "#dde3ea"],
      [0.65, "#9aa5b4"],
      [1, "#5e6878"],
    ]),
    linear("lip", [0, 0, 1, 1], [
      [0, "#ffffff"],
      [0.4, "#d3d9e1"],
      [0.7, "#6b7586"],
      [1, "#cfd6df"],
    ]),
    radial("disc", { cx: 0.4, cy: 0.36, r: 0.72 }, worn
      ? [
          [0, "#d6dbe1"],
          [0.55, "#9aa3ad"],
          [1, "#596270"],
        ]
      : [
          [0, "#f4f7fa"],
          [0.55, "#c6cdd6"],
          [1, "#7d8794"],
        ]),
    radial("hat", { cx: 0.4, cy: 0.35, r: 0.7 }, worn
      ? [
          [0, "#8a5a2b"],
          [0.55, "#5e3418"],
          [1, "#2a160b"],
        ]
      : [
          [0, "#dfe4ea"],
          [1, "#5e6878"],
        ]),
    linear("caliper", [0, 0, 1, 1], [
      [0, "#646a78"],
      [0.5, "#2c2e35"],
      [1, "#0c0c0f"],
    ]),
    linear("bow", [0, 0, 1, 0], [
      [0, "#ffffff", 0],
      [0.5, "#ffffff", 0.9],
      [1, "#ffffff", 0],
    ]),
    radial("dust", { cx: 0.5, cy: 0.5, r: 0.5 }, [
      [0.25, "#3a2a1e", 0],
      [0.85, "#3a2a1e", 0.45],
      [1, "#3a2a1e", 0.25],
    ]),
    radial("chrome", { cx: 0.35, cy: 0.3, r: 0.8 }, [
      [0, "#ffffff"],
      [0.5, "#aab4c2"],
      [1, "#3d4554"],
    ]),
    radial("keyLight", { cx: 0.5, cy: 0.5, r: 0.5 }, [
      [0, "#ffd9b0", 0.22],
      [1, "#ffd9b0", 0],
    ]),
    noiseTexture("asphalt", { frequency: 0.7, octaves: 3, seed: 3, color: "#0f0f12", alpha: 0.45 }),
    noiseTexture("rubber", { frequency: 1.3, octaves: 2, seed: 8, color: "#ffffff", alpha: 0.06 }),
    blur("soft", 14),
    blur("wide", 36),
    blur("tiny", 3),
    blur("far", 26),
  ];

  // Rim face: a disc with five windows between five double spokes (face-on coordinates).
  const windows: string[] = [];
  for (let index = 0; index < 5; index += 1) {
    const start = -90 + index * 72 + 16;
    windows.push(sector(cx, cy, 100, rimR - 26, start, start + 40));
    windows.push(sector(cx, cy, 146, rimR - 40, start - 12, start - 7));
  }
  const rimFace = `${circlePath(cx, cy, rimR - 4)} ${windows.join(" ")}`;
  const rings = Array.from({ length: worn ? 48 : 30 }, () => {
    const r = between(random, 150, rimR - 34);
    const dark = random() < (worn ? 0.6 : 0.4);
    return `<circle cx="${cx}" cy="${cy}" r="${n(r)}" fill="none" stroke="${dark ? "#111827" : "#ffffff"}" stroke-width="${n(dark && worn ? between(random, 1.5, 5) : between(random, 0.8, 2))}" opacity="${r2((worn ? between(random, 0.12, 0.4) : between(random, 0.05, 0.14)))}"/>`;
  }).join("");
  const lugs = Array.from({ length: 5 }, (_, index) => {
    const [x, y] = polar(cx, cy, 56, -90 + index * 72);
    const points = Array.from({ length: 6 }, (__, k) => polar(x, y, 14, k * 60 + 30))
      .map(([px, py]) => `${n(px)},${n(py)}`)
      .join(" ");
    return `<polygon points="${points}" fill="#000" opacity="0.5" transform="translate(4 5)"/><polygon points="${points}" fill="url(#chrome)"/><circle cx="${n(x - 4)}" cy="${n(y - 4)}" r="4" fill="#fff" opacity="0.6"/>`;
  }).join("");

  // Tread: circumferential grooves (shifted ellipses) and lateral sipes across the band.
  const grooves = [0.28, 0.55, 0.8]
    .map((t) => `<g transform="${face(tread * t)}"><circle cx="${cx}" cy="${cy}" r="${tireR - 2}" fill="none" stroke="#050506" stroke-width="9"/></g>`)
    .join("");
  const sipes = Array.from({ length: 34 }, (_, index) => {
    const angle = -88 + index * 5.3;
    const [x1, y1] = onFace(tireR - 2, angle, 4);
    const [x2, y2] = onFace(tireR - 2, angle, tread - 6);
    return `<path d="M ${n(x1)} ${n(y1)} L ${n(x2)} ${n(y2)}" stroke="#060607" stroke-width="5" opacity="0.8"/>`;
  }).join("");
  const reflections = [
    `<path d="M -40 120 C 200 90 380 140 560 110 C 760 80 980 140 1220 100 C 1400 70 1520 90 1640 84 L 1640 190 L -40 190 Z" fill="${shade(paint, 0.4)}" opacity="0.35" filter="url(#far)"/>`,
    `<path d="M -40 40 L 300 40 L 420 0 L 760 0 L 900 60 L 1180 50 L 1260 0 L -40 0 Z" fill="#1b1830" opacity="0.35" filter="url(#far)"/>`,
  ].join("");

  const body = [
    // Car body: fender above, front bumper on the right, rocker on the left.
    `<rect width="1600" height="1200" fill="url(#paint)"/>`,
    `<rect width="1600" height="1200" fill="url(#dusk)"/>`,
    reflections,
    `<path d="M 1300 0 C 1420 200 1500 500 1520 820 L 1600 820 L 1600 0 Z" fill="url(#bumper)"/>`,
    `<path d="M 0 248 C 400 238 1000 230 1600 214" stroke="${tint(paint, 0.6)}" stroke-width="4" fill="none" opacity="0.55"/>`,
    // Ground and the shade under the car.
    `<rect y="790" width="1600" height="410" fill="url(#ground)"/>`,
    `<rect y="790" width="1600" height="410" fill="#fff" filter="url(#asphalt)"/>`,
    `<path d="M 0 790 H 1600 V 900 C 1100 960 400 960 0 920 Z" fill="#07070a" opacity="0.9" filter="url(#wide)"/>`,
    `<path d="M -40 1120 L 1640 1000" stroke="#2b2a30" stroke-width="4" opacity="0.5"/>`,
    `<path d="M 0 792 H 1600" stroke="${shade(paint, 0.75)}" stroke-width="16"/>`,
    // Wheel well, the fender lip and its highlight.
    `<g transform="${face(26)}"><circle cx="${cx}" cy="${cy - 40}" r="${tireR + 66}" fill="#050506"/></g>`,
    `<g transform="${face(26)}"><path d="M ${cx - tireR - 66} ${cy - 40} A ${tireR + 66} ${tireR + 66} 0 0 1 ${cx + tireR + 66} ${cy - 40}" fill="none" stroke="${tint(paint, 0.55)}" stroke-width="10"/></g>`,
    `<rect y="790" width="1600" height="30" fill="#07070a" opacity="0.6"/>`,
    // Contact shadow, then the tire: tread band, grooves and sipes, then the sidewall.
    `<ellipse cx="${cx + 70}" cy="${groundY + 4}" rx="${n(tireR * K + 120)}" ry="34" fill="#000" opacity="0.92" filter="url(#soft)"/>`,
    `<g transform="${face(tread)}"><circle cx="${cx}" cy="${cy}" r="${tireR}" fill="url(#tread)"/></g>`,
    `<g transform="${face(tread / 2)}"><circle cx="${cx}" cy="${cy}" r="${tireR}" fill="url(#tread)"/></g>`,
    grooves,
    sipes,
    `<g transform="${face()}">`,
    `<circle cx="${cx}" cy="${cy}" r="${tireR}" fill="url(#sidewall)"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${tireR}" fill="#fff" filter="url(#rubber)"/>`,
    `<path d="${sector(cx, cy, tireR - 16, tireR, 150, 300)}" fill="#ffd9b0" opacity="0.22" filter="url(#tiny)"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${tireR - 1}" fill="none" stroke="#4a4a52" stroke-width="3" opacity="0.8"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${tireR - 58}" fill="none" stroke="#3a3a40" stroke-width="16" opacity="0.5"/>`,
    `<path d="${sector(cx, cy, tireR - 70, tireR - 12, 200, 290)}" fill="#ffffff" opacity="0.05"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${rimR + 18}" fill="#08080a"/>`,
    // Rim barrel (inside of the rim, seen because the face is recessed).
    `<circle cx="${cx}" cy="${cy}" r="${rimR + 4}" fill="url(#barrel)"/>`,
    `</g>`,
    `<g transform="${face(40)}">`,
    `<circle cx="${cx}" cy="${cy}" r="${rimR - 8}" fill="#060607"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${rimR - 26}" fill="url(#disc)"/>`,
    rings,
    `<path d="${sector(cx, cy, 150, rimR - 30, -140, -112)}" fill="url(#bow)" opacity="0.32"/>`,
    `<path d="${sector(cx, cy, 150, rimR - 30, 40, 68)}" fill="url(#bow)" opacity="0.22"/>`,
    worn ? `<circle cx="${cx}" cy="${cy}" r="${rimR - 32}" fill="none" stroke="#6b3518" stroke-width="10" opacity="0.7"/>` : "",
    `<circle cx="${cx}" cy="${cy}" r="138" fill="url(#hat)"/>`,
    `<path d="${sector(cx, cy, 168, rimR + 2, -64, -12)}" fill="url(#caliper)"/>`,
    `<path d="${sector(cx, cy, 176, rimR - 8, -58, -18)}" fill="#ffffff" opacity="0.07"/>`,
    `</g>`,
    `<g transform="${face(16)}">`,
    `<path d="${rimFace}" fill-rule="evenodd" fill="#000" opacity="0.6" filter="url(#soft)" transform="translate(20 22)"/>`,
    `<path d="${rimFace}" fill-rule="evenodd" fill="url(#spoke)"/>`,
    worn ? `<path d="${rimFace}" fill-rule="evenodd" fill="url(#dust)"/>` : "",
    `<circle cx="${cx}" cy="${cy}" r="96" fill="url(#lip)"/>`,
    `<circle cx="${cx}" cy="${cy}" r="82" fill="#1a2130"/>`,
    `<circle cx="${cx}" cy="${cy}" r="32" fill="url(#chrome)"/>`,
    lugs,
    `</g>`,
    `<g transform="${face()}">`,
    `<circle cx="${cx}" cy="${cy}" r="${rimR}" fill="none" stroke="url(#lip)" stroke-width="18"/>`,
    `<path d="M ${cx - 240} ${cy - 150} A 284 284 0 0 1 ${cx + 150} ${cy - 240}" stroke="#ffffff" stroke-width="10" fill="none" opacity="0.5" filter="url(#tiny)"/>`,
    `</g>`,
    // Warm key light from the left, cool street light catching the tread on the right.
    `<ellipse cx="420" cy="420" rx="620" ry="520" fill="url(#keyLight)"/>`,
    `<path d="M ${n(onFace(tireR, -60, tread)[0])} ${n(onFace(tireR, -60, tread)[1])} A ${n(tireR * K)} ${tireR} 0 0 1 ${n(onFace(tireR, 50, tread)[0])} ${n(onFace(tireR, 50, tread)[1])}" stroke="#93b4ff" stroke-width="6" fill="none" opacity="0.45" filter="url(#tiny)"/>`,
  ];
  return photoSvg(defs, body, { vignette: 0.55, grade: "#7c3aed", gradeOpacity: 0.03 });
}
