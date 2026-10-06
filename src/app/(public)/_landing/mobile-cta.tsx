"use client";

import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";

import { ButtonLink } from "@/components/ui/button-link";
import { cn } from "@/lib/cn";

/**
 * Phones and tablets: once the hero's "Find a Mechanic" button has scrolled away, a slim bar
 * keeps it within thumb reach at the bottom of the screen. It slides away again over the
 * closing call to action and the footer, so it never covers them, and while it shows the
 * page keeps focused elements clear of it (scroll-padding-bottom). Hidden from lg up.
 */
export function MobileCta() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("hero-cta");
    if (!hero || typeof IntersectionObserver === "undefined") return;
    const ends = [document.getElementById("cta-title")?.closest("section"), document.querySelector("footer")].filter(
      (node): node is HTMLElement => node instanceof HTMLElement,
    );
    let heroPassed = false;
    const endsInView = new Set<Element>();
    const update = () => setVisible(heroPassed && endsInView.size === 0);

    const heroObserver = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      heroPassed = !entry.isIntersecting && entry.boundingClientRect.top < 0;
      update();
    });
    heroObserver.observe(hero);

    const endObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) endsInView.add(entry.target);
        else endsInView.delete(entry.target);
      }
      update();
    });
    ends.forEach((node) => endObserver.observe(node));

    return () => {
      heroObserver.disconnect();
      endObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const root = document.documentElement;
    const previous = root.style.scrollPaddingBottom;
    root.style.scrollPaddingBottom = "6rem";
    return () => {
      root.style.scrollPaddingBottom = previous;
    };
  }, [visible]);

  return (
    <div
      inert={!visible}
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] sm:px-6 lg:hidden",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-[115%] opacity-0",
      )}
    >
      <div className="mx-auto max-w-md rounded-[1.25rem] border border-line-strong bg-elevated/95 p-1.5 shadow-elevated">
        <ButtonLink href="/request" size="lg" fullWidth trailingIcon={<ArrowRight />}>
          Find a Mechanic
        </ButtonLink>
      </div>
    </div>
  );
}
