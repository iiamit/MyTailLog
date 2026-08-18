import { color, text, radius } from "./tokens";

// The account menu behind the fleet avatar.
//
// Sign out used to be a top-level button above the fleet, competing with the
// aircraft for attention — the one action nobody opens the app to perform. It
// lives here now, along with the app-level utilities (sync, offline download)
// that likewise aren't why anyone opens the app.

export function AccountMenu({
  email,
  onClose,
  onSync,
  onDownloadAll,
  dl,
  onRebuild,
  onSignOut,
}: {
  email: string;
  onClose: () => void;
  onSync: () => void;
  onDownloadAll: () => void;
  dl: { done: number; total: number } | null;
  onRebuild: () => void;
  onSignOut: () => void;
}) {
  const downloading = !!dl && dl.total > 0 && dl.done < dl.total;

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 60, display: "flex", alignItems: "flex-end" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", background: color.surface,
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          border: `1px solid ${color.hairline}`,
          padding: "16px 16px calc(20px + env(safe-area-inset-bottom))",
          display: "flex", flexDirection: "column", gap: 6,
        }}
      >
        <div style={{ ...text.meta, color: color.faint, marginBottom: 6 }}>{email}</div>

        <MenuItem label="Sync now" onClick={onSync} />
        <MenuItem
          label={downloading ? `Downloading scans… ${dl!.done}/${dl!.total}` : "Download all scans for offline"}
          detail="Fetches every page and document once so the full record browses with no signal."
          onClick={onDownloadAll}
          disabled={downloading}
        />
        {/* The feed is forward-only, so a device that passed a change it could
            not read at the time can never catch up by syncing. This is the way
            back. */}
        <MenuItem
          label="Rebuild from the server"
          detail="Downloads everything fresh. Use it if something on here looks out of date after a sync. Anything you've recorded that hasn't uploaded yet is kept."
          onClick={onRebuild}
        />
        <MenuItem label="Sign out" onClick={onSignOut} tone={color.danger} />

        <button
          onClick={onClose}
          style={{
            marginTop: 6, minHeight: 44, background: "transparent",
            border: `1px solid ${color.hairline}`, borderRadius: radius.row,
            color: color.dim, fontFamily: text.rowTitle.fontFamily, fontSize: 14, cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

function MenuItem({
  label, detail, onClick, tone, disabled,
}: {
  label: string; detail?: string; onClick: () => void; tone?: string; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        textAlign: "left", background: "transparent", border: "none",
        borderRadius: radius.row, padding: "12px 4px", minHeight: 44,
        color: tone ?? color.ink, cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{ ...text.rowTitle, display: "block" }}>{label}</span>
      {detail && (
        <span style={{ ...text.meta, color: color.faint, display: "block", marginTop: 3, lineHeight: 1.45 }}>
          {detail}
        </span>
      )}
    </button>
  );
}
