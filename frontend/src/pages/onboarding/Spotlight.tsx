/**
 * Spotlight overlay for the onboarding tour.
 *
 * Dims the page with four edge rectangles around the target element so
 * the target stays fully visible AND remains naturally clickable (no
 * overlay covers it, so MUI's normal click handler runs untouched).
 * A glowing ring is drawn around the hole for emphasis. The component
 * re-measures the target on resize / scroll and polls briefly while
 * waiting for it to mount (handy when the user is on a different tab
 * when the tour reaches a step).
 */

import { useEffect, useState } from "react";
import { Box, keyframes } from "@mui/material";

type Rect = { top: number; left: number; width: number; height: number };

const PADDING = 8;
const RING_WIDTH = 3;
const OVERLAY_BG = "rgba(15, 23, 42, 0.55)";

const pulse = keyframes`
  0%   { box-shadow: 0 0 0 0 rgba(33, 150, 243, 0.65); }
  70%  { box-shadow: 0 0 0 14px rgba(33, 150, 243, 0); }
  100% { box-shadow: 0 0 0 0 rgba(33, 150, 243, 0); }
`;

const findTarget = (selector: string): HTMLElement | null => {
  const el = document.querySelector<HTMLElement>(selector);
  return el && el.getClientRects().length > 0 ? el : null;
};

const useTargetRect = (selector: string): Rect | null => {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: number | undefined;
    let resizeObserver: ResizeObserver | undefined;

    const measure = () => {
      const el = findTarget(selector);
      if (!el) {
        setRect(null);
        return false;
      }
      const r = el.getBoundingClientRect();
      if (cancelled) return true;
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      return true;
    };

    if (!measure()) {
      // Target not mounted yet (or hidden). Poll briefly until it shows up.
      pollTimer = window.setInterval(() => {
        if (measure() && pollTimer !== undefined) {
          window.clearInterval(pollTimer);
          pollTimer = undefined;
        }
      }, 200);
    }

    const onWindowChange = () => measure();
    window.addEventListener("resize", onWindowChange);
    window.addEventListener("scroll", onWindowChange, true);
    const el = findTarget(selector);
    if (el && "ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(onWindowChange);
      resizeObserver.observe(el);
    }

    return () => {
      cancelled = true;
      if (pollTimer !== undefined) window.clearInterval(pollTimer);
      window.removeEventListener("resize", onWindowChange);
      window.removeEventListener("scroll", onWindowChange, true);
      resizeObserver?.disconnect();
    };
  }, [selector]);

  return rect;
};

type Props = {
  /** CSS selector for the element to spotlight. */
  targetSelector: string;
  /**
   * z-index for the dim layer. Sits below MUI's `Drawer` (1200) and
   * `Modal` (1300), so that when the spotlighted button opens a form or
   * dialog, the new surface naturally covers the dim. Floating tour
   * cards should match this value to be hidden by the same drawer.
   */
  zIndex?: number;
};

export default function Spotlight({ targetSelector, zIndex = 1150 }: Props) {
  const rect = useTargetRect(targetSelector);
  if (!rect) {
    // Until we know where the target is, blanket the page so the user
    // does not interact mid-transition. Once the rect is known we swap
    // to the four-edge mask, which leaves the target untouched.
    return (
      <Box
        sx={{
          position: "fixed",
          inset: 0,
          zIndex,
          bgcolor: OVERLAY_BG,
        }}
      />
    );
  }

  const holeTop = Math.max(0, rect.top - PADDING);
  const holeLeft = Math.max(0, rect.left - PADDING);
  const holeRight = rect.left + rect.width + PADDING;
  const holeBottom = rect.top + rect.height + PADDING;

  return (
    <>
      {/* Four dim rectangles around the target. They cover the whole
          viewport except the spotlight rect, so the target keeps its
          native pointer events. */}
      <Box
        sx={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: holeTop,
          zIndex,
          bgcolor: OVERLAY_BG,
        }}
      />
      <Box
        sx={{
          position: "fixed",
          top: holeTop,
          bottom: `calc(100vh - ${holeBottom}px)`,
          left: 0,
          width: holeLeft,
          zIndex,
          bgcolor: OVERLAY_BG,
        }}
      />
      <Box
        sx={{
          position: "fixed",
          top: holeTop,
          bottom: `calc(100vh - ${holeBottom}px)`,
          left: holeRight,
          right: 0,
          zIndex,
          bgcolor: OVERLAY_BG,
        }}
      />
      <Box
        sx={{
          position: "fixed",
          top: holeBottom,
          bottom: 0,
          left: 0,
          right: 0,
          zIndex,
          bgcolor: OVERLAY_BG,
        }}
      />

      {/* Pulsing ring around the hole. Pointer-events disabled so it
          never absorbs clicks meant for the highlighted button. */}
      <Box
        sx={{
          position: "fixed",
          top: holeTop - RING_WIDTH,
          left: holeLeft - RING_WIDTH,
          width: holeRight - holeLeft + RING_WIDTH * 2,
          height: holeBottom - holeTop + RING_WIDTH * 2,
          zIndex: zIndex + 1,
          pointerEvents: "none",
          borderRadius: 1,
          border: `${RING_WIDTH}px solid`,
          borderColor: "primary.main",
          animation: `${pulse} 1.8s ease-out infinite`,
        }}
      />
    </>
  );
}
