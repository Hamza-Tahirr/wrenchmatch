import type { ReactNode } from "react";

import { ambient as s } from "./ambient";
import { Van, VehicleDefs } from "./parts";
import { ink, neon, toneColors, type Tone } from "./palette";
import {
  BlurFilter,
  GlassDefs,
  GlowFilter,
  IllustrationSvg,
  LinearGradient,
  RadialGradient,
  gearPath,
  pinPath,
  ref,
  useSvgIds,
  type IllustrationProps,
} from "./svg-kit";

// Spot illustrations for empty, success and error states. One shared composition: a
// holographic projector platform with a floating glass object, neon edges and a soft aura.
// viewBox 240 x 180 (4:3). Size them with a width class, e.g. `w-40 sm:w-48`.

type Ids = (name: string) => string;

type SpotFrameProps = IllustrationProps & {
  id: Ids;
  tone: Tone;
  defaultTitle: string;
  defaultDesc: string;
  /** Extra gradients/filters for the object. */
  defs?: ReactNode;
  children: ReactNode;
};

const STARS: ReadonlyArray<readonly [number, number, number, boolean]> = [
  [34, 38, 1.2, true],
  [58, 20, 0.9, false],
  [196, 28, 1.3, true],
  [216, 62, 0.8, false],
  [22, 96, 0.8, false],
  [210, 112, 1.1, true],
  [176, 14, 0.7, false],
  [44, 132, 0.9, true],
];

function sparkle(x: number, y: number, size: number): string {
  const k = size * 0.28;
  return `M${x} ${y - size}L${x + k} ${y - k}L${x + size} ${y}L${x + k} ${y + k}L${x} ${y + size}L${x - k} ${y + k}L${x - size} ${y}L${x - k} ${y - k}Z`;
}

function SpotFrame({
  id,
  tone,
  title,
  desc,
  decorative,
  className,
  animated = true,
  defaultTitle,
  defaultDesc,
  defs,
  children,
}: SpotFrameProps) {
  const c = toneColors[tone];
  return (
    <IllustrationSvg
      viewBox="0 0 240 180"
      id={id}
      title={title ?? defaultTitle}
      desc={desc ?? defaultDesc}
      decorative={decorative}
      className={className}
    >
      <defs>
        <RadialGradient
          id={id("aura")}
          units="userSpaceOnUse"
          cx={120}
          cy={90}
          r={88}
          stops={[
            [0, c.main, 0.3],
            [0.45, c.alt, 0.1],
            [1, c.alt, 0],
          ]}
        />
        <RadialGradient
          id={id("plat")}
          stops={[
            [0, c.soft, 0.75],
            [0.45, c.main, 0.28],
            [1, c.main, 0],
          ]}
        />
        <LinearGradient
          id={id("beam")}
          x1={0}
          y1={1}
          x2={0}
          y2={0}
          stops={[
            [0, c.main, 0.26],
            [0.7, c.main, 0.05],
            [1, c.main, 0],
          ]}
        />
        <LinearGradient
          id={id("accent")}
          x1={0}
          y1={0}
          x2={1}
          y2={1}
          stops={[
            [0, c.soft, 1],
            [1, c.main, 1],
          ]}
        />
        <GlassDefs id={id} />
        <GlowFilter id={id("glow")} blur={3.2} />
        <BlurFilter id={id("blur")} blur={6} />
        {defs}
      </defs>
      <circle cx={120} cy={90} r={88} fill={ref(id("aura"))} />
      {STARS.map(([x, y, r, twinkles], index) => (
        <circle
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          r={r}
          fill={index % 2 ? ink.ice : c.soft}
          opacity={0.75}
          className={animated && twinkles ? (index % 3 ? s.twinkle : s.twinkleLate) : undefined}
        />
      ))}
      <ellipse cx={120} cy={153} rx={86} ry={16} fill={ref(id("plat"))} />
      <ellipse cx={120} cy={153} rx={66} ry={11.5} fill="none" stroke={c.main} strokeOpacity={0.6} />
      <ellipse
        cx={120}
        cy={153}
        rx={44}
        ry={7.5}
        fill="none"
        stroke={c.alt}
        strokeOpacity={0.7}
        strokeDasharray="2 5"
        className={animated ? s.dashSlow : undefined}
      />
      <path d="M80 153 L99 60 H141 L160 153 Z" fill={ref(id("beam"))} />
      <g className={animated ? s.float : undefined}>{children}</g>
      <path d={sparkle(186, 46, 5)} fill={c.soft} className={animated ? s.twinkle : undefined} />
      <path d={sparkle(56, 70, 3.5)} fill={ink.ice} className={animated ? s.twinkleLate : undefined} />
    </IllustrationSvg>
  );
}

/** Glass card with a luminous edge and a top sheen. */
function GlassCard({ id, x, y, width, height, radius = 10 }: { id: Ids; x: number; y: number; width: number; height: number; radius?: number }) {
  return (
    <>
      <rect x={x} y={y + 6} width={width} height={height} rx={radius} fill={ink.void} opacity={0.45} filter={ref(id("blur"))} />
      <rect x={x} y={y} width={width} height={height} rx={radius} fill={ref(id("glass"))} />
      <rect x={x} y={y} width={width} height={height} rx={radius} fill={ref(id("sheen"))} />
      <rect
        x={x + 0.6}
        y={y + 0.6}
        width={width - 1.2}
        height={height - 1.2}
        rx={radius - 0.6}
        fill="none"
        stroke={ref(id("edge"))}
        strokeWidth={1.3}
      />
    </>
  );
}

function TextLine({ x, y, width, color = ink.ice, opacity = 0.2 }: { x: number; y: number; width: number; color?: string; opacity?: number }) {
  return <rect x={x} y={y} width={width} height={4} rx={2} fill={color} opacity={opacity} />;
}

export function NoRequests(props: IllustrationProps) {
  const id = useSvgIds();
  return (
    <SpotFrame
      {...props}
      id={id}
      tone="cyan"
      defaultTitle="No repair requests yet"
      defaultDesc="A blank holographic request form floating above a glowing platform."
    >
      <GlassCard id={id} x={84} y={36} width={72} height={94} />
      <rect x={105} y={30} width={30} height={12} rx={4} fill={ink.steel} stroke={neon.cyanSoft} strokeOpacity={0.75} />
      <circle cx={120} cy={36} r={2} fill={neon.cyanSoft} />
      <path
        d="M100 67c0-3 2-5 5-5.5l5-5c1.5-1.5 3.5-2.5 6-2.5h9c2.5 0 4.5 1 6 2.5l5 5c3 .5 5 2.5 5 5.5v2.5h-41z"
        fill={ref(id("accent"))}
        opacity={0.9}
      />
      <circle cx={109} cy={70} r={3.4} fill={ink.deep} stroke={neon.cyanSoft} strokeWidth={1.3} />
      <circle cx={131} cy={70} r={3.4} fill={ink.deep} stroke={neon.cyanSoft} strokeWidth={1.3} />
      <TextLine x={96} y={82} width={48} opacity={0.24} />
      <TextLine x={96} y={92} width={38} opacity={0.16} />
      <TextLine x={96} y={102} width={44} opacity={0.16} />
      <TextLine x={96} y={112} width={22} color={neon.cyan} opacity={0.55} />
      <g filter={ref(id("glow"))}>
        <circle cx={154} cy={124} r={13} fill={ref(id("accent"))} />
      </g>
      <path d="M154 118v12M148 124h12" stroke={ink.deep} strokeWidth={2.8} strokeLinecap="round" />
    </SpotFrame>
  );
}

function zigzagReceipt(x: number, y: number, width: number, height: number, tooth: number): string {
  const bottom = y + height;
  const parts = [`M${x + 6} ${y}`, `H${x + width - 6}`, `A6 6 0 0 1 ${x + width} ${y + 6}`, `V${bottom}`];
  const steps = Math.round(width / tooth);
  for (let i = 1; i <= steps; i += 1) {
    const px = x + width - (width / steps) * i;
    parts.push(`L${px.toFixed(1)} ${i % 2 ? bottom + 4.5 : bottom}`);
  }
  parts.push(`V${y + 6}`, `A6 6 0 0 1 ${x + 6} ${y}`, "Z");
  return parts.join(" ");
}

export function NoQuotes(props: IllustrationProps) {
  const id = useSvgIds();
  const receipt = zigzagReceipt(86, 34, 70, 92, 5.8);
  return (
    <SpotFrame
      {...props}
      id={id}
      tone="violet"
      defaultTitle="No quotes yet"
      defaultDesc="An empty itemized quote with a small clock, waiting for mechanics to reply."
    >
      <g transform="rotate(-9 104 92)" opacity={0.55}>
        <path d={zigzagReceipt(70, 42, 62, 80, 5.2)} fill={ref(id("glass"))} stroke={neon.violetSoft} strokeOpacity={0.5} />
      </g>
      <path d={receipt} fill={ink.void} opacity={0.4} transform="translate(0 6)" filter={ref(id("blur"))} />
      <path d={receipt} fill={ref(id("glass"))} />
      <path d={receipt} fill={ref(id("sheen"))} />
      <path d={receipt} fill="none" stroke={ref(id("edge"))} strokeWidth={1.3} />
      <rect x={96} y={44} width={26} height={5} rx={2.5} fill={neon.violetSoft} opacity={0.8} />
      <TextLine x={96} y={54} width={40} opacity={0.14} />
      {[68, 80, 92].map((lineY) => (
        <g key={lineY}>
          <rect x={96} y={lineY} width={30} height={5} rx={2.5} fill="none" stroke={ink.ice} strokeOpacity={0.35} strokeDasharray="2.5 2.5" />
          <rect x={132} y={lineY} width={14} height={5} rx={2.5} fill="none" stroke={neon.violetSoft} strokeOpacity={0.6} strokeDasharray="2.5 2.5" />
        </g>
      ))}
      <path d="M96 104.5H146" stroke={ink.ice} strokeOpacity={0.2} />
      <rect x={96} y={110} width={18} height={6} rx={3} fill={ink.ice} opacity={0.3} />
      <rect x={128} y={110} width={18} height={6} rx={3} fill="none" stroke={neon.cyanSoft} strokeOpacity={0.8} strokeDasharray="2.5 2.5" />
      <g filter={ref(id("glow"))}>
        <circle cx={154} cy={118} r={14} fill={ink.navy} stroke={neon.cyan} strokeWidth={1.8} />
      </g>
      <path d="M154 110.5V118l5 3.5" fill="none" stroke={neon.cyanSoft} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </SpotFrame>
  );
}

export function NoJobs(props: IllustrationProps) {
  const id = useSvgIds();
  const animated = props.animated ?? true;
  return (
    <SpotFrame
      {...props}
      id={id}
      tone="cyan"
      defaultTitle="No jobs yet"
      defaultDesc="A holographic radar scanning the area for repair jobs."
      defs={
        <LinearGradient
          id={id("sweep")}
          x1={0}
          y1={0}
          x2={1}
          y2={0}
          stops={[
            [0, neon.cyan, 0],
            [1, neon.cyan, 0.55],
          ]}
        />
      }
    >
      <circle cx={120} cy={86} r={50} fill={ink.navy} opacity={0.82} />
      <circle cx={120} cy={86} r={50} fill={ref(id("sheen"))} />
      <circle cx={120} cy={86} r={50} fill="none" stroke={ref(id("edge"))} strokeWidth={1.6} />
      <circle cx={120} cy={86} r={35} fill="none" stroke={neon.cyan} strokeOpacity={0.3} />
      <circle cx={120} cy={86} r={20} fill="none" stroke={neon.cyan} strokeOpacity={0.3} />
      <path d="M70 86H170M120 36V136" stroke={neon.cyan} strokeOpacity={0.18} />
      <g className={animated ? s.sweep : undefined} style={{ transformOrigin: "120px 86px" }}>
        <path d="M120 86L170 86A50 50 0 0 0 155.4 50.6Z" fill={ref(id("sweep"))} />
        <path d="M120 86L170 86" stroke={neon.cyanSoft} strokeWidth={1.4} strokeOpacity={0.9} />
      </g>
      <circle cx={146} cy={66} r={3} fill={neon.violetSoft} opacity={0.7} />
      <circle cx={146} cy={66} r={7} fill="none" stroke={neon.violetSoft} className={animated ? s.pulse : undefined} />
      <circle cx={120} cy={86} r={13} fill={ink.navy2} stroke={neon.cyanSoft} strokeWidth={1.4} />
      <g transform="rotate(-45 120 86)">
        <rect x={108} y={84} width={17} height={4.4} rx={2.2} fill={neon.cyanSoft} />
        <circle cx={127} cy={86} r={5.4} fill={neon.cyanSoft} />
        <rect x={127} y={84.2} width={6} height={3.6} fill={ink.navy2} />
      </g>
    </SpotFrame>
  );
}

export function NoBookings(props: IllustrationProps) {
  const id = useSvgIds();
  const cells: Array<[number, number]> = [];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 4; col += 1) cells.push([95 + col * 14, 70 + row * 15]);
  }
  return (
    <SpotFrame
      {...props}
      id={id}
      tone="violet"
      defaultTitle="No bookings yet"
      defaultDesc="A holographic calendar with an open time slot."
      defs={
        <LinearGradient
          id={id("band")}
          stops={[
            [0, neon.violet, 0.95],
            [1, neon.cyan, 0.85],
          ]}
        />
      }
    >
      <GlassCard id={id} x={82} y={40} width={76} height={86} radius={11} />
      <path d="M82 51a11 11 0 0 1 11-11h54a11 11 0 0 1 11 11v8H82z" fill={ref(id("band"))} opacity={0.9} />
      <rect x={100} y={33} width={5} height={13} rx={2.5} fill={ink.ice} />
      <rect x={135} y={33} width={5} height={13} rx={2.5} fill={ink.ice} />
      {cells.map(([x, y], index) =>
        index === 6 ? null : (
          <rect key={`${x}-${y}`} x={x} y={y} width={9} height={9} rx={2.4} fill={ink.ice} opacity={index % 5 === 0 ? 0.22 : 0.1} />
        ),
      )}
      <g filter={ref(id("glow"))}>
        <rect x={123} y={85} width={9} height={9} rx={2.4} fill="none" stroke={neon.cyanSoft} strokeWidth={1.4} strokeDasharray="2 2" />
      </g>
      <g filter={ref(id("glow"))}>
        <circle cx={154} cy={120} r={12} fill={ink.navy} stroke={neon.violetSoft} strokeWidth={1.6} />
      </g>
      <path d="M154 114.5v11M148.5 120h11" stroke={neon.violetSoft} strokeWidth={2.2} strokeLinecap="round" />
    </SpotFrame>
  );
}

export function NoNotifications(props: IllustrationProps) {
  const id = useSvgIds();
  const animated = props.animated ?? true;
  const bell =
    "M120 44c-17 0-29 13-29 31v14c0 7-3.5 11-9 15v4h76v-4c-5.5-4-9-8-9-15v-14c0-18-12-31-29-31z";
  return (
    <SpotFrame
      {...props}
      id={id}
      tone="cyan"
      defaultTitle="No notifications"
      defaultDesc="A quiet holographic bell."
    >
      <path d={bell} fill={ink.void} opacity={0.45} transform="translate(0 6)" filter={ref(id("blur"))} />
      <path d={bell} fill={ref(id("glass"))} />
      <path d={bell} fill={ref(id("sheen"))} />
      <path d={bell} fill="none" stroke={ref(id("edge"))} strokeWidth={1.5} />
      <path d="M100 76c0-10 6-17 14-19" fill="none" stroke={ink.ice} strokeOpacity={0.45} strokeWidth={2} strokeLinecap="round" />
      <circle cx={120} cy={41} r={4} fill="none" stroke={neon.cyanSoft} strokeWidth={1.8} />
      <g filter={ref(id("glow"))}>
        <ellipse cx={120} cy={116} rx={8} ry={6} fill={neon.cyan} />
      </g>
      <g fill={neon.cyanSoft} fontWeight={700} opacity={0.85}>
        <text x={150} y={58} fontSize={13} className={animated ? s.twinkle : undefined}>
          z
        </text>
        <text x={160} y={44} fontSize={10} className={animated ? s.twinkleLate : undefined}>
          z
        </text>
      </g>
    </SpotFrame>
  );
}

export function NoResults(props: IllustrationProps) {
  const id = useSvgIds();
  return (
    <SpotFrame
      {...props}
      id={id}
      tone="violet"
      defaultTitle="No results"
      defaultDesc="A magnifying glass over an empty holographic grid."
      defs={
        <>
          <RadialGradient
            id={id("lens")}
            cx={0.38}
            cy={0.32}
            r={0.75}
            stops={[
              [0, neon.cyanSoft, 0.35],
              [0.55, neon.violet, 0.12],
              [1, ink.navy, 0.7],
            ]}
          />
          <LinearGradient
            id={id("handle")}
            stops={[
              [0, neon.violetSoft, 1],
              [1, neon.violet, 1],
            ]}
          />
        </>
      }
    >
      <g opacity={0.5}>
        {[0, 1, 2].map((row) =>
          [0, 1, 2, 3].map((col) => (
            <rect
              key={`${row}-${col}`}
              x={70 + col * 26}
              y={52 + row * 22}
              width={20}
              height={14}
              rx={3}
              fill="none"
              stroke={ink.mist}
              strokeOpacity={0.4}
              strokeDasharray="3 3"
            />
          )),
        )}
      </g>
      <path d="M134 104l24 24" stroke={ink.void} strokeOpacity={0.45} strokeWidth={13} strokeLinecap="round" filter={ref(id("blur"))} />
      <path d="M134 104l24 24" stroke={ref(id("handle"))} strokeWidth={10} strokeLinecap="round" />
      <circle cx={114} cy={82} r={31} fill={ref(id("lens"))} />
      <circle cx={114} cy={82} r={31} fill="none" stroke={ref(id("edge"))} strokeWidth={5} />
      <path d="M96 72a20 20 0 0 1 14-12" fill="none" stroke={ink.white} strokeOpacity={0.6} strokeWidth={2.5} strokeLinecap="round" />
      <text x={114} y={94} textAnchor="middle" fontSize={32} fontWeight={700} fill={neon.cyanSoft} filter={ref(id("glow"))}>
        ?
      </text>
    </SpotFrame>
  );
}

export function Success(props: IllustrationProps) {
  const id = useSvgIds();
  const animated = props.animated ?? true;
  const confetti: ReadonlyArray<readonly [number, number, number, string]> = [
    [72, 50, 20, neon.cyan],
    [168, 44, -25, neon.violetSoft],
    [62, 102, 40, neon.amber],
    [176, 98, -10, neon.green],
    [94, 30, 65, neon.magenta],
    [150, 26, 15, neon.cyanSoft],
  ];
  return (
    <SpotFrame
      {...props}
      id={id}
      tone="emerald"
      defaultTitle="Done"
      defaultDesc="A glowing check mark inside luminous rings."
      defs={
        <RadialGradient
          id={id("disc")}
          cx={0.4}
          cy={0.35}
          r={0.7}
          stops={[
            [0, neon.greenSoft, 0.55],
            [0.6, "#0f766e", 0.55],
            [1, ink.navy, 0.9],
          ]}
        />
      }
    >
      <circle cx={120} cy={84} r={44} fill="none" stroke={neon.green} strokeOpacity={0.25} strokeWidth={1} />
      <circle cx={120} cy={84} r={44} fill="none" stroke={neon.green} strokeOpacity={0.6} className={animated ? s.pulse : undefined} />
      <circle cx={120} cy={84} r={34} fill={ref(id("disc"))} />
      <circle cx={120} cy={84} r={34} fill="none" stroke={ref(id("edge"))} strokeWidth={1.6} />
      <g filter={ref(id("glow"))}>
        <path d="M103 85l11 11 23-25" fill="none" stroke={ink.white} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {confetti.map(([x, y, angle, color], index) => (
        <rect
          key={`${x}-${y}`}
          x={x - 3}
          y={y - 1.5}
          width={6}
          height={3}
          rx={1}
          fill={color}
          transform={`rotate(${angle} ${x} ${y})`}
          className={animated ? (index % 2 ? s.twinkle : s.twinkleLate) : undefined}
        />
      ))}
    </SpotFrame>
  );
}

export function NotFound(props: IllustrationProps) {
  const id = useSvgIds();
  const animated = props.animated ?? true;
  return (
    <SpotFrame
      {...props}
      id={id}
      tone="violet"
      defaultTitle="Page not found"
      defaultDesc="A map pin with a question mark beside a route that ends nowhere."
      defs={
        <LinearGradient
          id={id("pin")}
          x1={0}
          y1={0}
          x2={0.6}
          y2={1}
          stops={[
            [0, neon.violetSoft, 1],
            [1, neon.violet, 1],
          ]}
        />
      }
    >
      <path
        d="M52 140C70 120 64 104 84 98S118 108 126 94"
        fill="none"
        stroke={neon.cyan}
        strokeOpacity={0.75}
        strokeWidth={2.2}
        strokeDasharray="5 6"
        strokeLinecap="round"
        className={animated ? s.dash : undefined}
      />
      <path d="M166 120l8 8M174 120l-8 8" stroke={neon.rose} strokeWidth={2.4} strokeLinecap="round" opacity={0.85} />
      <path d="M134 98C146 104 152 112 160 118" fill="none" stroke={neon.cyan} strokeOpacity={0.3} strokeWidth={2} strokeDasharray="2 7" strokeLinecap="round" />
      <ellipse cx={120} cy={130} rx={18} ry={4.5} fill={neon.violet} opacity={0.35} filter={ref(id("blur"))} />
      <g filter={ref(id("glow"))}>
        <path d={pinPath(120, 62, 22)} fill={ref(id("pin"))} />
      </g>
      <path d={pinPath(120, 62, 22)} fill={ref(id("sheen"))} />
      <circle cx={120} cy={62} r={13} fill={ink.navy} />
      <text x={120} y={69} textAnchor="middle" fontSize={19} fontWeight={700} fill={neon.cyanSoft}>
        ?
      </text>
    </SpotFrame>
  );
}

export function ServerError(props: IllustrationProps) {
  const id = useSvgIds();
  const animated = props.animated ?? true;
  return (
    <SpotFrame
      {...props}
      id={id}
      tone="amber"
      defaultTitle="Something went wrong"
      defaultDesc="A holographic gear with an amber warning sign."
      defs={
        <LinearGradient
          id={id("warn")}
          x1={0}
          y1={0}
          x2={0}
          y2={1}
          stops={[
            [0, "#fde68a", 1],
            [1, neon.orange, 1],
          ]}
        />
      }
    >
      <g className={animated ? s.spin : undefined}>
        <path d={gearPath(110, 76, 38, 30, 10)} fill={ref(id("glass"))} stroke={ref(id("edge"))} strokeWidth={1.4} />
        <circle cx={110} cy={76} r={13} fill={ink.deep} stroke={neon.cyanSoft} strokeOpacity={0.6} />
      </g>
      <path d="M86 52l6 4M80 62l7 1M92 44l3 6" stroke={neon.amber} strokeWidth={1.6} strokeLinecap="round" opacity={0.8} />
      <g filter={ref(id("glow"))}>
        <path d="M146 82L170 124H122Z" fill={ref(id("warn"))} stroke="#fef3c7" strokeWidth={2} strokeLinejoin="round" />
      </g>
      <path d="M146 96v13" stroke={ink.deep} strokeWidth={3.6} strokeLinecap="round" />
      <circle cx={146} cy={116} r={2.3} fill={ink.deep} />
    </SpotFrame>
  );
}

export function UploadPhotos(props: IllustrationProps) {
  const id = useSvgIds();
  const animated = props.animated ?? true;
  return (
    <SpotFrame
      {...props}
      id={id}
      tone="cyan"
      defaultTitle="Add photos"
      defaultDesc="Holographic photo cards with an upload arrow."
      defs={
        <>
          <LinearGradient
            id={id("sky")}
            x1={0}
            y1={0}
            x2={0}
            y2={1}
            stops={[
              [0, neon.violet, 0.75],
              [1, neon.cyan, 0.45],
            ]}
          />
          <LinearGradient
            id={id("hill")}
            x1={0}
            y1={0}
            x2={1}
            y2={1}
            stops={[
              [0, neon.cyanSoft, 0.95],
              [1, neon.blue, 0.8],
            ]}
          />
        </>
      }
    >
      <g transform="rotate(-11 98 92)">
        <GlassCard id={id} x={66} y={50} width={64} height={60} radius={8} />
        <rect x={72} y={56} width={52} height={38} rx={4} fill={ink.deep} opacity={0.8} />
        <path d="M72 88l14-12 10 8 10-10 18 14v6H72z" fill={neon.violetSoft} opacity={0.5} />
      </g>
      <g transform="rotate(7 132 96)">
        <GlassCard id={id} x={102} y={56} width={70} height={66} radius={9} />
        <rect x={108} y={62} width={58} height={42} rx={5} fill={ref(id("sky"))} />
        <circle cx={152} cy={73} r={5} fill="#fde68a" />
        <path d="M108 99l16-15 11 9 12-12 19 15v8a5 5 0 0 1-5 5H113a5 5 0 0 1-5-5z" fill={ref(id("hill"))} />
        <rect x={108} y={109} width={30} height={4} rx={2} fill={ink.ice} opacity={0.3} />
      </g>
      <g className={animated ? s.bob : undefined}>
        <g filter={ref(id("glow"))}>
          <circle cx={162} cy={46} r={15} fill={ref(id("accent"))} />
        </g>
        <path d="M162 53V39M155.5 45.5L162 39l6.5 6.5" fill="none" stroke={ink.deep} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </SpotFrame>
  );
}

export function AccessDenied(props: IllustrationProps) {
  const id = useSvgIds();
  const shield = "M120 32L156 45V80C156 104 140 121 120 131C100 121 84 104 84 80V45Z";
  return (
    <SpotFrame
      {...props}
      id={id}
      tone="violet"
      defaultTitle="Not available for this account"
      defaultDesc="A holographic shield with a lock."
      defs={
        <LinearGradient
          id={id("lock")}
          x1={0}
          y1={0}
          x2={0}
          y2={1}
          stops={[
            [0, "#fde68a", 1],
            [1, neon.amber, 1],
          ]}
        />
      }
    >
      <path d={shield} fill={ink.void} opacity={0.45} transform="translate(0 6)" filter={ref(id("blur"))} />
      <path d={shield} fill={ref(id("glass"))} />
      <path d={shield} fill={ref(id("sheen"))} />
      <path d={shield} fill="none" stroke={ref(id("edge"))} strokeWidth={1.8} />
      <path d="M120 41L148 51V80C148 98 136 112 120 120" fill="none" stroke={neon.cyanSoft} strokeOpacity={0.25} strokeWidth={1.2} />
      <path d="M111 80v-7a9 9 0 0 1 18 0v7" fill="none" stroke={ink.ice} strokeWidth={3.4} strokeLinecap="round" />
      <g filter={ref(id("glow"))}>
        <rect x={104} y={79} width={32} height={25} rx={5} fill={ref(id("lock"))} />
      </g>
      <circle cx={120} cy={89} r={3.4} fill={ink.deep} />
      <rect x={118.6} y={90} width={2.8} height={8} rx={1.4} fill={ink.deep} />
    </SpotFrame>
  );
}

/** Feature mini: a mobile-mechanic van on the projector pad (mobile or garage service). */
export function MobileServiceArt(props: IllustrationProps) {
  const id = useSvgIds();
  return (
    <SpotFrame
      {...props}
      id={id}
      tone="violet"
      defaultTitle="Mobile service"
      defaultDesc="A mechanic's van with a glowing roof light parked on a holographic pad."
      defs={<VehicleDefs id={id} />}
    >
      <Van id={id} x={44} y={86} scale={0.43} beam={false} />
      <path d="M193 125L238 104V152L193 131Z" fill={ref(id("beam-right"))} />
    </SpotFrame>
  );
}

/** Feature mini: an approximate-area ring around a pin (no exact addresses). */
export function ApproximateAreaArt(props: IllustrationProps) {
  const id = useSvgIds();
  const animated = props.animated ?? true;
  return (
    <SpotFrame
      {...props}
      id={id}
      tone="cyan"
      defaultTitle="Approximate area"
      defaultDesc="A map pin inside a dashed ring showing an approximate area instead of an exact address."
      defs={
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
      }
    >
      <ellipse cx={120} cy={122} rx={74} ry={22} fill={neon.cyan} fillOpacity={0.08} stroke={neon.cyan} strokeOpacity={0.6} strokeDasharray="5 6" className={animated ? s.dashSlow : undefined} />
      <ellipse cx={120} cy={122} rx={44} ry={13} fill="none" stroke={neon.violetSoft} strokeOpacity={0.6} />
      <path d="M60 100H180M76 86H164M60 138H180" stroke={ink.mist} strokeOpacity={0.25} strokeDasharray="2 6" />
      <g filter={ref(id("glow"))}>
        <path d={pinPath(120, 70, 20)} fill={ref(id("pin"))} />
      </g>
      <circle cx={120} cy={70} r={8} fill={ink.deep} />
    </SpotFrame>
  );
}

/** All spot illustrations by key, for data-driven empty states. */
export const spotIllustrations = {
  "no-requests": NoRequests,
  "no-quotes": NoQuotes,
  "no-jobs": NoJobs,
  "no-bookings": NoBookings,
  "no-notifications": NoNotifications,
  "no-results": NoResults,
  success: Success,
  "not-found": NotFound,
  "server-error": ServerError,
  "upload-photos": UploadPhotos,
  "access-denied": AccessDenied,
  "mobile-service": MobileServiceArt,
  "approximate-area": ApproximateAreaArt,
} as const;

export type SpotIllustrationName = keyof typeof spotIllustrations;

/** Render a spot illustration by name: `<SpotIllustration name="no-quotes" className="w-40" />`. */
export function SpotIllustration({ name, ...props }: IllustrationProps & { name: SpotIllustrationName }) {
  const Component = spotIllustrations[name];
  return <Component {...props} />;
}
