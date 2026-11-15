import React, { useState } from "react";
import { Download } from "lucide-react";

const LAST_KEY = "dispatch.lastBackup";
const RESTORE = "node ./node_modules/vite-node/dist/cli.mjs packages/agent/src/bin/restore-backup.ts <backup.json> <database path> [--force]";

const readLast = (): string | null => {
  try { return localStorage.getItem(LAST_KEY); } catch { return null; }
};

// Owner only. One JSON file with the whole database and the key that unlocks saved plugin keys, so it is private.
// Restoring is offline on purpose (one writer owns the data), so this page explains the command instead of offering a button.
export function BackupPanel() {
  const [last, setLast] = useState<string | null>(readLast);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const download = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/backup", { credentials: "same-origin" });
      if (response.status === 409) return setMessage({ ok: false, text: "This server is not saving data to a file, so there is nothing to back up." });
      if (response.status === 403) return setMessage({ ok: false, text: "Only the owner can download a backup." });
      if (!response.ok) return setMessage({ ok: false, text: "Could not make the backup. Try again." });
      const blob = await response.blob();
      const name = /filename="?([^";]+)"?/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? `dispatchai-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
      const now = new Date().toISOString();
      try { localStorage.setItem(LAST_KEY, now); } catch { /* storage can be blocked */ }
      setLast(now);
      setMessage({ ok: true, text: `Saved ${name}. Keep it somewhere private.` });
    } catch {
      setMessage({ ok: false, text: "Cannot reach the DispatchAI server." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="backup" aria-labelledby="backup-title">
      <div className="backup__head">
        <h2 className="backup__title" id="backup-title">Backup</h2>
        <p className="backup__lede">One file with all your bookings, customers and settings. Back up before you update DispatchAI.</p>
      </div>
      <p className="backup__warn">Keep the file private. It also holds the key that unlocks your saved plugin keys. If you set MASTER_KEY yourself on a cloud server, the file does not include it: keep that key in your own secret store.</p>
      <div className="backup__actions">
        <button type="button" className="btn btn--primary" onClick={download} disabled={busy}><Download size={14} aria-hidden="true" />{busy ? "Preparing…" : "Download backup"}</button>
        <span className="backup__last">{last ? `Last downloaded from this browser: ${new Date(last).toLocaleString()}` : "No backup downloaded from this browser yet."}</span>
      </div>
      {message && <p role={message.ok ? "status" : "alert"} className={message.ok ? "backup__ok" : "field__error"}>{message.text}</p>}
      <details className="backup__restore">
        <summary>How to restore</summary>
        <ol>
          <li>Stop DispatchAI. Restoring happens outside the app on purpose, so two programs never write to your data at once.</li>
          <li>On the machine that runs the Docker or source install, run this in the project folder:</li>
        </ol>
        <pre className="backup__code" tabIndex={0} aria-label="Restore command"><code>{RESTORE}</code></pre>
        <p>Add <code>--force</code> to replace an existing database: the old files are moved aside as <code>*.before-restore-&lt;time&gt;</code>, never deleted. Then start DispatchAI again. The desktop app has no restore command yet.</p>
      </details>
    </section>
  );
}
