import "server-only";

import Link from "next/link";

import { cn } from "@/lib/cn";
import { getViewer } from "@/server/auth/viewer";
import { UPLOAD_LIMITS } from "@/server/config";
import { createAppContext } from "@/server/context";
import { removeMyAvatarAction, setMyAvatarAction } from "@/server/media/actions";
import { getMyAvatar } from "@/server/media/avatar";
import { uploadBudgetFor } from "@/server/storage/config";

import { AvatarUploader } from "./avatar-uploader";

/**
 * Drop-in profile picture editor for the signed-in customer or admin (the /account/photo
 * page uses it). Mechanics are pointed to their profile photo, which is what customers see.
 */
export async function MyAvatar({ className }: { className?: string }) {
  const viewer = await getViewer();
  if (!viewer) return null;
  if (viewer.role === "mechanic") {
    return (
      <p className={cn("text-sm text-fg-muted", className)}>
        Customers see your profile photo.{" "}
        <Link href="/mechanic/profile" className="font-semibold text-brand-700 underline-offset-4 hover:underline">
          Change it on your profile
        </Link>
        .
      </p>
    );
  }
  const avatar = await getMyAvatar(createAppContext(), viewer);
  return (
    <div className={className}>
      <AvatarUploader
        name={viewer.displayName}
        currentSrc={avatar?.src ?? null}
        maxBytes={UPLOAD_LIMITS.user_avatar.maxBytes}
        budget={uploadBudgetFor("user_avatar")}
        setAction={setMyAvatarAction}
        removeAction={removeMyAvatarAction}
      />
    </div>
  );
}
