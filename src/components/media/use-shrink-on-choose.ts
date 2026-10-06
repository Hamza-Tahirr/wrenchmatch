"use client";

import { useCallback, useRef, useState } from "react";

import type { UploadBudget } from "./media-types";
import { shrinkPicturesFor } from "./shrink-picture";
import { isShrinkablePicture, markShrinking, replaceInputFiles } from "./upload-budget";

/**
 * Shrinking for file inputs whose form sends the files as chosen (FileInput, the request
 * form's photo picker). With a budget, `shrinkChosen(input, files)` replaces the pictures in
 * `input` by shrunk copies and resolves with the files the form will now send; the input is
 * marked busy meanwhile, so UploadBudgetGuard holds a submit until it is done. It resolves with
 * null when there is nothing to shrink (no budget, no pictures), when shrinking failed (the
 * originals stay chosen; the budget check and the server still apply) and when a newer choice
 * replaced this one.
 */
export function useShrinkOnChoose(budget: UploadBudget | undefined) {
  const [shrinking, setShrinking] = useState(false);
  const latest = useRef(0);

  const shrinkChosen = useCallback(
    async (input: HTMLInputElement, files: readonly File[]): Promise<File[] | null> => {
      const choice = (latest.current += 1);
      if (!budget || !files.some(isShrinkablePicture)) {
        setShrinking(false);
        markShrinking(input, false);
        return null;
      }
      setShrinking(true);
      markShrinking(input, true);
      try {
        const shrunk = await shrinkPicturesFor(files, budget);
        if (choice !== latest.current) return null;
        replaceInputFiles(input, shrunk);
        return shrunk;
      } catch {
        return null;
      } finally {
        if (choice === latest.current) {
          setShrinking(false);
          markShrinking(input, false);
        }
      }
    },
    [budget],
  );

  return { shrinking, shrinkChosen };
}
