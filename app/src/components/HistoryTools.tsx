import { useState } from "react";

/** Select, delete selected, delete all — for any list of finished trades. */
export function useSelection() {
  const [sel, setSel] = useState<Set<string>>(new Set());
  return {
    sel,
    has: (id: string) => sel.has(id),
    toggle: (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }),
    setAll: (ids: string[], on: boolean) => setSel(on ? new Set(ids) : new Set()),
    clear: () => setSel(new Set()),
  };
}

export function HistoryBar({ count, selected, onDelete, onSelectAll, allSelected }: { count: number; selected: string[]; onDelete: (b: { ids?: string[]; all?: boolean }) => Promise<void>; onSelectAll: (on: boolean) => void; allSelected: boolean }) {
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const run = async (b: { ids?: string[]; all?: boolean }) => { setBusy(true); setErr(""); try { await onDelete(b); } catch (e) { setErr((e as Error).message); } setBusy(false); setConfirmAll(false); };
  if (!count) return null;
  return (
    <div className="hist-bar">
      <label className="check"><input type="checkbox" checked={allSelected} onChange={(e) => onSelectAll(e.target.checked)} /> Select all ({count})</label>
      <span className="pick-btns">
        <button className="btn" disabled={busy || !selected.length} onClick={() => run({ ids: selected })}>Delete selected{selected.length ? ` (${selected.length})` : ""}</button>
        {confirmAll
          ? <><button className="btn sell-btn" disabled={busy} onClick={() => run({ all: true })}>Yes, delete all {count}</button><button className="link" onClick={() => setConfirmAll(false)}>Cancel</button></>
          : <button className="btn" disabled={busy} onClick={() => setConfirmAll(true)}>Delete all history</button>}
      </span>
      {err && <p className="err">{err}</p>}
      <p className="sub">Deleting history only removes finished trades from the list. It doesn't change your balance or any open trade.</p>
    </div>
  );
}
