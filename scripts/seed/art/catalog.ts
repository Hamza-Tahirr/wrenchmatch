// Every generated photo the sample data uses, by key. Each entry draws one 1600 x 1200 scene
// (rendered at 1200 x 900); the same key always draws the same picture.
import { brakeCloseupScene, suspensionScene } from "./scenes-brakes";
import { dashboardScene, scanToolScene } from "./scenes-cabin";
import { airFilterScene, batteryScene, coilPackScene } from "./scenes-engine";
import { drivewayScene, headlightScene, wiperScene } from "./scenes-exterior";
import { wheelScene } from "./scenes-wheel";

export const SCENES = {
  "wheel-worn": () => wheelScene({ paint: "#1f4e79", wear: "worn" }),
  "wheel-new": () => wheelScene({ paint: "#b91c1c", wear: "new", seed: 9 }),
  "wheel-silver": () => wheelScene({ paint: "#64748b", wear: "new", seed: 12 }),
  "brake-worn": () => brakeCloseupScene({ wear: "worn" }),
  "brake-new": () => brakeCloseupScene({ wear: "new", caliper: "#b91c1c" }),
  "suspension-worn": () => suspensionScene({ wear: "worn" }),
  "suspension-new": () => suspensionScene({ wear: "new" }),
  "dash-check-engine": () => dashboardScene("check_engine"),
  "dash-no-start": () => dashboardScene("no_start"),
  "dash-oil-life": () => dashboardScene("oil_life"),
  "dash-all-clear": () => dashboardScene("all_clear"),
  "scan-tool": () => scanToolScene(),
  "battery-corroded": () => batteryScene("corroded"),
  "battery-worn": () => batteryScene("worn"),
  "battery-new": () => batteryScene("new"),
  "coils-cracked": () => coilPackScene("cracked"),
  "coils-new": () => coilPackScene("new"),
  "filter-dirty": () => airFilterScene("dirty"),
  "filter-compare": () => airFilterScene("compare"),
  "headlight-out": () => headlightScene("out"),
  "headlight-on": () => headlightScene("on"),
  "wiper-worn": () => wiperScene("worn"),
  "wiper-new": () => wiperScene("new"),
  "driveway-hazards": () => drivewayScene({ vehicle: "sedan", paint: "#9ca3af", setting: "home", hazards: true }),
  "driveway-ready": () => drivewayScene({ vehicle: "sedan", paint: "#1d4ed8", setting: "home", seed: 89 }),
  "jobsite-pickup": () => drivewayScene({ vehicle: "pickup", paint: "#f1f5f9", setting: "jobsite" }),
} as const satisfies Record<string, () => string>;

export type SceneKey = keyof typeof SCENES;
