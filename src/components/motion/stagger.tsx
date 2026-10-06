import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

import type { EntranceTag } from "./entrance";

type StaggerProps = Omit<HTMLAttributes<HTMLElement>, "children"> & {
  as?: EntranceTag;
  /**
   * "mount" (default): direct children slide up one after another (60 ms apart, CSS only).
   * "inView": each direct child reveals as it scrolls into view (CSS scroll timeline).
   */
  trigger?: "mount" | "inView";
  children?: ReactNode;
};

/**
 * Staggered entrance for a list or grid. Server-safe (pure CSS); the stagger applies to
 * direct children, so `StaggerItem` is optional (it only marks the item for reduced motion).
 *
 *   <Stagger as="ul" className="grid gap-4 sm:grid-cols-2">
 *     {items.map((item) => <StaggerItem as="li" key={item.id}>…</StaggerItem>)}
 *   </Stagger>
 */
export function Stagger({ as: Tag = "div", trigger = "mount", className, children, ...rest }: StaggerProps) {
  return (
    <Tag {...rest} className={cn(trigger === "mount" ? "stagger-children" : "stagger-reveal", className)}>
      {children}
    </Tag>
  );
}

type StaggerItemProps = Omit<HTMLAttributes<HTMLElement>, "children"> & {
  as?: EntranceTag;
  children?: ReactNode;
};

export function StaggerItem({ as: Tag = "div", className, children, ...rest }: StaggerItemProps) {
  return (
    <Tag {...rest} data-reveal="" className={className}>
      {children}
    </Tag>
  );
}
