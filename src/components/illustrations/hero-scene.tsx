"use client";

import { ambient as s } from "./ambient";
import { RenderScene, type SceneDefinition, type SceneProps } from "./layered-scene";
import { ink, neon } from "./palette";
import {
  ArtDefs,
  Car,
  GroundPin,
  Leader,
  MechanicBadge,
  PerspectiveGrid,
  QuoteCard,
  PinPulse,
  RouteBase,
  RouteFlow,
  Skyline,
  SlotChip,
  Stars,
  Van,
} from "./parts";
import { LinearGradient, RadialGradient, ref, seeded, useSvgIds, r1 } from "./svg-kit";

type Ids = (name: string) => string;

const HERO_SIZE = { width: 1600, height: 1000 } as const;

const HORIZON = 566;
const ROUTE_VAN = "M954 728C1010 744 984 846 1010 886";
const ROUTE_FAR = "M1330 628C1250 690 1120 760 1028 882";

/**
 * Composition note: the left ~42% (x < 670) stays calm (sky, low skyline, floor grid) because
 * the landing headline sits on top of it on large screens; the action is on the right.
 */
function rampLeft(x: number): number {
  if (x < 560) return 0.42;
  if (x > 980) return 1;
  return 0.42 + ((x - 560) / 420) * 0.58;
}

function Particles({ seed, count, animated }: { seed: number; count: number; animated: boolean }) {
  const rand = seeded(seed);
  const dots = Array.from({ length: count }, () => ({
    x: r1(620 + rand() * 980),
    y: r1(60 + rand() * 900),
    r: r1(1 + rand() * 2.4),
    o: r1(0.25 + rand() * 0.55),
  }));
  return (
    <g>
      {dots.map((dot, index) => (
        <circle
          key={index}
          cx={dot.x}
          cy={dot.y}
          r={dot.r}
          fill={index % 3 === 0 ? neon.violetSoft : neon.cyanSoft}
          opacity={dot.o}
          className={animated && index % 9 === 1 ? (index % 2 ? s.twinkle : s.twinkleLate) : undefined}
        />
      ))}
    </g>
  );
}

/** Streaks of traffic light along the horizon highway. */
function LightTrails({ animated }: { animated: boolean }) {
  const rows: ReadonlyArray<readonly [number, string, string, number]> = [
    [HORIZON + 7, neon.cyanSoft, "60 90", 0.75],
    [HORIZON + 12, neon.magenta, "30 140", 0.6],
    [HORIZON + 17, neon.violetSoft, "80 120", 0.55],
  ];
  return (
    <g>
      {rows.map(([y, color, dash, opacity], index) => (
        <path
          key={y}
          d={`M-300 ${y}H1900`}
          stroke={color}
          strokeOpacity={opacity}
          strokeWidth={index === 1 ? 2 : 2.5}
          strokeDasharray={dash}
          strokeLinecap="round"
          className={animated && index <= 1 ? (index === 1 ? s.dash : s.dashSlow) : undefined}
        />
      ))}
    </g>
  );
}

export function buildHeroScene(id: Ids, animated: boolean): SceneDefinition {
  const { width, height } = HERO_SIZE;
  return {
    width,
    height,
    defs: (
      <>
        <ArtDefs id={id} />
        <LinearGradient
          id={id("sky")}
          units="userSpaceOnUse"
          x1={0}
          y1={-300}
          x2={0}
          y2={HORIZON}
          stops={[
            [0, "#02030c", 1],
            [0.55, "#060a24", 1],
            [1, "#121c55", 1],
          ]}
        />
        <LinearGradient
          id={id("ground")}
          units="userSpaceOnUse"
          x1={0}
          y1={HORIZON}
          x2={0}
          y2={1100}
          stops={[
            [0, "#0d1645", 1],
            [0.35, "#060a22", 1],
            [1, "#02030b", 1],
          ]}
        />
        <LinearGradient
          id={id("haze")}
          x1={0}
          y1={0}
          x2={0}
          y2={1}
          stops={[
            [0, "#121c55", 0],
            [1, "#121c55", 0.95],
          ]}
        />
        <LinearGradient
          id={id("searchlight")}
          x1={0}
          y1={1}
          x2={0}
          y2={0}
          stops={[
            [0, neon.cyanSoft, 0.32],
            [1, neon.cyanSoft, 0],
          ]}
        />
        <RadialGradient
          id={id("horizon-glow")}
          stops={[
            [0, neon.cyan, 0.42],
            [0.35, neon.violet, 0.18],
            [1, neon.violet, 0],
          ]}
        />
        <RadialGradient
          id={id("aurora-violet")}
          stops={[
            [0, neon.violet, 0.42],
            [1, neon.violet, 0],
          ]}
        />
        <RadialGradient
          id={id("aurora-cyan")}
          stops={[
            [0, neon.cyan, 0.26],
            [1, neon.cyan, 0],
          ]}
        />
        <RadialGradient
          id={id("planet")}
          cx={0.66}
          cy={0.28}
          r={0.78}
          stops={[
            [0, "#4146b0", 1],
            [0.5, "#161b57", 1],
            [1, "#070a26", 1],
          ]}
        />
        <LinearGradient
          id={id("billboard")}
          stops={[
            [0, neon.violet, 0.95],
            [1, neon.cyan, 0.9],
          ]}
        />
      </>
    ),
    layers: [
      {
        key: "sky",
        depth: 0.55,
        content: (
          <g>
            <rect x={-300} y={-400} width={2200} height={HORIZON + 420} fill={ref(id("sky"))} />
            <ellipse cx={1180} cy={360} rx={640} ry={240} fill={ref(id("aurora-violet"))} />
            <ellipse cx={760} cy={440} rx={520} ry={170} fill={ref(id("aurora-cyan"))} />
            <Stars count={85} width={1600} height={500} seed={11} animated={animated} />
            <path d="M1010 566L930 0L990 0Z" fill={ref(id("searchlight"))} opacity={0.6} />
            <path d="M1470 566L1560 0L1620 0Z" fill={ref(id("searchlight"))} opacity={0.45} />
            <g>
              <ellipse cx={880} cy={128} rx={118} ry={20} transform="rotate(-14 880 128)" fill="none" stroke={neon.violetSoft} strokeOpacity={0.22} strokeWidth={3} />
              <circle cx={880} cy={128} r={62} fill={ref(id("planet"))} />
              <path d="M827 160A62 62 0 0 0 942 128" fill="none" stroke={neon.cyanSoft} strokeOpacity={0.6} strokeWidth={3} filter={ref(id("glow"))} />
              <path d="M765.5 156.5A118 20 -14 0 0 994.5 99.5" fill="none" stroke={neon.violetSoft} strokeOpacity={0.6} strokeWidth={3} />
            </g>
            <ellipse cx={1100} cy={HORIZON} rx={1000} ry={150} fill={ref(id("horizon-glow"))} />
          </g>
        ),
      },
      {
        key: "far-city",
        depth: 0.42,
        box: [0, 320, 1600, 260],
        content: (
          <g>
            <Skyline
              id={id}
              seed={7}
              from={-20}
              to={1620}
              base={HORIZON + 4}
              minH={40}
              maxH={180}
              minW={24}
              maxW={58}
              fill="#0c1544"
              windows="windows-b"
              windowOpacity={0.22}
              heightAt={rampLeft}
            />
            <rect x={-20} y={HORIZON - 90} width={1640} height={96} fill={ref(id("haze"))} />
          </g>
        ),
      },
      {
        key: "near-city",
        depth: 0.3,
        box: [600, 220, 1000, 370],
        content: (
          <g>
            <Skyline
              id={id}
              seed={23}
              from={630}
              to={1620}
              base={HORIZON + 10}
              minH={110}
              maxH={320}
              minW={58}
              maxW={118}
              fill="#0f1a4f"
              windows="windows"
              windowOpacity={0.36}
              rim={neon.cyan}
              heightAt={rampLeft}
            />
            <g filter={ref(id("glow"))}>
              <rect x={1404} y={330} width={128} height={64} rx={8} fill={ref(id("billboard"))} opacity={0.85} />
            </g>
            <g transform="rotate(-45 1468 362)">
              <rect x={1448} y={358} width={30} height={8} rx={4} fill={ink.white} />
              <circle cx={1482} cy={362} r={11} fill={ink.white} />
              <rect x={1482} y={358} width={13} height={8} fill="#5b4bd6" />
            </g>
            <path d="M1412 384H1524" stroke={ink.white} strokeOpacity={0.35} strokeWidth={2} />
            <rect x={796} y={380} width={3} height={182} fill={neon.violetSoft} opacity={0.55} filter={ref(id("glow"))} />
            <rect x={1226} y={300} width={3} height={262} fill={neon.cyanSoft} opacity={0.55} filter={ref(id("glow"))} />
            <rect x={600} y={HORIZON - 40} width={1020} height={50} fill={ref(id("haze"))} opacity={0.7} />
          </g>
        ),
      },
      {
        key: "ground",
        depth: 0.12,
        box: [0, 540, 1600, 460],
        content: (
          <g>
            <rect x={-300} y={HORIZON} width={2200} height={600} fill={ref(id("ground"))} />
            <PerspectiveGrid id={id} horizon={HORIZON + 22} bottom={1000} vanishX={1120} left={-300} right={1900} spacing={110} depths={14} />
            <rect x={-300} y={HORIZON + 2} width={2200} height={20} fill="#0a1236" />
            <ellipse cx={1100} cy={HORIZON + 12} rx={1150} ry={18} fill={ref(id("pool-cyan"))} />
            <path d={`M-300 ${HORIZON}H1900`} stroke={neon.cyanSoft} strokeOpacity={0.55} strokeWidth={1.5} />
            <ellipse cx={1010} cy={890} rx={310} ry={66} fill="none" stroke={neon.cyan} strokeOpacity={0.3} strokeWidth={2} />
            <ellipse cx={1010} cy={890} rx={190} ry={40} fill="none" stroke={neon.violetSoft} strokeOpacity={0.35} strokeWidth={1.5} />
            <RouteBase d={ROUTE_VAN} />
            <RouteBase d={ROUTE_FAR} color={neon.violet} />
            <GroundPin id={id} x={480} y={640} size={10} tone="violet" pulse={false} />
            <GroundPin id={id} x={1330} y={628} size={13} tone="violet" pulse={false} />
            <GroundPin id={id} x={1520} y={690} size={12} tone="cyan" pulse={false} />
            <GroundPin id={id} x={1010} y={886} size={22} tone="cyan" pulse={false}>
              <circle cx={1010} cy={836.5} r={4} fill={neon.cyanSoft} />
            </GroundPin>
          </g>
        ),
      },
      {
        // Everything that loops on the floor, kept free of filters so repaints stay cheap.
        key: "ground-fx",
        depth: 0.12,
        box: [0, 540, 1600, 460],
        content: (
          <g>
            <LightTrails animated={animated} />
            <ellipse cx={1010} cy={890} rx={310} ry={66} fill="none" stroke={neon.cyan} strokeOpacity={0.55} strokeWidth={2} strokeDasharray="10 14" className={animated ? s.dashSlow : undefined} />
            <RouteFlow d={ROUTE_VAN} animated={animated} />
            <RouteFlow d={ROUTE_FAR} animated={animated} />
            <PinPulse x={480} y={640} size={10} tone="violet" animated={animated} />
            <PinPulse x={1330} y={628} size={13} tone="violet" animated={animated} late />
            <PinPulse x={1520} y={690} size={12} animated={animated} />
            <PinPulse x={1010} y={886} size={22} animated={animated} late />
          </g>
        ),
      },
      {
        key: "vehicles",
        depth: 0,
        box: [680, 600, 920, 400],
        content: (
          <g>
            <Van id={id} x={740} y={640} scale={0.6} />
            <Car id={id} x={1082} y={792} scale={0.9} reflection />
          </g>
        ),
      },
      {
        key: "badge",
        depth: -0.14,
        box: [696, 420, 372, 150],
        loopClassName: animated ? s.floatSlow : undefined,
        content: <MechanicBadge id={id} x={712} y={440} scale={0.9} />,
      },
      {
        key: "quote",
        depth: -0.16,
        box: [1150, 46, 432, 364],
        loopClassName: animated ? s.float : undefined,
        content: <QuoteCard id={id} x={1176} y={72} scale={0.98} />,
      },
      {
        key: "chip",
        depth: -0.12,
        box: [1100, 600, 284, 100],
        loopClassName: animated ? s.bob : undefined,
        content: <SlotChip id={id} x={1112} y={616} scale={0.9} />,
      },
      {
        key: "fx",
        depth: -0.28,
        box: [600, 40, 1000, 940],
        content: (
          <g>
            <Particles seed={5} count={30} animated={animated} />
            <Leader d="M862 554C864 590 868 612 872 634" animated={animated} />
            <Leader d="M1290 384C1290 450 1270 530 1236 612" animated={animated} />
            <path d="M640 958L900 944" stroke={neon.cyanSoft} strokeOpacity={0.25} strokeWidth={1.5} />
            <path d="M1260 978L1600 964" stroke={neon.violetSoft} strokeOpacity={0.25} strokeWidth={1.5} />
          </g>
        ),
      },
    ],
  };
}

/**
 * Landing hero: night city with a holographic map floor, glowing routes and pins, a sleek
 * car, a mobile-mechanic van and floating glass UI cards (example quote, approved-mechanic
 * badge with a "New" chip, time slot). viewBox 1600 x 1000; the left ~42% is kept calm for
 * overlaid text.
 */
export function HeroScene({
  title = "A mobile mechanic heading to a car across a glowing city map",
  desc = "Night city skyline over a holographic map grid. A mechanic's van follows a glowing route to a parked electric car. Floating cards show an example itemized quote, an approved-mechanic badge marked New, and a Thursday 9:00 AM time slot.",
  decorative,
  className,
  animated = true,
  variant,
  fontFamily,
}: SceneProps) {
  const id = useSvgIds();
  return (
    <RenderScene
      scene={buildHeroScene(id, animated)}
      id={id}
      title={title}
      desc={desc}
      decorative={decorative}
      className={className}
      variant={variant}
      fontFamily={fontFamily}
    />
  );
}
