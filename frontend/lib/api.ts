/* eslint-disable @typescript-eslint/no-explicit-any */
export async function fetchJSON<T>(
  url: string,
  opts?: RequestInit
): Promise<T> {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(await res.text());
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
