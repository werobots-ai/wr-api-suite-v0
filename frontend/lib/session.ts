export const LOGOUT_EVENT_NAME = "wr-auth-logout";
const LOGIN_ROUTE = "/auth/dev-login";
const SESSION_STORAGE_KEYS = ["wr_auth_token", "wr_active_org", "apiKey"] as const;

export function clearStoredSession() {
  if (typeof window === "undefined") return;
  SESSION_STORAGE_KEYS.forEach((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      console.warn(`Failed to remove ${key} from storage`, error);
    }
  });
}

export function redirectToLogin() {
  if (typeof window === "undefined") return;
  if (window.location.pathname === LOGIN_ROUTE) return;
  window.location.replace(LOGIN_ROUTE);
}

export function forceLogoutRedirect() {
  if (typeof window === "undefined") return;
  clearStoredSession();
  window.dispatchEvent(new Event(LOGOUT_EVENT_NAME));
  redirectToLogin();
}
