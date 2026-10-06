// Touch-friendly class names shared by the mechanic pages (Tailwind classes, so they are
// literal strings Tailwind can find).

/** Phones: design-system buttons at least 44 px tall (their md size is 40 px, sm 36 px). */
export const TAP = "max-sm:min-h-11";

/** TAP for every link and button inside an actions row (put it on the row). */
export const TAP_WITHIN = "max-sm:[&_a]:min-h-11 max-sm:[&_button]:min-h-11";

/** Phones: every button inside (icon buttons included) at least 44 x 44 px. */
export const TAP_BUTTONS = "max-sm:[&_button]:min-h-11 max-sm:[&_button]:min-w-11";

/**
 * A card title link that covers the whole card (a "stretched link"), so the card is one big
 * tap target. The card must be positioned (SelectableCard and GlowCard are); controls inside
 * the card that must stay clickable sit in a CARD_LAYER.
 */
export const CARD_LINK =
  "rounded-sm decoration-neon-cyan/60 underline-offset-4 hover:underline after:absolute after:inset-0 after:rounded-2xl after:content-['']";

/** Puts card controls (buttons, links) above a CARD_LINK's overlay. */
export const CARD_LAYER = "relative z-10";

/** On a form with a sticky action bar: focused fields scroll clear of the bar. */
export const BAR_CLEARANCE = "[&_input]:scroll-mb-28 [&_select]:scroll-mb-28 [&_textarea]:scroll-mb-28";

/**
 * Phones: on a shared Checkbox / CheckboxGroup, the whole option row (box, label and hint) is
 * the label's tap target, like the radio cards (the shared label alone is 36 px tall).
 */
export const CHECK_ROWS =
  "max-sm:[&_div:has(>input)]:relative max-sm:[&_label]:after:absolute max-sm:[&_label]:after:inset-0";
