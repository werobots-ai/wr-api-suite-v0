import { QAResult, QuestionSet } from "@/types/Questions";
import { AppProps } from "next/app";
import Link from "next/link";
import { useState } from "react";

export default function MyApp({ Component, pageProps }: AppProps) {
  const [questionSet, setQuestionSet] = useState<QuestionSet | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [snippets, setSnippets] = useState<Record<string, QAResult>>({});

  return (
    <div className="app-layout">
      <nav className="app-nav">
        <div className="nav-links">
          <Link href="/questions">Questions</Link>
          {questionSet && (
            <>
              {" "}
              |{" "}
              <Link href="/conversations">
                Conversations
                {Object.keys(snippets).length > 0
                  ? ` (${Object.keys(snippets).length})`
                  : ""}
              </Link>
            </>
          )}
        </div>
        <div className="nav-title">
          {questionSet?.title || "No question set loaded"}
        </div>
      </nav>
      <main className="app-content">
        <Component
          {...pageProps}
          questionSet={questionSet}
          setQuestionSet={setQuestionSet}
          isSaved={isSaved}
          setIsSaved={setIsSaved}
          snippets={snippets}
          setSnippets={setSnippets}
        />
      </main>
      <style jsx global>{`
        html,
        body,
        #__next {
          margin: 0;
          padding: 0;
          height: 100%;
          font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        }
        .app-layout {
          display: flex;
          flex-direction: column;
          height: 100vh;
        }
        .app-nav {
          flex: 0 0 auto;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 1.5rem;
          background: #ffffff;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        .app-nav a {
          margin: 0 0.75rem;
          color: #1890ff;
          text-decoration: none;
          font-weight: 500;
          font-size: 1rem;
        }
        .app-nav a:hover {
          text-decoration: underline;
        }
        .app-content {
          flex: 1 1 auto;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
        }
        .nav-title {
          font-size: 1rem;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}
