import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  getStoredAuth,
  getValidAccessToken,
  beginLogin,
  exchangeCode,
  clearStoredAuth,
  getStoredClientId,
  setStoredClientId,
} from "../lib/spotify/auth";

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  accessToken: string | null;
  clientId: string;
  error: string | null;
  login: () => Promise<void>;
  logout: () => void;
  updateClientId: (newId: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string>(getStoredClientId());

  const initAuth = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    // 1. Check if returning from Spotify OAuth redirect with ?code=
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const errorParam = params.get("error");

    if (errorParam) {
      setError(`Spotify login was denied or failed: ${errorParam}`);
      // Clean query string
      const cleanUrl = window.location.origin + window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, cleanUrl);
      setIsLoading(false);
      return;
    }

    if (code) {
      try {
        const authData = await exchangeCode(code, clientId);
        setAccessToken(authData.accessToken);
        // Strip code parameter from URL without reloading
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

    // 2. Check existing token in storage
    const stored = getStoredAuth();
    if (stored) {
      const validToken = await getValidAccessToken();
      setAccessToken(validToken);
    } else {
      setAccessToken(null);
    }

    setIsLoading(false);
  }, [clientId]);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  const login = async () => {
    setError(null);
    try {
      await beginLogin(clientId);
    } catch (err) {
      setError((err as Error).message || "Failed to initialize Spotify login");
      throw err;
    }
  };

  const logout = () => {
    clearStoredAuth();
    setAccessToken(null);
  };

  const updateClientId = (newId: string) => {
    setStoredClientId(newId);
    setClientId(newId);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: Boolean(accessToken),
        isLoading,
        accessToken,
        clientId,
        error,
        login,
        logout,
        updateClientId,
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
