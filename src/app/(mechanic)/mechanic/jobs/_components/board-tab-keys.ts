// The job board's views (?tab=), shared by the Server Component page and the client tabs.

export const BOARD_TABS = ["new", "interested", "quotes", "bookings"] as const;
export type BoardTab = (typeof BOARD_TABS)[number];

export type BoardTabItem = {
  key: BoardTab;
  label: string;
  count: number;
};

export function isBoardTab(value: string | null | undefined): value is BoardTab {
  return BOARD_TABS.some((tab) => tab === value);
}
