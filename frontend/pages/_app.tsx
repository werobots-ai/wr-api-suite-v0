import { QAResult, QuestionSet } from "@/types/Questions";
import Head from "next/head";
import { AppProps } from "next/app";
import Link from "next/link";
import { useState } from "react";
import ApiKeyModal from "@/components/ApiKeyModal";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { SafeOrganization } from "@/types/account";

function InnerApp({ Component, pageProps }: AppProps) {
  const [questionSet, setQuestionSet] = useState<QuestionSet | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [snippets, setSnippets] = useState<Record<string, QAResult>>({});

  return (
    <div className="app-layout">
      <Head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <meta name="theme-color" content="#0F1D3B" />
      </Head>
      <ApiKeyModal />
      <Navigation questionSet={questionSet} snippets={snippets} />
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
          height: 48px;
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
          gap: 0.75rem;
        }
        .nav-links.right {
          gap: 1rem;
        }
        .app-nav a {
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
          margin-left: 0.25rem;
          max-width: 300px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #555;
          font-size: 0.9rem;
        }
        .nav-auth {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .nav-auth select {
          padding: 0.25rem 0.5rem;
        }
        .nav-auth button {
          padding: 0.25rem 0.75rem;
          border: none;
          background: #f5222d;
          color: #fff;
          border-radius: 4px;
          cursor: pointer;
        }
        .nav-auth button:hover {
          background: #cf1322;
        }
        .nav-auth .nav-user {
          font-size: 0.9rem;
          color: #333;
        }
      `}</style>
    </div>
  );
}

function Navigation({
  questionSet,
  snippets,
}: {
  questionSet: QuestionSet | null;
  snippets: Record<string, QAResult>;
}) {
  const {
    user,
    permissions,
    organizations,
    activeOrgId,
    setActiveOrg,
    logout,
    loading,
  } = useAuth();
  const isSysAdmin = Boolean(user?.globalRoles.includes("SYSADMIN"));
  return (
    <nav className="app-nav">
      <div className="nav-links">
        <Link href="/questions">Questions</Link>
        {questionSet && (
          <>
            <span>|</span>
            <Link href="/snippets">
              Snippets
              {Object.keys(snippets).length > 0
                ? ` (${Object.keys(snippets).length})`
                : ""}
            </Link>
            <span className="nav-current-set" title={questionSet.title}>
              {`- ${questionSet.title}`}
            </span>
          </>
        )}
      </div>
      <div className="nav-links right">
        {user && (permissions?.manageBilling || permissions?.manageKeys) && (
          <Link href="/account/billing">Account &amp; Billing</Link>
        )}
        {isSysAdmin && (
          <>
            <span>|</span>
            <Link href="/admin/users">WR Console</Link>
          </>
        )}
        {!user && !loading && (
          <>
            <span>|</span>
            <Link href="/auth/dev-login">Login / Sign up</Link>
          </>
        )}
        <NavAuth
          userEmail={user?.email || null}
          organizations={organizations}
          activeOrgId={activeOrgId}
          setActiveOrg={setActiveOrg}
          logout={logout}
          loading={loading}
        />
      </div>
    </nav>
  );
}

function NavAuth({
  userEmail,
  organizations,
  activeOrgId,
  setActiveOrg,
  logout,
  loading,
}: {
  userEmail: string | null;
  organizations: SafeOrganization[];
  activeOrgId: string | null;
  setActiveOrg: (orgId: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}) {
  if (!userEmail) {
    if (loading) return <span>Loading...</span>;
    return null;
  }
  return (
    <div className="nav-auth">
      {organizations.length > 1 && (
        <select
          value={activeOrgId ?? ""}
          onChange={(e) => {
            void setActiveOrg(e.target.value);
          }}
        >
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      )}
      <span className="nav-user">{userEmail}</span>
      <button type="button" onClick={() => logout()}>
        Log out
      </button>
    </div>
  );
}

export default function MyApp(props: AppProps) {
  return (
    <AuthProvider>
      <InnerApp {...props} />
    </AuthProvider>
  );
}
