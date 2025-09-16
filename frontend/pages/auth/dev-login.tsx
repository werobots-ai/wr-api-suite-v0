import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/context/AuthContext";

export default function DevAuthPage() {
  const { login, signup, user, loading } = useAuth();
  const router = useRouter();
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [signupForm, setSignupForm] = useState({
    organizationName: "",
    ownerEmail: "",
    ownerName: "",
    ownerPassword: "",
    billingEmail: "",
  });
  const [revealedKeys, setRevealedKeys] = useState<string[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user && !loading) {
      router.replace("/account/billing");
    }
  }, [user, loading, router]);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setRevealedKeys(null);
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
    setSubmitting(true);
    try {
      const result = await signup({
        organizationName: signupForm.organizationName,
        ownerEmail: signupForm.ownerEmail,
        ownerName: signupForm.ownerName,
        ownerPassword: signupForm.ownerPassword,
        billingEmail: signupForm.billingEmail || undefined,
      });
      setRevealedKeys(result.revealedApiKeys);
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

  return (
    <div className="auth-container">
      <div className="card">
        <h1>Developer Authentication</h1>
        <p>
          This local-only auth flow mimics the Keycloak integration we will ship
          later. The forms below let you create an organization and owner account
          or sign in with existing credentials.
        </p>
        {message && <div className="notice success">{message}</div>}
        {error && <div className="notice error">{error}</div>}
        {revealedKeys && revealedKeys.length > 0 && (
          <div className="notice warning">
            <strong>New API keys</strong>
            <p>Copy these values now. They will not be displayed again.</p>
            <ul>
              {revealedKeys.map((key) => (
                <li key={key}>
                  <code>{key}</code>
                </li>
              ))}
            </ul>
          </div>
        )}
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
            <button type="submit" disabled={submitting}>
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
            <button type="submit" disabled={submitting}>
              {submitting ? "Working..." : "Create organization"}
            </button>
          </form>
        </div>
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
        .notice.warning {
          background: #fff7e6;
          border: 1px solid #ffd591;
        }
        .notice.warning ul {
          margin: 0.5rem 0 0;
          padding: 0;
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .notice.warning code {
          background: #000;
          color: #fff;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          display: inline-block;
        }
      `}</style>
    </div>
  );
}
