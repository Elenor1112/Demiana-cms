"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Anchored popover.
 *
 * Portals to document.body rather than rendering in place: these are used
 * inside Dialog, which is `overflow-y-auto`, so an absolutely positioned child
 * would be clipped by the modal's scroll container.
 *
 * Because it is portalled, position is measured from the trigger and kept in
 * sync on scroll/resize, and it flips above the trigger when there is not
 * enough room below.
 */
export function Popover({
  open,
  onClose,
  anchorRef,
  children,
  className,
  align = "start",
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  className?: string;
  align?: "start" | "end";
}) {
  const [mounted, setMounted] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number; flip: boolean } | null>(null);

  React.useEffect(() => setMounted(true), []);

  const place = React.useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const panelH = panelRef.current?.offsetHeight ?? 320;
    const panelW = panelRef.current?.offsetWidth ?? 280;
    const gap = 6;

    const flip = r.bottom + panelH + gap > window.innerHeight && r.top - panelH - gap > 0;
    const top = flip ? r.top - panelH - gap : r.bottom + gap;

    let left = align === "end" ? r.right - panelW : r.left;
    // Keep it on screen on narrow viewports.
    left = Math.max(8, Math.min(left, window.innerWidth - panelW - 8));

    setPos({ top, left, flip });
  }, [anchorRef, align]);

  React.useLayoutEffect(() => {
    if (!open) return;
    place();
    // Re-measure once the panel has its real size.
    const raf = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Stop the surrounding Dialog's own Escape handler from also firing —
      // one press should close the popover, not the whole form.
      e.stopPropagation();
      onClose();
      anchorRef.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    // Capture phase so this runs before Dialog's document-level listener.
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, onClose, anchorRef]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          role="dialog"
          initial={{ opacity: 0, y: pos?.flip ? 4 : -4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: pos?.flip ? 4 : -4, scale: 0.98 }}
          transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
          className={cn(
            // z-[70] clears Dialog (z-50) and the command palette (z-[60]).
            "fixed z-[70] rounded-xl border border-border bg-card p-3 shadow-xl",
            className
          )}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
