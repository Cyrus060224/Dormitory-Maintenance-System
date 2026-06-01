import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({
  currentPage,
  totalCount,
  pageSize,
  onPageChange,
}: PaginationProps) {
  const totalPages = Math.ceil(totalCount / pageSize);

  if (totalPages <= 1) return null;

  const pages: number[] = [];
  const maxVisiblePages = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
  let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

  if (endPage - startPage + 1 < maxVisiblePages) {
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 py-4 border-t border-border/60">
      <p className="text-xs sm:text-sm text-muted-foreground">
        显示第 <span className="font-semibold text-foreground">{Math.min((currentPage - 1) * pageSize + 1, totalCount)}</span> 至{' '}
        <span className="font-semibold text-foreground">{Math.min(currentPage * pageSize, totalCount)}</span> 项，共{' '}
        <span className="font-semibold text-foreground">{totalCount}</span> 项
      </p>
      
      <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-xl border border-border/40 backdrop-blur-sm shadow-inner">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground transition duration-200 cursor-pointer disabled:cursor-not-allowed"
          aria-label="上一页"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {startPage > 1 && (
          <>
            <button
              onClick={() => onPageChange(1)}
              className={`w-9 h-9 rounded-lg text-sm font-medium transition duration-200 hover:bg-muted/85 hover:scale-105 active:scale-95 cursor-pointer ${
                currentPage === 1
                  ? 'bg-gradient-to-r from-primary to-blue-600 text-primary-foreground shadow-md shadow-primary/20 font-bold'
                  : 'text-foreground'
              }`}
            >
              1
            </button>
            {startPage > 2 && <span className="px-1 text-muted-foreground text-sm font-medium select-none">...</span>}
          </>
        )}

        {pages.map((p) => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`w-9 h-9 rounded-lg text-sm font-medium transition duration-200 hover:bg-muted/85 hover:scale-105 active:scale-95 cursor-pointer ${
              currentPage === p
                ? 'bg-gradient-to-r from-primary to-blue-600 text-primary-foreground shadow-md shadow-primary/20 scale-105 font-bold animate-fade-in'
                : 'text-foreground'
            }`}
          >
            {p}
          </button>
        ))}

        {endPage < totalPages && (
          <>
            {endPage < totalPages - 1 && <span className="px-1 text-muted-foreground text-sm font-medium select-none">...</span>}
            <button
              onClick={() => onPageChange(totalPages)}
              className={`w-9 h-9 rounded-lg text-sm font-medium transition duration-200 hover:bg-muted/85 hover:scale-105 active:scale-95 cursor-pointer ${
                currentPage === totalPages
                  ? 'bg-gradient-to-r from-primary to-blue-600 text-primary-foreground shadow-md shadow-primary/20 font-bold'
                  : 'text-foreground'
              }`}
            >
              {totalPages}
            </button>
          </>
        )}

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground transition duration-200 cursor-pointer disabled:cursor-not-allowed"
          aria-label="下一页"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
