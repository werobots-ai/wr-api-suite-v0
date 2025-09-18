import { useEffect, useMemo, useState, useId } from "react";
import { createPortal } from "react-dom";

interface KeyRevealModalProps {
  isOpen: boolean;
  keys: string[];
  context?: string;
  title?: string;
  onClose: () => void;
}

export default function KeyRevealModal({
  isOpen,
  keys,
  context,
  title = "New secret",
  onClose,
}: KeyRevealModalProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const titleId = useId();

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;
    setCopiedIndex(null);
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

  const safeKeys = useMemo(() => keys.filter(Boolean), [keys]);

  if (!mounted || !isOpen || safeKeys.length === 0) {
    return null;
  }

  const handleCopy = async (value: string, index: number) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex((current) => (current === index ? null : current)), 2000);
    } catch (error) {
      console.warn("Failed to copy value", error);
    }
  };

  const modal = (
    <div className="overlay" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="close" onClick={onClose} aria-label="Close secret reveal">
            ×
          </button>
        </header>
        <div className="body">
          {context && <p className="context">{context}</p>}
          <p className="disclaimer">
            This is the only time these credentials will ever be displayed. Store them immediately in your
            team&apos;s password manager or secret vault. We cannot recover them later.
          </p>
          <ul>
            {safeKeys.map((key, index) => (
              <li key={key}>
                <code>{key}</code>
                <button type="button" onClick={() => handleCopy(key, index)}>
                  {copiedIndex === index ? "Copied" : "Copy"}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <footer>
          <button type="button" className="primary" onClick={onClose}>
            I have stored these secrets securely
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
            z-index: 2000;
            padding: 1.5rem;
          }
          .modal {
            background: #fff;
            border-radius: 8px;
            box-shadow: 0 20px 45px rgba(0, 0, 0, 0.2);
            width: min(640px, 100%);
            display: flex;
            flex-direction: column;
            max-height: 90vh;
          }
          header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 1rem 1.25rem;
            border-bottom: 1px solid #f0f0f0;
          }
          header h2 {
            margin: 0;
            font-size: 1.25rem;
          }
          .close {
            border: none;
            background: transparent;
            font-size: 1.5rem;
            cursor: pointer;
            line-height: 1;
            color: #888;
          }
          .close:hover {
            color: #000;
          }
          .body {
            padding: 1rem 1.25rem 0.75rem;
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
            overflow-y: auto;
          }
          .context {
            margin: 0;
            color: #333;
          }
          .disclaimer {
            margin: 0;
            color: #cf1322;
            font-weight: 500;
          }
          ul {
            list-style: none;
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
          }
          li {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.75rem;
            background: #141414;
            color: #fff;
            border-radius: 6px;
            padding: 0.75rem 1rem;
            flex-wrap: wrap;
          }
          code {
            font-family: "Fira Code", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace;
            font-size: 0.95rem;
            word-break: break-all;
            flex: 1 1 auto;
          }
          li button {
            flex: 0 0 auto;
            border: none;
            background: #262626;
            color: #fff;
            padding: 0.35rem 0.75rem;
            border-radius: 4px;
            cursor: pointer;
          }
          li button:hover {
            background: #434343;
          }
          footer {
            padding: 1rem 1.25rem 1.25rem;
            border-top: 1px solid #f0f0f0;
            display: flex;
            justify-content: flex-end;
          }
          .primary {
            background: #1890ff;
            color: #fff;
            border: none;
            border-radius: 4px;
            padding: 0.5rem 1rem;
            cursor: pointer;
          }
          .primary:hover {
            background: #096dd9;
          }
          @media (max-width: 480px) {
            li {
              flex-direction: column;
              align-items: flex-start;
            }
            li button {
              width: 100%;
              text-align: center;
            }
          }
        `}</style>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
