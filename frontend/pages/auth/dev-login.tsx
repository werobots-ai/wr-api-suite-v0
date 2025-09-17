import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/context/AuthContext";
import KeyRevealModal from "@/components/KeyRevealModal";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function DevAuthPage() {
  const { login, signup, bootstrapMaster, user, loading } = useAuth();
  const router = useRouter();
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [signupForm, setSignupForm] = useState({
    organizationName: "",
    ownerEmail: "",
    ownerName: "",
    ownerPassword: "",
    billingEmail: "",
  });
  const [bootstrapForm, setBootstrapForm] = useState({
    organizationName: "",
    ownerEmail: "",
    ownerName: "",
    ownerPassword: "",
    confirmPassword: "",
    billingEmail: "",
  });
  const [keyModalKeys, setKeyModalKeys] = useState<string[]>([]);
  const [keyModalContext, setKeyModalContext] = useState(
    "Organization created. Copy the API keys now—they will not be shown again.",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [needsBootstrap, setNeedsBootstrap] = useState<boolean | null>(null);
  const [bootstrapMessage, setBootstrapMessage] = useState<string | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [bootstrapSubmitting, setBootstrapSubmitting] = useState(false);
  const [statusInfo, setStatusInfo] = useState<{
    bootstrapCompletedAt: string | null;
    organizationCount: number;
  } | null>(null);

  useEffect(() => {
    if (user && !loading) {
      router.replace("/account/billing");
    }
  }, [user, loading, router]);

  useEffect(() => {
    let active = true;
    const fetchStatus = async () => {
      setStatusLoading(true);
      setStatusError(null);
      try {
        const res = await fetch(`${API_URL}/api/auth/dev/status`);
        if (!res.ok) {
          throw new Error(await res.text());
        }
        const data = await res.json();
        if (!active) return;
        setNeedsBootstrap(Boolean(data.needsBootstrap));
        setStatusInfo({
          bootstrapCompletedAt: data.bootstrapCompletedAt ?? null,
          organizationCount: Number(data.organizationCount ?? 0),
        });
      } catch (err: unknown) {
        if (!active) return;
        const message = err instanceof Error ? err.message : String(err);
        setStatusError(message || "Failed to check deployment status");
        setNeedsBootstrap(true);
      } finally {
        if (active) {
          setStatusLoading(false);
        }
      }
    };

    void fetchStatus();

    return () => {
      active = false;
    };
  }, []);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setKeyModalKeys([]);
    setSubmitting(true);
    try {
      await login(loginForm.email, loginForm.password);
      setMessage("Logged in successfully.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Failed to login");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignup = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setBootstrapMessage(null);
    setSubmitting(true);
    try {
      const result = await signup({
        organizationName: signupForm.organizationName,
        ownerEmail: signupForm.ownerEmail,
        ownerName: signupForm.ownerName,
        ownerPassword: signupForm.ownerPassword,
        billingEmail: signupForm.billingEmail || undefined,
      });
      setKeyModalContext(
        "Organization created. Copy the API keys now—they will not be shown again.",
      );
      setKeyModalKeys(result.revealedApiKeys || []);
      setMessage(
        "Organization created. Copy the API keys now—they will not be shown again.",
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Failed to sign up");
    } finally {
      setSubmitting(false);
    }
  };

  const handleBootstrap = async (event: FormEvent) => {
    event.preventDefault();
    setBootstrapError(null);
    setBootstrapMessage(null);
    setError(null);
    setMessage(null);
    setKeyModalKeys([]);
    if (bootstrapForm.ownerPassword !== bootstrapForm.confirmPassword) {
      setBootstrapError("Passwords do not match");
      return;
    }
    setBootstrapSubmitting(true);
    try {
      const result = await bootstrapMaster({
        organizationName: bootstrapForm.organizationName,
        ownerEmail: bootstrapForm.ownerEmail,
        ownerName: bootstrapForm.ownerName,
        ownerPassword: bootstrapForm.ownerPassword,
        billingEmail: bootstrapForm.billingEmail || undefined,
      });
      setKeyModalContext(
        "Bootstrap complete. Copy the master API keys now—they will not be shown again.",
      );
      setKeyModalKeys(result.revealedApiKeys || []);
      setBootstrapMessage(
        "Master organization created. Copy the keys now—they will not be shown again.",
      );
      setNeedsBootstrap(false);
      setStatusInfo({
        bootstrapCompletedAt: result.bootstrapCompletedAt,
        organizationCount: Math.max(statusInfo?.organizationCount ?? 0, 1),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setBootstrapError(message || "Failed to create master account");
    } finally {
      setBootstrapSubmitting(false);
    }
  };

  return (
    <div className="auth-container">
      <KeyRevealModal
        isOpen={keyModalKeys.length > 0}
        keys={keyModalKeys}
        context={keyModalContext}
        title="New API keys"
        onClose={() => setKeyModalKeys([])}
      />
      <div className="card">
        <h1>Developer Authentication</h1>
        <p>
          This local-only auth flow mimics the Keycloak integration we will ship later. The forms
          below let you create an organization and owner account or sign in with existing
          credentials.
        </p>
        {statusInfo?.bootstrapCompletedAt && needsBootstrap === false && (
          <p className="status-line">
            Deployment bootstrapped on {" "}
            {new Date(statusInfo.bootstrapCompletedAt).toLocaleString()}.
          </p>
        )}
        {statusLoading && <div className="notice info">Checking deployment status...</div>}
        {statusError && <div className="notice error">{statusError}</div>}
        {needsBootstrap === true ? (
          <form onSubmit={handleBootstrap} className="panel bootstrap-panel">
            <h2>Initialize deployment</h2>
            <p className="muted">
              Create the first master organization. Its owners can review platform-wide metrics
              and manage every tenant.
            </p>
            {bootstrapMessage && <div className="notice success">{bootstrapMessage}</div>}
            {bootstrapError && <div className="notice error">{bootstrapError}</div>}
            <label>
              Master organization name
              <input
                type="text"
                value={bootstrapForm.organizationName}
                onChange={(e) =>
                  setBootstrapForm({ ...bootstrapForm, organizationName: e.target.value })
                }
                required
              />
            </label>
            <label>
              Owner name
              <input
                type="text"
                value={bootstrapForm.ownerName}
                onChange={(e) =>
                  setBootstrapForm({ ...bootstrapForm, ownerName: e.target.value })
                }
                required
              />
            </label>
            <label>
              Owner email
              <input
                type="email"
                value={bootstrapForm.ownerEmail}
                onChange={(e) =>
                  setBootstrapForm({ ...bootstrapForm, ownerEmail: e.target.value })
                }
                required
              />
            </label>
            <label>
              Owner password
              <input
                type="password"
                value={bootstrapForm.ownerPassword}
                onChange={(e) =>
                  setBootstrapForm({ ...bootstrapForm, ownerPassword: e.target.value })
                }
                required
              />
            </label>
            <label>
              Confirm password
              <input
                type="password"
                value={bootstrapForm.confirmPassword}
                onChange={(e) =>
                  setBootstrapForm({ ...bootstrapForm, confirmPassword: e.target.value })
                }
                required
              />
            </label>
            <label>
              Billing email (optional)
              <input
                type="email"
                value={bootstrapForm.billingEmail}
                onChange={(e) =>
                  setBootstrapForm({ ...bootstrapForm, billingEmail: e.target.value })
                }
              />
            </label>
            <button type="submit" disabled={bootstrapSubmitting || statusLoading}>
              {bootstrapSubmitting ? "Setting up..." : "Create master account"}
            </button>
          </form>
        ) : needsBootstrap === false ? (
          <>
            {message && <div className="notice success">{message}</div>}
            {error && <div className="notice error">{error}</div>}
            <div className="forms">
              <form onSubmit={handleLogin} className="panel">
                <h2>Log in</h2>
                <label>
                  Email
                  <input
                    type="email"
                    value={loginForm.email}
                    onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={loginForm.password}
                    onChange={(e) =>
                      setLoginForm({ ...loginForm, password: e.target.value })
                    }
                    required
                  />
                </label>
                <button type="submit" disabled={submitting || statusLoading}>
                  {submitting ? "Working..." : "Log in"}
                </button>
              </form>
              <form onSubmit={handleSignup} className="panel">
                <h2>Create organization</h2>
                <label>
                  Organization name
                  <input
                    type="text"
                    value={signupForm.organizationName}
                    onChange={(e) =>
                      setSignupForm({ ...signupForm, organizationName: e.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  Owner name
                  <input
                    type="text"
                    value={signupForm.ownerName}
                    onChange={(e) =>
                      setSignupForm({ ...signupForm, ownerName: e.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  Owner email
                  <input
                    type="email"
                    value={signupForm.ownerEmail}
                    onChange={(e) =>
                      setSignupForm({ ...signupForm, ownerEmail: e.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  Owner password
                  <input
                    type="password"
                    value={signupForm.ownerPassword}
                    onChange={(e) =>
                      setSignupForm({ ...signupForm, ownerPassword: e.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  Billing email (optional)
                  <input
                    type="email"
                    value={signupForm.billingEmail}
                    onChange={(e) =>
                      setSignupForm({ ...signupForm, billingEmail: e.target.value })
                    }
                  />
                </label>
                <button type="submit" disabled={submitting || statusLoading}>
                  {submitting ? "Working..." : "Create organization"}
                </button>
              </form>
            </div>
          </>
        ) : null}
      </div>
      <style jsx>{`
        .auth-container {
          display: flex;
          justify-content: center;
          align-items: flex-start;
          padding: 2rem;
          background: #f0f2f5;
          min-height: calc(100vh - 48px);
        }
        .card {
          background: #fff;
          padding: 2rem;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          max-width: 960px;
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .status-line {
          margin: 0;
          color: #595959;
          font-size: 0.9rem;
        }
        .forms {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1.5rem;
        }
        .panel {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          padding: 1rem;
          border: 1px solid #e6e6e6;
          border-radius: 6px;
          background: #fafafa;
        }
        .bootstrap-panel {
          max-width: 520px;
        }
        .muted {
          color: #8c8c8c;
          font-size: 0.9rem;
        }
        label {
          display: flex;
          flex-direction: column;
          font-weight: 500;
          font-size: 0.9rem;
          gap: 0.25rem;
        }
        input {
          padding: 0.5rem;
          border: 1px solid #d9d9d9;
          border-radius: 4px;
          font-size: 1rem;
        }
        button {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 4px;
          background: #1890ff;
          color: #fff;
          cursor: pointer;
        }
        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .notice {
          padding: 0.75rem;
          border-radius: 4px;
        }
        .notice.success {
          background: #f6ffed;
          border: 1px solid #b7eb8f;
        }
        .notice.error {
          background: #fff2f0;
          border: 1px solid #ffccc7;
        }
        .notice.info {
          background: #e6f7ff;
          border: 1px solid #91d5ff;
        }
        @media (max-width: 640px) {
          .card {
            padding: 1.5rem;
          }
        }
      `}</style>
    </div>
  );
}
