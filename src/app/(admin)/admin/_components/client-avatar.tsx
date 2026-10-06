"use client";

import { Avatar, type AvatarProps } from "@/components/ui/avatar";

/**
 * The UI kit's Avatar, rendered from a Client Component. An <img> rendered by a Server
 * Component makes React add an image preload hint to the page's RSC payload; when the page
 * is only prefetched (hovering a link to it), those preloads go unused and the browser
 * warns about every profile photo.
 */
export function ClientAvatar(props: AvatarProps) {
  return <Avatar {...props} />;
}
