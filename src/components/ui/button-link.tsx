import Link from "next/link";
import type { ComponentProps } from "react";
import {
  ButtonContent,
  buttonClasses,
  type ButtonIconProps,
  type ButtonStyleProps,
} from "./button";

export type ButtonLinkProps = ComponentProps<typeof Link> & ButtonStyleProps & ButtonIconProps;

/** A next/link styled as a button. Use it for navigation; use Button for actions. */
export function ButtonLink({
  variant,
  size,
  fullWidth,
  leadingIcon,
  trailingIcon,
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={buttonClasses({ variant, size, fullWidth, className })} {...props}>
      <ButtonContent leadingIcon={leadingIcon} trailingIcon={trailingIcon}>
        {children}
      </ButtonContent>
    </Link>
  );
}
