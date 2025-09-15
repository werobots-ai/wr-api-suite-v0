/* eslint-disable @typescript-eslint/no-explicit-any */
import { QAResult, Question, QuestionSet } from "@/types/Questions";
import { useState, useEffect, useRef } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function SnippetsPage(props: {
  questionSet: QuestionSet | null;
  snippets: Record<string, QAResult>;
  setSnippets: React.Dispatch<React.SetStateAction<Record<string, QAResult>>>;
}) {
  const { snippets, setSnippets } = props;

  const [logs, setLogs] = useState<string[]>([]);
  const logsRef = useRef<HTMLTextAreaElement>(null);
  const isAtBottomRef = useRef(true);
  const [showDrawer, setShowDrawer] = useState(false);
  const [drawerData, setDrawerData] = useState<{
    shortQuestion: string;
    convId: string;
    question: string;
    questionId: number;
    files: string[];
    metrics: { requests: number; cost: number };
    shortAnswer?: string;
    detailedAnswer?: string;
    reasoning?: string;
    detailedReasoning?: string;
  } | null>(null);
  const [processingMsg, setProcessingMsg] = useState<string | null>(null);

  const initialHasDropped = snippets && Object.keys(snippets).length > 0;
  const [hasDropped, setHasDropped] = useState(initialHasDropped);

  useEffect(() => {
    if (!props.questionSet) {
      window.location.href = "/questions";
    }
  }, [props.questionSet]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const getApiKey = () =>
    typeof window !== "undefined" ? localStorage.getItem("apiKey") : null;

  const handleBrowse = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    setHasDropped(true);
    setSnippets({});
    setLogs([]);
    const form = new FormData();
    for (let i = 0; i < e.target.files.length; i++) {
      const f = e.target.files[i];
      if (
        f.name.toLowerCase().endsWith(".xlsx") ||
        f.name.toLowerCase().endsWith(".txt") ||
        f.name.toLowerCase().endsWith(".md")
      ) {
        form.append("files", f);
      }
    }
    if (!form.has("files")) {
      setLogs((prev) => [...prev, "No .xlsx, .txt, or .md files found."]);
      e.target.value = "";
      return;
    }
    const apiKey = getApiKey();
    const headers: Record<string, string> = props.questionSet
      ? { questionSetId: props.questionSet.id }
      : {};
    if (apiKey) headers["x-api-key"] = apiKey;
    const res = await fetch(`${API_URL}/api/upload`, {
      method: "POST",
      headers,
      body: form,
    });
    if (!res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop()!;
      for (const part of parts) {
        const lines = part.split("\n");
        const eventLine = lines.find((l) => l.startsWith("event:"));
        const dataLine = lines.find((l) => l.startsWith("data:"));
        if (!eventLine || !dataLine) continue;
        const event = eventLine.replace("event:", "").trim();
        const data = JSON.parse(dataLine.replace("data:", ""));
        handleEvent(event, data);
      }
    }
    e.target.value = "";
  };

  const cellRefs = useRef<Record<string, HTMLTableCellElement>>({});
  useEffect(() => {
    if (showDrawer && drawerData) {
      const key = `${drawerData.convId}-${drawerData.question}`;
      const cell = cellRefs.current[key];
      if (cell) {
        cell.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "center",
        });

        // remove highlight from all cells in the same column
        Object.values(cellRefs.current).forEach((c) => {
          if (c !== cell && c.classList.contains("highlight")) {
            c.classList.remove("highlight");
          }
        });
        // highlight the selected cell
        cell.classList.add("highlight");
      }
    }
  }, [showDrawer, drawerData]);
  useEffect(() => {
    if (!showDrawer) {
      Object.values(cellRefs.current).forEach((cell) =>
        cell.classList.remove("highlight")
      );
    }
  }, [showDrawer]);

  const handleLogScroll = () => {
    if (!logsRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logsRef.current;
    isAtBottomRef.current = scrollTop + clientHeight >= scrollHeight - 5;
  };

  // Auto-scroll logs to bottom when updated, only if already at bottom
  useEffect(() => {
    if (isAtBottomRef.current && logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

  const handleEvent = (event: string, data: any) => {
    if (event === "log") {
      setLogs((prev) => [...prev, data.log]);
      return;
    }
    if (event === "error") {
      setLogs((prev) => [...prev, `Error: ${data.message}`]);
      return;
    }
    if (event === "snippetCount") {
      const count = data.count ?? 0;
      setProcessingMsg(`Received ${count} snippets. Processing...`);
      return;
    }
    if (!data.snippetId) {
      return;
    }

    setSnippets((prev) => {
      const convId: string = data.snippetId;
      const existing = prev[convId] || { files: [], answers: {} };
      const conv = {
        files: [...existing.files],
        snippetId: convId,
        questionSetId: existing.questionSetId,
        logs: existing.logs || [],
        answers: { ...existing.answers },
        metrics: existing.metrics || {
          requests: 0,
          cost: 0,
        },
        rowCount: existing.rowCount || 0,
        errors: existing.errors || [],
      };

      const initAnswer = () => {
        if (!conv.answers[data.question]) {
          conv.answers[data.question] = {
            short_answer: "",
            detailed_answer: "",
            short_reasoning: "",
            detailed_reasoning: "",
          };
        }
      };

      switch (event) {
        case "conversation":
        case "snippet":
          // ensure answers object exists
          break;
        case "linkFileToSnippet":
          if (!conv.files.includes(data.file)) conv.files.push(data.file);
          break;
        case "reasoning": {
          const q = data.question;
          initAnswer();
          conv.answers[q].short_reasoning = data.reasoning;
          break;
        }
        case "detailedReasoning": {
          const q = data.question;
          initAnswer();
          conv.answers[q].detailed_reasoning = data.detailedReasoning;
          break;
        }
        case "detailedAnswer": {
          const q = data.question;
          initAnswer();
          conv.answers[q].detailed_answer = data.detailedAnswer;
          break;
        }
        case "shortAnswer": {
          const q = data.question;
          initAnswer();
          conv.answers[q].short_answer = data.shortAnswer;
          break;
        }
        case "metrics":
          conv.metrics = data.metrics;
          break;
        case "rowCount":
          conv.rowCount = data.count;
          break;
        case "fileError":
          conv.errors.push(data.message);
          setLogs((prev) => [
            ...prev,
            `Error in file ${data.file}: ${data.message}`,
          ]);
          break;
        case "processingQuestions":
          const q = data.questions as Question[];
          conv.answers = {
            ...conv.answers,
            ...q.reduce((acc, question) => {
              acc[question.questionText] = conv.answers[
                question.questionText
              ] || {
                short_answer: "",
                detailed_answer: "",
                short_reasoning: "",
                detailed_reasoning: "",
              };

              return acc;
            }, {} as QAResult["answers"]),
          };
          break;
        default:
          alert(`Ignoring event: ${event}`);
          break;
      }

      return { ...prev, [convId]: conv };
    });
  };

  const handleContainerDragOver = (e: React.DragEvent) => {
    if (hasDropped) {
      e.preventDefault();
      setHasDropped(false);
    }
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setHasDropped(true);
    // clear previous data
    setSnippets({});
    setLogs([]);

    const form = new FormData();
    // append direct files
    for (let i = 0; i < e.dataTransfer.files.length; i++) {
      const f = e.dataTransfer.files[i];
      if (
        f.name.toLowerCase().endsWith(".xlsx") ||
        f.name.toLowerCase().endsWith(".txt") ||
        f.name.toLowerCase().endsWith(".md")
      ) {
        form.append("files", f);
      }
    }
    // traverse directories if needed
    if (e.dataTransfer.items) {
      const traverseItem = (item: any): Promise<void> =>
        new Promise((resolve) => {
          if (item.isFile) {
            item.file((file: File) => {
              if (
                file.name.toLowerCase().endsWith(".xlsx") ||
                file.name.toLowerCase().endsWith(".txt") ||
                file.name.toLowerCase().endsWith(".md")
              ) {
                form.append("files", file);
              }
              resolve();
            });
          } else if (item.isDirectory) {
            const reader = item.createReader();
            reader.readEntries((entries: any[]) => {
              Promise.all(entries.map(traverseItem)).then(() => resolve());
            });
          } else {
            resolve();
          }
        });
      const traversePromises: Promise<void>[] = [];
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const entry = e.dataTransfer.items[i].webkitGetAsEntry?.();
        if (entry) {
          traversePromises.push(traverseItem(entry));
        }
      }
      await Promise.all(traversePromises);
    }
    if (!form.has("files")) {
      setLogs((prev) => [...prev, "No .xlsx, .txt, or .md files found."]);
      return;
    }

    // Include questionSetId header if provided
    const apiKey = getApiKey();
    const headers: Record<string, string> = props.questionSet
      ? { questionSetId: props.questionSet.id }
      : {};
    if (apiKey) headers["x-api-key"] = apiKey;
    const res = await fetch(`${API_URL}/api/upload`, {
      method: "POST",
      headers,
      body: form,
    });
    if (!res.body) return;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop()!;

      for (const part of parts) {
        const lines = part.split("\n");
        const eventLine = lines.find((l) => l.startsWith("event:"));
        const dataLine = lines.find((l) => l.startsWith("data:"));
        if (!eventLine || !dataLine) continue;

        const event = eventLine.replace("event:", "").trim();
        const data = JSON.parse(dataLine.replace("data:", ""));
        handleEvent(event, data);
      }
    }
  };

  const handleOpenDrawer = (convId: string, questionText: string) => {
    const conv = snippets[convId];
    const ans = conv.answers[questionText] || {};
    const { questionId, shortQuestionText } = props.questionSet!.questions.find(
      (q) => q.questionText === questionText
    )!;
    setDrawerData({
      shortQuestion: shortQuestionText,
      convId,
      question: questionText,
      questionId,
      files: conv.files,
      metrics: conv.metrics,
      shortAnswer: ans.short_answer,
      detailedAnswer: ans.detailed_answer,
      reasoning: ans.short_reasoning,
      detailedReasoning: ans.detailed_reasoning,
    });
    setShowDrawer(true);
  };

  const handleCloseDrawer = () => {
    setShowDrawer(false);
    setDrawerData(null);
  };

  const truncate = (text: string = "", max = 50) => {
    return text.length > max ? text.slice(0, max) + "…" : text;
  };

  return (
    <>
      {processingMsg && (
        <div className="modal-overlay">
          <div className="modal">
            <button
              className="modal-close-button"
              onClick={() => setProcessingMsg(null)}
            >
              ×
            </button>
            <p>{processingMsg}</p>
          </div>
        </div>
      )}
      <main className="container" onDragOver={handleContainerDragOver}>
        <input
          ref={fileInputRef}
          type="file"
          accept={[".xlsx", ".txt", ".md"].join(",")}
          multiple
          // @ts-expect-error webkitdirectory is not in the type definition
          webkitdirectory="true"
          style={{ display: "none" }}
          onChange={handleBrowse}
        />
        <div
          className={`panel dropzone ${hasDropped ? "dropped" : ""}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          Drag &amp; drop XLSX, TXT, or MD files or folders here, or&nbsp;
          <span
            className="browse"
            onClick={() => fileInputRef.current?.click()}
          >
            click to browse
          </span>
        </div>

        <div
          className={`panel results ${hasDropped ? "visible" : ""} ${
            showDrawer ? "with-drawer" : ""
          }`}
        >
          {(() => {
            const convEntries = Object.entries(snippets);
            if (convEntries.length === 0) {
              return <p>No snippets yet.</p>;
            }
            const questions = props.questionSet!.questions as Question[];

            return (
              <table
                style={{
                  borderCollapse: "collapse",
                  width: "100%",
                }}
              >
                <thead>
                  <tr>
                    <th
                      style={{
                        border: "1px solid #ccc",
                        padding: "0.5rem",
                        whiteSpace: "normal",
                        wordBreak: "break-word",
                        overflowWrap: "break-word",
                        minWidth: "250px",
                      }}
                    >
                      Question
                    </th>
                    {convEntries.map(([id, conv]) => (
                      <th
                        key={id}
                        className={
                          showDrawer && drawerData?.convId !== id
                            ? "hidden-column"
                            : ""
                        }
                        style={{
                          minWidth: "200px",
                          border: "1px solid #ccc",
                          padding: "0.5rem",
                        }}
                      >
                        {conv.files.join(", ")}
                        <br />
                        <span
                          style={{
                            fontSize: "0.7rem",
                            fontFamily: "monospace",
                            fontWeight: "normal",
                            color: "#555",
                          }}
                        >
                          {conv.rowCount ? `${conv.rowCount} rows - ` : ""}$
                          {conv.metrics.cost.toFixed(4)}
                          <br />
                          {conv.metrics.requests} request
                          {conv.metrics.requests > 1 ? "s" : ""}
                        </span>
                        {conv.errors.length > 0 && (
                          <span
                            style={{
                              color: "red",
                              fontSize: "0.7rem",
                              fontFamily: "monospace",
                            }}
                          >
                            {conv.errors.map((e: any) => (
                              <div key={e} title={e}>
                                {truncate(e)}
                              </div>
                            ))}
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {questions.map((question) => (
                    <tr key={question.questionText}>
                      <td
                        key={question.questionText}
                        className={`question-cell ${
                          showDrawer &&
                          drawerData?.question === question.questionText
                            ? "highlight-question"
                            : ""
                        } ${showDrawer ? "clickable-question-cell" : ""}`}
                        onClick={() => {
                          if (
                            showDrawer &&
                            drawerData?.question === question.questionText
                          ) {
                            handleCloseDrawer();
                          } else if (showDrawer && drawerData) {
                            handleOpenDrawer(
                              drawerData.convId,
                              question.questionText
                            );
                          }
                        }}
                        style={{
                          border: "1px solid #ccc",
                          padding: "0.5rem",
                          whiteSpace: "normal",
                          wordBreak: "break-word",
                          overflowWrap: "break-word",
                        }}
                      >
                        {question.shortQuestionText}
                      </td>
                      {convEntries.map(([id, conv]) => {
                        const ans = conv.answers[question.questionText] || {};
                        return (
                          <td
                            ref={(el) => {
                              if (el)
                                cellRefs.current[
                                  `${id}-${question.questionText}`
                                ] = el;
                            }}
                            key={id}
                            className={`clickable-cell ${
                              showDrawer && drawerData?.convId !== id
                                ? "hidden-column"
                                : ""
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (
                                showDrawer &&
                                drawerData?.convId === id &&
                                drawerData.question === question.questionText
                              ) {
                                handleCloseDrawer();
                              } else {
                                handleOpenDrawer(id, question.questionText);
                              }
                            }}
                            style={{
                              border: "1px solid #ccc",
                              padding: "0.5rem",
                              verticalAlign: "top",
                              position: "relative",
                            }}
                          >
                            {ans.short_answer ||
                              (conv.answers[question.questionText]
                                ? "Processing…"
                                : "")}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
        </div>

        <div
          className={`panel logs ${hasDropped ? "visible" : ""} ${
            hasDropped ? "with-dropzone" : ""
          }`}
        >
          <textarea
            ref={logsRef}
            readOnly
            onScroll={handleLogScroll}
            value={logs.join("\n")}
          />
        </div>
      </main>
      {showDrawer && drawerData && (
        <div className="drawer-overlay" onClick={handleCloseDrawer}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()}>
            <button className="drawer-close-button" onClick={handleCloseDrawer}>
              ×
            </button>
            <h1 className="drawer-title">
              Q{drawerData.questionId}: {drawerData.shortQuestion}
            </h1>
            <p>{drawerData.question}</p>
            <div>
              <strong>Document Path:</strong> {drawerData.files.join(", ")}
            </div>
            <div>
              <strong>Request Count:</strong> {drawerData.metrics.requests}
            </div>
            {/* <div>
              <strong>Cost:</strong> ${drawerData.metrics.cost.toFixed(4)}
            </div> */}
            {drawerData.shortAnswer && (
              <>
                <h2>Answer: {drawerData.shortAnswer}</h2>
                {drawerData.detailedAnswer &&
                  drawerData.detailedAnswer !== drawerData.shortAnswer && (
                    <div
                      dangerouslySetInnerHTML={{
                        __html: drawerData.detailedAnswer,
                      }}
                    />
                  )}
              </>
            )}

            {drawerData.reasoning && (
              <>
                <h2>Reasoning</h2>
                <div>
                  {drawerData.reasoning && (
                    <div
                      dangerouslySetInnerHTML={{ __html: drawerData.reasoning }}
                    />
                  )}
                </div>
              </>
            )}

            {drawerData.detailedReasoning && (
              <>
                <h2>Full thought process</h2>
                <div
                  dangerouslySetInnerHTML={{
                    __html: drawerData.detailedReasoning,
                  }}
                />
              </>
            )}
          </aside>
        </div>
      )}
      <style jsx>{`
        .container {
          padding: 1rem;
          display: flex;
          flex-direction: column;
          flex: 1 1 auto;
          overflow: hidden;
          gap: 1rem;
          box-sizing: border-box;
          background: #f0f2f5;
          position: relative;
        }
        .panel {
          background: #fff;
          border-radius: 4px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          padding: 1rem;
          box-sizing: border-box;
        }
        .dropzone {
          position: absolute;
          bottom: 2%;
          right: 2%;
          width: 96%;
          height: 96%;
          transform-origin: bottom right;
          transition: all 0.5s ease;
          transform: scale(1);
          text-align: center;
          min-height: 100px;
          border: 2px dashed #888;
        }
        .dropzone.dropped {
          width: 150px;
          height: 150px;
          bottom: 1rem;
          right: 1rem;
          top: auto;
          left: auto;
          z-index: 1;
          opacity: 0.8;
        }
        .results {
          opacity: 0;
          transform: translateY(-100%);
          transition: opacity 0.5s ease, transform 0.5s ease;
          flex: 1 1 auto;
          overflow: auto;
          min-height: 0;
        }
        .results.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .results.with-drawer {
          width: calc(100% - 40rem);
          transition: width 0.3s ease;
          overflow-x: hidden;
        }
        .logs {
          opacity: 0;
          transform: translateY(100%);
          transition: opacity 0.5s ease, transform 0.5s ease;
          flex: 0 0 150px;
        }
        .logs.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .logs.with-dropzone {
          margin-right: calc(150px + 1rem);
          transition: margin 0.3s ease;
        }
        .logs textarea {
          width: 100%;
          height: 100%;
          font-family: monospace;
          resize: none;
          border: none;
          overflow-y: auto;
        }
        .modal-overlay {
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
        .modal {
          position: relative;
          background: #fff;
          padding: 1.5rem;
          border-radius: 8px;
          max-width: 1000px;
          width: 90%;
          max-height: 80%;
          overflow-y: auto;
        }
        details > summary {
          list-style: none;
          color: #222;
          font-weight: bold;
        }
        details > summary::-webkit-details-marker {
          display: none;
        }
        details > summary::after {
          content: "▸";
          margin-left: 0.25rem;
          color: #555;
        }
        details[open] > summary::after {
          content: "▾";
        }

        .modal-close-button {
          position: absolute;
          top: 0.5rem;
          right: 0.5rem;
          background: transparent;
          border: none;
          font-size: 1.25rem;
          cursor: pointer;
        }

        .drawer {
          position: fixed;
          top: 0;
          right: 0;
          width: 40rem;
          max-width: 100%;
          height: 100%;
          background: #fff;
          box-shadow: -2px 0 8px rgba(0, 0, 0, 0.1);
          overflow-y: auto;
          z-index: 1000;
          padding: 1rem;
          transform: translateX(100%);
          transition: transform 0.3s ease;
          text-align: left;
        }
        .drawer-overlay .drawer {
          transform: translateX(0);
        }
        .drawer-close-button {
          position: sticky;
          top: 0;
          display: block;
          margin-left: auto;
          background: #fff;
          border: none;
          font-size: 1.75rem;
          padding: 0.5rem;
          cursor: pointer;
          z-index: 1001;
        }
        .drawer-overlay {
          position: fixed;
          top: 0;
          right: 0;
          width: 40rem;
          height: 100%;
          background: transparent;
          z-index: 999;
        }
        .drawer-title {
          font-size: 1.8rem;
          margin: -2.7rem 0 0;
        }
        .drawer h2 {
          margin-top: 2.5rem;
          margin-bottom: 0;
        }
        .highlight {
          background-color: #fffae6;
        }
        .clickable-cell {
          cursor: pointer;
          position: relative;
          transition: background-color 0.2s ease;
          white-space: normal;
          word-break: break-word;
          overflow-wrap: break-word;
        }
        .clickable-cell:hover {
          background-color: rgba(0, 0, 0, 0.03);
        }
        .clickable-cell::after {
          content: "›";
          position: absolute;
          top: 50%;
          right: 0.5rem;
          transform: translateY(-50%);
          color: #aaa;
          font-size: 0.75rem;
          pointer-events: none;
        }
        .hidden-column {
          width: 0;
          padding: 0 !important;
          border: none !important;
          overflow: hidden;
          transition: width 0.3s ease, padding 0.3s ease;
          display: none;
        }
        .browse {
          color: #0070f3;
          text-decoration: underline;
          cursor: pointer;
        }
        table th,
        table td {
          /* enforce consistent padding and line-height */
          padding: 0.5rem !important;
          line-height: 1.5;
          transition: width 0.3s ease, padding 0.3s ease, height 0.3s ease;
        }
        .results {
          scroll-behavior: smooth;
        }
        .highlight-question {
          background-color: #fffae6;
          transition: background-color 0.3s ease;
        }
        .clickable-question-cell {
          cursor: pointer;
          transition: background-color 0.2s ease;
        }
        .clickable-question-cell:hover {
          background-color: rgba(0, 0, 0, 0.03);
        }
        :global(.drawer table) {
          width: 100%;
          border-collapse: collapse;
          margin-top: 1rem;
        }
        :global(.drawer table th),
        :global(.drawer table td) {
          padding: 0.5rem 0.75rem;
          border-bottom: 1px solid #ddd;
          text-align: left;
          background: #f9f9f9;
          font-size: 0.9rem;
        }
        :global(.drawer table th) {
          font-weight: 600;
        }
        /* Add bottom spacing to the last element inside the drawer */
        :global(.drawer > :last-child) {
          margin-bottom: 4rem;
        }
      `}</style>
    </>
  );
}
