import { useState, useEffect } from "react";

export default function ApiKeyModal() {
  const [apiKey, setApiKey] = useState("");
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("apiKey");
    if (!stored) {
      setShow(true);
    }
  }, []);

  const save = () => {
    if (typeof window !== "undefined" && apiKey) {
      localStorage.setItem("apiKey", apiKey);
    }
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="modal">
      <div className="modal-content">
        <h2>Enter API Key</h2>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <button onClick={save}>Save</button>
      </div>
      <style jsx>{`
        .modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .modal-content {
          background: #fff;
          padding: 1rem;
          border-radius: 4px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          min-width: 300px;
        }
        input {
          padding: 0.5rem;
          font-size: 1rem;
        }
        button {
          align-self: flex-end;
          padding: 0.5rem 1rem;
        }
      `}</style>
    </div>
  );
}
