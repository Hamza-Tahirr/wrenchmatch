"use client";

import { cn } from "@/lib/cn";
import { ambient as s } from "./ambient";
import { RenderScene, type SceneDefinition, type SceneLayer, type SceneProps } from "./layered-scene";
import { artFont, ink, neon } from "./palette";
import {
  ArtDefs,
  Car,
  GlassPanel,
  MechanicFigure,
  PerspectiveGrid,
  PinPulse,
  ShieldBadge,
  SlotChip,
  Stars,
  MechanicBadge,
} from "./parts";
import { LinearGradient, RadialGradient, ref, seeded, useSvgIds, r1, pinPath } from "./svg-kit";

type Ids = (name: string) => string;

function Twinkles({ seed, count, box, animated }: { seed: number; count: number; box: readonly [number, number, number, number]; animated: boolean }) {
  const rand = seeded(seed);
  const [bx, by, bw, bh] = box;
  return (
    <g>
      {Array.from({ length: count }, (_, index) => (
        <circle
          key={index}
          cx={r1(bx + rand() * bw)}
          cy={r1(by + rand() * bh)}
          r={r1(1.2 + rand() * 2)}
          fill={index % 3 === 0 ? neon.violetSoft : neon.cyanSoft}
          opacity={r1(0.3 + rand() * 0.5)}
          className={animated && index % 8 === 0 ? (index % 16 === 0 ? s.twinkle : s.twinkleLate) : undefined}
        />
      ))}
    </g>
  );
}

function SceneGlows({ id }: { id: Ids }) {
  return (
    <>
      <RadialGradient
        id={id("room")}
        cx={0.5}
        cy={0.3}
        r={0.85}
        stops={[
          [0, "#121c52", 1],
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
          [0, neon.cyan, 0.28],
          [1, neon.cyan, 0],
        ]}
      />
      <RadialGradient
        id={id("glow-amber")}
        stops={[
          [0, neon.amber, 0.55],
          [0.4, neon.orange, 0.2],
          [1, neon.orange, 0],
        ]}
      />
    </>
  );
}

// ── For mechanics: futuristic garage ─────────────────────────────────────────────

function Tool({ kind, x, y, color }: { kind: "wrench" | "driver" | "socket" | "hammer" | "pliers"; x: number; y: number; color: string }) {
  switch (kind) {
    case "wrench":
      return (
        <g transform={`translate(${x} ${y})`} fill={color}>
          <rect x={-4} y={-10} width={8} height={78} rx={4} />
          <circle cx={0} cy={-14} r={12} />
          <rect x={-4.5} y={-30} width={9} height={14} fill="#0a1032" />
          <circle cx={0} cy={72} r={8} />
        </g>
      );
    case "driver":
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x={-8} y={-26} width={16} height={36} rx={7} fill={color} />
          <rect x={-2.5} y={10} width={5} height={48} rx={2} fill={ink.mist} />
        </g>
      );
    case "socket":
      return (
        <g transform={`translate(${x} ${y})`} fill={color}>
          <rect x={-4} y={-20} width={8} height={70} rx={4} />
          <rect x={-14} y={-34} width={28} height={18} rx={6} />
        </g>
      );
    case "hammer":
      return (
        <g transform={`translate(${x} ${y})`} fill={color}>
          <rect x={-4} y={-14} width={8} height={74} rx={4} />
          <rect x={-22} y={-28} width={44} height={16} rx={5} />
        </g>
      );
    case "pliers":
      return (
        <g transform={`translate(${x} ${y})`} fill="none" stroke={color} strokeWidth={7} strokeLinecap="round">
          <path d="M-6 -24L4 6L-10 58" />
          <path d="M6 -24L-4 6L10 58" />
        </g>
      );
  }
}

function JobRow({ y, title, meta, status, tone }: { y: number; title: string; meta: string; status: string; tone: "cyan" | "violet" }) {
  const color = tone === "cyan" ? neon.cyan : neon.violetSoft;
  return (
    <g>
      <rect x={96} y={y} width={372} height={64} rx={14} fill="#070c26" stroke="#2a3a7a" strokeWidth={1.5} />
      <rect x={108} y={y + 14} width={6} height={36} rx={3} fill={color} />
      <text x={128} y={y + 28} fontSize={16} fontWeight={650} fill={ink.white}>
        {title}
      </text>
      <text x={128} y={y + 50} fontSize={13} fill={ink.mist}>
        {meta}
      </text>
      <rect x={376} y={y + 18} width={78} height={28} rx={14} fill={color} fillOpacity={0.16} stroke={color} strokeOpacity={0.7} />
      <text x={415} y={y + 37} fontSize={13} fontWeight={650} textAnchor="middle" fill={color}>
        {status}
      </text>
    </g>
  );
}

function buildMechanics(id: Ids, animated: boolean): SceneDefinition {
  const width = 1200;
  const height = 900;
  const layers: SceneLayer[] = [
    {
      key: "room",
      depth: 0.38,
      content: (
        <g>
          <rect x={-150} y={-150} width={width + 300} height={height + 300} fill={ref(id("room"))} />
          <ellipse cx={760} cy={300} rx={560} ry={300} fill={ref(id("glow-violet"))} />
          <rect x={560} y={70} width={600} height={440} rx={18} fill="#0a1131" stroke="#1f2b6b" strokeWidth={3} />
          <rect x={584} y={94} width={552} height={392} rx={10} fill={ref(id("pegboard"))} opacity={0.5} />
          <Tool kind="wrench" x={640} y={170} color={neon.cyanSoft} />
          <Tool kind="wrench" x={690} y={160} color="#9db8ff" />
          <Tool kind="driver" x={750} y={170} color={neon.violetSoft} />
          <Tool kind="driver" x={790} y={180} color={neon.cyan} />
          <Tool kind="socket" x={850} y={170} color="#9db8ff" />
          <Tool kind="hammer" x={920} y={180} color={neon.violetSoft} />
          <Tool kind="pliers" x={990} y={176} color={neon.cyanSoft} />
          <Tool kind="wrench" x={1050} y={160} color={neon.violetSoft} />
          <Tool kind="driver" x={1095} y={176} color="#9db8ff" />
          <path d="M600 330H1120" stroke={neon.cyan} strokeOpacity={0.5} strokeWidth={3} />
          <rect x={600} y={350} width={520} height={110} rx={10} fill="#0d1645" />
          {[0, 1, 2, 3].map((index) => (
            <rect key={index} x={618 + index * 128} y={366} width={110} height={78} rx={8} fill="#111c52" stroke="#2a3a7a" strokeWidth={1.5} />
          ))}
          <path d="M40 40H1160" stroke={neon.cyanSoft} strokeWidth={6} strokeLinecap="round" filter={ref(id("glow"))} />
          <path d="M80 60L-60 560H560L440 60Z" fill={ref(id("ceiling-light"))} />
          <path d="M760 60L620 560H1240L1120 60Z" fill={ref(id("ceiling-light"))} />
        </g>
      ),
    },
    {
      key: "floor",
      depth: 0.14,
      box: [0, 560, 1200, 340],
      content: (
        <g>
          <rect x={-150} y={600} width={width + 300} height={400} fill="#050818" />
          <PerspectiveGrid id={id} horizon={600} bottom={960} vanishX={640} left={-200} right={1400} spacing={110} depths={9} />
          <path d="M-150 600H1350" stroke={neon.cyan} strokeOpacity={0.45} strokeWidth={2} />
        </g>
      ),
    },
    {
      key: "lift",
      depth: 0,
      box: [380, 220, 820, 620],
      content: (
        <g>
          <ellipse cx={790} cy={790} rx={380} ry={40} fill={ref(id("pool-cyan"))} />
          <rect x={460} y={300} width={34} height={500} rx={6} fill="#141d4f" />
          <rect x={1090} y={300} width={34} height={500} rx={6} fill="#141d4f" />
          <rect x={474} y={320} width={6} height={460} rx={3} fill={neon.cyan} opacity={0.8} filter={ref(id("glow"))} />
          <rect x={1104} y={320} width={6} height={460} rx={3} fill={neon.violetSoft} opacity={0.8} filter={ref(id("glow"))} />
          <path d="M494 560H640M1090 560H950" stroke="#26336e" strokeWidth={12} strokeLinecap="round" />
          <Car id={id} x={540} y={392} scale={1.06} beam={false} />
          <ellipse cx={810} cy={800} rx={300} ry={18} fill="#000" opacity={0.5} />
        </g>
      ),
    },
    {
      key: "mechanic",
      depth: -0.04,
      box: [120, 500, 260, 330],
      content: <MechanicFigure id={id} x={190} y={530} scale={1.08} />,
    },
    {
      key: "board",
      depth: -0.18,
      box: [40, 60, 470, 440],
      loopClassName: animated ? s.floatSlow : undefined,
      content: (
        <g>
          <GlassPanel id={id} x={70} y={84} w={420} h={392} />
          <text x={96} y={128} fontSize={13} letterSpacing={2.5} fill={neon.cyanSoft} style={{ fontFamily: artFont.mono }}>
            JOB BOARD
          </text>
          <text x={96} y={160} fontSize={24} fontWeight={650} fill={ink.white}>
            Matched to your services
          </text>
          <JobRow y={186} title="Battery replacement" meta="2016 Honda Civic · about 3 mi" status="New" tone="cyan" />
          <JobRow y={262} title="Check engine light" meta="2015 Ford Focus · about 5 mi" status="New" tone="cyan" />
          <JobRow y={338} title="Brake pads, front" meta="2019 Toyota Camry · about 8 mi" status="Quoted" tone="violet" />
          <text x={96} y={448} fontSize={13} fill={ink.mist}>
            Approximate distances between ZIP areas
          </text>
        </g>
      ),
    },
    {
      key: "fx",
      depth: -0.3,
      content: <Twinkles seed={97} count={22} box={[40, 40, 1120, 760]} animated={animated} />,
    },
  ];
  return {
    width,
    height,
    defs: (
      <>
        <ArtDefs id={id} />
        <SceneGlows id={id} />
        <pattern id={id("pegboard")} width={22} height={22} patternUnits="userSpaceOnUse">
          <circle cx={11} cy={11} r={2.2} fill="#33448a" />
        </pattern>
        <LinearGradient
          id={id("ceiling-light")}
          x1={0}
          y1={0}
          x2={0}
          y2={1}
          stops={[
            [0, neon.cyanSoft, 0.2],
            [1, neon.cyan, 0],
          ]}
        />
      </>
    ),
    layers,
  };
}

// ── Safety: glowing brake disc + shield ──────────────────────────────────────────

function BrakeDisc({ id, cx, cy, r }: { id: Ids; cx: number; cy: number; r: number }) {
  const holes: Array<[number, number]> = [];
  for (let ring = 0; ring < 3; ring += 1) {
    const radius = r * (0.6 + ring * 0.12);
    for (let i = 0; i < 18; i += 1) {
      const a = (i / 18) * Math.PI * 2 + ring * 0.12;
      holes.push([r1(cx + Math.cos(a) * radius), r1(cy + Math.sin(a) * radius)]);
    }
  }
  const slots = Array.from({ length: 36 }, (_, i) => {
    const a = (i / 36) * Math.PI * 2;
    const a2 = a + 0.08;
    return `M${r1(cx + Math.cos(a) * r * 0.55)} ${r1(cy + Math.sin(a) * r * 0.55)}L${r1(cx + Math.cos(a2) * r * 0.97)} ${r1(cy + Math.sin(a2) * r * 0.97)}`;
  }).join("");
  const lugs = Array.from({ length: 5 }, (_, i) => {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    return [r1(cx + Math.cos(a) * r * 0.27), r1(cy + Math.sin(a) * r * 0.27)] as const;
  });
  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 26} fill={ref(id("heat"))} />
      <circle cx={cx} cy={cy} r={r} fill={ref(id("rotor"))} />
      <path d={slots} stroke="#1a2563" strokeOpacity={0.55} strokeWidth={3} />
      {holes.map(([hx, hy]) => (
        <circle key={`${hx}-${hy}`} cx={hx} cy={hy} r={r * 0.028} fill="#0a1032" />
      ))}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={ref(id("hot-edge"))} strokeWidth={r * 0.05} filter={ref(id("glow"))} />
      <circle cx={cx} cy={cy} r={r * 0.46} fill="#111a4a" stroke="#3a4790" strokeWidth={4} />
      <circle cx={cx} cy={cy} r={r * 0.36} fill="#0b1235" stroke={neon.cyan} strokeOpacity={0.5} strokeWidth={2} />
      <circle cx={cx} cy={cy} r={r * 0.13} fill="#05081a" stroke={neon.cyanSoft} strokeWidth={3} />
      {lugs.map(([lx, ly]) => (
        <circle key={`${lx}-${ly}`} cx={lx} cy={ly} r={r * 0.045} fill="#c9d6ff" />
      ))}
    </g>
  );
}

function buildSafety(id: Ids, animated: boolean): SceneDefinition {
  const width = 1000;
  const height = 800;
  const cx = 420;
  const cy = 420;
  const r = 250;
  const layers: SceneLayer[] = [
    {
      key: "room",
      depth: 0.4,
      content: (
        <g>
          <rect x={-120} y={-120} width={width + 240} height={height + 240} fill={ref(id("room"))} />
          <ellipse cx={360} cy={440} rx={460} ry={360} fill={ref(id("glow-amber"))} opacity={0.55} />
          <ellipse cx={760} cy={300} rx={380} ry={300} fill={ref(id("glow-cyan"))} />
          <Stars count={30} width={width} height={height} seed={113} animated={animated} />
          <circle cx={cx} cy={cy} r={330} fill="none" stroke={neon.cyan} strokeOpacity={0.18} strokeWidth={2} strokeDasharray="4 10" />
          <circle cx={cx} cy={cy} r={380} fill="none" stroke={neon.violetSoft} strokeOpacity={0.14} strokeWidth={2} />
        </g>
      ),
    },
    {
      key: "disc",
      depth: 0.08,
      box: [cx - r - 40, cy - r - 40, (r + 40) * 2, (r + 40) * 2],
      loopClassName: animated ? s.spin : undefined,
      content: <BrakeDisc id={id} cx={cx} cy={cy} r={r} />,
    },
    {
      key: "caliper",
      depth: 0,
      box: [560, 180, 220, 480],
      content: (
        <g>
          <path d="M600 230C690 260 740 340 742 420C740 500 690 580 600 610L586 560C650 530 680 480 682 420C680 360 650 310 586 280Z" fill={ref(id("caliper"))} stroke={neon.violetSoft} strokeWidth={2} />
          <path d="M612 268C668 300 692 360 694 420" stroke={ink.white} strokeOpacity={0.35} strokeWidth={4} fill="none" strokeLinecap="round" />
          <rect x={652} y={398} width={56} height={44} rx={10} fill="#1d1250" stroke={neon.violetSoft} strokeOpacity={0.7} strokeWidth={2} />
        </g>
      ),
    },
    {
      key: "shield",
      depth: -0.2,
      box: [640, 120, 340, 520],
      loopClassName: animated ? s.float : undefined,
      content: (
        <g>
          <ShieldBadge id={id} cx={810} cy={300} r={110} tone="emerald" />
          {[
            ["Brakes", 470],
            ["Suspension", 524],
          ].map(([label, y]) => (
            <g key={label}>
              <rect x={700} y={Number(y)} width={220} height={42} rx={21} fill="#07261f" stroke={neon.green} strokeOpacity={0.7} strokeWidth={1.5} />
              <circle cx={724} cy={Number(y) + 21} r={9} fill={neon.green} />
              <path d={`M719.5 ${Number(y) + 21}l3 3 5.5-6`} stroke={ink.deep} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <text x={744} y={Number(y) + 27} fontSize={17} fontWeight={650} fill="#c9fbe6">
                {label}
              </text>
              <text x={904} y={Number(y) + 27} fontSize={12} textAnchor="end" letterSpacing={1.5} fill={neon.greenSoft} style={{ fontFamily: artFont.mono }}>
                GATED
              </text>
            </g>
          ))}
        </g>
      ),
    },
    {
      key: "fx",
      depth: -0.3,
      content: <Twinkles seed={127} count={18} box={[40, 40, 920, 720]} animated={animated} />,
    },
  ];
  return {
    width,
    height,
    defs: (
      <>
        <ArtDefs id={id} />
        <SceneGlows id={id} />
        <RadialGradient
          id={id("rotor")}
          cx={0.38}
          cy={0.32}
          r={0.75}
          stops={[
            [0, "#dfe8ff", 1],
            [0.35, "#8f9fd8", 1],
            [0.75, "#3e4b95", 1],
            [1, "#1b2563", 1],
          ]}
        />
        <LinearGradient
          id={id("hot-edge")}
          x1={0}
          y1={1}
          x2={1}
          y2={0}
          stops={[
            [0, neon.orange, 1],
            [0.35, neon.amber, 0.9],
            [0.6, neon.cyan, 0.6],
            [1, neon.cyan, 0.9],
          ]}
        />
        <RadialGradient
          id={id("heat")}
          cx={0.3}
          cy={0.75}
          r={0.6}
          stops={[
            [0, neon.orange, 0.45],
            [1, neon.orange, 0],
          ]}
        />
        <LinearGradient
          id={id("caliper")}
          x1={0}
          y1={0}
          x2={1}
          y2={1}
          stops={[
            [0, "#8b6cff", 1],
            [1, "#3b1fa8", 1],
          ]}
        />
      </>
    ),
    layers,
  };
}

// ── Coverage: holographic terrain behind the live map ────────────────────────────

function buildCoverage(id: Ids, animated: boolean): SceneDefinition {
  const width = 1600;
  const height = 900;
  const contours = Array.from({ length: 9 }, (_, index) => {
    const y = 520 + index * 46;
    const amp = 26 + index * 6;
    return `M-100 ${y}C200 ${y - amp} 400 ${y + amp} 700 ${y}S1200 ${y - amp} 1700 ${y + amp * 0.4}`;
  }).join("");
  const nodes: ReadonlyArray<readonly [number, number, "cyan" | "violet"]> = [
    [180, 600, "cyan"],
    [360, 700, "violet"],
    [1240, 640, "cyan"],
    [1420, 760, "violet"],
    [1120, 820, "cyan"],
    [260, 820, "cyan"],
  ];
  const layers: SceneLayer[] = [
    {
      key: "sky",
      depth: 0.4,
      content: (
        <g>
          <rect x={-150} y={-150} width={width + 300} height={height + 300} fill={ref(id("room"))} className="wmi-night" />
          <ellipse cx={800} cy={460} rx={900} ry={260} fill={ref(id("glow-cyan"))} />
          <ellipse cx={300} cy={240} rx={500} ry={260} fill={ref(id("glow-violet"))} />
          <g className="wmi-night">
            <Stars count={60} width={width} height={440} seed={151} animated={animated} />
          </g>
        </g>
      ),
    },
    {
      key: "terrain",
      depth: 0.16,
      box: [0, 420, 1600, 480],
      content: (
        <g>
          <PerspectiveGrid id={id} horizon={460} bottom={height + 40} vanishX={800} left={-300} right={1900} spacing={120} depths={10} />
          <path d={contours} fill="none" stroke={neon.violetSoft} strokeOpacity={0.3} strokeWidth={1.6} className="wmi-contour" />
          {nodes.map(([x, y, tone]) => (
            <g key={`${x}-${y}`}>
              <ellipse cx={x} cy={y} rx={34} ry={10} fill={ref(id(tone === "cyan" ? "pool-cyan" : "pool-violet"))} />
              <path d={pinPath(x, y - 26, 10)} fill={ref(id(tone === "cyan" ? "pin" : "pin-violet"))} />
            </g>
          ))}
        </g>
      ),
    },
    {
      key: "terrain-fx",
      depth: 0.16,
      box: [0, 420, 1600, 480],
      content: (
        <g>
          {nodes.map(([x, y, tone], index) => (
            <PinPulse key={`${x}-${y}`} x={x} y={y} size={12} tone={tone} animated={animated} late={index % 2 === 1} />
          ))}
        </g>
      ),
    },
    {
      key: "fx",
      depth: -0.2,
      content: (
        <g className="wmi-night">
          <Twinkles seed={163} count={24} box={[20, 40, 1560, 820]} animated={animated} />
        </g>
      ),
    },
  ];
  return {
    width,
    height,
    defs: (
      <>
        <ArtDefs id={id} />
        <SceneGlows id={id} />
      </>
    ),
    layers,
  };
}

// ── Auth: portal art for login / signup ──────────────────────────────────────────

function buildAuth(id: Ids, animated: boolean): SceneDefinition {
  const width = 800;
  const height = 1000;
  const cx = 400;
  const cy = 520;
  const layers: SceneLayer[] = [
    {
      key: "sky",
      depth: 0.4,
      content: (
        <g>
          <rect x={-150} y={-150} width={width + 300} height={height + 300} fill={ref(id("room"))} />
          <ellipse cx={260} cy={260} rx={420} ry={320} fill={ref(id("glow-violet"))} />
          <ellipse cx={560} cy={700} rx={420} ry={320} fill={ref(id("glow-cyan"))} />
          <Stars count={70} width={width} height={height} seed={181} animated={animated} />
        </g>
      ),
    },
    {
      key: "floor",
      depth: 0.2,
      box: [0, 600, 800, 400],
      content: <PerspectiveGrid id={id} horizon={640} bottom={height + 40} vanishX={cx} left={-300} right={1100} spacing={80} depths={9} />,
    },
    {
      key: "ring-outer",
      depth: 0.12,
      box: [cx - 330, cy - 330, 660, 660],
      loopClassName: animated ? s.spin : undefined,
      content: (
        <g>
          <circle cx={cx} cy={cy} r={300} fill="none" stroke={ref(id("ring"))} strokeWidth={3} strokeDasharray="2 14" strokeLinecap="round" />
          <circle cx={cx} cy={cy} r={318} fill="none" stroke={neon.violetSoft} strokeOpacity={0.25} strokeWidth={1.5} />
          <path d={`M${cx - 300} ${cy}A300 300 0 0 1 ${cx} ${cy - 300}`} fill="none" stroke={neon.cyanSoft} strokeWidth={5} strokeLinecap="round" filter={ref(id("glow"))} />
        </g>
      ),
    },
    {
      key: "portal",
      depth: 0.04,
      box: [cx - 280, cy - 280, 560, 560],
      content: (
        <g>
          <circle cx={cx} cy={cy} r={250} fill={ref(id("portal"))} />
          <circle cx={cx} cy={cy} r={250} fill="none" stroke={ref(id("edge"))} strokeWidth={3} />
          <circle cx={cx} cy={cy} r={214} fill="none" stroke={neon.cyan} strokeOpacity={0.3} strokeWidth={1.5} strokeDasharray="6 8" />
          <ellipse cx={cx} cy={cy + 150} rx={200} ry={34} fill={ref(id("pool-cyan"))} />
          <ellipse cx={cx} cy={cy + 150} rx={180} ry={28} fill="none" stroke={neon.cyanSoft} strokeOpacity={0.6} strokeWidth={2} />
        </g>
      ),
    },
    {
      key: "car",
      depth: -0.04,
      box: [140, 520, 520, 200],
      content: <Car id={id} x={175} y={526} scale={0.9} beam={false} reflection />,
    },
    {
      key: "badge",
      depth: -0.2,
      // Badge and chip stay inside x 150-650: the side panel crops the art to its centre.
      box: [180, 120, 380, 160],
      loopClassName: animated ? s.floatSlow : undefined,
      content: <MechanicBadge id={id} x={200} y={150} scale={0.92} distance="about 4 mi" />,
    },
    {
      key: "chip",
      depth: -0.24,
      box: [298, 400, 330, 110],
      loopClassName: animated ? s.float : undefined,
      content: <SlotChip id={id} x={318} y={420} scale={0.98} label="Fri · 8:30 AM" meta="1 h" />,
    },
    {
      key: "fx",
      depth: -0.3,
      content: <Twinkles seed={199} count={26} box={[20, 20, 760, 960]} animated={animated} />,
    },
  ];
  return {
    width,
    height,
    defs: (
      <>
        <ArtDefs id={id} />
        <SceneGlows id={id} />
        <RadialGradient
          id={id("portal")}
          cx={0.5}
          cy={0.4}
          r={0.6}
          stops={[
            [0, "#2a3d9e", 0.55],
            [0.6, "#121a52", 0.55],
            [1, "#070b22", 0.2],
          ]}
        />
        <LinearGradient
          id={id("ring")}
          stops={[
            [0, neon.cyan, 1],
            [1, neon.violet, 1],
          ]}
        />
      </>
    ),
    layers,
  };
}

// ── Components ───────────────────────────────────────────────────────────────────

function useScene(build: (id: Ids, animated: boolean) => SceneDefinition, animated: boolean) {
  const id = useSvgIds();
  return { id, scene: build(id, animated) };
}

/** "For mechanics": futuristic garage with a two-post lift, tool wall and a holographic job board. viewBox 1200 x 900. */
export function MechanicsScene({
  title = "A mechanic with a holographic job board in a futuristic garage",
  desc = "A car raised on a glowing two-post lift in front of a lit tool wall. A mechanic holds a tablet beside a floating job board listing matched repair jobs with approximate distances.",
  decorative,
  className,
  animated = true,
  variant,
  fontFamily,
}: SceneProps) {
  const { id, scene } = useScene(buildMechanics, animated);
  return <RenderScene scene={scene} id={id} title={title} desc={desc} decorative={decorative} className={className} variant={variant} fontFamily={fontFamily} />;
}

/** Safety: a glowing brake disc and caliper with an emerald shield (brakes and suspension gated). viewBox 1000 x 800. */
export function SafetyScene({
  title = "A brake disc protected by a safety shield",
  desc = "A drilled brake disc glows hot at one edge inside a violet caliper. An emerald shield with a check mark floats beside it above chips reading Brakes and Suspension, gated.",
  decorative,
  className,
  animated = true,
  variant,
  fontFamily,
}: SceneProps) {
  const { id, scene } = useScene(buildSafety, animated);
  return <RenderScene scene={scene} id={id} title={title} desc={desc} decorative={decorative} className={className} variant={variant} fontFamily={fontFamily} />;
}

/**
 * Holographic terrain and grid to sit behind the live coverage map. viewBox 1600 x 900.
 * Usually decorative. `daylight`: in the light theme the night backdrop and stars drop away
 * and the grid deepens, leaving a blueprint-like terrain on the light page.
 */
export function CoverageArt({
  title = "Holographic terrain grid",
  desc = "A glowing perspective grid with contour lines and softly pulsing location pins.",
  decorative = true,
  className,
  animated = true,
  variant,
  fontFamily,
  daylight = false,
}: SceneProps & { daylight?: boolean }) {
  const { id, scene } = useScene(buildCoverage, animated);
  return (
    <RenderScene
      scene={scene}
      id={id}
      title={title}
      desc={desc}
      decorative={decorative}
      className={cn(daylight && "wmi-daylight", className)}
      variant={variant}
      fontFamily={fontFamily}
    />
  );
}

/** Login / signup side art: a glowing portal with a car, an approved-mechanic badge and a time slot. viewBox 800 x 1000. */
export function AuthArt({
  title = "An electric car inside a glowing portal",
  desc = "A car parked on a holographic platform inside a rotating neon ring, with a floating approved-mechanic badge marked New and a Friday 8:30 AM time slot.",
  decorative,
  className,
  animated = true,
  variant,
  fontFamily,
}: SceneProps) {
  const { id, scene } = useScene(buildAuth, animated);
  return <RenderScene scene={scene} id={id} title={title} desc={desc} decorative={decorative} className={className} variant={variant} fontFamily={fontFamily} />;
}
