import { Response } from "express";

export const initStream = (res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    (res as any).flush?.();
  };

  const sendError = (error: any, snippetId?: string) => {
    console.error("Error in stream:", error);
    sendEvent("error", {
      message: typeof error === "string" ? error : error.message,
      snippetId,
    });
  };

  const sendLog = (log: string, snippetId?: string) => {
    sendEvent("log", {
      log: snippetId ? `${snippetId}: ${log}` : log,
      snippetId,
    });
  };

  return { sendEvent, sendError, sendLog };
};
