// frontend/pages/questions.tsx

import {
  Question,
  QuestionSet,
  QuestionType,
  QUESTION_TYPE_LABELS,
  ListQuestion,
  QAResult,
} from "@/types/Questions";
import { useState, useEffect, useRef, useLayoutEffect } from "react";
import DynamicWidthTextarea from "@/components/DynamicWidthTextarea";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

const blankQuestionSet: QuestionSet = {
  id: "",
  title: "",
  questions: [],
  snippetType: "",
  executionPlan: "",
  executionPlanReasoning: "",
  qaResults: [] as QAResult[],
};

const QuestionSetPage: React.FC<
  React.PropsWithChildren<{
    questionSet: QuestionSet | null;
    setQuestionSet: React.Dispatch<React.SetStateAction<QuestionSet | null>>;
    snippets: Record<string, QAResult>;
    setSnippets: React.Dispatch<React.SetStateAction<Record<string, QAResult>>>;
    isSaved: boolean;
    setIsSaved: React.Dispatch<React.SetStateAction<boolean>>;
  }>
> = (props) => {
  const { questionSet, setQuestionSet, isSaved, setIsSaved, setSnippets } =
    props;
  const {
    questions = [],
    snippetType = "",
    executionPlan = "",
  } = questionSet || blankQuestionSet;

  const [showModal, setShowModal] = useState(false);
  const [userInput, setUserInput] = useState("");

  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(
    null
  );
  const [editingDesc, setEditingDesc] = useState(false);
  const [editingPlan, setEditingPlan] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const logViewerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logViewerRef.current) {
      logViewerRef.current.scrollTop = logViewerRef.current.scrollHeight;
    }
  }, [logs]);
  const [streamComplete, setStreamComplete] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [availableSets, setAvailableSets] = useState<
    {
      id: string;
      title: string;
      date: string;
      questionCount: number;
      snippetCount: number;
    }[]
  >([]);
  const [countdown, setCountdown] = useState<number>(0);
  const [timerCanceled, setTimerCanceled] = useState<boolean>(false);

  useEffect(() => {
    if (streamComplete) {
      setTimerCanceled(false);
      setCountdown(20);
    }
  }, [streamComplete]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (streamComplete && !timerCanceled) {
      timer = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            clearInterval(timer);
            closeModal();
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [streamComplete, timerCanceled]);
  const loadListRef = useRef<HTMLUListElement>(null);
  const [focusedSetId, setFocusedSetId] = useState<string | null>(null);
  const [editingDetails, setEditingDetails] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    [descRef.current, titleRef.current].forEach((ta) => {
      if (ta) {
        ta.style.height = "auto";
        ta.style.height = `${ta.scrollHeight}px`;
      }
    });
  }, [selectedQuestion?.description, selectedQuestion?.questionText]);

  useEffect(() => {
    if (editingDetails && titleRef.current) {
      const el = titleRef.current;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, [editingDetails]);

  const openModal = () => setShowModal(true);
  const closeModal = () => setShowModal(false);
  const openLoadModal = async () => {
    const apiKey = getApiKey();
    const res = await fetch(`${API_URL}/api/questions`, {
      headers: apiKey ? { "x-api-key": apiKey } : undefined,
    });
    const data: {
      id: string;
      title: string;
      date: string;
      questionCount: number;
      snippetCount: number;
    }[] = await res.json();
    setAvailableSets(data);
    setShowLoadModal(true);
    setFocusedSetId(data.length > 0 ? data[0].id : null);
  };
  const closeLoadModal = () => setShowLoadModal(false);
  const handleDeleteSet = async (id: string) => {
    if (
      window.confirm(
        "Are you sure you want to delete this question set? This action cannot be undone."
      )
    ) {
      const apiKey = getApiKey();
      await fetch(`${API_URL}/api/questions/${id}`, {
        method: "DELETE",
        headers: apiKey ? { "x-api-key": apiKey } : undefined,
      });
      setAvailableSets((prev) => prev.filter((s) => s.id !== id));
    }
  };

  const loadQuestionSet = async (id: string) => {
    const apiKey = getApiKey();
    const res = await fetch(`${API_URL}/api/questions/${id}`, {
      headers: apiKey ? { "x-api-key": apiKey } : undefined,
    });
    const set: QuestionSet = await res.json();

    setQuestionSet(set);
    setSnippets(
      set.qaResults.reduce((acc, result) => {
        acc[result.snippetId] = result;
        return acc;
      }, {} as Record<string, QAResult>)
    );

    setIsSaved(true);
    closeLoadModal();
  };

  const handleSubmit = async () => {
    setQuestionSet(null);
    setIsSaved(false);
    setIsGenerating(true);
    setLogs([]);
    setStreamComplete(false);

    const apiKey = getApiKey();
    const res = await fetch(`${API_URL}/api/questions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "x-api-key": apiKey } : {}),
      },
      body: JSON.stringify({ changeRequest: userInput }),
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
        const payload = JSON.parse(dataLine.replace("data:", "").trim());

        switch (event) {
          case "log":
            setLogs((prev) => [...prev, payload.log]);
            break;

          case "loadQuestionSet":
            loadQuestionSet(payload.questionSetId);
            break;
          default:
            break;
        }
      }
    }

    setIsGenerating(false);
    setStreamComplete(true);
  };

  const handleSave = () => {
    // TODO: persist this question set to the backend
    setIsSaved(true);
  };

  const handleListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!questions.length) return;
    const currentIndex = questions.findIndex(
      (q) => selectedQuestion?.questionId === q.questionId
    );
    let nextIndex = currentIndex;
    if (e.key === "ArrowDown") {
      nextIndex = Math.min(currentIndex + 1, questions.length - 1);
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      nextIndex = Math.max(currentIndex - 1, 0);
      e.preventDefault();
    }
    if (nextIndex !== currentIndex) {
      setSelectedQuestion(questions[nextIndex]);
    }
  };

  const handleLoadKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (!availableSets.length) return;
    const idx = availableSets.findIndex((s) => s.id === focusedSetId);
    let next = idx;
    if (e.key === "ArrowDown") {
      next = Math.min(idx + 1, availableSets.length - 1);
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      next = Math.max(idx - 1, 0);
      e.preventDefault();
    } else if (e.key === "Enter" && idx >= 0) {
      loadQuestionSet(availableSets[idx].id);
      return;
    }
    if (next !== idx && next >= 0) {
      setFocusedSetId(availableSets[next].id);
    }
  };

  useEffect(() => {
    if (showLoadModal) {
      // Focus the list so arrow keys work immediately
      loadListRef.current?.focus();
    }
  }, [showLoadModal]);

  useEffect(() => {
    if (listRef.current && selectedQuestion) {
      const el = listRef.current.querySelector(
        `.question-item[data-question-id="${selectedQuestion.questionId}"]`
      ) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedQuestion]);

  const getApiKey = () =>
    typeof window !== "undefined" ? localStorage.getItem("apiKey") : null;

  return (
    <main className="container">
      {showModal && (
        <div className="modal">
          {!isGenerating && !streamComplete && (
            <>
              <DynamicWidthTextarea
                placeholder="Type or paste your questions here or describe the set of questions you want to generate."
                growVertically={true}
                rows={8}
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
              />
            </>
          )}

          {(isGenerating || logs.length > 0) && (
            <div className="log-viewer" ref={logViewerRef}>
              {logs.map((line, idx) => (
                <div key={idx}>{line}</div>
              ))}
            </div>
          )}

          <div className="modal-buttons">
            {!isGenerating && !streamComplete && (
              <>
                <button className="finish-button" onClick={handleSubmit}>
                  Generate Questions
                </button>
                <button className="finish-button" onClick={closeModal}>
                  Cancel
                </button>
              </>
            )}
            {isGenerating && <span>Processing... please wait.</span>}
            {streamComplete && (
              <>
                <p className="finish-message">
                  The question set is saved! You can now close this and review
                  it.
                </p>
                <button className="finish-button" onClick={closeModal}>
                  Close{countdown > 0 ? ` (${countdown}s)` : ""}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {showLoadModal && (
        <div className="modal">
          <button
            className="modal-close"
            onClick={closeLoadModal}
            aria-label="Close"
          >
            ×
          </button>
          <h2>Select a Question Set</h2>
          <ul
            className="load-list"
            tabIndex={0}
            ref={loadListRef}
            onKeyDown={handleLoadKeyDown}
            onFocus={() => {
              if (!focusedSetId && availableSets.length) {
                setFocusedSetId(availableSets[0].id);
              }
            }}
          >
            {availableSets.map((set) => (
              <li
                key={set.id}
                className={`load-item ${
                  focusedSetId === set.id ? "selected" : ""
                }`}
                onClick={() => loadQuestionSet(set.id)}
                onFocus={() => setFocusedSetId(set.id)}
                tabIndex={-1}
              >
                <div className="load-item-content">
                  <div className="load-item-title">{set.title}</div>
                  <div className="load-item-subtitle">
                    {new Date(set.date).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}{" "}
                    • {set.questionCount}
                    {set.questionCount === 1 ? " Question" : " Questions"}
                    {set.snippetCount > 0
                      ? ` • ${set.snippetCount} ${
                          set.snippetCount === 1
                            ? "Conversation"
                            : "Conversations"
                        }`
                      : ""}
                  </div>
                </div>
                <button
                  className="delete-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteSet(set.id);
                  }}
                  aria-label="Delete question set"
                >
                  {/* Trash icon SVG */}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M3 6h18"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <path
                      d="M8 6V4h8v2"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <path
                      d="M19 6l-1 14H6L5 6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <path
                      d="M10 11v6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <path
                      d="M14 11v6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="main-content">
        <div className="panel questions-panel" tabIndex={0}>
          <div className="panel-header">
            <div className="toolbar-right">
              {isSaved && (
                <>
                  {/* Temporarily disabled */}
                  {/* <button className="btn-primary" onClick={openModal}>
                    ✨ Refine with AI
                  </button> */}

                  <button className="btn-secondary" onClick={openLoadModal}>
                    Load Existing Set
                  </button>
                  <button className="btn-secondary" onClick={openModal}>
                    ✨ Create Question Set
                  </button>
                </>
              )}
            </div>
          </div>

          {questions.length === 0 ? (
            <div className="empty-state">
              <p>No questions generated yet.</p>
              <div className="empty-state-buttons">
                <button className="btn-primary" onClick={openModal}>
                  ✨ Create Question Set
                </button>
                <button className="btn-primary" onClick={openLoadModal}>
                  Load Existing Set
                </button>
              </div>
            </div>
          ) : (
            <div
              className="questions-list"
              tabIndex={0}
              ref={listRef}
              onKeyDown={handleListKeyDown}
            >
              <ul className="questions-list-ul">
                {questions.map((q) => (
                  <li
                    key={q.questionId}
                    data-question-id={q.questionId}
                    className={`question-item ${
                      selectedQuestion?.questionId === q.questionId
                        ? "selected"
                        : ""
                    }`}
                    onClick={() => {
                      setSelectedQuestion(q);
                      listRef.current?.focus();
                    }}
                  >
                    <div className="question-title">{`Q${q.questionId}. ${q.questionText}`}</div>
                    <div className="question-subtitle" title={q.description}>
                      {q.description}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className={"panel details-panel"} tabIndex={0}>
          <div className="details-body">
            {selectedQuestion ? (
              <>
                <div className="edit-btn-container">
                  <button
                    className="edit-toggle"
                    onClick={() => setEditingDetails((v) => !v)}
                    aria-label="Toggle Edit Mode"
                  >
                    {editingDetails ? "💾 Save" : "✏️ Edit"}
                  </button>
                </div>
                <div className="details-header">
                  <div className="details-title-group">
                    <h2>
                      Q{selectedQuestion.questionId}.{" "}
                      <DynamicWidthTextarea
                        ref={titleRef}
                        className="details-title-input"
                        disabled={!editingDetails}
                        value={selectedQuestion.questionText}
                        growVertically={true}
                        onChange={(e) =>
                          setQuestionSet(
                            (prev) =>
                              prev && {
                                ...prev,
                                questions: prev.questions.map((q) =>
                                  q.questionId === selectedQuestion.questionId
                                    ? { ...q, questionText: e.target.value }
                                    : q
                                ),
                              }
                          )
                        }
                        onInput={() => {
                          const ta = titleRef.current;
                          if (ta) {
                            ta.style.height = "auto";
                            ta.style.height = `${ta.scrollHeight}px`;
                          }
                        }}
                      />
                    </h2>
                  </div>
                </div>
              </>
            ) : (
              <div className="details-header">
                <p>Select a question to view details.</p>
              </div>
            )}
            {selectedQuestion && (
              <>
                <h3 className="details-section-header">Question Group</h3>
                <DynamicWidthTextarea
                  className="details-field"
                  disabled={!editingDetails}
                  growVertically={true}
                  value={selectedQuestion!.group}
                  onChange={(e) =>
                    setQuestionSet(
                      (prev) =>
                        prev && {
                          ...prev,
                          questions: prev.questions.map((q) =>
                            q.questionId === selectedQuestion!.questionId
                              ? { ...q, group: e.target.value }
                              : q
                          ),
                        }
                    )
                  }
                />
                <h3 className="details-section-header">
                  Question Type:&nbsp;
                  <select
                    className="question-type-select"
                    disabled={!editingDetails}
                    value={selectedQuestion.questionType}
                    onChange={(e) => {
                      const qt = e.target.value as QuestionType;
                      setQuestionSet(
                        (prev) =>
                          prev && {
                            ...prev,
                            questions: prev.questions.map((q) =>
                              q.questionId === selectedQuestion.questionId
                                ? ({ ...q, questionType: qt } as Question)
                                : q
                            ),
                          }
                      );
                    }}
                  >
                    {Object.entries(QUESTION_TYPE_LABELS).map(([key, info]) => (
                      <option key={key} value={key}>
                        {info.label}
                      </option>
                    ))}
                  </select>
                </h3>
                <div>
                  {
                    QUESTION_TYPE_LABELS[selectedQuestion.questionType]
                      .description
                  }
                </div>
                <h3 className="details-section-header">Description</h3>
                <DynamicWidthTextarea
                  ref={descRef}
                  onInput={() => {
                    const ta = descRef.current;
                    if (ta) {
                      ta.style.height = "auto";
                      ta.style.height = `${ta.scrollHeight}px`;
                    }
                  }}
                  growVertically={true}
                  className="details-field"
                  disabled={!editingDetails}
                  value={selectedQuestion.description}
                  onChange={(e) =>
                    setQuestionSet(
                      (prev) =>
                        prev && {
                          ...prev,
                          questions: prev.questions.map((q) =>
                            q.questionId === selectedQuestion.questionId
                              ? { ...q, description: e.target.value }
                              : q
                          ),
                        }
                    )
                  }
                />

                {/* Editable per-type fields */}
                {selectedQuestion.questionType === "classification" && (
                  <>
                    <h3 className="details-section-header">Choices</h3>
                    <ul className="details-dependencies markdown-list">
                      {selectedQuestion.choices.map((choice, idx) => (
                        <li key={idx}>
                          <div className="dependency-header">
                            <DynamicWidthTextarea
                              rows={1}
                              className="details-field choice"
                              disabled={!editingDetails}
                              value={choice.label}
                              onChange={(e) => {
                                const newChoices = selectedQuestion.choices.map(
                                  (c, i) =>
                                    i === idx
                                      ? { ...c, label: e.target.value }
                                      : c
                                );
                                setQuestionSet(
                                  (prev) =>
                                    prev && {
                                      ...prev,
                                      questions: prev.questions.map((q) =>
                                        q.questionId ===
                                        selectedQuestion.questionId
                                          ? { ...q, choices: newChoices }
                                          : q
                                      ),
                                    }
                                );
                              }}
                            />
                            {editingDetails && (
                              <button
                                className="dependency-remove"
                                onClick={() => {
                                  const newChoices =
                                    selectedQuestion.choices.filter(
                                      (_, i) => i !== idx
                                    );
                                  setQuestionSet(
                                    (prev) =>
                                      prev && {
                                        ...prev,
                                        questions: prev.questions.map((q) =>
                                          q.questionId ===
                                          selectedQuestion.questionId
                                            ? { ...q, choices: newChoices }
                                            : q
                                        ),
                                      }
                                  );
                                }}
                                aria-label="Remove choice"
                              >
                                ×
                              </button>
                            )}
                          </div>
                          <DynamicWidthTextarea
                            className="details-field"
                            disabled={!editingDetails}
                            value={choice.criteria}
                            growVertically={true}
                            onChange={(e) => {
                              const newChoices = selectedQuestion.choices.map(
                                (c, i) =>
                                  i === idx
                                    ? { ...c, criteria: e.target.value }
                                    : c
                              );
                              setQuestionSet(
                                (prev) =>
                                  prev && {
                                    ...prev,
                                    questions: prev.questions.map((q) =>
                                      q.questionId ===
                                      selectedQuestion.questionId
                                        ? { ...q, choices: newChoices }
                                        : q
                                    ),
                                  }
                              );
                            }}
                          />
                        </li>
                      ))}
                    </ul>
                    {editingDetails && (
                      <button
                        className="dependency-add"
                        onClick={() => {
                          const newChoices = [
                            ...selectedQuestion.choices,
                            { label: "", criteria: "" },
                          ];
                          setQuestionSet(
                            (prev) =>
                              prev && {
                                ...prev,
                                questions: prev.questions.map((q) =>
                                  q.questionId === selectedQuestion.questionId
                                    ? { ...q, choices: newChoices }
                                    : q
                                ),
                              }
                          );
                        }}
                      >
                        + Add choice
                      </button>
                    )}
                  </>
                )}

                {selectedQuestion.questionType === "scale" && (
                  <>
                    <h3 className="details-section-header">Scale Range</h3>
                    <div className="scale-range-inputs">
                      <span>Values range from </span>
                      <DynamicWidthTextarea
                        className="details-field short-number"
                        disabled={!editingDetails}
                        value={String(selectedQuestion.min)}
                        onChange={(e) => {
                          const min = Number(e.target.value);
                          setQuestionSet(
                            (prev) =>
                              prev && {
                                ...prev,
                                questions: prev.questions.map((q) =>
                                  q.questionId === selectedQuestion.questionId
                                    ? { ...q, min }
                                    : q
                                ),
                              }
                          );
                        }}
                      />
                      <span> to </span>
                      <DynamicWidthTextarea
                        className="details-field short-number"
                        disabled={!editingDetails}
                        value={String(selectedQuestion.max)}
                        onChange={(e) => {
                          const max = Number(e.target.value);
                          setQuestionSet(
                            (prev) =>
                              prev && {
                                ...prev,
                                questions: prev.questions.map((q) =>
                                  q.questionId === selectedQuestion.questionId
                                    ? { ...q, max }
                                    : q
                                ),
                              }
                          );
                        }}
                      />
                      <span>.</span>
                    </div>
                    <h3 className="details-section-header">Ranges</h3>
                    <ul className="details-dependencies markdown-list">
                      {selectedQuestion.ranges.map((rng, idx) => (
                        <li key={idx}>
                          <div className="dependency-header">
                            <DynamicWidthTextarea
                              className="details-field choice short-number"
                              disabled={!editingDetails}
                              value={String(rng.min)}
                              onChange={(e) => {
                                const min = Number(e.target.value);
                                const newRanges = selectedQuestion.ranges.map(
                                  (r, i) => (i === idx ? { ...r, min } : r)
                                );
                                setQuestionSet(
                                  (prev) =>
                                    prev && {
                                      ...prev,
                                      questions: prev.questions.map((q) =>
                                        q.questionId ===
                                        selectedQuestion.questionId
                                          ? { ...q, ranges: newRanges }
                                          : q
                                      ),
                                    }
                                );
                              }}
                            />
                            <span>–</span>
                            <DynamicWidthTextarea
                              className="details-field choice short-number"
                              disabled={!editingDetails}
                              value={String(rng.max)}
                              onChange={(e) => {
                                const max = Number(e.target.value);
                                const newRanges = selectedQuestion.ranges.map(
                                  (r, i) => (i === idx ? { ...r, max } : r)
                                );
                                setQuestionSet(
                                  (prev) =>
                                    prev && {
                                      ...prev,
                                      questions: prev.questions.map((q) =>
                                        q.questionId ===
                                        selectedQuestion.questionId
                                          ? { ...q, ranges: newRanges }
                                          : q
                                      ),
                                    }
                                );
                              }}
                            />
                            <span>:</span>
                            <DynamicWidthTextarea
                              className="details-field choice range-title indented"
                              disabled={!editingDetails}
                              value={rng.title}
                              onChange={(e) => {
                                const title = e.target.value;
                                const newRanges = selectedQuestion.ranges.map(
                                  (r, i) => (i === idx ? { ...r, title } : r)
                                );
                                setQuestionSet(
                                  (prev) =>
                                    prev && {
                                      ...prev,
                                      questions: prev.questions.map((q) =>
                                        q.questionId ===
                                        selectedQuestion.questionId
                                          ? { ...q, ranges: newRanges }
                                          : q
                                      ),
                                    }
                                );
                              }}
                            />
                            {editingDetails && (
                              <button
                                className="dependency-remove"
                                onClick={() => {
                                  const newRanges =
                                    selectedQuestion.ranges.filter(
                                      (_, i) => i !== idx
                                    );
                                  setQuestionSet(
                                    (prev) =>
                                      prev && {
                                        ...prev,
                                        questions: prev.questions.map((q) =>
                                          q.questionId ===
                                          selectedQuestion.questionId
                                            ? { ...q, ranges: newRanges }
                                            : q
                                        ),
                                      }
                                  );
                                }}
                                aria-label="Remove range"
                              >
                                ×
                              </button>
                            )}
                          </div>
                          <div className="inline-label">Criteria to meet:</div>
                          <DynamicWidthTextarea
                            className="details-field"
                            disabled={!editingDetails}
                            growVertically={true}
                            value={rng.criteria}
                            onChange={(e) => {
                              const newRanges = selectedQuestion.ranges.map(
                                (r, i) =>
                                  i === idx
                                    ? { ...r, criteria: e.target.value }
                                    : r
                              );
                              setQuestionSet(
                                (prev) =>
                                  prev && {
                                    ...prev,
                                    questions: prev.questions.map((q) =>
                                      q.questionId ===
                                      selectedQuestion.questionId
                                        ? { ...q, ranges: newRanges }
                                        : q
                                    ),
                                  }
                              );
                            }}
                          />
                          <div
                            className="inline-label"
                            style={{ marginTop: "1rem" }}
                          >
                            Guidance to decide within this range:
                          </div>
                          <DynamicWidthTextarea
                            className="details-field"
                            disabled={!editingDetails}
                            growVertically={true}
                            value={rng.guidanceWithinRange}
                            onChange={(e) => {
                              const newRanges = selectedQuestion.ranges.map(
                                (r, i) =>
                                  i === idx
                                    ? {
                                        ...r,
                                        guidanceWithinRange: e.target.value,
                                      }
                                    : r
                              );
                              setQuestionSet(
                                (prev) =>
                                  prev && {
                                    ...prev,
                                    questions: prev.questions.map((q) =>
                                      q.questionId ===
                                      selectedQuestion.questionId
                                        ? { ...q, ranges: newRanges }
                                        : q
                                    ),
                                  }
                              );
                            }}
                          />
                        </li>
                      ))}
                    </ul>
                    {editingDetails && (
                      <button
                        className="dependency-add"
                        onClick={() => {
                          const newRanges = [
                            ...selectedQuestion.ranges,
                            {
                              min: 0,
                              max: 0,
                              criteria: "",
                              guidanceWithinRange: "",
                              title: "",
                            },
                          ];
                          setQuestionSet(
                            (prev) =>
                              prev && {
                                ...prev,
                                questions: prev.questions.map((q) =>
                                  q.questionId === selectedQuestion.questionId
                                    ? { ...q, ranges: newRanges }
                                    : q
                                ),
                              }
                          );
                        }}
                      >
                        + Add range
                      </button>
                    )}
                  </>
                )}

                {selectedQuestion.questionType === "list_or_count" && (
                  <>
                    <h3 className="details-section-header">Extraction Mode</h3>
                    <select
                      className="details-field"
                      disabled={!editingDetails}
                      value={selectedQuestion.extractMode}
                      onChange={(e) => {
                        const extractMode = e.target.value as QuestionType;
                        setQuestionSet(
                          (prev) =>
                            prev && {
                              ...prev,
                              questions: prev.questions.map((q) =>
                                q.questionId === selectedQuestion.questionId
                                  ? {
                                      ...q,
                                      extractMode:
                                        extractMode as ListQuestion["extractMode"],
                                    }
                                  : q
                              ),
                            }
                        );
                      }}
                    >
                      <option value="exact">Exact</option>
                      <option value="inferred">Inferred</option>
                      <option value="mixed">Mixed</option>
                    </select>

                    <h3 className="details-section-header">
                      Extraction Criteria
                    </h3>
                    <DynamicWidthTextarea
                      className="details-field"
                      disabled={!editingDetails}
                      value={selectedQuestion.extractionCriteria}
                      growVertically={true}
                      onChange={(e) => {
                        const extractionCriteria = e.target.value;
                        setQuestionSet(
                          (prev) =>
                            prev && {
                              ...prev,
                              questions: prev.questions.map((q) =>
                                q.questionId === selectedQuestion.questionId
                                  ? { ...q, extractionCriteria }
                                  : q
                              ),
                            }
                        );
                      }}
                    />

                    <h3 className="details-section-header">Cardinality</h3>
                    <DynamicWidthTextarea
                      className="details-field"
                      disabled={!editingDetails}
                      value={selectedQuestion.cardinality}
                      onChange={(e) => {
                        const cardinality = e.target.value;
                        setQuestionSet(
                          (prev) =>
                            prev && {
                              ...prev,
                              questions: prev.questions.map((q) =>
                                q.questionId === selectedQuestion.questionId
                                  ? { ...q, cardinality }
                                  : q
                              ),
                            }
                        );
                      }}
                    />

                    <h3 className="details-section-header">
                      Mark Ambiguous Items
                    </h3>
                    <input
                      type="checkbox"
                      className="details-field"
                      disabled={!editingDetails}
                      checked={selectedQuestion.allowAmbiguity}
                      onChange={(e) => {
                        const allowAmbiguity = e.target.checked;
                        setQuestionSet(
                          (prev) =>
                            prev && {
                              ...prev,
                              questions: prev.questions.map((q) =>
                                q.questionId === selectedQuestion.questionId
                                  ? { ...q, allowAmbiguity }
                                  : q
                              ),
                            }
                        );
                      }}
                    />

                    <h3 className="details-section-header">
                      Ambiguity Criteria
                    </h3>
                    <DynamicWidthTextarea
                      className="details-field"
                      disabled={!editingDetails}
                      value={selectedQuestion.disambiguationGuide}
                      growVertically={true}
                      onChange={(e) => {
                        const disambiguationGuide = e.target.value;
                        setQuestionSet(
                          (prev) =>
                            prev && {
                              ...prev,
                              questions: prev.questions.map((q) =>
                                q.questionId === selectedQuestion.questionId
                                  ? { ...q, disambiguationGuide }
                                  : q
                              ),
                            }
                        );
                      }}
                    />

                    <h3 className="details-section-header">
                      Shortening Guidance
                    </h3>
                    <DynamicWidthTextarea
                      className="details-field"
                      disabled={!editingDetails}
                      value={selectedQuestion.previewGuidance}
                      growVertically={true}
                      onChange={(e) => {
                        const previewGuidance = e.target.value;
                        setQuestionSet(
                          (prev) =>
                            prev && {
                              ...prev,
                              questions: prev.questions.map((q) =>
                                q.questionId === selectedQuestion.questionId
                                  ? { ...q, previewGuidance }
                                  : q
                              ),
                            }
                        );
                      }}
                    />
                  </>
                )}

                {(selectedQuestion!.dependencies.length > 0 ||
                  editingDetails) && (
                  <>
                    <h3 className="details-section-header">Dependencies</h3>
                    <ul className="details-dependencies markdown-list">
                      {selectedQuestion.dependencies.map((dep, idx) => {
                        const source = questionSet?.questions.find(
                          (q) => q.questionId === dep.questionId
                        );
                        return (
                          <li key={editingDetails ? idx : dep.questionId}>
                            <div className="dependency-header">
                              <strong>{`Q${dep.questionId}. ${
                                source?.questionText || ""
                              }`}</strong>
                              {editingDetails && (
                                <button
                                  className="dependency-remove"
                                  onClick={() => {
                                    const newDeps =
                                      selectedQuestion.dependencies.filter(
                                        (_, i) => i !== idx
                                      );
                                    setQuestionSet(
                                      (prev) =>
                                        prev && {
                                          ...prev,
                                          questions: prev.questions.map((q) =>
                                            q.questionId ===
                                            selectedQuestion.questionId
                                              ? { ...q, dependencies: newDeps }
                                              : q
                                          ),
                                        }
                                    );
                                  }}
                                  aria-label="Remove dependency"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                            {/* <div className="inline-label">Reason</div> */}
                            <DynamicWidthTextarea
                              className="details-field dependency-reason-input"
                              disabled={!editingDetails}
                              growVertically={true}
                              value={dep.reason}
                              onChange={(e) => {
                                const newDeps =
                                  selectedQuestion.dependencies.map((d, i) =>
                                    i === idx
                                      ? { ...d, reason: e.target.value }
                                      : d
                                  );
                                setQuestionSet(
                                  (prev) =>
                                    prev && {
                                      ...prev,
                                      questions: prev.questions.map((q) =>
                                        q.questionId ===
                                        selectedQuestion.questionId
                                          ? { ...q, dependencies: newDeps }
                                          : q
                                      ),
                                    }
                                );
                              }}
                            />
                          </li>
                        );
                      })}
                    </ul>
                    {editingDetails && (
                      <button
                        className="dependency-add"
                        onClick={() => {
                          const newDeps = [
                            ...selectedQuestion.dependencies,
                            { questionId: 0, reason: "" },
                          ];
                          setQuestionSet(
                            (prev) =>
                              prev && {
                                ...prev,
                                questions: prev.questions.map((q) =>
                                  q.questionId === selectedQuestion.questionId
                                    ? { ...q, dependencies: newDeps }
                                    : q
                                ),
                              }
                          );
                        }}
                      >
                        + Add dependency
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </div>{" "}
          {/* .details-body */}
        </div>
      </div>

      <div className="bottom-content">
        <div className="panel desc-panel" tabIndex={0}>
          <div className="field">
            <label htmlFor="snippet-desc">Snippet Description</label>
            <DynamicWidthTextarea
              id="snippet-desc"
              readOnly={!editingDesc}
              value={snippetType}
              growVertically={true}
              rows={6}
              onChange={(e) =>
                setQuestionSet((prev) => ({
                  ...blankQuestionSet,
                  ...prev,
                  snippetType: e.target.value,
                }))
              }
            />
            <button
              className="textarea-edit-button"
              onClick={() => setEditingDesc((v) => !v)}
              aria-label={
                editingDesc
                  ? "Save snippet description"
                  : "Edit snippet description"
              }
            >
              {editingDesc ? "💾" : "✏️"}
            </button>
          </div>
        </div>
        <div className="panel plan-panel" tabIndex={0}>
          <div className="field">
            <label htmlFor="execution-plan">Execution Plan</label>
            <DynamicWidthTextarea
              id="execution-plan"
              readOnly={!editingPlan}
              value={executionPlan}
              growVertically={true}
              rows={6}
              onChange={(e) =>
                setQuestionSet((prev) => ({
                  ...blankQuestionSet,
                  ...prev,
                  executionPlan: e.target.value,
                }))
              }
            />
            <button
              className="textarea-edit-button"
              onClick={() => setEditingPlan((v) => !v)}
              aria-label={
                editingPlan ? "Save execution plan" : "Edit execution plan"
              }
            >
              {editingPlan ? "💾" : "✏️"}
            </button>
          </div>
        </div>
      </div>

      {questions.length > 0 && !isSaved && (
        <div className="sticky-footer">
          <button
            className="btn-secondary"
            onClick={() => {
              setQuestionSet(blankQuestionSet);
              setIsSaved(false);
              setSelectedQuestion(null);
              setUserInput("");
              setEditingDesc(false);
              setEditingPlan(false);
              setStreamComplete(false);
              setLogs([]);
              setShowModal(false);
              setShowLoadModal(false);
              setAvailableSets([]);
              setIsGenerating(false);
            }}
          >
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave}>
            Save Question Set
          </button>
        </div>
      )}

      <style jsx>{`
        /* Load Modal Styles */
        .load-list {
          list-style: none;
          margin: 1rem 0;
          padding: 0;
          max-height: 60vh;
          overflow-y: auto;
        }
        .load-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1rem;
          border-bottom: 1px solid #eee;
          cursor: pointer;
        }
        .load-item.selected {
          background: #e6f7ff;
        }
        .load-item:hover {
          background: #e6f7ff;
        }
        .load-item-content {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .load-item-title {
          font-weight: 600;
          margin-bottom: 0.25rem;
        }
        .load-item-subtitle {
          color: #666;
          font-size: 0.875rem;
        }

        /* Container & Layout */
        .toolbar-right {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
        }
        .container {
          display: flex;
          flex-direction: column;
          flex: 1 1 auto;
          overflow: hidden;
          padding: 1rem;
          gap: 1rem;
          background: #f0f2f5;
        }
        .main-content {
          display: flex;
          flex: 1;
          gap: 1rem;
          min-height: 0;
        }
        .bottom-content {
          display: flex;
          gap: 1rem;
        }
        .panel {
          background: #fff;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          padding: 1rem;
        }
        .panel:focus {
          outline: none;
          background-color: #fdfdfd;
          box-shadow: 0 0 0 2px rgba(0, 112, 243, 0.1);
        }
        .questions-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .details-panel {
          position: relative;
          flex: 2;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .details-body {
          position: relative;
          flex: 1;
          overflow-y: auto;
        }
        .desc-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          position: relative;
          font-size: 0.8rem;
        }
        .plan-panel {
          flex: 2;
          display: flex;
          flex-direction: column;
          position: relative;
          font-size: 0.8rem;
        }

        /* Buttons */
        button {
          margin: 0;
          padding: 0.3rem 0.75rem;
          border: 1px solid transparent;
          background: none;
          color: #0070f3;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 500;
          transition: background 0.2s ease, border-color 0.2s ease;
        }
        button:hover {
          background: rgba(0, 112, 243, 0.1);
        }
        .btn-primary {
          border: 1px solid #0070f3;
          color: #0070f3;
        }
        .btn-primary:hover {
          background: rgba(0, 112, 243, 0.1);
        }
        .btn-secondary {
          border: 1px solid #eaeaea;
          color: #666;
        }
        .btn-secondary:hover {
          background: #f5f5f5;
        }

        /* Empty State */
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #888;
          text-align: center;
        }
        .empty-state p {
          font-size: 1.25rem;
          color: #555;
          margin: 0;
        }
        .empty-state-buttons {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          margin-top: 2rem;
        }
        .empty-state .btn-primary {
          width: 100%;
          max-width: 240px;
          padding: 0.75rem 1.5rem;
          font-size: 1rem;
        }
        .empty-state .btn-secondary {
          background: none;
          border: none;
          color: #1890ff;
          text-decoration: underline;
          padding: 0;
          font-size: 0.875rem;
          cursor: pointer;
        }

        /* Questions List */
        .questions-list {
          flex: 1;
          overflow-y: auto;
          margin-top: 10px;
        }
        .questions-list-ul {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .question-item {
          /* Align left edge with toolbar buttons */
          padding: 0.5rem 1rem 0.5rem 0;
          border-bottom: 1px solid #eee;
          cursor: pointer;
        }
        .question-item:hover {
          background: #f9f9f9;
        }
        .question-item.selected {
          background: #e6f7ff;
        }
        .question-title {
          font-size: 1rem;
          font-weight: 500;
        }
        .question-subtitle {
          font-size: 0.875rem;
          color: #666;
          margin-top: 0.25rem;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        /* Selected Question JSON */
        .question-json {
          white-space: pre-wrap;
          background: #f0f0f0;
          padding: 1rem;
          border-radius: 4px;
          max-height: 80vh;
          overflow: auto;
        }

        /* Modals & Log Viewer */
        .modal {
          position: fixed;
          top: 50%;
          left: 50%;
          width: 70%;
          transform: translate(-50%, -50%);
          background: #fff;
          padding: 2rem;
          border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
          z-index: 100;
        }
        .modal-close {
          position: absolute;
          top: 1rem;
          right: 1rem;
          border: none;
          background: transparent;
          font-size: 1.25rem;
          cursor: pointer;
          color: #666;
        }
        .modal textarea {
          width: 100%;
          height: 300px;
          border: 1px solid #d9d9d9;
          border-radius: 4px;
          padding: 0.5rem;
        }
        .modal-buttons {
          margin-top: 1rem;
          display: flex;
          justify-content: flex-end;
          align-items: baseline;
          gap: 0.5rem;
        }
        .log-viewer {
          max-height: 300px;
          overflow-y: auto;
          background: #1e1e1e;
          color: #fff;
          padding: 0.5rem;
          font-family: monospace;
          border-radius: 4px;
          margin-bottom: 1rem;
        }
        .finish-message {
          margin: 0;
          align-self: baseline;
        }
        .finish-button {
          margin: 0;
          padding: 0.5rem 1.5rem;
          font-size: 1.05rem;
        }

        /* Misc */
        .sticky-footer {
          position: sticky;
          bottom: 0;
          background: #fff;
          padding: 1rem;
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          border-top: 1px solid #e8e8e8;
        }

        .textarea-edit-button {
          position: absolute;
          top: 0.3rem;
          right: 0.5rem;
          background: transparent;
          border: none;
          cursor: pointer;
          font-size: 1rem;
          padding: 0;
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          margin-bottom: 1rem;
        }
        .desc-panel .textarea-edit-button,
        .plan-panel .textarea-edit-button {
          top: 1rem;
          right: 1rem;
        }
        textarea:disabled {
          background-color: #fff;
        }
        .field textarea {
          border: none;
          background: transparent;
          resize: none;
          outline: none;
        }
        .field label {
          font-size: 0.875rem;
          color: #333;
          font-weight: 500;
        }
        .details-header {
          position: relative;
          display: flex;
          justify-content: flex-start;
          align-items: center;
          padding-bottom: 1.5rem;
          margin-bottom: 1rem;
        }

        .details-subtitle {
          font-size: 0.875rem;
          color: #666;
          margin-top: 0.25rem;
        }
        .question-type-label {
          font-size: 1rem;
          font-weight: 600;
        }
        .question-type-desc {
          /* make it flow like a normal paragraph */
          font-size: inherit;
          color: inherit;
          margin: 0;
          max-width: none;
          text-align: left;
          word-break: normal;
        }
        .details-dependencies {
          list-style: none;
          padding: 0;
          margin: 0.5rem 0 0 0;
        }
        .details-dependencies li {
          margin-bottom: 0.75rem;
        }
        /* Markdown-style list for Classification choices */
        .markdown-list {
          list-style: disc outside;
          margin: 0;
          padding-left: 1rem; /* indent content, bullet at edge */
        }
        .markdown-list > li {
          margin-bottom: 1rem;
          padding-left: 1rem; /* indent content, bullet at edge */
        }
        .markdown-list .dependency-header {
          display: inline-flex;
          align-items: baseline;
          gap: 0;
          /* margin: 0; */
          margin-bottom: 0.2rem;
          padding: 0;
          white-space: nowrap;
        }
        .markdown-list .dependency-header > * {
          /* flex: none; */
        }
        .markdown-list .dependency-header input {
          font-weight: bold;
          border: none;
          background: transparent;
          padding: 0;
          margin: 0;
        }
        /* Prevent header textareas from indenting */
        .markdown-list .dependency-header textarea {
          margin: 0;
        }
        .markdown-list .dependency-header textarea.indented {
          margin-left: 0.5rem;
        }
        .markdown-list textarea {
          margin: 0.25rem 0 0 1.5rem;
        }
        .markdown-list .dependency-reason-input {
          margin: 0.25rem 0 0 1.5rem;
        }
        .markdown-list .dependency-remove {
          margin-left: 0.5rem;
          vertical-align: middle;
        }
        .details-dependencies .dependency-header {
          /* margin-left: 1.5rem; indent content, bullet at edge */
        }

        /* Use full-width flex for scale-range headers (detect by presence of short-number fields) */
        .details-dependencies.markdown-list
          li:has(.choice.short-number)
          .dependency-header {
          display: flex !important;
          white-space: nowrap; /* keep header items on one line */
        }
        .dependency-reason {
          font-size: 0.875rem;
          color: #666;
          margin-top: 0.25rem;
        }
        .edit-toggle {
          border: none;
          cursor: pointer;
          font-size: 1rem;
          padding: 0;
        }
        .details-section-header {
          font-weight: 700;
          font-size: 1.1rem;
          margin-top: 2rem;
          margin-bottom: 0.75rem;
        }
        .details-field {
          background-color: transparent;
          border: 1px solid transparent;
          padding: 0;
          border-radius: 4px;
          font: inherit;
          box-sizing: border-box;
          overflow: hidden;
          resize: none;
        }
        select.details-field:enabled {
          margin: -0.15rem -0.3rem;
        }
        select.details-field:disabled {
          appearance: none;
          -webkit-appearance: none;
          background: transparent;
          border: none;
          color: #000;
          opacity: 1;
        }
        .details-field:enabled {
          background-color: rgba(0, 0, 0, 0.03);
        }
        .details-field:disabled {
          background-color: transparent;
        }
        .details-field:focus {
          border-color: rgba(0, 0, 0, 0.1);
          outline: none;
        }
        .inline-label {
          font-weight: 500;
          margin-bottom: 0.1rem;
          margin-top: 0.1rem;
          display: block;
        }
        .details-view h3 {
          margin-top: 1rem;
          font-weight: 500;
        }
        .details-edit label {
          display: block;
          margin-top: 1rem;
          font-weight: 500;
        }
        .details-edit textarea {
          width: 100%;
          min-height: 4rem;
          border: 1px solid #d9d9d9;
          border-radius: 4px;
          padding: 0.5rem;
        }
        .dependency-remove {
          background: none;
          border: none;
          color: #f5222d;
          cursor: pointer;
          font-size: 1rem;
          line-height: 1;
          padding: 0;
          /* keep just that left gap */
          margin: 0 0 0 0.5rem;
        }
        .dependency-add {
          background: none;
          border: none;
          color: #1890ff;
          cursor: pointer;
          margin-top: 0.5rem;
          font-size: 1rem;
        }
        .question-type-select {
          font: inherit;
          padding: 0;
          border: none;
          background: transparent;
          cursor: pointer;
          text-align: left;
          font-weight: normal;
          margin-left: 0.25rem;
        }
        .question-type-select:disabled {
          appearance: none;
          -webkit-appearance: none;
          background: transparent;
          border: none;
          color: #000;
          opacity: 1;
        }
        .question-type-select:enabled {
          appearance: auto;
          -webkit-appearance: auto;
          background-color: rgba(0, 0, 0, 0.03);
          /* padding: 0; */
          margin: -1px 0;
        }
        .question-type-select:focus {
          outline: none;
          border-color: rgba(0, 0, 0, 0.1);
        }
        .details-title-input:disabled,
        .details-subtitle-input:disabled,
        .details-field:disabled {
          color: inherit;
          opacity: 1;
        }
        .details-title-input,
        .details-subtitle-input {
          flex: 1;
          font: inherit;
          border: 1px solid transparent;
          background-color: transparent;
          padding: 0.25rem;
          margin: 0;
          width: 100%;
          border-radius: 4px;
          box-sizing: border-box;
          /* height and min-height intentionally omitted to allow textarea to auto-grow */
          overflow: hidden;
          resize: none;
        }
        .details-title-input::-webkit-resizer,
        .details-subtitle-input::-webkit-resizer {
          display: none;
        }
        .details-title-input:enabled,
        .details-subtitle-input:enabled {
          background-color: rgba(0, 0, 0, 0.03);
        }
        .details-title-input:focus,
        .details-subtitle-input:focus {
          outline: none;
          border-color: rgba(0, 0, 0, 0.1);
        }
        .edit-btn-container {
          position: sticky;
          float: right;
          top: 0.5rem;
          right: 0.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          z-index: 10;
          background: #fff;
          opacity: 0.9;
          padding: 0.2rem;
          border-radius: 4px;
        }
        .details-title-group {
          flex: 1;
          margin-right: 6rem; /* reserve width for controls */
        }
        .details-title-group h2 {
          margin: 0;
          display: flex;
          align-items: flex-start;
          gap: 1rem;
        }
        /* .details-subtitle-input {
          margin-top: 0.5rem;
        } */
        .details-subtitle-group {
          display: flex;
          align-items: center;
          margin-top: 0.5rem; /* space below title */
        }
        .details-question-type-section {
          display: flex;
          align-items: center;
          margin-top: 0.5rem;
          gap: 0.5rem;
        }
        .inline-label-inline {
          font-size: 1rem;
          font-weight: 500;
          margin-right: 0.5rem;
        }
        .dependency-header {
          display: inline-flex;
          flex-wrap: nowrap;
          justify-content: flex-start;
          align-items: baseline;
          gap: 0.5rem;
        }
        .dependency-reason-input {
          margin-top: 0.25rem;
        }
        .details-field.choice {
          font-weight: bold;
          white-space: nowrap;
          flex: 1;
        }
        .details-field.choice.short-number {
          flex: none;
          width: 1.5ch;
        }
        .details-field.choice.range-title {
          flex: 1;
          white-space: nowrap;
        }

        /* Force no gap for markdown list headers (scale and classification ranges) */
        .details-dependencies.markdown-list .dependency-header {
          gap: 0 !important;
          font-weight: 700;
        }

        .delete-button {
          background: transparent;
          border: none;
          cursor: pointer;
          padding: 0.25rem;
          margin-left: 0.5rem;
          color: #888;
          display: flex;
          align-items: center;
          transition: color 0.2s;
        }
        .delete-button:hover {
          color: #f5222d;
        }
      `}</style>
    </main>
  );
};

export default QuestionSetPage;
