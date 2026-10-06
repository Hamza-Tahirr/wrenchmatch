"use client";

import { useActionState } from "react";

type Versioned<S> = { state: S; version: number };

/**
 * useActionState plus a version that changes after every completed submission. Key the
 * form's fields with the version: after a refused submit they remount with the echoed values
 * as defaults (and fresh local state), instead of React's automatic form reset rewinding
 * them. Redirects thrown by the action propagate as usual.
 */
export function useVersionedActionState<S>(
  action: (state: S, formData: FormData) => Promise<S>,
  initialState: S,
): readonly [state: S, dispatch: (formData: FormData) => void, version: number] {
  const [versioned, dispatch] = useActionState<Versioned<S>, FormData>(
    async (previous, formData) => ({
      state: await action(previous.state, formData),
      version: previous.version + 1,
    }),
    { state: initialState, version: 0 },
  );
  return [versioned.state, dispatch, versioned.version] as const;
}
