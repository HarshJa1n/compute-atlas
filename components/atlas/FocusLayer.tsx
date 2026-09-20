"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";

/**
 * Brings a side panel to the centre of the screen. The panel is laid out at its
 * final size, then a FLIP transform (WAAPI, compositor-only) plays it from the
 * rectangle it came from, so it visibly grows out of its slot rather than
 * appearing. Closing plays the same path backwards; spatial consistency is the
 * whole point. Reduced motion falls back to a fade.
 */
export default function FocusLayer({
  open, from, label, onClosed, children,
}: {
  open: boolean;
  from: DOMRect | null;
  label: string;
  onClosed: () => void;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const closing = useRef(false);

  const flip = (reverse: boolean): Animation | null => {
    const el = panel.current;
    if (!el) return null;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const to = el.getBoundingClientRect();
    if (!from || reduce || to.width === 0) {
      return el.animate(reverse ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }], {
        duration: reverse ? 160 : 200, easing: EASE_OUT, fill: "both",
      });
    }
    const start = {
      transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`,
      opacity: 0.55,
    };
    const end = { transform: "translate(0px, 0px) scale(1, 1)", opacity: 1 };
    return el.animate(reverse ? [end, start] : [start, end], { duration: reverse ? 200 : 280, easing: EASE_OUT, fill: "both" });
  };

  // Enter: panel and scrim read as one surface, so they share the curve.
  useLayoutEffect(() => {
    const a = flip(false);
    const b = scrim.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: EASE_OUT, fill: "both" });
    return () => { a?.cancel(); b?.cancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Exit is driven by the parent flipping `open`; we own the animation and report when it is done.
  useEffect(() => {
    if (open || closing.current) return;
    closing.current = true;
    const a = flip(true);
    scrim.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: EASE_OUT, fill: "both" });
    if (a) a.onfinish = () => onClosed();
    else onClosed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className="fixed inset-0 z-40" role="presentation">
      <div ref={scrim} aria-hidden className="absolute inset-0 bg-bg/60 backdrop-blur-[2px]" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="focus-panel glass absolute inset-0 m-auto flex flex-col overflow-hidden rounded-panel"
      >
        <div className="focus-zoom flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
