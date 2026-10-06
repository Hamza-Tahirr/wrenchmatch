"use client";

import type { ComponentProps, MouseEvent } from "react";

import { prefersReducedMotion } from "@/components/motion/hydration";
import { ButtonContent, buttonClasses, type ButtonIconProps, type ButtonStyleProps } from "@/components/ui/button";

/**
 * Scrolls a same-page target into view (clear of the sticky header via scroll-padding) and
 * moves focus to `focusTarget` (the target by default; give it tabIndex -1), without a
 * history entry: a #hash navigation fires popstate, which the top progress bar reads as a
 * page load.
 */
export function jumpTo(target: HTMLElement, focusTarget: HTMLElement | null = target): void {
  target.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  focusTarget?.focus({ preventScroll: true });
}

/** Whether a link click is a plain one (new-tab and other modified clicks keep the browser's behaviour). */
export function isPlainClick(event: MouseEvent<Element>): boolean {
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

type JumpLinkProps = Omit<ComponentProps<"a">, "href" | "onClick"> &
  ButtonStyleProps &
  ButtonIconProps & {
    /** An element id on the same page, e.g. "#job-quote-title". */
    href: `#${string}`;
  };

/**
 * A same-page jump styled as a button. It scrolls at once with jumpTo instead of queueing a
 * client-side navigation the way next/link does; before hydration the plain anchor works.
 */
export function JumpLink({ variant, size, fullWidth, leadingIcon, trailingIcon, className, children, ...props }: JumpLinkProps) {
  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!isPlainClick(event)) return;
    const target = document.getElementById(decodeURIComponent(props.href.slice(1)));
    if (!target) return;
    event.preventDefault();
    jumpTo(target);
  }
  return (
    <a className={buttonClasses({ variant, size, fullWidth, className })} onClick={onClick} {...props}>
      <ButtonContent leadingIcon={leadingIcon} trailingIcon={trailingIcon}>
        {children}
      </ButtonContent>
    </a>
  );
}
