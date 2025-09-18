/* eslint-disable @typescript-eslint/no-explicit-any */
import { HttpError, isUnauthorized } from "./http";
import { forceLogoutRedirect } from "./session";

export async function fetchJSON<T>(
  url: string,
  opts?: RequestInit,
): Promise<T> {
  const headers = new Headers(opts?.headers || {});
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("wr_auth_token");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const orgId = localStorage.getItem("wr_active_org");
    if (orgId) headers.set("x-org-id", orgId);
  }
  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) {
    const message = await res.text();
    if (isUnauthorized(res.status)) {
      forceLogoutRedirect();
    }
    throw new HttpError(res.status, message || res.statusText);
  }
  return res.json();
}

export function uploadFiles(files: File[]) {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  return fetchJSON<{ snippets: any[] }>("/api/upload", {
    method: "POST",
    body: form,
  });
}

export function getQuestions(): Promise<{
  executionPlan: string;
  questions: {
    questionId: number;
    question: string;
    description: string;
    quantitative: boolean;
    originalQuestion: string;
    originalDescription?: string;
  }[];
}> {
  return fetchJSON<{
    executionPlan: string;
    questions: {
      questionId: number;
      question: string;
      description: string;
      quantitative: boolean;
      originalQuestion: string;
      originalDescription?: string;
    }[];
  }>("/api/questions");
}

export function saveQuestions(qs: string[]) {
  return fetchJSON("/api/questions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(qs),
  });
}
