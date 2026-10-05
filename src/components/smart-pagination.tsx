import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

interface SmartPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Max number of page-number buttons shown (excluding prev/next/ellipsis). Default 5. */
  siblingCount?: number;
  className?: string;
}

function getPageRange(current: number, total: number, maxButtons: number): (number | "ellipsis")[] {
  if (total <= maxButtons) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | "ellipsis")[] = [];
  const half = Math.floor((maxButtons - 2) / 2);
  let start = Math.max(2, current - half);
  let end = Math.min(total - 1, current + half);

  if (current - 1 <= half) {
    end = maxButtons - 1;
  }
  if (total - current <= half) {
    start = total - (maxButtons - 2);
  }

  pages.push(1);
  if (start > 2) pages.push("ellipsis");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push("ellipsis");
  pages.push(total);
  return pages;
}

export function SmartPagination({
  currentPage,
  totalPages,
  onPageChange,
  siblingCount = 5,
  className,
}: SmartPaginationProps) {
  if (totalPages <= 1) return null;
  const pages = getPageRange(currentPage, totalPages, siblingCount);

  return (
    <Pagination className={className}>
      <PaginationContent className="flex-wrap justify-center gap-1 max-w-full">
        <PaginationItem>
          <PaginationPrevious
            className="cursor-pointer"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          />
        </PaginationItem>
        {pages.map((p, i) =>
          p === "ellipsis" ? (
            <PaginationItem key={`e-${i}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={p}>
              <PaginationLink
                className="cursor-pointer"
                isActive={currentPage === p}
                onClick={() => onPageChange(p)}
              >
                {p}
              </PaginationLink>
            </PaginationItem>
          ),
        )}
        <PaginationItem>
          <PaginationNext
            className="cursor-pointer"
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
