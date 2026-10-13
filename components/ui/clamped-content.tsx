"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// SSR-safe layout effect: measuring before paint avoids a visible button pop-in.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

interface ClampedContentProps {
  content: string;
  expanded: boolean;
  onToggleExpanded: () => void;
  /** Tailwind line-clamp class applied while collapsed (e.g. "line-clamp-5"). */
  clampClassName: string;
  className?: string;
  expandLabel?: string;
  collapseLabel?: string;
}

/**
 * Renders text clamped to N lines and only shows the expand toggle when the
 * text is *actually* cut off.
 *
 * A character-count heuristic gets this wrong both ways: a short note with many
 * line breaks can still overflow the clamp, while a long single-line note may
 * fit entirely. We measure the rendered box instead, and re-measure on resize so
 * the verdict stays correct across view-mode and viewport changes.
 */
export function ClampedContent({
  content,
  expanded,
  onToggleExpanded,
  clampClassName,
  className,
  expandLabel = "展開全文",
  collapseLabel = "收起",
}: ClampedContentProps) {
  const contentRef = useRef<HTMLParagraphElement | null>(null);
  const [overflows, setOverflows] = useState(false);

  const measure = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    // scrollHeight reports the full text height even when -webkit-line-clamp
    // hides the overflow, so a 1px tolerance absorbs sub-pixel rounding.
    setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, []);

  useIsomorphicLayoutEffect(() => {
    // While expanded the paragraph is unclamped and cannot overflow, so keep the
    // last verdict — that keeps the toggle mounted and avoids a flicker on collapse.
    if (expanded) return;

    measure();

    const el = contentRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [content, expanded, clampClassName, measure]);

  const showToggle = expanded || overflows;

  return (
    <div className={cn("flex-1", className)}>
      <p
        ref={contentRef}
        className={cn("whitespace-pre-wrap", !expanded && clampClassName)}
      >
        {content}
      </p>
      {showToggle && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onToggleExpanded}
          className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
        >
          {expanded ? collapseLabel : expandLabel}
        </Button>
      )}
    </div>
  );
}
