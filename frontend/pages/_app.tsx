import { QAResult, QuestionSet } from "@/types/Questions";
import Head from "next/head";
import { AppProps } from "next/app";
import Link from "next/link";
import { useState } from "react";
import ApiKeyModal from "@/components/ApiKeyModal";

export default function MyApp({ Component, pageProps }: AppProps) {
  const [questionSet, setQuestionSet] = useState<QuestionSet | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [snippets, setSnippets] = useState<Record<string, QAResult>>({});

  return (
    <>
      <Head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <meta name="theme-color" content="#0F1D3B" />
      </Head>
      <div className="app-layout">
        <ApiKeyModal />
        <nav className="app-nav">
          <div className="nav-links">
            <Link href="/questions">Questions</Link>
          {questionSet && (
            <>
              {" "}|{" "}
              <Link href="/snippets">
                Snippets
                {Object.keys(snippets).length > 0
                  ? ` (${Object.keys(snippets).length})`
                  : ""}
              </Link>
            </>
          )}
          {questionSet && (
            <span
              className="nav-current-set"
              title={questionSet.title}
            >
              {`- ${questionSet.title}`}
            </span>
          )}
        </div>
        <div className="nav-links">
          <Link href="/account/billing">Account &amp; Billing</Link>
          {" "}|{" "}
          <Link href="/admin/users">Admin</Link>
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
        .nav-links {
          display: flex;
          align-items: center;
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
        .nav-current-set {
          margin-left: 0.75rem;
          max-width: 300px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #555;
          font-size: 0.9rem;
        }
      `}</style>
      </div>
    </>
  );
}
