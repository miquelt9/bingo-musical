import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  getStoredAuth,
  getValidAccessToken,
  beginLogin,
  exchangeCode,
  clearStoredAuth,
  isSpotifyConfigured,
} from "../lib/spotify/auth";

interface AuthContextType {
  isConfigured: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  accessToken: string | null;
  error: string | null;
  login: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const initAuth = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const errorParam = params.get("error");

    if (errorParam) {
      setError(`Spotify login was denied or failed: ${errorParam}`);
      const cleanUrl = window.location.origin + window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, cleanUrl);
      setIsLoading(false);
      return;
    }

    if (code) {
      try {
        const authData = await exchangeCode(code);
        setAccessToken(authData.accessToken);
        const cleanUrl = window.location.origin + window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, cleanUrl);
        setIsLoading(false);
        return;
      } catch (err) {
        console.error("Failed to exchange Spotify authorization code:", err);
        setError((err as Error).message || "Failed to complete Spotify login.");
        const cleanUrl = window.location.origin + window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    }

    const stored = getStoredAuth();
    if (stored) {
      const validToken = await getValidAccessToken();
      setAccessToken(validToken);
    } else {
      setAccessToken(null);
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  const login = async () => {
    setError(null);
    try {
      await beginLogin();
    } catch (err) {
      setError((err as Error).message || "Failed to initialize Spotify login");
      throw err;
    }
  };

  const logout = () => {
    clearStoredAuth();
    setAccessToken(null);
  };

  return (
    <AuthContext.Provider
      value={{
        isConfigured: isSpotifyConfigured(),
        isAuthenticated: Boolean(accessToken),
        isLoading,
        accessToken,
        error,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
