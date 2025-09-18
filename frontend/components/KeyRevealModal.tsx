import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";

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

  useEffect(() => {
    if (!isOpen) return;
    setCopiedIndex(null);
  }, [isOpen]);

  const safeKeys = useMemo(() => keys.filter(Boolean), [keys]);

  if (!isOpen || safeKeys.length === 0) {
    return null;
  }

  const handleCopy = async (value: string, index: number) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedIndex(index);
      setTimeout(() =>
        setCopiedIndex((current) => (current === index ? null : current)),
      2000);
    } catch (error) {
      console.warn("Failed to copy value", error);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      className="key-reveal-modal"
      bodyClassName="key-reveal-body"
      closeLabel="Close secret reveal"
      footer={
        <button type="button" className="primary" onClick={onClose}>
          I have stored these secrets securely
        </button>
      }
    >
      {context && <p className="context">{context}</p>}
      <p className="disclaimer">
        This is the only time these credentials will ever be displayed. Store
        them immediately in your team&apos;s password manager or secret vault. We
        cannot recover them later.
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
      <style jsx>{`
        :global(.key-reveal-modal) {
          width: min(640px, 100%);
        }
        :global(.key-reveal-body) {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          padding-bottom: 0;
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
          font-family: "Fira Code", "SFMono-Regular", Consolas,
            "Liberation Mono", Menlo, Courier, monospace;
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
    </Modal>
  );
}
