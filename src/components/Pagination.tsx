"use client";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  pageSize?: number;
}

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  pageSize,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages: (number | "...")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push("...");
    for (
      let i = Math.max(2, currentPage - 1);
      i <= Math.min(totalPages - 1, currentPage + 1);
      i++
    ) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }

  const showingFrom = totalItems
    ? (currentPage - 1) * (pageSize || 25) + 1
    : null;
  const showingTo = totalItems
    ? Math.min(currentPage * (pageSize || 25), totalItems)
    : null;

  return (
    <div className="flex items-center justify-between pt-4">
      {totalItems != null && showingFrom != null && showingTo != null ? (
        <span className="text-xs text-[var(--muted)]">
          Showing {showingFrom}-{showingTo} of {totalItems}
        </span>
      ) : (
        <span />
      )}
      <div className="flex gap-1">
        <button
          className="pagination-btn"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          Prev
        </button>
        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`dots-${i}`} className="px-2 text-[var(--muted)] text-sm">
              ...
            </span>
          ) : (
            <button
              key={p}
              className={`pagination-btn ${currentPage === p ? "active" : ""}`}
              onClick={() => onPageChange(p)}
            >
              {p}
            </button>
          )
        )}
        <button
          className="pagination-btn"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
