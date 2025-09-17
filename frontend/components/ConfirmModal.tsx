import { ReactNode, useEffect, useId } from "react";
import { createPortal } from "react-dom";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}

export default function ConfirmModal({
  isOpen,
  title,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  destructive = false,
}: ConfirmModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
      if (event.key === "Enter") {
        const target = event.target as HTMLElement | null;
        const isTextInput =
          target?.tagName === "TEXTAREA" || target?.tagName === "INPUT";
        if (!event.shiftKey && !isTextInput) {
          event.preventDefault();
          onConfirm();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onCancel, onConfirm]);

  if (!isOpen || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="overlay" role="presentation" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
        </header>
        <div className="body">{children}</div>
        <footer>
          <button type="button" className="secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={destructive ? "primary destructive" : "primary"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </footer>
        <style jsx>{`
          .overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.55);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2100;
            padding: 1.5rem;
          }
          .modal {
            background: #fff;
            border-radius: 8px;
            box-shadow: 0 20px 45px rgba(0, 0, 0, 0.2);
            width: min(520px, 100%);
            display: flex;
            flex-direction: column;
            max-height: 90vh;
          }
          header {
            padding: 1rem 1.25rem;
            border-bottom: 1px solid #f0f0f0;
          }
          header h2 {
            margin: 0;
            font-size: 1.25rem;
          }
          .body {
            padding: 1rem 1.25rem 0.75rem;
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
            color: #434343;
          }
          .body :global(p) {
            margin: 0;
            line-height: 1.4;
          }
          footer {
            padding: 1rem 1.25rem 1.25rem;
            border-top: 1px solid #f0f0f0;
            display: flex;
            justify-content: flex-end;
            gap: 0.75rem;
          }
          button {
            border: none;
            border-radius: 4px;
            padding: 0.5rem 1rem;
            cursor: pointer;
            font-weight: 500;
          }
          .secondary {
            background: #f0f0f0;
            color: #434343;
          }
          .secondary:hover {
            background: #e0e0e0;
          }
          .primary {
            background: #1890ff;
            color: #fff;
          }
          .primary:hover {
            background: #096dd9;
          }
          .primary.destructive {
            background: #cf1322;
          }
          .primary.destructive:hover {
            background: #a8071a;
          }
        `}</style>
      </div>
    </div>,
    document.body,
  );
}
