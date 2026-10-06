// Cabin scenes: the instrument cluster at night with a warning light on (check engine,
// no-start, oil life, overheating, all clear) and a scan tool plugged into the OBD port.
import {
  arc,
  between,
  blur,
  bokeh,
  g,
  linear,
  n,
  noiseTexture,
  photoSvg,
  polar,
  radial,
  rng,
  roundRect,
  text,
} from "./kit";

export type DashboardVariant = "check_engine" | "no_start" | "oil_life" | "overheat" | "all_clear";

type Light = "abs" | "engine" | "battery" | "oil" | "temp";

const AMBER = "#fbbf24";
const RED = "#f87171";

/** Pictograms drawn in a 140 x 90 box. */
const ICONS: Record<Light, string> = {
  engine:
    "M 30 22 H 62 V 12 H 46 V 5 H 94 V 12 H 78 V 22 H 98 L 110 34 H 120 V 24 H 132 V 72 H 120 V 62 H 110 V 80 H 54 L 42 68 H 30 V 56 H 18 V 74 H 6 V 34 H 18 V 46 H 30 Z",
  battery:
    "M 14 24 H 126 V 82 H 14 Z M 30 12 H 50 V 24 H 30 Z M 90 12 H 110 V 24 H 90 Z",
  oil: "M 8 52 L 26 40 H 50 L 56 32 H 66 L 72 40 H 92 L 126 26 L 132 32 L 100 66 H 30 Z M 128 46 C 128 52 124 56 120 56 C 116 56 112 52 112 46 L 120 36 Z",
  temp: "M 62 8 H 78 V 52 A 16 16 0 1 1 62 52 Z M 84 18 H 104 M 84 30 H 100 M 84 42 H 104 M 8 72 Q 24 62 40 72 T 72 72 T 104 72 T 136 72",
  abs: "M 70 10 A 38 38 0 1 1 69.9 10 Z",
};

function icon(kind: Light, x: number, y: number, scale: number, color: string, lit: boolean, glowId: string): string {
  const stroked = kind === "temp" || kind === "abs";
  const paint = stroked
    ? `fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"`
    : `fill="${color}" fill-rule="evenodd"`;
  const label = kind === "abs" ? text(70, 58, "ABS", { size: 28, fill: color, weight: 700, anchor: "middle", font: "display" }) : "";
  const battery =
    kind === "battery"
      ? `<path d="M 34 52 H 54 M 44 42 V 62 M 86 52 H 106" stroke="#05070c" stroke-width="7" stroke-linecap="round"/>`
      : "";
  const shape = `<path d="${ICONS[kind]}" ${paint}/>${battery}${label}`;
  const transform = `translate(${n(x)} ${n(y)}) scale(${scale})`;
  if (!lit) return `<g transform="${transform}" opacity="0.13">${shape}</g>`;
  return [
    `<g transform="${transform}" filter="url(#${glowId})" opacity="0.95">${shape}</g>`,
    `<g transform="${transform}">${shape}</g>`,
  ].join("");
}

type Gauge = {
  cx: number;
  cy: number;
  r: number;
  labels: readonly string[];
  /** 0..1 along the 270 degree sweep. */
  value: number;
  redFrom?: number;
  unit: string;
};

const SWEEP_START = 135;
const SWEEP = 270;

function gauge(gauge: Gauge, prefix: string, brightness: number): string {
  const { cx, cy, r } = gauge;
  const parts: string[] = [];
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${r + 18}" fill="url(#${prefix}bezel)"/>`);
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${r + 4}" fill="#020306"/>`);
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${prefix}face)"/>`);
  parts.push(
    `<circle cx="${cx}" cy="${cy}" r="${r - 8}" fill="none" stroke="#38bdf8" stroke-width="3" opacity="${0.55 * brightness}" filter="url(#${prefix}soft)"/>`,
  );
  if (gauge.redFrom !== undefined) {
    parts.push(
      `<path d="${arc(cx, cy, r - 30, SWEEP_START + SWEEP * gauge.redFrom, SWEEP_START + SWEEP)}" fill="none" stroke="#ef4444" stroke-width="16" opacity="${0.85 * brightness}"/>`,
    );
  }
  const majors = gauge.labels.length - 1;
  for (let index = 0; index <= majors * 4; index += 1) {
    const angle = SWEEP_START + (SWEEP * index) / (majors * 4);
    const major = index % 4 === 0;
    const [x1, y1] = polar(cx, cy, r - (major ? 46 : 32), angle);
    const [x2, y2] = polar(cx, cy, r - 14, angle);
    parts.push(
      `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="#e0f2fe" stroke-width="${major ? 7 : 3}" stroke-linecap="round" opacity="${brightness}"/>`,
    );
  }
  gauge.labels.forEach((label, index) => {
    const angle = SWEEP_START + (SWEEP * index) / majors;
    const [x, y] = polar(cx, cy, r - 86, angle);
    parts.push(text(x, y + 14, label, { size: 38, fill: "#f0f9ff", weight: 600, anchor: "middle", font: "display", opacity: brightness }));
  });
  parts.push(text(cx, cy + r * 0.3, gauge.unit, { size: 26, fill: "#7dd3fc", anchor: "middle", font: "display", opacity: 0.8 * brightness, spacing: 3 }));
  // Needle with a glow, then the pivot cap.
  const angle = SWEEP_START + SWEEP * gauge.value;
  const [tx, ty] = polar(cx, cy, r - 22, angle);
  const [lx, ly] = polar(cx, cy, 16, angle - 90);
  const [rx, ry] = polar(cx, cy, 16, angle + 90);
  const [bx, by] = polar(cx, cy, 46, angle + 180);
  const needle = `M ${n(tx)} ${n(ty)} L ${n(lx)} ${n(ly)} L ${n(bx)} ${n(by)} L ${n(rx)} ${n(ry)} Z`;
  parts.push(`<path d="${needle}" fill="#fb923c" filter="url(#${prefix}glow)" opacity="${0.9 * brightness}"/>`);
  parts.push(`<path d="${needle}" fill="url(#${prefix}needle)"/>`);
  parts.push(`<circle cx="${cx}" cy="${cy}" r="38" fill="url(#${prefix}cap)"/>`);
  parts.push(`<circle cx="${cx}" cy="${cy}" r="38" fill="none" stroke="#000" stroke-opacity="0.5" stroke-width="3"/>`);
  return parts.join("");
}

/** A small sub-gauge in the bottom gap of a dial: temperature (C-H) or fuel (E-F). */
function subGauge(cx: number, cy: number, kind: "temp" | "fuel", value: number, alarm: boolean, prefix: string, brightness: number): string {
  const start = 215;
  const end = 325;
  const angle = start + (end - start) * value;
  const [x1, y1] = polar(cx, cy, 14, angle);
  const [x2, y2] = polar(cx, cy, 60, angle);
  const [low, high] = kind === "temp" ? ["C", "H"] : ["E", "F"];
  const needleColor = alarm ? "#ef4444" : "#fb923c";
  const glow = alarm ? ` filter="url(#${prefix}glow)"` : "";
  const line = `x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}"`;
  return [
    `<path d="${arc(cx, cy, 54, start, end)}" fill="none" stroke="#1e293b" stroke-width="10" stroke-linecap="round"/>`,
    kind === "temp"
      ? `<path d="${arc(cx, cy, 54, 300, end)}" fill="none" stroke="#ef4444" stroke-width="10" stroke-linecap="round" opacity="${0.9 * brightness}"/>`
      : `<path d="${arc(cx, cy, 54, start, 232)}" fill="none" stroke="#f59e0b" stroke-width="10" stroke-linecap="round" opacity="${0.8 * brightness}"/>`,
    text(...polar(cx, cy, 78, start - 8), low, { size: 24, fill: "#bae6fd", anchor: "middle", font: "display", opacity: brightness }),
    text(...polar(cx, cy, 78, end + 8), high, { size: 24, fill: alarm ? RED : "#bae6fd", anchor: "middle", font: "display", weight: 700, opacity: brightness }),
    `<line ${line} stroke="${needleColor}" stroke-width="8" stroke-linecap="round"${glow}/>`,
    `<line ${line} stroke="${alarm ? "#fecaca" : "#fdba74"}" stroke-width="4" stroke-linecap="round"/>`,
    `<circle cx="${cx}" cy="${cy}" r="12" fill="#0f172a" stroke="#334155" stroke-width="3"/>`,
  ].join("");
}

function display(variant: DashboardVariant, x: number, y: number, width: number, height: number, brightness: number, glowId: string): string {
  const parts: string[] = [
    `<path d="${roundRect(x, y, width, height, 26)}" fill="#03060c" stroke="#1e3a5f" stroke-width="3"/>`,
    `<path d="${roundRect(x + 10, y + 10, width - 20, height - 20, 18)}" fill="url(#tft)" opacity="${brightness}"/>`,
  ];
  const cx = x + width / 2;
  const line = (dy: number, content: string, size: number, fill: string, weight = 600) =>
    text(cx, y + dy, content, { size, fill, weight, anchor: "middle", font: "display", opacity: brightness });
  switch (variant) {
    case "oil_life":
      parts.push(
        `<g transform="translate(${n(cx - 34)} ${n(y + 62)}) scale(0.48)" filter="url(#${glowId})"><path d="M 20 120 L 100 40 A 40 40 0 1 1 140 64 L 60 144 Z" fill="${AMBER}"/></g>`,
        line(210, "OIL LIFE", 34, AMBER, 700),
        line(262, "5%", 64, AMBER, 700),
        line(306, "Service due soon", 24, "#fde68a", 500),
      );
      break;
    case "overheat":
      parts.push(line(150, "ENGINE", 34, RED, 700), line(192, "TEMP HIGH", 34, RED, 700), line(250, "Stop safely", 26, "#fecaca", 500));
      break;
    case "no_start":
      parts.push(line(150, "LOW", 30, RED, 700), line(190, "VOLTAGE", 30, RED, 700), line(258, "10.9 V", 50, "#fecaca", 700));
      break;
    default:
      parts.push(
        line(110, "P", 72, "#e0f2fe", 700),
        line(186, variant === "all_clear" ? "88°F" : "91°F", 32, "#bae6fd", 500),
        line(250, "ODO", 22, "#7dd3fc", 600),
        line(286, variant === "all_clear" ? "131,236" : "131,207", 32, "#e0f2fe", 600),
      );
  }
  return parts.join("");
}

/** The instrument cluster at dusk, photographed from the driver's seat. */
export function dashboardScene(variant: DashboardVariant, seed = 7): string {
  const random = rng(seed);
  const engineOff = variant === "no_start";
  const brightness = engineOff ? 0.62 : 1;
  const lit: Record<Light, boolean> = {
    abs: engineOff,
    engine: variant === "check_engine" || engineOff,
    battery: engineOff,
    oil: engineOff || variant === "oil_life",
    temp: variant === "overheat",
  };
  const colors: Record<Light, string> = { abs: AMBER, engine: AMBER, battery: RED, oil: variant === "oil_life" ? AMBER : RED, temp: RED };
  const speed = variant === "overheat" ? 0.05 : 0;
  const rpm = engineOff ? 0 : variant === "overheat" ? 0.16 : variant === "check_engine" ? 0.11 : 0.09;

  const defs = [
    linear("cabin", [0, 0, 0, 1], [
      [0, "#0b0f19"],
      [1, "#030407"],
    ]),
    linear("windshield", [0, 0, 0, 1], [
      [0, "#1b2338"],
      [1, "#0b1020"],
    ]),
    linear("cowl", [0, 0, 0, 1], [
      [0, "#20242c"],
      [0.6, "#121419"],
      [1, "#08090c"],
    ]),
    linear("recess", [0, 0, 0, 1], [
      [0, "#020305"],
      [1, "#0b0e15"],
    ]),
    linear("gbezel", [0, 0, 1, 1], [
      [0, "#e2e8f0"],
      [0.35, "#64748b"],
      [0.6, "#1e293b"],
      [1, "#94a3b8"],
    ]),
    radial("gface", { cx: 0.5, cy: 0.45, r: 0.6 }, [
      [0, "#18233a"],
      [0.7, "#0a0f1c"],
      [1, "#04060b"],
    ]),
    linear("gneedle", [0, 0, 1, 1], [
      [0, "#fed7aa"],
      [0.5, "#f97316"],
      [1, "#c2410c"],
    ]),
    radial("gcap", { cx: 0.4, cy: 0.35, r: 0.7 }, [
      [0, "#475569"],
      [0.6, "#111827"],
      [1, "#020617"],
    ]),
    radial("tft", { cx: 0.5, cy: 0.3, r: 0.9 }, [
      [0, "#0c1b33"],
      [1, "#050a14"],
    ]),
    linear("glare", [0, 0, 1, 1], [
      [0, "#ffffff", 0.09],
      [0.5, "#ffffff", 0.02],
      [1, "#ffffff", 0],
    ]),
    linear("rim", [0, 0, 0, 1], [
      [0, "#2a2d33"],
      [0.2, "#111215"],
      [1, "#040405"],
    ]),
    noiseTexture("grain", { frequency: 0.9, octaves: 2, seed: 4, color: "#ffffff", alpha: 0.05 }),
    radial("spill", { cx: 0.5, cy: 0.5, r: 0.5 }, [
      [0, "#38bdf8", 0.22],
      [1, "#38bdf8", 0],
    ]),
    blur("gsoft", 4),
    blur("gglow", 9),
    blur("iconGlow", 10),
    blur("far", 16),
    blur("dof", 7),
    blur("lip", 18),
  ];

  const city = bokeh(random, 26, { x: 0, y: 10, width: 1600, height: 150 }, ["#fbbf24", "#f97316", "#fde68a", "#ef4444", "#93c5fd"], [8, 26], [0.25, 0.7]);
  const gaugeLeft: Gauge = { cx: 430, cy: 590, r: 232, labels: ["0", "20", "40", "60", "80", "100", "120", "140", "160"], value: speed, unit: "MPH" };
  const gaugeRight: Gauge = { cx: 1170, cy: 590, r: 232, labels: ["0", "1", "2", "3", "4", "5", "6", "7", "8"], value: rpm, redFrom: 0.8, unit: "x1000 RPM" };
  const lights: Light[] = ["abs", "engine", "battery", "oil", "temp"];
  const lightX = (index: number) => 520 + index * 118;
  const lightRow = lights.map((light, index) => icon(light, lightX(index), 800, 0.62, colors[light], lit[light], "iconGlow")).join("");
  // Lit warning lights spill colored light onto the lens and the recess.
  const spills = lights
    .map((light, index) =>
      lit[light]
        ? `<ellipse cx="${n(lightX(index) + 43)}" cy="828" rx="120" ry="70" fill="${colors[light]}" opacity="0.2" filter="url(#lip)"/>`
        : "",
    )
    .join("");
  const reflections = lights
    .map((light, index) =>
      lit[light]
        ? `<ellipse cx="${n(lightX(index) + 43 + 30)}" cy="300" rx="70" ry="12" fill="${colors[light]}" opacity="0.12" filter="url(#gglow)"/>`
        : "",
    )
    .join("");

  const body = [
    `<rect width="1600" height="1200" fill="url(#cabin)"/>`,
    // Windshield with the street outside, out of focus.
    `<rect width="1600" height="240" fill="url(#windshield)"/>`,
    g([city], `filter="url(#far)"`),
    // Dashboard cowl over the cluster: soft-touch plastic with a lit leading edge.
    `<path d="M 0 150 C 300 120 1300 120 1600 150 L 1600 330 C 1300 280 300 280 0 330 Z" fill="url(#cowl)"/>`,
    `<path d="M 0 150 C 300 120 1300 120 1600 150 L 1600 330 C 1300 280 300 280 0 330 Z" fill="#fff" filter="url(#grain)"/>`,
    `<path d="M 0 152 C 300 122 1300 122 1600 152" stroke="#64748b" stroke-width="3" fill="none" opacity="0.45"/>`,
    `<path d="M 120 280 C 450 250 1150 250 1480 280" stroke="#4b5563" stroke-width="3" fill="none" opacity="0.6"/>`,
    `<path d="${roundRect(150, 270, 1300, 700, 120)}" fill="url(#recess)"/>`,
    `<path d="${roundRect(150, 270, 1300, 700, 120)}" fill="none" stroke="#1f2937" stroke-width="4"/>`,
    `<path d="M 160 300 C 500 250 1100 250 1440 300 L 1440 380 C 1100 330 500 330 160 380 Z" fill="#000" opacity="0.75" filter="url(#lip)"/>`,
    `<ellipse cx="430" cy="590" rx="360" ry="330" fill="url(#spill)" opacity="${brightness}"/>`,
    `<ellipse cx="1170" cy="590" rx="360" ry="330" fill="url(#spill)" opacity="${brightness}"/>`,
    spills,
    gauge(gaugeLeft, "g", brightness),
    gauge(gaugeRight, "g", brightness),
    subGauge(430, 790, "fuel", 0.68, false, "g", brightness),
    subGauge(1170, 790, "temp", variant === "overheat" ? 0.95 : 0.5, variant === "overheat", "g", brightness),
    display(variant, 690, 400, 220, 340, brightness, "iconGlow"),
    lightRow,
    reflections,
    // Glass glare across the cluster lens.
    `<path d="M 150 270 L 760 270 L 380 970 L 150 970 Z" fill="url(#glare)"/>`,
    // Steering-wheel rim in the foreground, out of focus.
    g(
      [
        `<circle cx="800" cy="1820" r="860" fill="none" stroke="url(#rim)" stroke-width="96"/>`,
        `<path d="${arc(800, 1820, 900, 232, 308)}" fill="none" stroke="#9ca3af" stroke-width="5" opacity="0.28"/>`,
        `<path d="${arc(800, 1820, 860, 236, 304)}" fill="none" stroke="#3f3f46" stroke-width="3" stroke-dasharray="10 12" opacity="0.6"/>`,
        `<path d="M 600 1200 C 640 1100 960 1100 1000 1200 Z" fill="#08090b"/>`,
      ],
      `filter="url(#dof)"`,
    ),
  ];
  return photoSvg(defs, body, { vignette: 0.6, grade: "#1d4ed8", gradeOpacity: 0.04 });
}

/** A handheld scan tool plugged into the OBD-II port under the dash, showing live data. */
export function scanToolScene(seed = 11): string {
  const random = rng(seed);
  const defs = [
    linear("dash", [0, 0, 0, 1], [
      [0, "#1f2937"],
      [1, "#0b0f17"],
    ]),
    linear("tool", [0, 0, 1, 1], [
      [0, "#334155"],
      [0.5, "#111827"],
      [1, "#020617"],
    ]),
    linear("screen", [0, 0, 0, 1], [
      [0, "#082f49"],
      [1, "#020617"],
    ]),
    linear("cable", [0, 0, 1, 0], [
      [0, "#0f172a"],
      [0.5, "#334155"],
      [1, "#0f172a"],
    ]),
    radial("torch", { cx: 0.5, cy: 0.5, r: 0.5 }, [
      [0, "#fef3c7", 0.28],
      [1, "#fef3c7", 0],
    ]),
    blur("soft", 10),
    blur("glow", 6),
    blur("bg", 14),
  ];
  const trace = Array.from({ length: 24 }, (_, index) => {
    const x = 640 + index * 22;
    const y = 520 + Math.sin(index * 0.7) * 26 + between(random, -10, 10);
    return `${index === 0 ? "M" : "L"} ${n(x)} ${n(y)}`;
  }).join(" ");
  const body = [
    `<rect width="1600" height="1200" fill="url(#dash)"/>`,
    g(
      [
        `<path d="M 0 0 H 1600 V 260 C 1200 300 400 300 0 260 Z" fill="#111827"/>`,
        `<rect x="1050" y="60" width="380" height="180" rx="30" fill="#0f172a"/>`,
        `<circle cx="300" cy="1150" r="420" fill="#0b0f17"/>`,
      ],
      `filter="url(#bg)"`,
    ),
    `<ellipse cx="800" cy="640" rx="620" ry="460" fill="url(#torch)"/>`,
    // The OBD-II port in the lower dash panel.
    `<path d="${roundRect(180, 760, 420, 230, 30)}" fill="#0a0d14" stroke="#374151" stroke-width="4"/>`,
    `<path d="M 250 830 H 530 L 500 930 H 280 Z" fill="#111827" stroke="#4b5563" stroke-width="5"/>`,
    `<path d="M 270 845 H 510 L 486 915 H 294 Z" fill="#1f2937"/>`,
    `<path d="M 300 860 H 480 L 470 900 H 310 Z" fill="#0f172a"/>`,
    // Connector and cable up to the tool.
    `<path d="M 290 840 H 490 L 470 930 H 310 Z" fill="#1e3a8a"/>`,
    `<path d="M 330 860 H 450 V 905 H 330 Z" fill="#1e40af"/>`,
    `<path d="M 390 840 C 380 700 420 640 520 600" stroke="url(#cable)" stroke-width="34" fill="none" stroke-linecap="round"/>`,
    // The scan tool.
    `<path d="${roundRect(500, 330, 720, 470, 48)}" fill="#000" opacity="0.5" filter="url(#soft)" transform="translate(18 26)"/>`,
    `<path d="${roundRect(500, 330, 720, 470, 48)}" fill="url(#tool)" stroke="#475569" stroke-width="3"/>`,
    `<path d="${roundRect(560, 380, 600, 330, 18)}" fill="url(#screen)"/>`,
    `<path d="${roundRect(560, 380, 600, 330, 18)}" fill="none" stroke="#22d3ee" stroke-opacity="0.35" stroke-width="2"/>`,
    text(590, 425, "LIVE DATA", { size: 26, fill: "#67e8f9", weight: 700, font: "display", spacing: 2 }),
    text(1130, 425, "P0302", { size: 26, fill: "#fbbf24", weight: 700, font: "mono", anchor: "end" }),
    `<path d="${trace}" fill="none" stroke="#22d3ee" stroke-width="5" filter="url(#glow)"/>`,
    `<path d="${trace}" fill="none" stroke="#a5f3fc" stroke-width="3"/>`,
    text(590, 620, "MISFIRE CYL 2", { size: 24, fill: "#e0f2fe", font: "mono" }),
    text(590, 660, "RPM 742   STFT +3%", { size: 24, fill: "#94a3b8", font: "mono" }),
    ...[0, 1, 2].map((index) => `<circle cx="${700 + index * 160}" cy="755" r="18" fill="#1e293b" stroke="#475569" stroke-width="3"/>`),
    `<path d="M 560 384 L 760 384 L 600 706 L 560 706 Z" fill="#ffffff" opacity="0.05"/>`,
  ];
  return photoSvg(defs, body, { vignette: 0.62, grade: "#0ea5e9", gradeOpacity: 0.03 });
}
