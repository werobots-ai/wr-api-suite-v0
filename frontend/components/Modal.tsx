import { ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  closeLabel?: string;
  showCloseButton?: boolean;
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  className,
  bodyClassName,
  closeLabel = "Close dialog",
  showCloseButton = true,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const labelId = useId();

  useEffect(() => {
    if (typeof document === "undefined") {
      return () => {};
    }

    const rootId = "wr-modal-root";
    let root = document.getElementById(rootId);
    if (!root) {
      root = document.createElement("div");
      root.setAttribute("id", rootId);
      document.body.appendChild(root);
    }

    const container = document.createElement("div");
    container.className = "modal-container";
    root.appendChild(container);
    containerRef.current = container;
    setMounted(true);

    return () => {
      if (containerRef.current && containerRef.current.parentNode) {
        containerRef.current.parentNode.removeChild(containerRef.current);
      }
      containerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted || !containerRef.current) {
    return null;
  }

  const shouldRenderHeader = Boolean(title) || showCloseButton;

  return createPortal(
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className={`modal ${className ?? ""}`.trim()}
        role="dialog"
        aria-modal="true"
        {...(title ? { "aria-labelledby": labelId } : {})}
        onClick={(event) => event.stopPropagation()}
      >
        {shouldRenderHeader && (
          <header className="modal-header">
            {title && (
              <div className="modal-title" id={labelId}>
                {title}
              </div>
            )}
            {showCloseButton && (
              <button
                type="button"
                className="modal-close"
                onClick={onClose}
                aria-label={closeLabel}
              >
                ×
              </button>
            )}
          </header>
        )}
        <div className={`modal-body ${bodyClassName ?? ""}`.trim()}>{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
        <style jsx>{`
          .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.55);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
            padding: 1.5rem;
          }
          .modal {
            background: #fff;
            border-radius: 8px;
            box-shadow: 0 20px 45px rgba(0, 0, 0, 0.2);
            width: min(640px, 100%);
            max-height: 90vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
          }
          .modal-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 1rem 1.25rem;
            border-bottom: 1px solid #f0f0f0;
            gap: 1rem;
          }
          .modal-title {
            font-size: 1.25rem;
            font-weight: 600;
          }
          .modal-close {
            border: none;
            background: transparent;
            font-size: 1.5rem;
            cursor: pointer;
            line-height: 1;
            color: #888;
          }
          .modal-close:hover {
            color: #000;
          }
          .modal-body {
            padding: 1rem 1.25rem;
            overflow-y: auto;
          }
          .modal-footer {
            padding: 1rem 1.25rem 1.25rem;
            border-top: 1px solid #f0f0f0;
            display: flex;
            justify-content: flex-end;
            gap: 0.75rem;
          }
        `}</style>
      </div>
    </div>,
    containerRef.current,
  );
}
