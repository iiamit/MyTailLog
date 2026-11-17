import { useEffect, useRef, type ReactNode } from "react";

/** Native modal focus containment, Escape, inert background and focus restoration. */
export function Modal({ title, onClose, children }: { title: string; onClose?: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={ref} aria-label={title} data-android-back
      onCancel={(event) => { event.preventDefault(); onClose?.(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose?.(); }}
      onKeyDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onTouchEnd={(event) => event.stopPropagation()}
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", maxWidth: "none", maxHeight: "none", margin: 0, padding: 0, border: 0, boxSizing: "border-box", background: "rgba(0,0,0,.55)", zIndex: 60, display: "flex", alignItems: "flex-end" }}>
      {children}
    </dialog>
  );
}
