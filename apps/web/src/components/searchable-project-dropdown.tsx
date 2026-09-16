"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export interface ProjectDropdownOption {
  id: string;
  name: string;
  count: number;
}

interface SearchableProjectDropdownProps {
  options: ProjectDropdownOption[];
  activeId: string | "ALL";
  onSelect: (id: string | "ALL") => void;
  totalCount: number;
  /** Singular unit noun, e.g. "bug" — the plural is derived unless overridden. */
  unitLabel: string;
  unitLabelPlural?: string;
  isLoading?: boolean;
  placeholder?: string;
  /** Set false when callers have no real per-project count to show (e.g. a plain project picker) — omits the count badge instead of displaying a meaningless 0. Defaults to true. */
  showCount?: boolean;
}

/**
 * A searchable single-select for picking a project out of a potentially long
 * list — a text filter over a dropdown listing, rather than scanning a
 * horizontally-scrolling row of pills or cards.
 */
export function SearchableProjectDropdown({
  options,
  activeId,
  onSelect,
  totalCount,
  unitLabel,
  unitLabelPlural,
  isLoading,
  placeholder = "All Projects",
  showCount = true,
}: SearchableProjectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  if (isLoading) {
    return <Skeleton className="h-10 w-full max-w-sm" />;
  }

  const plural = unitLabelPlural ?? `${unitLabel}s`;
  const filtered = options.filter((option) =>
    option.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const activeOption = options.find((option) => option.id === activeId);
  const triggerLabel = activeId === "ALL" ? placeholder : (activeOption?.name ?? "Unknown project");

  function select(id: string | "ALL") {
    onSelect(id);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm transition-colors hover:bg-muted"
      >
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-md">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search projects…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            <button
              type="button"
              onClick={() => select("ALL")}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted",
                activeId === "ALL" && "bg-accent",
              )}
            >
              <span className="flex items-center gap-2">
                {activeId === "ALL" && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                <span className={cn(activeId !== "ALL" && "pl-[1.375rem]")}>{placeholder}</span>
              </span>
              {showCount && (
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{totalCount}</span>
              )}
            </button>

            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                No projects match &ldquo;{query}&rdquo;.
              </p>
            ) : (
              filtered.map((option) => {
                const active = option.id === activeId;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => select(option.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted",
                      active && "bg-accent",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {active && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                      <span className={cn("truncate", !active && "pl-[1.375rem]")}>{option.name}</span>
                    </span>
                    {showCount && (
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {option.count} {option.count === 1 ? unitLabel : plural}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
