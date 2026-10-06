// Shared class names for the admin console's touch layout (safe on server and client).

/**
 * Raises a control to a 44px tap target on phones and touch screens. The UI kit's "sm" and
 * "md" buttons are 36-40px tall, which is fine for a mouse but small for a thumb. Pass it as
 * `className` (or `triggerClassName`); it only sets a minimum height, so it never fights the
 * component's own colors or padding.
 */
export const TAP_TARGET = "max-sm:min-h-11 pointer-coarse:min-h-11";

/** The same for square icon buttons (also widens them to 44px). */
export const TAP_TARGET_SQUARE = "max-sm:size-11 pointer-coarse:size-11";

/**
 * A row of filter or navigation pills that scrolls sideways on narrow screens instead of
 * wrapping onto several lines; the edges fade to show there is more to scroll.
 */
export const SCROLL_ROW =
  "flex snap-x snap-proximity gap-2 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/** Fades the left and right edges of a sideways-scrolling row. */
export const SCROLL_FADE =
  "[mask-image:linear-gradient(to_right,transparent,#000_1rem,#000_calc(100%-1rem),transparent)]";
