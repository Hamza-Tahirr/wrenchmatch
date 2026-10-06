"use client";

import type { ReactNode } from "react";

import { ambient as s } from "./ambient";
import { RenderScene, type SceneDefinition, type SceneLayer, type SceneProps } from "./layered-scene";
import { artFont, ink, neon } from "./palette";
import {
  ArtDefs,
  Car,
  EngineGlyph,
  GlassPanel,
  GroundPin,
  Leader,
  MechanicFigure,
  PerspectiveGrid,
  PinPulse,
  RouteBase,
  RouteFlow,
  ShieldBadge,
  Stars,
} from "./parts";
import { LinearGradient, RadialGradient, ref, seeded, useSvgIds, r1, pinPath } from "./svg-kit";

// Four "How it works" scenes (viewBox 1000 x 800, 5:4) for the StickyScrollStory.
// Each scene has a backdrop, mid and foreground layers that drift at different depths.

type Ids = (name: string) => string;
const W = 1000;
const H = 800;

function Backdrop({ id, glowA, glowB, floor = true, seed }: { id: Ids; glowA: string; glowB: string; floor?: boolean; seed: number }) {
  return (
    <g>
      <rect x={-120} y={-120} width={W + 240} height={H + 240} fill={ref(id("stage"))} />
      <ellipse cx={420} cy={300} rx={520} ry={360} fill={ref(id(glowA))} />
      <ellipse cx={760} cy={560} rx={420} ry={300} fill={ref(id(glowB))} />
      <Stars count={36} width={W} height={420} seed={seed} />
      {floor ? <PerspectiveGrid id={id} horizon={560} bottom={H + 60} vanishX={500} left={-200} right={1200} spacing={90} depths={9} /> : null}
    </g>
  );
}

function StageDefs({ id }: { id: Ids }) {
  return (
    <>
      <ArtDefs id={id} />
      <RadialGradient
        id={id("stage")}
        cx={0.5}
        cy={0.35}
        r={0.8}
        stops={[
          [0, "#111a4d", 1],
          [0.6, "#070b22", 1],
          [1, "#03050f", 1],
        ]}
      />
      <RadialGradient
        id={id("glow-violet")}
        stops={[
          [0, neon.violet, 0.36],
          [1, neon.violet, 0],
        ]}
      />
      <RadialGradient
        id={id("glow-cyan")}
        stops={[
          [0, neon.cyan, 0.26],
          [1, neon.cyan, 0],
        ]}
      />
      <RadialGradient
        id={id("glow-amber")}
        stops={[
          [0, neon.amber, 0.5],
          [0.4, neon.orange, 0.16],
          [1, neon.orange, 0],
        ]}
      />
      <LinearGradient
        id={id("button")}
        stops={[
          [0, neon.cyan, 1],
          [1, neon.blue, 1],
        ]}
      />
    </>
  );
}

function Sparkles({ seed, count, box, animated }: { seed: number; count: number; box: readonly [number, number, number, number]; animated: boolean }) {
  const rand = seeded(seed);
  const [bx, by, bw, bh] = box;
  return (
    <g>
      {Array.from({ length: count }, (_, index) => {
        const x = r1(bx + rand() * bw);
        const y = r1(by + rand() * bh);
        const r = r1(1.2 + rand() * 2.2);
        return (
          <circle
            key={index}
            cx={x}
            cy={y}
            r={r}
            fill={index % 3 === 0 ? neon.violetSoft : neon.cyanSoft}
            opacity={r1(0.3 + rand() * 0.5)}
            className={animated && index % 8 === 0 ? (index % 16 === 0 ? s.twinkle : s.twinkleLate) : undefined}
          />
        );
      })}
    </g>
  );
}

function FieldBox({ x, y, w, h = 42, label, children }: { x: number; y: number; w: number; h?: number; label: string; children: ReactNode }) {
  return (
    <g>
      <text x={x} y={y - 10} fontSize={12} letterSpacing={2} fill={neon.cyanSoft} style={{ fontFamily: artFont.mono }}>
        {label}
      </text>
      <rect x={x} y={y} width={w} height={h} rx={10} fill="#070c26" stroke="#33448a" strokeWidth={1.5} />
      {children}
    </g>
  );
}

// ── 1. Describe the problem ──────────────────────────────────────────────────────

function Gauge({ id, cx, cy, value }: { id: Ids; cx: number; cy: number; value: number }) {
  const r = 78;
  const start = Math.PI * 0.8;
  const sweep = Math.PI * 1.4;
  const point = (t: number, radius: number) => [r1(cx + Math.cos(start + sweep * t) * radius), r1(cy + Math.sin(start + sweep * t) * radius)] as const;
  const [sx, sy] = point(0, r);
  const [ex, ey] = point(1, r);
  const [vx, vy] = point(value, r);
  const [nx, ny] = point(value, r - 18);
  const ticks = Array.from({ length: 11 }, (_, index) => {
    const [ax, ay] = point(index / 10, r - 14);
    const [bx, by] = point(index / 10, r - 4);
    return `M${ax} ${ay}L${bx} ${by}`;
  }).join("");
  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 12} fill="#060a22" stroke="#1d2a6e" strokeWidth={2} />
      <path d={`M${sx} ${sy}A${r} ${r} 0 1 1 ${ex} ${ey}`} fill="none" stroke="#1a2560" strokeWidth={9} strokeLinecap="round" />
      <path d={`M${sx} ${sy}A${r} ${r} 0 ${value > 0.71 ? 1 : 0} 1 ${vx} ${vy}`} fill="none" stroke={neon.cyan} strokeWidth={6} strokeLinecap="round" filter={ref(id("glow"))} />
      <path d={ticks} stroke={ink.mist} strokeOpacity={0.5} strokeWidth={2} />
      <path d={`M${cx} ${cy}L${nx} ${ny}`} stroke={neon.magenta} strokeWidth={4} strokeLinecap="round" filter={ref(id("glow"))} />
      <circle cx={cx} cy={cy} r={9} fill={ink.navy2} stroke={neon.cyanSoft} strokeWidth={2} />
    </g>
  );
}

function buildDescribe(id: Ids, animated: boolean): SceneDefinition {
  const layers: SceneLayer[] = [
    {
      key: "backdrop",
      depth: 0.4,
      content: <Backdrop id={id} glowA="glow-violet" glowB="glow-amber" floor={false} seed={31} />,
    },
    {
      key: "dashboard",
      depth: 0.18,
      box: [0, 380, 1000, 420],
      content: (
        <g>
          <path d="M-60 820V610C150 545 350 520 500 520C650 520 850 545 1060 610V820Z" fill="#070b24" />
          <path d="M-60 610C150 545 350 520 500 520C650 520 850 545 1060 610" fill="none" stroke={neon.cyan} strokeOpacity={0.35} strokeWidth={2} />
          <path d="M220 640C220 488 330 410 500 410C670 410 780 488 780 640Z" fill="#0a1032" stroke={ref(id("edge"))} strokeWidth={2} />
          <Gauge id={id} cx={378} cy={548} value={0.62} />
          <Gauge id={id} cx={622} cy={548} value={0.34} />
          <ellipse cx={500} cy={606} rx={66} ry={34} fill={ref(id("glow-amber"))} />
          <g filter={ref(id("glow"))}>
            <EngineGlyph cx={500} cy={604} scale={0.72} />
          </g>
          <path d="M210 820C210 690 330 640 500 640C670 640 790 690 790 820" fill="none" stroke="#0d1543" strokeWidth={40} />
          <path d="M226 760C250 690 350 655 500 655" fill="none" stroke={neon.violetSoft} strokeOpacity={0.35} strokeWidth={3} />
        </g>
      ),
    },
    {
      key: "phone",
      depth: -0.06,
      box: [110, 170, 330, 520],
      content: (
        <g transform="rotate(-9 270 430)">
          <rect x={160} y={200} width={230} height={450} rx={36} fill={ink.void} opacity={0.6} filter={ref(id("blur"))} transform="translate(10 18)" />
          <rect x={160} y={200} width={230} height={450} rx={36} fill="#05081a" stroke={ref(id("edge"))} strokeWidth={3} />
          <rect x={171} y={211} width={208} height={428} rx={27} fill="#0b1235" />
          <rect x={244} y={220} width={62} height={14} rx={7} fill="#05081a" />
          <ellipse cx={275} cy={400} rx={110} ry={90} fill={ref(id("glow-amber"))} />
          <g filter={ref(id("glow"))}>
            <EngineGlyph cx={275} cy={400} scale={1.45} />
          </g>
          <path d="M205 330V306H229M321 306H345V330M345 470V494H321M229 494H205V470" fill="none" stroke={neon.cyanSoft} strokeWidth={3} strokeLinecap="round" />
          <text x={233} y={268} fontSize={12} fontWeight={700} letterSpacing={1.5} fill={ink.white}>
            PHOTO
          </text>
          <text x={283} y={268} fontSize={12} fontWeight={600} letterSpacing={1.5} fill={ink.mist}>
            VIDEO
          </text>
          <rect x={186} y={540} width={38} height={38} rx={8} fill="#141d4f" stroke={neon.violetSoft} strokeOpacity={0.6} />
          <circle cx={205} cy={559} r={6} fill={neon.amber} opacity={0.8} />
          <circle cx={275} cy={590} r={27} fill="none" stroke={ink.white} strokeWidth={4} />
          <circle cx={275} cy={590} r={20} fill={ref(id("button"))} />
        </g>
      ),
    },
    {
      key: "form",
      depth: -0.18,
      box: [540, 70, 440, 520],
      loopClassName: animated ? s.floatSlow : undefined,
      content: (
        <g>
          <GlassPanel id={id} x={566} y={98} w={392} h={462} />
          <text x={596} y={146} fontSize={24} fontWeight={650} fill={ink.white}>
            New repair request
          </text>
          <text x={596} y={172} fontSize={14} fill={ink.mist}>
            Vehicle, problem and photos
          </text>
          <FieldBox x={596} y={214} w={332} label="VEHICLE">
            <text x={612} y={241} fontSize={16} fill={ink.white}>
              2016 Honda Civic
            </text>
          </FieldBox>
          <FieldBox x={596} y={292} w={332} h={64} label="WHAT'S HAPPENING?">
            <text x={612} y={318} fontSize={15} fill={ink.white}>
              Check engine light came on
            </text>
            <text x={612} y={340} fontSize={15} fill={ink.white}>
              this morning. Runs rough idle.
            </text>
          </FieldBox>
          <text x={596} y={392} fontSize={12} letterSpacing={2} fill={neon.cyanSoft} style={{ fontFamily: artFont.mono }}>
            PHOTOS &amp; VIDEO
          </text>
          <rect x={596} y={404} width={64} height={52} rx={9} fill="#0b1235" stroke={neon.violetSoft} strokeOpacity={0.6} />
          <EngineGlyph cx={628} cy={430} scale={0.42} />
          <rect x={670} y={404} width={64} height={52} rx={9} fill="#0b1235" stroke={neon.violetSoft} strokeOpacity={0.6} />
          <path d="M680 446L696 428L708 438L716 430L726 446Z" fill={neon.cyanSoft} opacity={0.75} />
          <rect x={744} y={404} width={64} height={52} rx={9} fill="none" stroke={neon.cyanSoft} strokeOpacity={0.7} strokeDasharray="4 4" />
          <path d="M776 420V440M766 430H786" stroke={neon.cyanSoft} strokeWidth={2.5} strokeLinecap="round" />
          <rect x={596} y={484} width={332} height={48} rx={24} fill={ref(id("button"))} />
          <text x={762} y={514} fontSize={17} fontWeight={650} textAnchor="middle" fill={ink.deep}>
            Send request
          </text>
        </g>
      ),
    },
    {
      key: "fx",
      depth: -0.3,
      content: (
        <g>
          <Leader d="M398 330C460 300 520 260 566 250" animated={animated} />
          <Sparkles seed={8} count={16} box={[60, 60, 900, 560]} animated={animated} />
        </g>
      ),
    },
  ];
  return { width: W, height: H, defs: <StageDefs id={id} />, layers };
}

// ── 2. Approved mechanics nearby are matched ────────────────────────────────────

/** Isometric projection of map coordinates (0..600) onto the scene. */
const ISO = "matrix(0.736 0.425 -0.736 0.425 500 205)";
function iso(x: number, y: number): readonly [number, number] {
  return [r1(0.736 * x - 0.736 * y + 500), r1(0.425 * x + 0.425 * y + 205)];
}

function MapTile({ id }: { id: Ids }) {
  const lines: string[] = [];
  for (let v = 0; v <= 600; v += 50) lines.push(`M${v} 0V600M0 ${v}H600`);
  return (
    <g transform={ISO}>
      <rect x={-8} y={-8} width={616} height={616} rx={18} fill={ink.void} opacity={0.6} transform="translate(26 26)" filter={ref(id("blur"))} />
      <rect x={0} y={0} width={600} height={600} rx={16} fill="#091033" />
      <path d={lines.join("")} stroke={neon.cyan} strokeOpacity={0.12} strokeWidth={1.4} />
      <path d="M0 150H600M0 400H600M200 0V600M450 0V600" stroke={neon.cyanSoft} strokeOpacity={0.35} strokeWidth={5} />
      <path d="M0 520C120 470 200 520 300 470S500 380 600 420" stroke={neon.violet} strokeOpacity={0.45} strokeWidth={16} fill="none" />
      <rect x={60} y={40} width={110} height={80} rx={8} fill="#0f1a4f" />
      <rect x={230} y={30} width={190} height={90} rx={8} fill="#0f1a4f" />
      <rect x={480} y={180} width={90} height={190} rx={8} fill="#0f1a4f" />
      <rect x={40} y={190} width={130} height={170} rx={8} fill="#0d1745" />
      <rect x={230} y={430} width={70} height={40} rx={8} fill="#123a4a" />
      <rect x={480} y={30} width={90} height={90} rx={8} fill="#123a4a" />
      <rect x={0.75} y={0.75} width={598.5} height={598.5} rx={16} fill="none" stroke={ref(id("edge"))} strokeWidth={2.5} />
      <circle cx={300} cy={300} r={260} fill={neon.cyan} fillOpacity={0.05} stroke={neon.cyan} strokeOpacity={0.45} strokeWidth={2.5} strokeDasharray="10 10" />
      <circle cx={300} cy={300} r={170} fill="none" stroke={neon.cyan} strokeOpacity={0.3} strokeWidth={2} />
      <circle cx={300} cy={300} r={85} fill={neon.violet} fillOpacity={0.12} stroke={neon.violetSoft} strokeOpacity={0.5} strokeWidth={2} />
    </g>
  );
}

const MATCH_PINS: ReadonlyArray<readonly [number, number]> = [
  [180, 220],
  [420, 260],
  [240, 430],
];

function buildMatch(id: Ids, animated: boolean): SceneDefinition {
  const [cx, cy] = iso(300, 300);
  const outside = iso(575, 95);
  const pins = MATCH_PINS.map(([x, y]) => iso(x, y));
  const layers: SceneLayer[] = [
    {
      key: "backdrop",
      depth: 0.4,
      content: <Backdrop id={id} glowA="glow-cyan" glowB="glow-violet" floor={false} seed={47} />,
    },
    {
      key: "map",
      depth: 0.16,
      box: [40, 180, 920, 560],
      content: (
        <g>
          <MapTile id={id} />
          {pins.map(([x, y]) => (
            <RouteBase key={`${x}-${y}`} d={`M${cx} ${cy}Q${r1((cx + x) / 2)} ${r1(Math.min(cy, y) - 70)} ${x} ${y}`} color={neon.cyan} />
          ))}
        </g>
      ),
    },
    {
      key: "map-fx",
      depth: 0.16,
      box: [40, 180, 920, 560],
      content: (
        <g>
          {pins.map(([x, y]) => (
            <RouteFlow key={`${x}-${y}`} d={`M${cx} ${cy}Q${r1((cx + x) / 2)} ${r1(Math.min(cy, y) - 70)} ${x} ${y}`} animated={animated} />
          ))}
          <PinPulse x={cx} y={cy} size={30} tone="violet" animated={animated} />
          <PinPulse x={cx} y={cy} size={30} tone="violet" animated={animated} late />
        </g>
      ),
    },
    {
      key: "pins",
      depth: 0,
      box: [200, 160, 700, 420],
      content: (
        <g>
          <GroundPin id={id} x={outside[0]} y={outside[1]} size={13} tone="violet" pulse={false} />
          <path d={pinPath(outside[0], outside[1] - 13 * 2.25, 13)} fill={ink.navy2} opacity={0.6} />
          {pins.map(([x, y]) => (
            <GroundPin key={`${x}-${y}`} id={id} x={x} y={y} size={17} pulse={false}>
              <path d={`M${x - 4.5} ${y - 38}l3 3 6-6.5`} stroke={neon.cyanSoft} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </GroundPin>
          ))}
          <GroundPin id={id} x={cx} y={cy} size={26} tone="violet" pulse={false} />
          <path d={`M${cx - 11} ${cy - 56}h22l-3 -8h-16z`} fill={ink.white} opacity={0.9} />
          <circle cx={cx - 6} cy={cy - 55} r={2.6} fill={ink.white} />
          <circle cx={cx + 6} cy={cy - 55} r={2.6} fill={ink.white} />
        </g>
      ),
    },
    {
      key: "shield",
      depth: -0.2,
      box: [600, 60, 300, 330],
      loopClassName: animated ? s.float : undefined,
      content: (
        <g>
          <ShieldBadge id={id} cx={735} cy={190} r={72} />
          <rect x={672} y={300} width={128} height={34} rx={17} fill={neon.cyan} fillOpacity={0.14} stroke={neon.cyan} strokeOpacity={0.7} />
          <text x={736} y={322} fontSize={15} fontWeight={650} textAnchor="middle" fill={neon.cyanSoft}>
            Approved
          </text>
        </g>
      ),
    },
    {
      key: "chips",
      depth: -0.26,
      box: [40, 60, 400, 260],
      loopClassName: animated ? s.floatSlow : undefined,
      content: (
        <g>
          {[
            ["Covers your ZIP code", neon.cyan],
            ["Works on your make", neon.violetSoft],
            ["Offers this repair", neon.cyan],
          ].map(([label, color], index) => (
            <g key={label} transform={`translate(${70 + index * 18} ${92 + index * 64})`}>
              <GlassPanel id={id} x={0} y={0} w={300} h={48} r={24} brackets={false} />
              <circle cx={26} cy={24} r={11} fill={color} opacity={0.9} />
              <path d="M21 24l3.5 3.5 6.5-7" stroke={ink.deep} strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <text x={48} y={30} fontSize={17} fontWeight={600} fill={ink.white}>
                {label}
              </text>
            </g>
          ))}
        </g>
      ),
    },
    {
      key: "fx",
      depth: -0.3,
      content: (
        <g>
          <Leader d={`M736 340C736 380 ${pins[1][0] + 10} ${pins[1][1] - 120} ${pins[1][0]} ${pins[1][1] - 52}`} animated={animated} />
          <Sparkles seed={19} count={14} box={[40, 40, 920, 700]} animated={animated} />
        </g>
      ),
    },
  ];
  return { width: W, height: H, defs: <StageDefs id={id} />, layers };
}

// ── 3. Compare itemized quotes ───────────────────────────────────────────────────

function MiniQuote({ id, x, y, total, distance, lines, highlight = false }: { id: Ids; x: number; y: number; total: string; distance: string; lines: ReadonlyArray<readonly [string, string]>; highlight?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {highlight ? (
        <rect x={-10} y={-10} width={360} height={430} rx={32} fill="none" stroke={neon.cyan} strokeWidth={4} filter={ref(id("glow-lg"))} />
      ) : null}
      <GlassPanel id={id} x={0} y={0} w={340} h={410} r={24} brackets={highlight} />
      <text x={26} y={44} fontSize={13} letterSpacing={2.5} fill={neon.cyanSoft} style={{ fontFamily: artFont.mono }}>
        EXAMPLE QUOTE
      </text>
      <circle cx={50} cy={96} r={24} fill={ink.steel} stroke={ref(id("chip"))} strokeWidth={2.5} />
      <circle cx={50} cy={89} r={8} fill="#b9c6f2" />
      <path d="M35 110C37 101 43 98 50 98C57 98 63 101 65 110" fill="#b9c6f2" />
      <text x={86} y={92} fontSize={18} fontWeight={650} fill={ink.white}>
        Approved mechanic
      </text>
      <rect x={86} y={102} width={46} height={22} rx={11} fill={neon.violet} fillOpacity={0.22} stroke={neon.violetSoft} strokeOpacity={0.8} />
      <text x={109} y={118} fontSize={12} fontWeight={650} textAnchor="middle" fill="#e4dcff">
        New
      </text>
      <text x={142} y={118} fontSize={13} fill={ink.mist}>
        {distance}
      </text>
      <path d="M26 146H314" stroke={ink.ice} strokeOpacity={0.14} strokeWidth={1.5} />
      {lines.map(([label, price], index) => (
        <g key={label}>
          <text x={26} y={180 + index * 34} fontSize={15} fill="#c3cdf0">
            {label}
          </text>
          <text x={314} y={180 + index * 34} fontSize={15} textAnchor="end" fill={ink.white} style={{ fontFamily: artFont.mono }}>
            {price}
          </text>
        </g>
      ))}
      <path d="M26 290H314" stroke={ink.ice} strokeOpacity={0.14} strokeWidth={1.5} strokeDasharray="4 6" />
      <text x={26} y={326} fontSize={18} fontWeight={650} fill={ink.white}>
        Total
      </text>
      <text x={314} y={328} fontSize={24} fontWeight={700} textAnchor="end" fill={highlight ? neon.cyanSoft : ink.white} style={{ fontFamily: artFont.mono }}>
        {total}
      </text>
      <rect x={26} y={350} width={288} height={36} rx={18} fill={highlight ? neon.cyan : "#141d4f"} fillOpacity={highlight ? 0.9 : 1} />
      <text x={170} y={374} fontSize={14} fontWeight={650} textAnchor="middle" fill={highlight ? ink.deep : ink.mist}>
        {highlight ? "Selected · Thu 9:00 AM" : "Wed 2:00 PM slot"}
      </text>
    </g>
  );
}

function buildCompare(id: Ids, animated: boolean): SceneDefinition {
  const layers: SceneLayer[] = [
    {
      key: "backdrop",
      depth: 0.4,
      content: <Backdrop id={id} glowA="glow-violet" glowB="glow-cyan" seed={53} />,
    },
    {
      key: "back-cards",
      depth: 0.12,
      box: [20, 150, 960, 560],
      content: (
        <g opacity={0.72}>
          <g transform="rotate(-7 205 400)">
            <MiniQuote
              id={id}
              x={40}
              y={200}
              total="$248.90"
              distance="Garage · about 9 mi"
              lines={[
                ["Labor · 0.6 h", "$72.00"],
                ["Battery (premium)", "$164.00"],
                ["Tax on parts", "$12.90"],
              ]}
            />
          </g>
          <g transform="rotate(7 795 400)">
            <MiniQuote
              id={id}
              x={620}
              y={200}
              total="$259.40"
              distance="Mobile · about 11 mi"
              lines={[
                ["Labor · 0.5 h", "$75.00"],
                ["Group 51R battery", "$170.00"],
                ["Tax on parts", "$14.40"],
              ]}
            />
          </g>
        </g>
      ),
    },
    {
      key: "front-card",
      depth: -0.1,
      box: [300, 100, 400, 480],
      loopClassName: animated ? s.float : undefined,
      content: (
        <MiniQuote
          id={id}
          x={330}
          y={130}
          highlight
          total="$232.12"
          distance="Mobile · about 6 mi"
          lines={[
            ["Labor · 0.5 h", "$60.00"],
            ["Group 51R battery", "$159.00"],
            ["Tax on parts", "$13.12"],
          ]}
        />
      ),
    },
    {
      key: "badge",
      depth: -0.24,
      box: [580, 80, 200, 110],
      loopClassName: animated ? s.bob : undefined,
      content: (
        <g>
          <rect x={604} y={102} width={150} height={44} rx={22} fill={ref(id("chip"))} filter={ref(id("glow"))} />
          <path d="M624 124l5 5 9-10" stroke={ink.deep} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <text x={646} y={130} fontSize={16} fontWeight={700} fill={ink.deep}>
            Your pick
          </text>
        </g>
      ),
    },
    {
      key: "fx",
      depth: -0.3,
      content: <Sparkles seed={61} count={18} box={[40, 40, 920, 720]} animated={animated} />,
    },
  ];
  return { width: W, height: H, defs: <StageDefs id={id} />, layers };
}

// ── 4. Reserve and get it fixed ──────────────────────────────────────────────────

function buildFixed(id: Ids, animated: boolean): SceneDefinition {
  const layers: SceneLayer[] = [
    {
      key: "backdrop",
      depth: 0.4,
      content: (
        <g>
          <Backdrop id={id} glowA="glow-cyan" glowB="glow-violet" seed={71} />
          <path d="M210 150L40 700H960L790 150Z" fill={ref(id("rig-light"))} />
          <path d="M110 118H890" stroke="#1b2766" strokeWidth={22} strokeLinecap="round" />
          <path d="M110 118V640M890 118V640" stroke="#141d4f" strokeWidth={18} />
          <path d="M110 200V600M890 200V600" stroke={neon.violetSoft} strokeOpacity={0.55} strokeWidth={3} />
          <g filter={ref(id("glow"))}>
            <rect x={200} y={128} width={600} height={12} rx={6} fill={ink.ice} />
          </g>
          {[250, 350, 450, 550, 650, 750].map((x) => (
            <rect key={x} x={x - 22} y={131} width={44} height={6} rx={3} fill={neon.cyanSoft} />
          ))}
        </g>
      ),
    },
    {
      key: "car",
      depth: 0,
      box: [90, 340, 860, 380],
      content: (
        <g>
          <ellipse cx={560} cy={640} rx={390} ry={46} fill="none" stroke={neon.cyan} strokeOpacity={0.45} strokeWidth={2} strokeDasharray="12 12" />
          <ellipse cx={560} cy={634} rx={340} ry={36} fill={ref(id("pool-cyan"))} />
          <Car id={id} x={300} y={452} scale={1.1} beam={false} />
          <MechanicFigure id={id} x={118} y={370} scale={1} />
        </g>
      ),
    },
    {
      key: "scan",
      depth: 0,
      box: [300, 430, 580, 120],
      loopClassName: animated ? s.scan : undefined,
      content: (
        <g>
          <rect x={320} y={456} width={540} height={4} rx={2} fill={neon.cyanSoft} opacity={0.85} />
          <rect x={320} y={436} width={540} height={20} fill={ref(id("scan-fade"))} />
        </g>
      ),
    },
    {
      key: "slot",
      depth: -0.18,
      box: [560, 150, 420, 230],
      loopClassName: animated ? s.floatSlow : undefined,
      content: (
        <g>
          <GlassPanel id={id} x={590} y={176} w={360} h={170} />
          <circle cx={648} cy={236} r={30} fill={ref(id("chip"))} />
          <rect x={634} y={223} width={28} height={26} rx={4} fill="none" stroke={ink.deep} strokeWidth={3} />
          <path d="M634 231H662M641 218V225M655 218V225" stroke={ink.deep} strokeWidth={3} strokeLinecap="round" />
          <text x={696} y={228} fontSize={22} fontWeight={650} fill={ink.white}>
            Thu · 9:00 AM
          </text>
          <text x={696} y={256} fontSize={15} fill={ink.mist}>
            45 min · Mobile service
          </text>
          <path d="M620 292H920" stroke={ink.ice} strokeOpacity={0.12} strokeWidth={1.5} />
          <circle cx={636} cy={318} r={9} fill={neon.green} />
          <path d="M631.5 318l3 3 5.5-6" stroke={ink.deep} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <text x={656} y={324} fontSize={15} fontWeight={600} fill={neon.greenSoft}>
            Quote accepted · slot reserved
          </text>
        </g>
      ),
    },
    {
      key: "check",
      depth: -0.26,
      box: [40, 150, 220, 220],
      loopClassName: animated ? s.bob : undefined,
      content: (
        <g>
          <circle cx={150} cy={258} r={60} fill={neon.green} fillOpacity={0.1} stroke={neon.green} strokeOpacity={0.45} strokeWidth={2} />
          <circle cx={150} cy={258} r={42} fill="#0b3b39" stroke={neon.greenSoft} strokeWidth={2.5} filter={ref(id("glow"))} />
          <path d="M131 259l13 13 26-28" stroke={ink.white} strokeWidth={7} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ),
    },
    {
      key: "fx",
      depth: -0.3,
      content: (
        <g>
          <path d="M392 600l-16-12M404 586l-4-18M380 614l-20 2" stroke={neon.amber} strokeWidth={2.5} strokeLinecap="round" opacity={0.85} />
          <Sparkles seed={83} count={16} box={[40, 40, 920, 700]} animated={animated} />
        </g>
      ),
    },
  ];
  return {
    width: W,
    height: H,
    defs: (
      <>
        <StageDefs id={id} />
        <LinearGradient
          id={id("rig-light")}
          x1={0}
          y1={0}
          x2={0}
          y2={1}
          stops={[
            [0, neon.cyanSoft, 0.28],
            [0.6, neon.cyan, 0.06],
            [1, neon.cyan, 0],
          ]}
        />
        <LinearGradient
          id={id("scan-fade")}
          x1={0}
          y1={1}
          x2={0}
          y2={0}
          stops={[
            [0, neon.cyan, 0.35],
            [1, neon.cyan, 0],
          ]}
        />
      </>
    ),
    layers,
  };
}

// ── Components ───────────────────────────────────────────────────────────────────

type StoryScene = (props: SceneProps) => ReactNode;

function makeScene(build: (id: Ids, animated: boolean) => SceneDefinition, defaults: { title: string; desc: string }): StoryScene {
  return function Scene({ title = defaults.title, desc = defaults.desc, decorative, className, animated = true, variant, fontFamily }: SceneProps) {
    const id = useSvgIds();
    return (
      <RenderScene
        scene={build(id, animated)}
        id={id}
        title={title}
        desc={desc}
        decorative={decorative}
        className={className}
        variant={variant}
        fontFamily={fontFamily}
      />
    );
  };
}

/** Step 1: a phone photographs a glowing check-engine light; a holographic request form floats beside it. */
export const HowItWorksDescribe = makeScene(buildDescribe, {
  title: "Photographing a dashboard warning light for a repair request",
  desc: "A phone camera frames an amber check-engine light on a glowing dashboard. Beside it, a holographic request form lists the vehicle, the problem and attached photos.",
});

/** Step 2: neon map with radius rings, matched mechanic pins and an "Approved" shield. */
export const HowItWorksMatch = makeScene(buildMatch, {
  title: "Approved mechanics matched on a map",
  desc: "A holographic map with radius rings around the customer's area. Approved mechanics inside the radius light up and connect to it; one outside the radius stays dim. A shield badge reads Approved.",
});

/** Step 3: three itemized example quotes; the chosen one glows. */
export const HowItWorksCompare = makeScene(buildCompare, {
  title: "Comparing itemized example quotes",
  desc: "Three floating example quotes list labor, parts and tax on separate lines. The middle one is highlighted as your pick.",
});

/** Step 4: a mechanic at work on the car under a light rig, with the reserved time slot. */
export const HowItWorksFixed = makeScene(buildFixed, {
  title: "A mechanic working on the car at the reserved time",
  desc: "Under a glowing light rig, a mechanic with a tablet works on an electric car. A card shows the Thursday 9:00 AM slot and a green check mark.",
});
