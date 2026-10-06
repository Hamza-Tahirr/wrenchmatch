"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import { isActivePath } from "./nav-items";

export type NavLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
  /** See NavItem.match. */
  match?: readonly string[];
};

/** A link that sets aria-current="page" on the current route; style it with `aria-[current=page]:`. */
export function NavLink({ href, match, ...props }: NavLinkProps) {
  const pathname = usePathname();
  return <Link href={href} aria-current={isActivePath(pathname, href, match) ? "page" : undefined} {...props} />;
}
