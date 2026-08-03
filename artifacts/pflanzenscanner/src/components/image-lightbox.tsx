import { useEffect, useRef, useState, useCallback } from "react";
import { X, ZoomIn } from "lucide-react";
import { createPortal } from "react-dom";

interface Point { x: number; y: number }

function dist(a: React.Touch, b: React.Touch) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}
function mid(a: React.Touch, b: React.Touch): Point {
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
}

interface Props {
  src: string;
  alt: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Full-screen image viewer with pinch-to-zoom and drag-to-pan.
 * Double-tap toggles 2× zoom. Tap the backdrop (when not zoomed) to close.
 */
export function ImageLightbox({ src, alt, open, onClose }: Props) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const imgRef = useRef<HTMLDivElement>(null);

  // Reset transform whenever the lightbox is opened
  useEffect(() => {
    if (open) { setScale(1); setOffset({ x: 0, y: 0 }); }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // ── touch state ────────────────────────────────────────────────────────────
  const lastTap = useRef(0);
  const pinchStart = useRef<{ dist: number; scale: number; mid: Point } | null>(null);
  const dragStart = useRef<{ touch: Point; offset: Point } | null>(null);

  const clampOffset = useCallback(
    (o: Point, s: number): Point => {
      if (!imgRef.current) return o;
      const el = imgRef.current;
      const maxX = Math.max(0, (el.clientWidth * (s - 1)) / 2);
      const maxY = Math.max(0, (el.clientHeight * (s - 1)) / 2);
      return {
        x: Math.max(-maxX, Math.min(maxX, o.x)),
        y: Math.max(-maxY, Math.min(maxY, o.y)),
      };
    },
    [],
  );

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // begin pinch
      pinchStart.current = {
        dist: dist(e.touches[0], e.touches[1]),
        scale,
        mid: mid(e.touches[0], e.touches[1]),
      };
      dragStart.current = null;
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        // double-tap: toggle 2× / reset
        const next = scale > 1.2 ? 1 : 2;
        setScale(next);
        setOffset(next === 1 ? { x: 0, y: 0 } : { x: 0, y: 0 });
        lastTap.current = 0;
        return;
      }
      lastTap.current = now;
      dragStart.current = {
        touch: { x: e.touches[0].clientX, y: e.touches[0].clientY },
        offset,
      };
      pinchStart.current = null;
    }
  }, [scale, offset]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault(); // stop page scroll while manipulating
    if (e.touches.length === 2 && pinchStart.current) {
      const ratio = dist(e.touches[0], e.touches[1]) / pinchStart.current.dist;
      const next = Math.max(1, Math.min(6, pinchStart.current.scale * ratio));
      setScale(next);
      if (next === 1) setOffset({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && dragStart.current && scale > 1) {
      const dx = e.touches[0].clientX - dragStart.current.touch.x;
      const dy = e.touches[0].clientY - dragStart.current.touch.y;
      setOffset(clampOffset(
        { x: dragStart.current.offset.x + dx, y: dragStart.current.offset.y + dy },
        scale,
      ));
    }
  }, [scale, clampOffset]);

  const handleTouchEnd = useCallback(() => {
    if (scale <= 1) setOffset({ x: 0, y: 0 });
    pinchStart.current = null;
    dragStart.current = null;
  }, [scale]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black"
      style={{ touchAction: "none" }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 flex items-center justify-center w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white transition-colors"
        aria-label="Schließen"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Hint when not zoomed */}
      {scale <= 1 && (
        <span className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-white/60 text-xs pointer-events-none select-none">
          <ZoomIn className="w-3.5 h-3.5" />
          Zum Vergrößern einkneifen oder doppeltippen
        </span>
      )}

      {/* Image container — captures touch gestures */}
      <div
        ref={imgRef}
        className="w-full h-full flex items-center justify-center overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        // Close on backdrop click only when not zoomed in
        onClick={() => { if (scale <= 1) onClose(); }}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="max-w-full max-h-full object-contain select-none"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: "center center",
            transition: pinchStart.current ? "none" : "transform 0.15s ease-out",
            willChange: "transform",
            cursor: scale > 1 ? "grab" : "default",
          }}
          // Stop the backdrop-close onClick from firing on the img itself
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>,
    document.body,
  );
}
