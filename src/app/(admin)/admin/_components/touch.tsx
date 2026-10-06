import { Pagination, type PaginationProps } from "@/components/ui/pagination";
import { Tabs, type TabsProps } from "@/components/ui/tabs";

// The UI kit's Tabs and Pagination with 44px tap targets on phones and touch screens (their
// links are 36px tall, comfortable for a mouse but small for a thumb). Server-safe.

export function AdminTabs(props: TabsProps) {
  return (
    <div className="max-sm:[&_a]:min-h-11 pointer-coarse:[&_a]:min-h-11">
      <Tabs {...props} />
    </div>
  );
}

export function AdminPagination(props: PaginationProps) {
  return (
    <div className="max-sm:[&>nav>a]:min-h-11 max-sm:[&>nav>span]:min-h-11 pointer-coarse:[&>nav>a]:min-h-11 pointer-coarse:[&>nav>span]:min-h-11">
      <Pagination {...props} />
    </div>
  );
}
