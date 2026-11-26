import { useEffect, useState, type ReactNode } from "react";

/** A button that asks "Are you sure?" before doing something that can't be undone (close a trade, reset, cancel). */
export default function ConfirmButton({ label, question, yes, onConfirm, className = "btn", disabled, busy }: {
  label: ReactNode; question: string; yes: string; onConfirm: () => void; className?: string; disabled?: boolean; busy?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  // Forget the question after a while, so a stray tap later doesn't confirm it.
  useEffect(() => { if (!asking) return; const t = setTimeout(() => setAsking(false), 8000); return () => clearTimeout(t); }, [asking]);
  if (!asking) return <button type="button" className={className} disabled={disabled || busy} onClick={() => setAsking(true)}>{label}</button>;
  return (
    <span className="confirm-box" role="alertdialog" aria-label={question}>
      <span className="confirm-q">{question}</span>
      <button type="button" className="btn small" onClick={() => setAsking(false)} autoFocus>No</button>
      <button type="button" className="btn small primary danger" onClick={() => { setAsking(false); onConfirm(); }}>{yes}</button>
    </span>
  );
}
