import type { ReactNode } from "react";

import { ambient as s } from "./ambient";
import { artFont, ink, neon } from "./palette";
import { BlurFilter, GlassDefs, GlowFilter, LinearGradient, RadialGradient, pinPath, r1, ref, seeded } from "./svg-kit";

// Reusable pieces for the big scenes. Every part draws in its own local coordinates and is
// placed with `transform`. All gradients/filters come from <ArtDefs>, included once per scene.

type Ids = (name: string) => string;

/** Gradients, filters and patterns shared by the scene parts. */
export function ArtDefs({ id }: { id: Ids }) {
  return (
    <>
      <GlassDefs id={id} />
      <GlowFilter id={id("glow")} blur={4} />
      <GlowFilter id={id("glow-lg")} blur={10} strength={1.3} />
      <BlurFilter id={id("blur")} blur={8} />
      <BlurFilter id={id("blur-lg")} blur={22} />
      <VehicleDefs id={id} />
      <LinearGradient
        id={id("pin")}
        x1={0}
        y1={0}
        x2={0.4}
        y2={1}
        stops={[
          [0, neon.cyanSoft, 1],
          [1, neon.blue, 1],
        ]}
      />
      <LinearGradient
        id={id("pin-violet")}
        x1={0}
        y1={0}
        x2={0.4}
        y2={1}
        stops={[
          [0, "#d7ccff", 1],
          [1, neon.violet, 1],
        ]}
      />
      <LinearGradient
        id={id("chip")}
        stops={[
          [0, neon.cyan, 1],
          [1, neon.violet, 1],
        ]}
      />
      <LinearGradient
        id={id("holo-cone")}
        x1={0}
        y1={1}
        x2={0}
        y2={0}
        stops={[
          [0, neon.cyan, 0.42],
          [1, neon.cyan, 0],
        ]}
      />
      <pattern id={id("windows")} width={12} height={16} patternUnits="userSpaceOnUse">
        <rect x={3} y={4} width={3} height={5} fill={neon.cyanSoft} opacity={0.75} />
        <rect x={8} y={11} width={2} height={3} fill={neon.violetSoft} opacity={0.5} />
      </pattern>
      <pattern id={id("windows-b")} width={9} height={13} patternUnits="userSpaceOnUse">
        <rect x={2} y={3} width={2} height={4} fill={neon.violetSoft} opacity={0.7} />
        <rect x={6} y={8} width={2} height={3} fill={ink.ice} opacity={0.35} />
      </pattern>
    </>
  );
}


/** Gradients used by Car, Van, Wheel, light pools and beams (also part of ArtDefs). */
export function VehicleDefs({ id }: { id: Ids }) {
  return (
    <>
      <LinearGradient
        id={id("car-body")}
        x1={0}
        y1={0}
        x2={0}
        y2={1}
        stops={[
          [0, "#3b51ad", 1],
          [0.45, "#1c2a6c", 1],
          [1, "#0a1131", 1],
        ]}
      />
      <LinearGradient
        id={id("car-glass")}
        x1={0}
        y1={0}
        x2={1}
        y2={1}
        stops={[
          [0, "#a5e9ff", 0.95],
          [0.35, "#4a63c9", 0.75],
          [1, "#0b1235", 0.95],
        ]}
      />
      <RadialGradient
        id={id("rim")}
        cx={0.4}
        cy={0.35}
        r={0.7}
        stops={[
          [0, "#e8f7ff", 1],
          [0.45, "#6f83d6", 1],
          [1, "#141d4f", 1],
        ]}
      />
      <LinearGradient
        id={id("van-body")}
        x1={0}
        y1={0}
        x2={0}
        y2={1}
        stops={[
          [0, "#c9d6ff", 1],
          [0.5, "#8797d6", 1],
          [1, "#3a4790", 1],
        ]}
      />
      <LinearGradient
        id={id("neon-line")}
        stops={[
          [0, neon.cyan, 0],
          [0.2, neon.cyanSoft, 1],
          [0.8, neon.violetSoft, 1],
          [1, neon.violet, 0],
        ]}
      />
      <LinearGradient
        id={id("beam-left")}
        x1={1}
        y1={0}
        x2={0}
        y2={0}
        stops={[
          [0, ink.ice, 0.55],
          [0.35, neon.cyanSoft, 0.18],
          [1, neon.cyan, 0],
        ]}
      />
      <LinearGradient
        id={id("beam-right")}
        stops={[
          [0, ink.ice, 0.5],
          [0.35, neon.cyanSoft, 0.16],
          [1, neon.cyan, 0],
        ]}
      />
      <RadialGradient
        id={id("pool-cyan")}
        stops={[
          [0, neon.cyan, 0.55],
          [0.5, neon.cyan, 0.16],
          [1, neon.cyan, 0],
        ]}
      />
      <RadialGradient
        id={id("pool-violet")}
        stops={[
          [0, neon.violet, 0.55],
          [0.5, neon.violet, 0.16],
          [1, neon.violet, 0],
        ]}
      />
    </>
  );
}

// ── Vehicles ─────────────────────────────────────────────────────────────────────

function Wheel({ id, cx, cy, r }: { id: Ids; cx: number; cy: number; r: number }) {
  const spokes = [0, 72, 144, 216, 288];
  const rim = r * 0.66;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#04060e" />
      <circle cx={cx} cy={cy} r={r - 1.5} fill="none" stroke="#2b3b80" strokeWidth={2.5} />
      <circle cx={cx} cy={cy} r={rim} fill={ref(id("rim"))} />
      {spokes.map((angle) => {
        const a = (angle * Math.PI) / 180;
        return (
          <path
            key={angle}
            d={`M${r1(cx + Math.cos(a) * rim * 0.25)} ${r1(cy + Math.sin(a) * rim * 0.25)}L${r1(cx + Math.cos(a + 0.35) * rim * 0.92)} ${r1(cy + Math.sin(a + 0.35) * rim * 0.92)}`}
            stroke="#0b1235"
            strokeWidth={r * 0.11}
            strokeLinecap="round"
          />
        );
      })}
      <circle cx={cx} cy={cy} r={rim + 2} fill="none" stroke={neon.cyan} strokeWidth={2.4} filter={ref(id("glow"))} />
      <circle cx={cx} cy={cy} r={r * 0.16} fill={ink.navy} stroke={neon.cyanSoft} strokeWidth={1.6} />
    </g>
  );
}

/**
 * Sleek electric coupe, facing left. Local box ≈ 0..500 × 0..160 (ground at y 160).
 * `beam` draws the headlight cone; `glow` the neon underglow.
 */
const CAR_BODY =
  "M14 128C5 121 3 108 9 99L24 90C80 78 132 70 182 66C222 44 264 28 314 26C364 24 406 32 438 50C462 63 484 75 496 84C503 90 505 104 502 114L498 128L442.3 128A56 56 0 1 0 337.7 128L142.3 128A56 56 0 1 0 37.7 128Z";

function CarShape({ id, beam, glow }: { id: Ids; beam: boolean; glow: boolean }) {
  return (
    <>
      {glow ? <ellipse cx={252} cy={156} rx={262} ry={22} fill={ref(id("pool-cyan"))} /> : null}
      {beam ? <path d="M10 92L-320 26L-320 176L12 102Z" fill={ref(id("beam-left"))} /> : null}
      <path d={CAR_BODY} fill={ref(id("car-body"))} />
      <path d="M190 66C222 46 262 33 310 31C356 30 394 38 424 54C436 61 446 67 452 72L196 72Z" fill={ref(id("car-glass"))} />
      <path d="M214 60C244 44 276 37 310 36" stroke={ink.white} strokeOpacity={0.6} strokeWidth={3} fill="none" strokeLinecap="round" />
      <path d="M340 38C372 40 398 48 418 58" stroke={ink.white} strokeOpacity={0.25} strokeWidth={2} fill="none" strokeLinecap="round" />
      <path d="M30 88C120 74 300 70 494 82" stroke="#a9c1ff" strokeOpacity={0.5} strokeWidth={2} fill="none" />
      <path d="M150 112C250 102 350 102 440 106" stroke="#7d93e6" strokeOpacity={0.35} strokeWidth={2} fill="none" />
      <path d="M142 124H338" stroke="#050a20" strokeOpacity={0.7} strokeWidth={6} />
      <path d="M24 99C140 90 330 89 497 96" stroke={ref(id("neon-line"))} strokeWidth={3} fill="none" filter={ref(id("glow"))} />
      <path d="M6 94L52 88L53 94L8 100Z" fill={ink.ice} filter={ref(id("glow"))} />
      <path d="M490 86L504 90L503 104L494 103Z" fill={neon.magenta} filter={ref(id("glow"))} />
      <Wheel id={id} cx={90} cy={108} r={50} />
      <Wheel id={id} cx={390} cy={108} r={50} />
    </>
  );
}

/**
 * Sleek electric coupe with a continuous glass canopy, facing left. Local box ≈ 0..505 ×
 * 0..160 (ground at y 158). `beam`: headlight cone; `glow`: neon underglow; `reflection`:
 * faded mirror image on a glossy floor.
 */
export function Car({
  id,
  x,
  y,
  scale = 1,
  beam = true,
  glow = true,
  reflection = false,
}: {
  id: Ids;
  x: number;
  y: number;
  scale?: number;
  beam?: boolean;
  glow?: boolean;
  reflection?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {reflection ? (
        <g transform="translate(0 316) scale(1 -1)" opacity={0.16}>
          <CarShape id={id} beam={false} glow={false} />
        </g>
      ) : null}
      <CarShape id={id} beam={beam} glow={glow} />
    </g>
  );
}

/** Mobile-mechanic van, facing right. Local box ≈ 0..356 × 0..160 (ground at y 156). */
export function Van({ id, x, y, scale = 1, beam = true }: { id: Ids; x: number; y: number; scale?: number; beam?: boolean }) {
  const body =
    "M6 136L6 26C6 14 14 8 26 8L236 8C250 8 258 12 266 22L306 70C316 74 340 80 348 90C354 98 354 120 352 136L314.5 136A38 38 0 1 0 245.5 136L112.5 136A38 38 0 1 0 43.5 136Z";
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cx={180} cy={154} rx={190} ry={16} fill={ref(id("pool-violet"))} />
      {beam ? <path d="M346 94L620 50L620 160L346 104Z" fill={ref(id("beam-right"))} /> : null}
      <path d={body} fill={ref(id("van-body"))} />
      <path d="M244 22L262 24L298 68L244 68Z" fill={ref(id("car-glass"))} />
      <path d="M6 84H306" stroke={ref(id("neon-line"))} strokeWidth={7} filter={ref(id("glow"))} />
      <path d="M6 96H300" stroke="#2c3780" strokeWidth={3} />
      <path d="M204 12V132M60 12V132" stroke="#3a4790" strokeOpacity={0.6} strokeWidth={2} />
      <circle cx={132} cy={50} r={24} fill="#141d4f" stroke={neon.cyan} strokeWidth={2.5} />
      <g transform="rotate(-45 132 50)">
        <rect x={116} y={47.5} width={20} height={5} rx={2.5} fill={neon.cyanSoft} />
        <circle cx={139} cy={50} r={7} fill={neon.cyanSoft} />
        <rect x={139} y={47.6} width={8} height={4.8} fill="#141d4f" />
      </g>
      <rect x={196} y={-2} width={56} height={10} rx={4} fill={neon.cyanSoft} filter={ref(id("glow"))} />
      <path d="M342 92L352 94L352 106L338 104Z" fill={ink.ice} filter={ref(id("glow"))} />
      <rect x={4} y={36} width={6} height={30} rx={2} fill={neon.magenta} filter={ref(id("glow"))} />
      <Wheel id={id} cx={78} cy={120} r={34} />
      <Wheel id={id} cx={280} cy={120} r={34} />
    </g>
  );
}

// ── Map elements ─────────────────────────────────────────────────────────────────

/** Map pin standing on a ground plane, with a light pool and an optional pulse ring. */
export function GroundPin({
  id,
  x,
  y,
  size = 18,
  tone = "cyan",
  pulse = true,
  animated = true,
  late = false,
  children,
}: {
  id: Ids;
  x: number;
  y: number;
  size?: number;
  tone?: "cyan" | "violet";
  pulse?: boolean;
  animated?: boolean;
  late?: boolean;
  children?: ReactNode;
}) {
  const head = y - size * 2.25;
  return (
    <g>
      <ellipse cx={x} cy={y} rx={size * 2.6} ry={size * 0.75} fill={ref(id(tone === "cyan" ? "pool-cyan" : "pool-violet"))} />
      {pulse ? <PinPulse x={x} y={y} size={size} tone={tone} animated={animated} late={late} /> : null}
      <g filter={ref(id("glow"))}>
        <path d={pinPath(x, head, size)} fill={ref(id(tone === "cyan" ? "pin" : "pin-violet"))} />
      </g>
      <circle cx={x} cy={head} r={size * 0.42} fill={ink.deep} />
      {children}
    </g>
  );
}

/** Perspective grid on the ground plane (holographic map floor). */
export function PerspectiveGrid({
  id,
  horizon,
  bottom,
  vanishX,
  left,
  right,
  spacing = 120,
  depths = 12,
  stroke = neon.cyan,
}: {
  id: Ids;
  horizon: number;
  bottom: number;
  vanishX: number;
  left: number;
  right: number;
  spacing?: number;
  depths?: number;
  stroke?: string;
}) {
  const fadeId = id(`grid-fade-${horizon}-${bottom}`);
  const verticals: string[] = [];
  for (let xb = left - (right - left); xb <= right + (right - left); xb += spacing) {
    verticals.push(`M${vanishX} ${horizon}L${r1(xb)} ${bottom}`);
  }
  const horizontals: string[] = [];
  const height = bottom - horizon;
  for (let d = 1; d <= depths; d += 1) {
    const yy = horizon + height / (1 + (d - 1) * 0.55);
    horizontals.push(`M${left} ${r1(yy)}H${right}`);
  }
  return (
    <g>
      <LinearGradient
        id={fadeId}
        units="userSpaceOnUse"
        x1={0}
        y1={horizon}
        x2={0}
        y2={bottom}
        stopClassName="wmi-grid-stop"
        stops={[
          [0, stroke, 0],
          [0.25, stroke, 0.14],
          [1, stroke, 0.42],
        ]}
      />
      <path d={verticals.join("")} stroke={ref(fadeId)} strokeWidth={1.2} fill="none" />
      <path d={horizontals.join("")} stroke={ref(fadeId)} strokeWidth={1.2} fill="none" />
    </g>
  );
}

/** Deterministic star field. */
export function Stars({ count, width, height, seed, top = 0, animated = true }: { count: number; width: number; height: number; seed: number; top?: number; animated?: boolean }) {
  const rand = seeded(seed);
  const stars = Array.from({ length: count }, (_, index) => ({
    x: r1(rand() * width),
    y: r1(top + rand() * height),
    r: r1(0.6 + rand() * 1.6),
    o: r1(0.35 + rand() * 0.6),
    t: index % 12 === 0,
  }));
  return (
    <g>
      {stars.map((star, index) => (
        <circle
          key={index}
          cx={star.x}
          cy={star.y}
          r={star.r}
          fill={index % 4 === 0 ? neon.cyanSoft : index % 7 === 0 ? neon.violetSoft : ink.ice}
          opacity={star.o}
          className={animated && star.t ? (index % 2 ? s.twinkle : s.twinkleLate) : undefined}
        />
      ))}
    </g>
  );
}

/** A row of buildings for a skyline layer. */
export function Skyline({
  id,
  seed,
  from,
  to,
  base,
  minH,
  maxH,
  minW,
  maxW,
  fill,
  windows,
  windowOpacity = 0.35,
  rim,
  heightAt,
}: {
  id: Ids;
  seed: number;
  from: number;
  to: number;
  base: number;
  minH: number;
  maxH: number;
  minW: number;
  maxW: number;
  fill: string;
  windows: "windows" | "windows-b";
  windowOpacity?: number;
  rim?: string;
  /** Height multiplier by x (keeps parts of the skyline low). */
  heightAt?: (x: number) => number;
}) {
  const rand = seeded(seed);
  const buildings: Array<{ x: number; w: number; h: number; antenna: boolean; lit: number }> = [];
  let cursor = from;
  while (cursor < to) {
    const w = Math.round(minW + rand() * (maxW - minW));
    const factor = heightAt ? heightAt(cursor + w / 2) : 1;
    const h = Math.round((minH + rand() * (maxH - minH)) * factor);
    buildings.push({ x: cursor, w, h, antenna: rand() > 0.72, lit: r1(windowOpacity * (0.5 + rand())) });
    cursor += w + Math.round(rand() * 6);
  }
  return (
    <g>
      {buildings.map((b) => (
        <g key={b.x}>
          <rect x={b.x} y={base - b.h} width={b.w} height={b.h + 4} fill={fill} />
          <rect x={b.x + 4} y={base - b.h + 8} width={Math.max(0, b.w - 8)} height={Math.max(0, b.h - 12)} fill={ref(id(windows))} opacity={b.lit} />
          {rim ? <rect x={b.x + b.w - 2} y={base - b.h} width={2} height={b.h} fill={rim} opacity={0.5} /> : null}
          {b.antenna ? (
            <>
              <rect x={b.x + b.w / 2 - 1} y={base - b.h - 18} width={2} height={18} fill={fill} />
              <circle cx={b.x + b.w / 2} cy={base - b.h - 19} r={2.2} fill={neon.cyanSoft} />
            </>
          ) : null}
        </g>
      ))}
    </g>
  );
}

// ── Holographic UI cards ─────────────────────────────────────────────────────────

/** Glass panel with luminous edge, top sheen, HUD corner brackets and a soft shadow. */
export function GlassPanel({ id, x, y, w, h, r = 22, brackets = true }: { id: Ids; x: number; y: number; w: number; h: number; r?: number; brackets?: boolean }) {
  const b = 16;
  return (
    <g>
      <rect x={x + 10} y={y + 24} width={w - 20} height={h} rx={r} fill="#01030a" opacity={0.6} filter={ref(id("blur"))} />
      <rect x={x} y={y} width={w} height={h} rx={r} fill={ref(id("glass"))} />
      <rect x={x} y={y} width={w} height={h} rx={r} fill={ref(id("sheen"))} />
      <rect x={x + 0.75} y={y + 0.75} width={w - 1.5} height={h - 1.5} rx={r - 0.75} fill="none" stroke={ref(id("edge"))} strokeWidth={1.5} />
      {brackets ? (
        <path
          d={`M${x - 6} ${y + b}V${y - 6}H${x + b}M${x + w - b} ${y - 6}H${x + w + 6}V${y + b}M${x + w + 6} ${y + h - b}V${y + h + 6}H${x + w - b}M${x + b} ${y + h + 6}H${x - 6}V${y + h - b}`}
          stroke={neon.cyanSoft}
          strokeOpacity={0.55}
          strokeWidth={2}
          fill="none"
        />
      ) : null}
    </g>
  );
}

/** Itemized example quote card (static example values, labelled "Example"). */
export function QuoteCard({ id, x, y, scale = 1, highlight = false }: { id: Ids; x: number; y: number; scale?: number; highlight?: boolean }) {
  const lines: ReadonlyArray<readonly [string, string]> = [
    ["Labor · 0.5 h", "$60.00"],
    ["Group 51R battery", "$159.00"],
    ["Tax on parts", "$13.12"],
  ];
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {highlight ? <rect x={-14} y={-14} width={408} height={338} rx={34} fill="none" stroke={neon.cyan} strokeWidth={3} filter={ref(id("glow-lg"))} opacity={0.9} /> : null}
      <GlassPanel id={id} x={0} y={0} w={380} h={310} />
      <text x={30} y={46} fontSize={15} letterSpacing={3} fill={neon.cyanSoft} style={{ fontFamily: artFont.mono }}>
        EXAMPLE QUOTE
      </text>
      <rect x={282} y={26} width={72} height={28} rx={14} fill={neon.cyan} fillOpacity={0.14} stroke={neon.cyan} strokeOpacity={0.6} />
      <text x={318} y={45} fontSize={14} fontWeight={600} textAnchor="middle" fill={neon.cyanSoft}>
        48 h
      </text>
      <text x={30} y={86} fontSize={27} fontWeight={650} fill={ink.white}>
        Battery replacement
      </text>
      <text x={30} y={114} fontSize={16} fill={ink.mist}>
        2016 Honda Civic · Mobile service
      </text>
      <path d="M30 134H350" stroke={ink.ice} strokeOpacity={0.14} strokeWidth={1.5} />
      {lines.map(([label, price], index) => (
        <g key={label}>
          <text x={30} y={166 + index * 34} fontSize={17} fill="#c3cdf0">
            {label}
          </text>
          <text x={350} y={166 + index * 34} fontSize={17} textAnchor="end" fill={ink.white} style={{ fontFamily: artFont.mono }}>
            {price}
          </text>
        </g>
      ))}
      <path d="M30 252H350" stroke={ink.ice} strokeOpacity={0.14} strokeWidth={1.5} strokeDasharray="4 6" />
      <text x={30} y={288} fontSize={21} fontWeight={650} fill={ink.white}>
        Total
      </text>
      <text x={350} y={289} fontSize={26} fontWeight={700} textAnchor="end" fill={neon.cyanSoft} style={{ fontFamily: artFont.mono }} filter={ref(id("glow"))}>
        $232.12
      </text>
    </g>
  );
}

/** "Approved mechanic" badge with a shield check and a "New" rating chip. */
export function MechanicBadge({ id, x, y, scale = 1, distance = "about 6 mi" }: { id: Ids; x: number; y: number; scale?: number; distance?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <GlassPanel id={id} x={0} y={0} w={370} h={120} r={24} />
      <circle cx={62} cy={60} r={34} fill={ink.steel} stroke={ref(id("chip"))} strokeWidth={3} />
      <circle cx={62} cy={50} r={11} fill="#b9c6f2" />
      <path d="M41 80C44 68 52 63 62 63C72 63 80 68 83 80" fill="#b9c6f2" />
      <g transform="translate(82 74)" filter={ref(id("glow"))}>
        <path d="M0 -14L12 -9V0C12 8 6 13 0 16C-6 13 -12 8 -12 0V-9Z" fill={neon.cyan} />
        <path d="M-5 1L-1 5L6 -3" stroke={ink.deep} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <text x={116} y={52} fontSize={23} fontWeight={650} fill={ink.white}>
        Approved mechanic
      </text>
      <rect x={116} y={68} width={58} height={28} rx={14} fill={neon.violet} fillOpacity={0.2} stroke={neon.violetSoft} strokeOpacity={0.8} />
      <text x={145} y={88} fontSize={15} fontWeight={650} textAnchor="middle" fill="#e4dcff">
        New
      </text>
      <text x={188} y={88} fontSize={16} fill={ink.mist}>
        Mobile · {distance}
      </text>
    </g>
  );
}

/** Time-slot chip. */
export function SlotChip({ id, x, y, scale = 1, label = "Thu · 9:00 AM", meta = "45 min" }: { id: Ids; x: number; y: number; scale?: number; label?: string; meta?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <GlassPanel id={id} x={0} y={0} w={290} h={72} r={36} brackets={false} />
      <circle cx={38} cy={36} r={22} fill={ref(id("chip"))} />
      <rect x={28} y={27} width={20} height={18} rx={3} fill="none" stroke={ink.deep} strokeWidth={2.6} />
      <path d="M28 33H48M33 24V29M43 24V29" stroke={ink.deep} strokeWidth={2.6} strokeLinecap="round" />
      <text x={74} y={44} fontSize={21} fontWeight={650} fill={ink.white}>
        {label}
      </text>
      <text x={268} y={44} fontSize={16} textAnchor="end" fill={ink.mist}>
        {meta}
      </text>
    </g>
  );
}

/** Thin holographic leader line with end dots. */
export function Leader({ d, color = neon.cyanSoft, animated = true }: { d: string; color?: string; animated?: boolean }) {
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeOpacity={0.55}
      strokeWidth={1.6}
      strokeDasharray="3 7"
      strokeLinecap="round"
      className={animated ? s.dashSlow : undefined}
    />
  );
}

/** Glowing route line: soft halo (wide translucent strokes, no filter) + bright core. */
export function RouteBase({ d, color = neon.cyan }: { d: string; color?: string }) {
  return (
    <g fill="none" strokeLinecap="round">
      <path d={d} stroke={color} strokeOpacity={0.1} strokeWidth={18} />
      <path d={d} stroke={color} strokeOpacity={0.22} strokeWidth={8} />
      <path d={d} stroke={color} strokeOpacity={0.95} strokeWidth={3} />
    </g>
  );
}

/** Light pulses travelling along a route (animated; keep it in a filter-free layer). */
export function RouteFlow({ d, animated = true }: { d: string; animated?: boolean }) {
  return (
    <path
      d={d}
      fill="none"
      stroke={ink.white}
      strokeWidth={3}
      strokeLinecap="round"
      strokeDasharray="10 38"
      className={animated ? s.dash : undefined}
      opacity={animated ? 1 : 0.85}
    />
  );
}

/** Route = base + flow (for single-layer art). */
export function Route({ d, animated = true, color = neon.cyan }: { d: string; animated?: boolean; color?: string }) {
  return (
    <g>
      <RouteBase d={d} color={color} />
      <RouteFlow d={d} animated={animated} />
    </g>
  );
}

/** Expanding ring on the ground under a pin (animated; filter-free). */
export function PinPulse({ x, y, size = 18, tone = "cyan", animated = true, late = false }: { x: number; y: number; size?: number; tone?: "cyan" | "violet"; animated?: boolean; late?: boolean }) {
  if (!animated) return null;
  return (
    <ellipse
      cx={x}
      cy={y}
      rx={size * 1.8}
      ry={size * 0.52}
      fill="none"
      stroke={tone === "cyan" ? neon.cyan : neon.violet}
      strokeWidth={2}
      className={late ? s.pulseLate : s.pulse}
    />
  );
}

// ── Glyphs and figures ───────────────────────────────────────────────────────────

/** Check-engine warning symbol, ≈ 64 × 40 at scale 1, centred on (cx, cy). */
export function EngineGlyph({ cx, cy, scale = 1, color = neon.amber }: { cx: number; cy: number; scale?: number; color?: string }) {
  return (
    <g transform={`translate(${cx} ${cy}) scale(${scale}) translate(-32 -20)`} fill="none" stroke={color} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round">
      <path d="M8 14H14V9H22V5H36V9H42L48 15H54V11H60V31H54V27H48L42 35H20L14 29H8Z" />
      <path d="M2 16V28M2 22H8" />
      <path d="M22 5H36" />
    </g>
  );
}

/** Shield with a check mark (glass fill, luminous edge). Width ≈ 2r, height ≈ 2.4r. */
export function ShieldBadge({ id, cx, cy, r, tone = "cyan" }: { id: Ids; cx: number; cy: number; r: number; tone?: "cyan" | "emerald" }) {
  const top = cy - r * 1.15;
  const d = `M${cx} ${top}L${cx + r} ${top + r * 0.38}V${cy + r * 0.05}C${cx + r} ${cy + r * 0.75} ${cx + r * 0.55} ${cy + r * 1.05} ${cx} ${cy + r * 1.28}C${cx - r * 0.55} ${cy + r * 1.05} ${cx - r} ${cy + r * 0.75} ${cx - r} ${cy + r * 0.05}V${top + r * 0.38}Z`;
  const accent = tone === "cyan" ? neon.cyan : neon.green;
  return (
    <g>
      <path d={d} fill={ink.void} opacity={0.5} transform={`translate(0 ${r * 0.18})`} filter={ref(id("blur"))} />
      <path d={d} fill={ref(id("glass"))} />
      <path d={d} fill={ref(id("sheen"))} />
      <path d={d} fill="none" stroke={ref(id("edge"))} strokeWidth={Math.max(1.5, r * 0.04)} />
      <g filter={ref(id("glow"))}>
        <path
          d={`M${cx - r * 0.42} ${cy + r * 0.05}L${cx - r * 0.1} ${cy + r * 0.37}L${cx + r * 0.46} ${cy - r * 0.27}`}
          fill="none"
          stroke={accent}
          strokeWidth={r * 0.16}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </g>
  );
}

/**
 * Stylised mechanic (faceless, cap and coveralls with a reflective stripe), facing right,
 * holding a glowing tablet. Local box ≈ 0..150 × 0..262 (feet at y 262).
 */
export function MechanicFigure({ id, x, y, scale = 1, tablet = true }: { id: Ids; x: number; y: number; scale?: number; tablet?: boolean }) {
  // Stylised technician in a 3/4 view facing right: tapered legs with knee pads, a fitted
  // jumpsuit with a reflective band, AR visor, cap, a wrench in the back hand and a tablet
  // projecting a small hologram in the front hand. Cyan rim light on the right, violet on the left.
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cx={68} cy={259} rx={62} ry={9} fill={ref(id("pool-cyan"))} />
      {/* back arm (behind the body) with a wrench */}
      <path d="M45 63C36 77 29 92 27 104C26 113 27 121 29.5 127" stroke="#1d2868" strokeWidth={12} strokeLinecap="round" fill="none" />
      <path d="M33 70C28 82 24.5 94 23.5 104" stroke={neon.violetSoft} strokeOpacity={0.4} strokeWidth={1.4} strokeLinecap="round" fill="none" />
      <path d="M30 134L27 166" stroke="#9fb0e8" strokeWidth={4} strokeLinecap="round" />
      <path d="M30.5 136L28 162" stroke={ink.ice} strokeOpacity={0.7} strokeWidth={1.2} strokeLinecap="round" />
      <path d="M22 171A7 7 0 1 1 33.5 172" stroke="#9fb0e8" strokeWidth={3.6} strokeLinecap="round" fill="none" />
      <circle cx={29.5} cy={130} r={6} fill="#0d1438" />
      {/* legs */}
      <path d="M45 138C44 166 45 190 47 206C48 222 48 236 47 246H61C62 234 63 220 63 206C64 188 65 164 66 138Z" fill="#121a48" />
      <path d="M63 138C65 166 71 190 75 206C78 222 81 236 82 246H97C96 232 94 218 92 204C89 184 87 162 87 138Z" fill="#1a2560" />
      <path d="M87.5 141C88.5 166 90 186 92.5 204C94.5 218 96 232 97 245" stroke={neon.cyan} strokeOpacity={0.55} strokeWidth={1.6} fill="none" />
      <path d="M45.5 141C44.5 166 45.5 190 47.5 206" stroke={neon.violetSoft} strokeOpacity={0.35} strokeWidth={1.4} fill="none" />
      <ellipse cx={54} cy={205} rx={7.5} ry={10} fill="#0d1438" />
      <rect x={77} y={195} width={17} height={20} rx={6} fill="#26336e" stroke={neon.cyanSoft} strokeOpacity={0.55} strokeWidth={1.2} />
      {/* boots */}
      <path d="M43 243H62C65 243 67 246 67 250V255C67 257.5 65 259 62.5 259H38C35 259 33.5 256 35.5 253.5C38 250 41 246 43 243Z" fill="#0a0f2c" />
      <path d="M79 243H97C102 243 107 247 111 251.5C113.5 254.5 111.5 259 107.5 259H79C77 259 75.5 257.5 75.5 255.5V246.5C75.5 244.5 77 243 79 243Z" fill="#0a0f2c" />
      <path d="M78 258H109M37 258H66" stroke={neon.cyanSoft} strokeOpacity={0.45} strokeWidth={1.4} strokeLinecap="round" />
      {/* jumpsuit */}
      <path d="M40 66C40 58 47 52 56 51H70C80 52 87 58 88 66L92 132C92 138 89 142 84 142H42C37 142 34 138 34 133Z" fill={ref(id("car-body"))} />
      <path d="M54 51L61 63L68 51Z" fill="#0b1235" />
      <path d="M61 63V132" stroke="#0a1131" strokeOpacity={0.7} strokeWidth={1.5} />
      <path d="M36 90H90L90.5 98H35.5Z" fill={neon.cyanSoft} opacity={0.88} />
      <path d="M36 101H90.6L90.7 103.5H35.8Z" fill={neon.cyanSoft} opacity={0.4} />
      <rect x={68} y={70} width={13} height={9} rx={2.5} fill={neon.cyan} opacity={0.85} />
      <path d="M70.5 74.5H78.5" stroke={ink.deep} strokeWidth={1.4} strokeLinecap="round" />
      <rect x={35} y={127} width={57} height={8} rx={2.5} fill="#0a0f2c" />
      <rect x={57} y={127} width={9} height={8} rx={1.5} fill={neon.amber} opacity={0.92} />
      <rect x={83} y={128} width={13} height={17} rx={3.5} fill="#141d4f" stroke="#33448a" strokeWidth={1.2} />
      <path d="M88 66C90 86 91 108 92 131" stroke={neon.cyan} strokeOpacity={0.75} strokeWidth={2} fill="none" />
      <path d="M40 67C38.5 88 36.5 110 34.5 131" stroke={neon.violetSoft} strokeOpacity={0.4} strokeWidth={1.5} fill="none" />
      {/* front arm holding the tablet */}
      <path d="M80 62C88 74 95 86 100 97C108 96 116 92 122 88" stroke="#2c3b8c" strokeWidth={13} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M85 60C92 71 98 82 103 93" stroke={neon.cyanSoft} strokeOpacity={0.5} strokeWidth={1.5} strokeLinecap="round" fill="none" />
      {/* head */}
      <rect x={55} y={41} width={13} height={13} rx={3} fill="#b9c4ec" />
      <circle cx={62} cy={31} r={18} fill="#cdd6f6" />
      <path d="M44 31C44 22 50 15 58 13L56.5 31C55 36 51 40 46.5 40.5C44.8 37.5 44 34.5 44 31Z" fill="#1a2150" />
      <ellipse cx={55} cy={33.5} rx={3.2} ry={4.2} fill="#b3bfe8" />
      <path d="M79.5 35A18 18 0 0 1 63 49" stroke={neon.cyan} strokeOpacity={0.75} strokeWidth={2} fill="none" />
      <path d="M60 27H79.5C81 27 82 28.2 82 29.7V31.4C82 33.4 80.4 35 78.4 35H63.4C61.5 35 60 33.5 60 31.6Z" fill={neon.cyan} opacity={0.88} />
      <path d="M63.5 29.3H78" stroke={ink.ice} strokeOpacity={0.85} strokeWidth={1.2} strokeLinecap="round" />
      <path d="M43 25C43 13 53 7 63 7C73 7 81 13 81 23V25Z" fill={neon.violet} />
      <path d="M50 14C55 10 62 9 68 10" stroke={neon.violetSoft} strokeOpacity={0.75} strokeWidth={2} strokeLinecap="round" fill="none" />
      <path d="M78 22H98C100.6 22 101.6 24.6 100 26.6C99 27.6 98 28 96.6 28H78Z" fill="#6d4fe0" />
      <circle cx={74} cy={16.5} r={2} fill={neon.cyanSoft} />
      {tablet ? (
        <g>
          <path d="M117 60L151 54L168 16L100 22Z" fill={ref(id("holo-cone"))} />
          <g opacity={0.85}>
            <rect x={110} y={24} width={44} height={6} rx={3} fill={neon.cyanSoft} opacity={0.75} />
            <rect x={113} y={35} width={32} height={4} rx={2} fill={neon.cyanSoft} opacity={0.5} />
            <circle cx={150} cy={37} r={3} fill={neon.green} />
          </g>
          <g transform="rotate(-12 132 86)">
            <rect x={114} y={60} width={38} height={52} rx={6} fill="#0a0f2c" stroke={neon.cyanSoft} strokeWidth={2} />
            <rect x={119} y={66} width={28} height={36} rx={3} fill={neon.cyan} opacity={0.35} />
            <path d="M124 78H142M124 86H138M124 94H134" stroke={ink.ice} strokeWidth={2.4} strokeLinecap="round" />
          </g>
          <circle cx={123.5} cy={89} r={6.5} fill="#0d1438" />
        </g>
      ) : (
        <circle cx={123.5} cy={89} r={6.5} fill="#0d1438" />
      )}
    </g>
  );
}
