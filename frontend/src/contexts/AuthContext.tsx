import * as React from "react";

const AUTH_TOKEN_KEY = "admin-auth-token";

let tokenStore: string | null = null;

export function getStoredToken(): string | null {
  if (tokenStore != null) return tokenStore;
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  tokenStore = token;
  try {
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
    else localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // ignore
  }
}

type AuthState = {
  token: string | null;
  isAuthenticated: boolean;
};

type AuthContextValue = AuthState & {
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = React.createContext<AuthContextValue | undefined>(
  undefined
);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = React.useState<string | null>(() =>
    getStoredToken()
  );

  const login = React.useCallback(
    async (username: string, password: string) => {
      const API_BASE =
        (import.meta.env?.VITE_API_BASE as string) || "";
      const res = await fetch(`${API_BASE}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data.message as string) || (data.error as string) || "Login failed"
        );
      }
      const t = (data.token as string) ?? null;
      if (!t) throw new Error("No token in response");
      setStoredToken(t);
      setToken(t);
    },
    []
  );

  const logout = React.useCallback(() => {
    setStoredToken(null);
    setToken(null);
  }, []);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      token,
      isAuthenticated: !!token,
      login,
      logout,
    }),
    [token, login, logout]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
