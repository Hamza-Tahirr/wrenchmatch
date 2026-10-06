// Ambient loops for the illustration system. Only transform and opacity are animated, and
// every loop stops under prefers-reduced-motion (the art stays fully visible). Loops inside
// an SVG repaint their layer (blur filters included) on every frame, so they pause while the
// page scrolls (`html[data-scrolling]`, set by the parallax scenes) and do not run at all on
// touch devices, where the scroll-linked parallax carries the motion instead. Loops on HTML
// layer wrappers run on the compositor and keep going everywhere.
//
// Delivered as a React 19 hoisted stylesheet (<style href precedence>): React inserts it once
// into <head> no matter how many illustrations render, in Server and Client Components alike,
// so the art never depends on a separately loaded CSS file.

const CSS = `
.wmi-float{animation:wmi-float 7s ease-in-out infinite}
.wmi-float-slow{animation:wmi-float 11s ease-in-out infinite;animation-delay:-3s}
.wmi-bob{animation:wmi-bob 5.5s ease-in-out infinite}
.wmi-twinkle,.wmi-twinkle-late,.wmi-pulse,.wmi-pulse-late,.wmi-spin{transform-box:fill-box;transform-origin:center}
.wmi-twinkle{animation:wmi-twinkle 3.4s ease-in-out infinite}
.wmi-twinkle-late{animation:wmi-twinkle 4.1s ease-in-out infinite;animation-delay:-1.7s}
.wmi-pulse{animation:wmi-pulse 2.8s cubic-bezier(.2,.7,.3,1) infinite}
.wmi-pulse-late{animation:wmi-pulse 2.8s cubic-bezier(.2,.7,.3,1) infinite;animation-delay:-1.4s}
.wmi-dash{animation:wmi-dash 2.4s linear infinite}
.wmi-dash-slow{animation:wmi-dash 6s linear infinite}
.wmi-spin{animation:wmi-spin 14s linear infinite}
.wmi-sweep{transform-box:view-box;animation:wmi-spin 5s linear infinite}
.wmi-scan{animation:wmi-scan 3.6s ease-in-out infinite}
@keyframes wmi-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes wmi-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@keyframes wmi-twinkle{0%,100%{opacity:.25;transform:scale(.7)}50%{opacity:1;transform:scale(1)}}
@keyframes wmi-pulse{0%{opacity:.85;transform:scale(.55)}100%{opacity:0;transform:scale(1.6)}}
@keyframes wmi-dash{to{stroke-dashoffset:-48}}
@keyframes wmi-spin{to{transform:rotate(360deg)}}
@keyframes wmi-scan{0%,100%{transform:translateY(0);opacity:.2}50%{transform:translateY(34px);opacity:.9}}
html[data-scrolling] svg [class*="wmi-"]{animation-play-state:paused}
@media (hover:none) and (pointer:coarse){
svg [class*="wmi-"]{animation:none}
svg .wmi-pulse,svg .wmi-pulse-late{opacity:.3}
svg .wmi-scan{opacity:.5}
}
[data-theme="light"] .wmi-daylight .wmi-night{display:none}
[data-theme="light"] .wmi-daylight .wmi-grid-stop{stop-color:#0e7490}
[data-theme="light"] .wmi-daylight .wmi-contour{stroke:#7c3aed;stroke-opacity:.2}
@media (prefers-reduced-motion:reduce){
.wmi-float,.wmi-float-slow,.wmi-bob,.wmi-twinkle,.wmi-twinkle-late,.wmi-pulse,.wmi-pulse-late,.wmi-dash,.wmi-dash-slow,.wmi-spin,.wmi-sweep,.wmi-scan{animation:none}
.wmi-pulse,.wmi-pulse-late{opacity:0}
}
`;

/** Class names for the ambient loops (apply them to SVG groups or HTML layer wrappers). */
export const ambient = {
  float: "wmi-float",
  floatSlow: "wmi-float-slow",
  bob: "wmi-bob",
  twinkle: "wmi-twinkle",
  twinkleLate: "wmi-twinkle-late",
  pulse: "wmi-pulse",
  pulseLate: "wmi-pulse-late",
  dash: "wmi-dash",
  dashSlow: "wmi-dash-slow",
  spin: "wmi-spin",
  sweep: "wmi-sweep",
  scan: "wmi-scan",
} as const;

/** Renders the shared stylesheet once per document (React hoists and de-duplicates it). */
export function AmbientStyles() {
  return (
    <style href="wm-illustration-ambient" precedence="default">
      {CSS}
    </style>
  );
}
