// Parallax primitives (Client Components, GPU transforms only, off under reduced motion).
// See docs/VISUALS.md for examples.

export { ParallaxScene, useMotionFactor, type ParallaxSceneProps } from "./parallax-scene";
export { ParallaxLayer, type ParallaxLayerProps } from "./parallax-layer";
export {
  PointerTilt,
  PointerTracker,
  Tilt,
  type PointerTiltProps,
  type PointerTrackerProps,
  type TiltProps,
} from "./pointer-tilt";
export { StickyScrollStory, type StickyScrollStoryProps, type StoryStep } from "./sticky-scroll-story";
export { LazyMount, type LazyMountProps } from "./lazy-mount";
export { useScrollActivity } from "./scroll-activity";
export { ParallaxContext, PointerContext, useFinePointer, useIsClient, type ParallaxEntrance } from "./context";
