import { useEffect, useRef, useState } from 'react';

interface ConfirmTypeModalProps {
  title: string;
  warning: string;
  // Exact phrase the user must type to enable the Confirm button.
  phrase: string;
  confirmLabel: string;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
  // When true, backdrop clicks and Escape do nothing — the modal can only be
  // dismissed through its buttons (used for the re-enable modal, where Cancel
  // means "log me back out").
  blockBackdropClose?: boolean;
}

// Type-to-confirm modal for irreversible account actions (disable profile,
// delete organization) and for re-enabling. No pop-ups rule does not apply —
// the user explicitly required these warnings with typed confirmation.
function ConfirmTypeModal({
  title,
  warning,
  phrase,
  confirmLabel,
  onConfirm,
  onCancel,
  blockBackdropClose,
}: ConfirmTypeModalProps) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !blockBackdropClose) onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel, blockBackdropClose]);

  const valid = typed === phrase;

  const run = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } catch (e: any) {
      alert(e?.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="confirm-type-backdrop" onClick={blockBackdropClose ? undefined : onCancel}>
      <div className="confirm-type-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p className="confirm-type-warning">{warning}</p>
        <input
          ref={inputRef}
          className="confirm-type-input"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={phrase}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          disabled={busy}
        />
        <div className="confirm-type-actions">
          <button className="confirm-type-cancel" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className="confirm-type-ok"
            onClick={run}
            disabled={!valid || busy}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
      <style>{`
        .confirm-type-backdrop {
          position: fixed; inset: 0; background: rgba(0,0,0,0.45);
          display: flex; align-items: center; justify-content: center;
          z-index: 300; padding: 20px;
        }
        .confirm-type-modal {
          background: white; border-radius: 12px; padding: 24px 20px;
          width: 100%; max-width: 380px; box-shadow: 0 8px 30px rgba(0,0,0,0.25);
        }
        .confirm-type-modal h3 { margin: 0 0 10px; color: #222; font-size: 17px; }
        .confirm-type-warning { margin: 0 0 16px; color: #555; font-size: 14px; line-height: 1.5; }
        .confirm-type-input {
          width: 100%; padding: 10px 12px; border: 1px solid #e0e0e0;
          border-radius: 8px; font-size: 14px; outline: none; font-family: inherit;
          box-sizing: border-box;
        }
        .confirm-type-input:focus { border-color: #667eea; }
        .confirm-type-actions { display: flex; gap: 10px; margin-top: 16px; }
        .confirm-type-cancel {
          flex: 1; padding: 10px 12px; border-radius: 8px; font-size: 14px; font-weight: 600;
          background: #fff; border: 1px solid #d0d0d0; color: #555; cursor: pointer; font-family: inherit;
        }
        .confirm-type-cancel:hover { background: #f5f5f5; }
        .confirm-type-ok {
          flex: 1; padding: 10px 12px; border-radius: 8px; font-size: 14px; font-weight: 600;
          background: #dc2626; border: none; color: #fff; cursor: pointer; font-family: inherit;
        }
        .confirm-type-ok:hover { background: #b91c1c; }
        .confirm-type-ok:disabled { background: #f0c4c4; cursor: default; }
      `}</style>
    </div>
  );
}

export default ConfirmTypeModal;