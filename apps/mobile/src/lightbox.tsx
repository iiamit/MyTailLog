import { useRef, useState } from "react";

// Full-screen image viewer: pinch to zoom (1–5×), drag to pan when zoomed,
// double-tap to toggle, ✕ or swipe-down to close. touch-action:none so the
// webview doesn't fight our gestures.
export function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const [t, setT] = useState({ scale: 1, x: 0, y: 0 });
  const g = useRef({ mode: "" as "" | "pan" | "pinch", startDist: 0, startScale: 1, startX: 0, startY: 0, baseX: 0, baseY: 0 });
  const animate = useRef(false);

  function dist(touches: TouchList) {
    const a = touches[0], b = touches[1];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  function onStart(e: React.TouchEvent) {
    animate.current = false;
    if (e.touches.length === 2) {
      g.current.mode = "pinch";
      g.current.startDist = dist(e.touches);
      g.current.startScale = t.scale;
    } else if (e.touches.length === 1) {
      g.current.mode = "pan";
      g.current.startX = e.touches[0].clientX;
      g.current.startY = e.touches[0].clientY;
      g.current.baseX = t.x;
      g.current.baseY = t.y;
    }
  }

  function onMove(e: React.TouchEvent) {
    if (g.current.mode === "pinch" && e.touches.length === 2) {
      const scale = clamp(g.current.startScale * (dist(e.touches) / g.current.startDist), 1, 5);
      setT((p) => ({ ...p, scale }));
    } else if (g.current.mode === "pan" && e.touches.length === 1) {
      const dx = e.touches[0].clientX - g.current.startX;
      const dy = e.touches[0].clientY - g.current.startY;
      if (t.scale > 1) {
        setT((p) => ({ ...p, x: g.current.baseX + dx, y: g.current.baseY + dy }));
      } else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) {
        onClose(); // swipe down to dismiss when not zoomed
      }
    }
  }

  function onEnd() {
    g.current.mode = "";
  }

  function onDouble() {
    animate.current = true;
    setT((p) => (p.scale > 1 ? { scale: 1, x: 0, y: 0 } : { scale: 2.5, x: 0, y: 0 }));
  }

  return (
    <div
      onTouchStart={onStart}
      onTouchMove={onMove}
      onTouchEnd={onEnd}
      onDoubleClick={onDouble}
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        touchAction: "none",
      }}
    >
      <img
        src={src}
        alt="Scanned page"
        draggable={false}
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`,
          transformOrigin: "center center",
          transition: animate.current ? "transform .18s ease" : "none",
        }}
      />
      <button
        onClick={onClose}
        aria-label="Close"
        style={{
          position: "absolute",
          top: "max(14px, env(safe-area-inset-top))",
          right: 14,
          width: 40,
          height: 40,
          borderRadius: 20,
          background: "rgba(255,255,255,0.16)",
          color: "#fff",
          border: "none",
          fontSize: 19,
          lineHeight: "40px",
        }}
      >
        ✕
      </button>
    </div>
  );
}

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}
