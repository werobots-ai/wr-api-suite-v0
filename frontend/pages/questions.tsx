// frontend/pages/questions.tsx

import {
  Question,
  QuestionSet,
  QuestionSetStatus,
  QuestionType,
  QUESTION_TYPE_LABELS,
  ListQuestion,
  QAResult,
} from "@/types/Questions";
import {
  useState,
  useEffect,
  useRef,
  useLayoutEffect,
  useCallback,
  useMemo,
} from "react";
import { useRouter } from "next/router";
import DynamicWidthTextarea from "@/components/DynamicWidthTextarea";
import Modal from "@/components/Modal";
import { useAuth } from "@/context/AuthContext";
import { forceLogoutRedirect } from "@/lib/session";
import { isUnauthorized } from "@/lib/http";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

const blankQuestionSet: QuestionSet = {
  id: "",
  title: "",
  questions: [],
  snippetType: "",
  executionPlan: "",
  executionPlanReasoning: "",
  qaResults: [] as QAResult[],
  originalUserInput: "",
  status: "draft",
  createdAt: "",
  updatedAt: "",
  finalizedAt: null,
  createdBy: null,
  lastModifiedBy: null,
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
  const { token, activeOrgId, documentAccess, loading: authLoading, user } =
    useAuth();
  const router = useRouter();
  const canCreateQuestions = Boolean(
    documentAccess?.permissions.createQuestionSet,
  );
  const canEvaluateDocuments = Boolean(
    documentAccess?.permissions.evaluateDocument,
  );
  const canEditExisting = Boolean(
    documentAccess?.permissions.editQuestionSet,
  );
  const canManageActivation = Boolean(
    documentAccess?.permissions.manageQuestionSetActivation,
  );

  const updateQuestionSetField = useCallback(
    (updater: (prev: QuestionSet) => QuestionSet) => {
      setQuestionSet((prev) => {
        if (!prev) return prev;
        const next = updater(prev);
        if (next !== prev) {
          setIsSaved(false);
        }
        return next;
      });
    },
    [setQuestionSet, setIsSaved],
  );

  const isCurrentCreator = Boolean(
    questionSet?.createdBy?.type === "user" &&
      questionSet.createdBy.id === user?.id,
  );

  const canEditCurrentSet = Boolean(
    questionSet &&
      (questionSet.status === "draft"
        ? isCurrentCreator || canEditExisting
        : canEditExisting),
  );

  const canFinalizeDraft = Boolean(
    questionSet &&
      questionSet.status === "draft" &&
      (canManageActivation || isCurrentCreator),
  );
  const statusLabelMap: Record<QuestionSetStatus, string> = {
    draft: "Draft",
    active: "Active",
    inactive: "Inactive",
  };
  const statusDescription = useMemo(() => {
    if (!questionSet) {
      return "Select a question set to view its status.";
    }
    if (questionSet.status === "draft") {
      return "Draft question sets, including newly generated ones, are inactive and cannot be used for snippet evaluation until they are finalized.";
    }
    if (questionSet.status === "inactive") {
      return "Inactive question sets are preserved but not available for evaluation. Activate them to resume usage.";
    }
    return "Active question sets are available for snippet evaluation.";
  }, [questionSet]);
  const canToggleActivation = Boolean(
    questionSet && questionSet.status !== "draft" && canManageActivation,
  );
  const isActive = questionSet?.status === "active";
  const hasUnsavedChanges = Boolean(questionSet && !isSaved);
  const updatedAt = questionSet?.updatedAt;
  const formattedUpdatedAt = useMemo(() => {
    if (!updatedAt) return null;
    try {
      return new Date(updatedAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return updatedAt;
    }
  }, [updatedAt]);
  const finalizedAt = questionSet?.finalizedAt ?? null;
  const formattedFinalizedAt = useMemo(() => {
    if (!finalizedAt) return null;
    try {
      return new Date(finalizedAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return finalizedAt;
    }
  }, [finalizedAt]);
  type ConfirmationState =
    | { type: "save" }
    | { type: "finalize" }
    | { type: "activation"; nextActive: boolean };
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(
    null,
  );
  const confirmationContent = useMemo(() => {
    if (!confirmation) return null;
    switch (confirmation.type) {
      case "save":
        return {
          title: "Save question set",
          message:
            "Saving will overwrite the stored question set with your current edits.",
          confirmLabel: "Save changes",
        } as const;
      case "finalize":
        return {
          title: "Finalize question set",
          message:
            "Finalizing will activate this question set for snippet evaluation. It can no longer return to the draft state.",
          confirmLabel: "Finalize set",
        } as const;
      case "activation":
        return confirmation.nextActive
          ? {
              title: "Activate question set",
              message:
                "Activated question sets become available for snippet evaluation immediately.",
              confirmLabel: "Activate set",
            }
          : {
              title: "Deactivate question set",
              message:
                "Deactivated question sets will be hidden from snippet evaluation until they are activated again.",
              confirmLabel: "Deactivate set",
            };
      default:
        return null;
    }
  }, [confirmation]);
  useEffect(() => {
    if (authLoading) return;
    if (!token) {
      router.replace("/auth/dev-login");
      return;
    }
    if (!canCreateQuestions || !canEvaluateDocuments) {
      router.replace("/account/billing");
    }
  }, [authLoading, token, canCreateQuestions, canEvaluateDocuments, router]);
  const buildAuthHeaders = useCallback(() => {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (activeOrgId) headers["x-org-id"] = activeOrgId;
    return headers;
  }, [token, activeOrgId]);
  const {
    questions = [],
    snippetType = "",
    executionPlan = "",
  } = questionSet || blankQuestionSet;

  const [showModal, setShowModal] = useState(false);
  const [userInput, setUserInput] = useState("");

  const [selectedQuestionId, setSelectedQuestionId] = useState<number | null>(
    null,
  );
  const selectedQuestion = useMemo(() => {
    if (!questionSet || selectedQuestionId === null) {
      return null;
    }
    return (
      questionSet.questions.find(
        (question) => question.questionId === selectedQuestionId,
      ) ?? null
    );
  }, [questionSet, selectedQuestionId]);
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
      status: QuestionSetStatus;
      createdAt: string;
      updatedAt: string;
      finalizedAt: string | null;
    }[]
  >([]);
  const [countdown, setCountdown] = useState<number>(0);
  const [timerCanceled, setTimerCanceled] = useState<boolean>(false);

  const [isProcessingAction, setIsProcessingAction] = useState(false);

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

  useEffect(() => {
    if (!canEditCurrentSet) {
      setEditingDetails(false);
      setEditingDesc(false);
      setEditingPlan(false);
    }
  }, [canEditCurrentSet]);

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
    if (!questionSet) {
      setSelectedQuestionId(null);
      return;
    }
    if (
      selectedQuestionId === null ||
      !questionSet.questions.some(
        (question) => question.questionId === selectedQuestionId,
      )
    ) {
      const firstQuestion = questionSet.questions[0];
      setSelectedQuestionId(firstQuestion ? firstQuestion.questionId : null);
    }
  }, [questionSet, selectedQuestionId]);

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
    const headers = buildAuthHeaders();
    try {
      const res = await fetch(`${API_URL}/api/questions`, {
        headers,
      });
      if (!res.ok) {
        if (isUnauthorized(res.status)) {
          forceLogoutRedirect();
          return;
        }
        throw new Error(await res.text());
      }
      const data: {
        id: string;
        title: string;
        date: string;
        questionCount: number;
        snippetCount: number;
        status: QuestionSetStatus;
        createdAt: string;
        updatedAt: string;
        finalizedAt: string | null;
      }[] = await res.json();
      setAvailableSets(data);
      setShowLoadModal(true);
      setFocusedSetId(data.length > 0 ? data[0].id : null);
    } catch (error) {
      console.error("Failed to load question sets", error);
    }
  };
  const closeLoadModal = useCallback(() => {
    setShowLoadModal(false);
  }, []);
  const adoptQuestionSet = useCallback(
    (set: QuestionSet) => {
      setQuestionSet(set);
      setSnippets(
        set.qaResults.reduce((acc, result) => {
          acc[result.snippetId] = result;
          return acc;
        }, {} as Record<string, QAResult>),
      );
      setIsSaved(true);
    },
    [setIsSaved, setQuestionSet, setSnippets],
  );

  const syncAvailableSet = useCallback(
    (next: QuestionSet) => {
      setAvailableSets((prev) => {
        const index = prev.findIndex((item) => item.id === next.id);
        if (index === -1) {
          return prev;
        }
        const copy = [...prev];
        copy[index] = {
          ...copy[index],
          title: next.title,
          questionCount: next.questions.length,
          status: next.status,
          date: next.updatedAt,
          createdAt: next.createdAt,
          updatedAt: next.updatedAt,
          finalizedAt: next.finalizedAt,
        };
        return copy;
      });
    },
    [setAvailableSets],
  );
  const handleDeleteSet = async (id: string) => {
    if (
      window.confirm(
        "Are you sure you want to delete this question set? This action cannot be undone."
      )
    ) {
      const headers = buildAuthHeaders();
      try {
        const res = await fetch(`${API_URL}/api/questions/${id}`, {
          method: "DELETE",
          headers,
        });
        if (!res.ok) {
          if (isUnauthorized(res.status)) {
            forceLogoutRedirect();
            return;
          }
          throw new Error(await res.text());
        }
        setAvailableSets((prev) => prev.filter((s) => s.id !== id));
      } catch (error) {
        console.error("Failed to delete question set", error);
      }
    }
  };

  const loadQuestionSet = useCallback(
    async (id: string) => {
      const headers = buildAuthHeaders();
      try {
        const res = await fetch(`${API_URL}/api/questions/${id}`, {
          headers,
        });
        if (!res.ok) {
          if (isUnauthorized(res.status)) {
            forceLogoutRedirect();
            return;
          }
          throw new Error(await res.text());
        }
        const set: QuestionSet = await res.json();

        adoptQuestionSet(set);
        closeLoadModal();
      } catch (error) {
        console.error("Failed to load question set", error);
      }
    },
    [adoptQuestionSet, buildAuthHeaders, closeLoadModal],
  );

  const handleSubmit = async () => {
    setQuestionSet(null);
    setIsSaved(false);
    setIsGenerating(true);
    setLogs([]);
    setStreamComplete(false);

    const headers = {
      ...buildAuthHeaders(),
      "Content-Type": "application/json",
    };
    try {
      const res = await fetch(`${API_URL}/api/questions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ changeRequest: userInput }),
      });
      if (!res.ok) {
        if (isUnauthorized(res.status)) {
          setIsGenerating(false);
          forceLogoutRedirect();
          return;
        }
        const message = await res.text();
        throw new Error(message || "Failed to generate question set");
      }
      if (!res.body) {
        throw new Error("No response received from the server");
      }
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
              void loadQuestionSet(payload.questionSetId);
              break;
            default:
              break;
          }
        }
      }

      setIsGenerating(false);
      setStreamComplete(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Failed to create question set", error);
      setLogs((prev) => [...prev, `Error: ${message}`]);
      setIsGenerating(false);
    }
  };

  const persistQuestionSet = useCallback(async () => {
    if (!questionSet || !questionSet.id) {
      throw new Error("No question set is currently loaded");
    }
    const headers = {
      ...buildAuthHeaders(),
      "Content-Type": "application/json",
    };
    const res = await fetch(`${API_URL}/api/questions/${questionSet.id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        title: questionSet.title,
        snippetType: questionSet.snippetType,
        executionPlan: questionSet.executionPlan,
        executionPlanReasoning: questionSet.executionPlanReasoning,
        questions: questionSet.questions,
        originalUserInput: questionSet.originalUserInput,
      }),
    });
    if (!res.ok) {
      if (isUnauthorized(res.status)) {
        forceLogoutRedirect();
      }
      const message = await res.text();
      throw new Error(message || "Failed to save question set");
    }
    const updated: QuestionSet = await res.json();
    adoptQuestionSet(updated);
    syncAvailableSet(updated);
    return updated;
  }, [
    questionSet,
    buildAuthHeaders,
    adoptQuestionSet,
    syncAvailableSet,
  ]);

  const finalizeCurrentDraft = useCallback(async () => {
    if (!questionSet || !questionSet.id) {
      throw new Error("No question set is currently loaded");
    }
    const headers = buildAuthHeaders();
    const res = await fetch(
      `${API_URL}/api/questions/${questionSet.id}/finalize`,
      {
        method: "POST",
        headers,
      },
    );
    if (!res.ok) {
      if (isUnauthorized(res.status)) {
        forceLogoutRedirect();
      }
      const message = await res.text();
      throw new Error(message || "Failed to finalize question set");
    }
    const updated: QuestionSet = await res.json();
    adoptQuestionSet(updated);
    syncAvailableSet(updated);
    return updated;
  }, [questionSet, buildAuthHeaders, adoptQuestionSet, syncAvailableSet]);

  const toggleActivation = useCallback(
    async (nextActive: boolean) => {
      if (!questionSet || !questionSet.id) {
        throw new Error("No question set is currently loaded");
      }
      const headers = {
        ...buildAuthHeaders(),
        "Content-Type": "application/json",
      };
      const res = await fetch(
        `${API_URL}/api/questions/${questionSet.id}/activation`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ active: nextActive }),
        },
      );
      if (!res.ok) {
        if (isUnauthorized(res.status)) {
          forceLogoutRedirect();
        }
        const message = await res.text();
        throw new Error(message || "Failed to change activation state");
      }
      const updated: QuestionSet = await res.json();
      adoptQuestionSet(updated);
      syncAvailableSet(updated);
      return updated;
    },
    [questionSet, buildAuthHeaders, adoptQuestionSet, syncAvailableSet],
  );

  const handleSave = useCallback(() => {
    if (!questionSet || !canEditCurrentSet) {
      return;
    }
    setConfirmation({ type: "save" });
  }, [questionSet, canEditCurrentSet]);

  const handleFinalize = useCallback(() => {
    if (!questionSet || questionSet.status !== "draft") {
      return;
    }
    if (!canFinalizeDraft) {
      return;
    }
    setConfirmation({ type: "finalize" });
  }, [questionSet, canFinalizeDraft]);

  const handleActivationRequest = useCallback(
    (nextActive: boolean) => {
      if (!questionSet || questionSet.status === "draft") {
        return;
      }
      if (!canManageActivation) {
        return;
      }
      setConfirmation({ type: "activation", nextActive });
    },
    [questionSet, canManageActivation],
  );

  const handleCancelEdits = useCallback(async () => {
    if (!questionSet) {
      return;
    }
    if (!questionSet.id) {
      setQuestionSet(blankQuestionSet);
      setSnippets({});
      setIsSaved(true);
      setSelectedQuestionId(null);
      setEditingDetails(false);
      setEditingDesc(false);
      setEditingPlan(false);
      return;
    }
    const currentId = questionSet.id;
    try {
      await loadQuestionSet(currentId);
    } catch (error) {
      console.error("Failed to reload question set", error);
    } finally {
      setEditingDetails(false);
      setEditingDesc(false);
      setEditingPlan(false);
    }
  }, [
    questionSet,
    loadQuestionSet,
    setQuestionSet,
    setSnippets,
    setIsSaved,
    setSelectedQuestionId,
  ]);

  const handleCancelConfirmation = useCallback(() => {
    if (isProcessingAction) return;
    setConfirmation(null);
  }, [isProcessingAction]);

  const handleConfirmAction = useCallback(async () => {
    if (!confirmation) return;
    setIsProcessingAction(true);
    try {
      if (confirmation.type === "save") {
        await persistQuestionSet();
      } else if (confirmation.type === "finalize") {
        await finalizeCurrentDraft();
      } else if (confirmation.type === "activation") {
        await toggleActivation(confirmation.nextActive);
      }
      setConfirmation(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(error);
      window.alert(message);
    } finally {
      setIsProcessingAction(false);
    }
  }, [
    confirmation,
    finalizeCurrentDraft,
    persistQuestionSet,
    toggleActivation,
  ]);

  const handleListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!questions.length) return;
    const currentIndex = questions.findIndex(
      (q) => selectedQuestionId === q.questionId,
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
      const nextQuestion = questions[nextIndex];
      setSelectedQuestionId(nextQuestion ? nextQuestion.questionId : null);
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

  if (authLoading) {
    return (
      <main className="container">
        <p>Loading account permissions...</p>
      </main>
    );
  }

  if (!token || !canCreateQuestions || !canEvaluateDocuments) {
    return null;
  }

  return (
    <main className="container">
      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title="Create Question Set"
        className="question-modal"
        bodyClassName="question-modal-body"
      >
        {!isGenerating && !streamComplete && (
          <DynamicWidthTextarea
            placeholder="Type or paste your questions here or describe the set of questions you want to generate."
            growVertically={true}
            rows={8}
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
          />
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
                The question set is saved! You can now close this and review it.
              </p>
              <button className="finish-button" onClick={closeModal}>
                Close{countdown > 0 ? ` (${countdown}s)` : ""}
              </button>
            </>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={showLoadModal}
        onClose={closeLoadModal}
        title="Select a Question Set"
        className="load-modal"
        bodyClassName="load-modal-body"
      >
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
                <div className="load-item-status">
                  <span className={`status-pill status-${set.status}`}>
                    {statusLabelMap[set.status]}
                  </span>
                </div>
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
      </Modal>

      <div className="status-banner">
        {questionSet ? (
          <>
            <div className="status-summary">
              <span className={`status-pill status-${questionSet.status}`}>
                {statusLabelMap[questionSet.status]}
              </span>
              {hasUnsavedChanges && (
                <span className="status-pill unsaved">Unsaved changes</span>
              )}
              <div className="status-description">{statusDescription}</div>
              <div className="status-meta">
                {formattedUpdatedAt && (
                  <span>Last updated {formattedUpdatedAt}</span>
                )}
                {formattedFinalizedAt && (
                  <span>Finalized {formattedFinalizedAt}</span>
                )}
              </div>
            </div>
            <div className="status-actions">
              {questionSet.status === "draft" && (
                <button
                  className="btn-primary"
                  onClick={handleFinalize}
                  disabled={!canFinalizeDraft || hasUnsavedChanges || isProcessingAction}
                >
                  Finalize &amp; Activate
                </button>
              )}
              {questionSet.status !== "draft" && canToggleActivation && (
                <button
                  className="btn-secondary"
                  onClick={() => handleActivationRequest(!isActive)}
                  disabled={hasUnsavedChanges || isProcessingAction}
                >
                  {isActive ? "Deactivate" : "Activate"} Question Set
                </button>
              )}
            </div>
          </>
        ) : (
          <span className="status-placeholder">
            Generate or load a question set to get started.
          </span>
        )}
      </div>

      <Modal
        isOpen={Boolean(confirmation)}
        onClose={handleCancelConfirmation}
        title={confirmationContent?.title ?? "Confirm action"}
        className="confirm-modal"
        bodyClassName="confirm-modal-body"
      >
        {confirmationContent && (
          <>
            <p>{confirmationContent.message}</p>
            {confirmation?.type === "finalize" && (
              <p className="confirm-note">
                Finalized question sets stay available for activation/deactivation
                but can no longer return to the draft state.
              </p>
            )}
            <div className="modal-buttons">
              <button
                className="btn-secondary"
                onClick={handleCancelConfirmation}
                disabled={isProcessingAction}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  void handleConfirmAction();
                }}
                disabled={isProcessingAction}
              >
                {confirmationContent.confirmLabel}
              </button>
            </div>
          </>
        )}
      </Modal>

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
                      setSelectedQuestionId(q.questionId);
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
                    disabled={!canEditCurrentSet}
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
                        onChange={(e) => {
                          if (!selectedQuestion || !canEditCurrentSet) return;
                          const nextValue = e.target.value;
                          updateQuestionSetField((prev) => ({
                            ...prev,
                            questions: prev.questions.map((q) =>
                              q.questionId === selectedQuestion.questionId
                                ? { ...q, questionText: nextValue }
                                : q
                            ),
                          }));
                        }}
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
                  onChange={(e) => {
                    if (!selectedQuestion || !canEditCurrentSet) return;
                    const nextValue = e.target.value;
                    updateQuestionSetField((prev) => ({
                      ...prev,
                      questions: prev.questions.map((q) =>
                        q.questionId === selectedQuestion.questionId
                          ? { ...q, group: nextValue }
                          : q
                      ),
                    }));
                  }}
                />
                <h3 className="details-section-header">
                  Question Type:&nbsp;
                  <select
                    className="question-type-select"
                    disabled={!editingDetails}
                    value={selectedQuestion.questionType}
                    onChange={(e) => {
                      if (!selectedQuestion || !canEditCurrentSet) return;
                      const qt = e.target.value as QuestionType;
                      updateQuestionSetField((prev) => ({
                        ...prev,
                        questions: prev.questions.map((q) =>
                          q.questionId === selectedQuestion.questionId
                            ? ({ ...q, questionType: qt } as Question)
                            : q
                        ),
                      }));
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
                  onChange={(e) => {
                    if (!selectedQuestion || !canEditCurrentSet) return;
                    const nextValue = e.target.value;
                    updateQuestionSetField((prev) => ({
                      ...prev,
                      questions: prev.questions.map((q) =>
                        q.questionId === selectedQuestion.questionId
                          ? { ...q, description: nextValue }
                          : q
                      ),
                    }));
                  }}
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
                                if (!selectedQuestion || !canEditCurrentSet)
                                  return;
                                const newChoices = selectedQuestion.choices.map(
                                  (c, i) =>
                                    i === idx
                                      ? { ...c, label: e.target.value }
                                      : c
                                );
                                updateQuestionSetField((prev) => ({
                                  ...prev,
                                  questions: prev.questions.map((q) =>
                                    q.questionId === selectedQuestion.questionId
                                      ? { ...q, choices: newChoices }
                                      : q
                                  ),
                                }));
                              }}
                            />
                            {editingDetails && (
                              <button
                                className="dependency-remove"
                                onClick={() => {
                                  if (!selectedQuestion || !canEditCurrentSet)
                                    return;
                                  const newChoices =
                                    selectedQuestion.choices.filter(
                                      (_, i) => i !== idx
                                    );
                                  updateQuestionSetField((prev) => ({
                                    ...prev,
                                    questions: prev.questions.map((q) =>
                                      q.questionId === selectedQuestion.questionId
                                        ? { ...q, choices: newChoices }
                                        : q
                                    ),
                                  }));
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
                              if (!selectedQuestion || !canEditCurrentSet)
                                return;
                              const newChoices = selectedQuestion.choices.map(
                                (c, i) =>
                                  i === idx
                                    ? { ...c, criteria: e.target.value }
                                    : c
                              );
                              updateQuestionSetField((prev) => ({
                                ...prev,
                                questions: prev.questions.map((q) =>
                                  q.questionId === selectedQuestion.questionId
                                    ? { ...q, choices: newChoices }
                                    : q
                                ),
                              }));
                            }}
                          />
                        </li>
                      ))}
                    </ul>
                    {editingDetails && (
                      <button
                        className="dependency-add"
                        onClick={() => {
                          if (!selectedQuestion || !canEditCurrentSet) return;
                          const newChoices = [
                            ...selectedQuestion.choices,
                            { label: "", criteria: "" },
                          ];
                          updateQuestionSetField((prev) => ({
                            ...prev,
                            questions: prev.questions.map((q) =>
                              q.questionId === selectedQuestion.questionId
                                ? { ...q, choices: newChoices }
                                : q,
                            ),
                          }));
                        }}
                      >
                        + Add choice
                      </button>
                    )}
                    <h3 className="details-section-header">
                      Strict short answer enforcement
                    </h3>
                    <label className="strict-toggle">
                      <input
                        type="checkbox"
                        className="details-field"
                        disabled={!editingDetails}
                        checked={Boolean(selectedQuestion.strict)}
                        onChange={(e) => {
                          if (!selectedQuestion || !canEditCurrentSet) return;
                          const strict = e.target.checked;
                          updateQuestionSetField((prev) => ({
                            ...prev,
                            questions: prev.questions.map((q) =>
                              q.questionId === selectedQuestion.questionId
                                ? { ...q, strict }
                                : q,
                            ),
                          }));
                        }}
                      />
                      <span>
                        Force the model to return exactly one of the defined
                        labels via the response schema.
                      </span>
                    </label>
                    <p className="strict-toggle-description">
                      When disabled, the model still sees the labels in the
                      prompt but can technically emit free-form text.
                    </p>
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
                          if (!selectedQuestion || !canEditCurrentSet) return;
                          const min = Number(e.target.value);
                          updateQuestionSetField((prev) => ({
                            ...prev,
                            questions: prev.questions.map((q) =>
                              q.questionId === selectedQuestion.questionId
                                ? { ...q, min }
                                : q,
                            ),
                          }));
                        }}
                      />
                      <span> to </span>
                      <DynamicWidthTextarea
                        className="details-field short-number"
                        disabled={!editingDetails}
                        value={String(selectedQuestion.max)}
                        onChange={(e) => {
                          if (!selectedQuestion || !canEditCurrentSet) return;
                          const max = Number(e.target.value);
                          updateQuestionSetField((prev) => ({
                            ...prev,
                            questions: prev.questions.map((q) =>
                              q.questionId === selectedQuestion.questionId
                                ? { ...q, max }
                                : q,
                            ),
                          }));
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
                                if (!selectedQuestion || !canEditCurrentSet)
                                  return;
                                const min = Number(e.target.value);
                                const newRanges = selectedQuestion.ranges.map(
                                  (r, i) => (i === idx ? { ...r, min } : r)
                                );
                                updateQuestionSetField((prev) => ({
                                  ...prev,
                                  questions: prev.questions.map((q) =>
                                    q.questionId === selectedQuestion.questionId
                                      ? { ...q, ranges: newRanges }
                                      : q,
                                  ),
                                }));
                              }}
                            />
                            <span>–</span>
                            <DynamicWidthTextarea
                              className="details-field choice short-number"
                              disabled={!editingDetails}
                              value={String(rng.max)}
                              onChange={(e) => {
                                if (!selectedQuestion || !canEditCurrentSet)
                                  return;
                                const max = Number(e.target.value);
                                const newRanges = selectedQuestion.ranges.map(
                                  (r, i) => (i === idx ? { ...r, max } : r)
                                );
                                updateQuestionSetField((prev) => ({
                                  ...prev,
                                  questions: prev.questions.map((q) =>
                                    q.questionId === selectedQuestion.questionId
                                      ? { ...q, ranges: newRanges }
                                      : q,
                                  ),
                                }));
                              }}
                            />
                            <span>:</span>
                            <DynamicWidthTextarea
                              className="details-field choice range-title indented"
                              disabled={!editingDetails}
                              value={rng.title}
                              onChange={(e) => {
                                if (!selectedQuestion || !canEditCurrentSet)
                                  return;
                                const title = e.target.value;
                                const newRanges = selectedQuestion.ranges.map(
                                  (r, i) => (i === idx ? { ...r, title } : r)
                                );
                                updateQuestionSetField((prev) => ({
                                  ...prev,
                                  questions: prev.questions.map((q) =>
                                    q.questionId === selectedQuestion.questionId
                                      ? { ...q, ranges: newRanges }
                                      : q,
                                  ),
                                }));
                              }}
                            />
                            {editingDetails && (
                              <button
                                className="dependency-remove"
                                onClick={() => {
                                  if (!selectedQuestion || !canEditCurrentSet)
                                    return;
                                  const newRanges =
                                    selectedQuestion.ranges.filter(
                                      (_, i) => i !== idx
                                    );
                                  updateQuestionSetField((prev) => ({
                                    ...prev,
                                    questions: prev.questions.map((q) =>
                                      q.questionId === selectedQuestion.questionId
                                        ? { ...q, ranges: newRanges }
                                        : q,
                                    ),
                                  }));
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
                              if (!selectedQuestion || !canEditCurrentSet)
                                return;
                              const newRanges = selectedQuestion.ranges.map(
                                (r, i) =>
                                  i === idx
                                    ? { ...r, criteria: e.target.value }
                                    : r
                                );
                              updateQuestionSetField((prev) => ({
                                ...prev,
                                questions: prev.questions.map((q) =>
                                  q.questionId === selectedQuestion.questionId
                                    ? { ...q, ranges: newRanges }
                                    : q,
                                ),
                              }));
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
                              if (!selectedQuestion || !canEditCurrentSet)
                                return;
                              const newRanges = selectedQuestion.ranges.map(
                                (r, i) =>
                                  i === idx
                                    ? {
                                        ...r,
                                        guidanceWithinRange: e.target.value,
                                      }
                                    : r
                              );
                              updateQuestionSetField((prev) => ({
                                ...prev,
                                questions: prev.questions.map((q) =>
                                  q.questionId === selectedQuestion.questionId
                                    ? { ...q, ranges: newRanges }
                                    : q,
                                ),
                              }));
                            }}
                          />
                        </li>
                      ))}
                    </ul>
                    {editingDetails && (
                      <button
                        className="dependency-add"
                        onClick={() => {
                          if (!selectedQuestion || !canEditCurrentSet) return;
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
                          updateQuestionSetField((prev) => ({
                            ...prev,
                            questions: prev.questions.map((q) =>
                              q.questionId === selectedQuestion.questionId
                                ? { ...q, ranges: newRanges }
                                : q,
                            ),
                          }));
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
                        if (!selectedQuestion || !canEditCurrentSet) return;
                        const extractMode = e.target.value as QuestionType;
                        updateQuestionSetField((prev) => ({
                          ...prev,
                          questions: prev.questions.map((q) =>
                            q.questionId === selectedQuestion.questionId
                              ? {
                                  ...q,
                                  extractMode:
                                    extractMode as ListQuestion["extractMode"],
                                }
                              : q,
                          ),
                        }));
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
                        if (!selectedQuestion || !canEditCurrentSet) return;
                        const extractionCriteria = e.target.value;
                        updateQuestionSetField((prev) => ({
                          ...prev,
                          questions: prev.questions.map((q) =>
                            q.questionId === selectedQuestion.questionId
                              ? { ...q, extractionCriteria }
                              : q,
                          ),
                        }));
                      }}
                    />

                    <h3 className="details-section-header">Cardinality</h3>
                    <DynamicWidthTextarea
                      className="details-field"
                      disabled={!editingDetails}
                      value={selectedQuestion.cardinality}
                      onChange={(e) => {
                        if (!selectedQuestion || !canEditCurrentSet) return;
                        const cardinality = e.target.value;
                        updateQuestionSetField((prev) => ({
                          ...prev,
                          questions: prev.questions.map((q) =>
                            q.questionId === selectedQuestion.questionId
                              ? { ...q, cardinality }
                              : q,
                          ),
                        }));
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
                        if (!selectedQuestion || !canEditCurrentSet) return;
                        const allowAmbiguity = e.target.checked;
                        updateQuestionSetField((prev) => ({
                          ...prev,
                          questions: prev.questions.map((q) =>
                            q.questionId === selectedQuestion.questionId
                              ? { ...q, allowAmbiguity }
                              : q,
                          ),
                        }));
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
                        if (!selectedQuestion || !canEditCurrentSet) return;
                        const disambiguationGuide = e.target.value;
                        updateQuestionSetField((prev) => ({
                          ...prev,
                          questions: prev.questions.map((q) =>
                            q.questionId === selectedQuestion.questionId
                              ? { ...q, disambiguationGuide }
                              : q,
                          ),
                        }));
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
                        if (!selectedQuestion || !canEditCurrentSet) return;
                        const previewGuidance = e.target.value;
                        updateQuestionSetField((prev) => ({
                          ...prev,
                          questions: prev.questions.map((q) =>
                            q.questionId === selectedQuestion.questionId
                              ? { ...q, previewGuidance }
                              : q,
                          ),
                        }));
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
                                    if (!selectedQuestion || !canEditCurrentSet)
                                      return;
                                    const newDeps =
                                      selectedQuestion.dependencies.filter(
                                        (_, i) => i !== idx
                                      );
                                    updateQuestionSetField((prev) => ({
                                      ...prev,
                                      questions: prev.questions.map((q) =>
                                        q.questionId === selectedQuestion.questionId
                                          ? { ...q, dependencies: newDeps }
                                          : q,
                                      ),
                                    }));
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
                                if (!selectedQuestion || !canEditCurrentSet)
                                  return;
                                const newDeps =
                                  selectedQuestion.dependencies.map((d, i) =>
                                    i === idx
                                      ? { ...d, reason: e.target.value }
                                      : d
                                  );
                                updateQuestionSetField((prev) => ({
                                  ...prev,
                                  questions: prev.questions.map((q) =>
                                    q.questionId === selectedQuestion.questionId
                                      ? { ...q, dependencies: newDeps }
                                      : q,
                                  ),
                                }));
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
                          if (!selectedQuestion || !canEditCurrentSet) return;
                          const newDeps = [
                            ...selectedQuestion.dependencies,
                            { questionId: 0, reason: "" },
                          ];
                          updateQuestionSetField((prev) => ({
                            ...prev,
                            questions: prev.questions.map((q) =>
                              q.questionId === selectedQuestion.questionId
                                ? { ...q, dependencies: newDeps }
                                : q,
                            ),
                          }));
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
              onChange={(e) => {
                if (!canEditCurrentSet) return;
                const nextValue = e.target.value;
                updateQuestionSetField((prev) => ({
                  ...prev,
                  snippetType: nextValue,
                }));
              }}
            />
            <button
              className="textarea-edit-button"
              onClick={() => {
                if (!canEditCurrentSet) return;
                setEditingDesc((v) => !v);
              }}
              aria-label={
                editingDesc
                  ? "Save snippet description"
                  : "Edit snippet description"
              }
              disabled={!canEditCurrentSet}
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
              onChange={(e) => {
                if (!canEditCurrentSet) return;
                const nextValue = e.target.value;
                updateQuestionSetField((prev) => ({
                  ...prev,
                  executionPlan: nextValue,
                }));
              }}
            />
            <button
              className="textarea-edit-button"
              onClick={() => {
                if (!canEditCurrentSet) return;
                setEditingPlan((v) => !v);
              }}
              aria-label={
                editingPlan ? "Save execution plan" : "Edit execution plan"
              }
              disabled={!canEditCurrentSet}
            >
              {editingPlan ? "💾" : "✏️"}
            </button>
          </div>
        </div>
      </div>

      {questionSet && canEditCurrentSet && !isSaved && (
        <div className="sticky-footer">
          <button
            className="btn-secondary"
            onClick={() => {
              void handleCancelEdits();
            }}
            disabled={isProcessingAction}
          >
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={isProcessingAction}
          >
            Save Question Set
          </button>
        </div>
      )}

      <style jsx>{`
        .status-banner {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
          background: #fff;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          padding: 1rem;
        }
        .status-summary {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          flex: 1 1 auto;
        }
        .status-pill {
          display: inline-flex;
          align-items: center;
          padding: 0.25rem 0.75rem;
          border-radius: 999px;
          font-size: 0.85rem;
          font-weight: 600;
          text-transform: uppercase;
        }
        .status-pill + .status-pill {
          margin-left: 0.5rem;
        }
        .status-pill.status-draft {
          background: #fff4e6;
          color: #b35c00;
        }
        .status-pill.status-active {
          background: #e6f7ff;
          color: #006aa6;
        }
        .status-pill.status-inactive {
          background: #f5f5f5;
          color: #555;
        }
        .status-pill.unsaved {
          background: #fff0f0;
          color: #b80000;
        }
        .status-description {
          color: #555;
          font-size: 0.95rem;
        }
        .status-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          color: #888;
          font-size: 0.85rem;
        }
        .status-actions {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .status-placeholder {
          color: #555;
        }
        .confirm-modal-body {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .confirm-note {
          color: #666;
          font-size: 0.9rem;
        }
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
        .load-item-status {
          margin-bottom: 0.25rem;
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
        :global(.question-modal .modal-body) {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        :global(.question-modal textarea) {
          width: 100%;
          min-height: 200px;
          border: 1px solid #d9d9d9;
          border-radius: 4px;
          padding: 0.5rem;
          background: #fafafa;
        }
        :global(.load-modal .modal-body) {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          max-height: 60vh;
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

        .strict-toggle {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .strict-toggle span {
          font-size: 0.95rem;
        }
        .strict-toggle-description {
          font-size: 0.875rem;
          color: #666;
          margin-top: 0.5rem;
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
