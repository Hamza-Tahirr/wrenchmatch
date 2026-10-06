import "server-only";

import type { Paged } from "./types";

export const ADMIN_PAGE_SIZE = 25;

export type PageWindow = { page: number; pageSize: number; totalPages: number; offset: number };

/** Clamps a requested page to the available pages (1 when the list is empty). */
export function pageWindow(requested: number | undefined, totalCount: number, pageSize = ADMIN_PAGE_SIZE): PageWindow {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const wanted = requested !== undefined && Number.isFinite(requested) ? Math.trunc(requested) : 1;
  const page = Math.min(totalPages, Math.max(1, wanted));
  return { page, pageSize, totalPages, offset: (page - 1) * pageSize };
}

export function toPaged<T>(items: T[], window: PageWindow, totalCount: number): Paged<T> {
  return {
    items,
    page: window.page,
    pageSize: window.pageSize,
    totalCount,
    totalPages: window.totalPages,
  };
}
