import React from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./state/AuthContext";
import { DeckProvider } from "./state/DeckContext";
import { ThemeProvider } from "./state/ThemeContext";
import { ToastProvider } from "./state/ToastContext";
import { AppShell } from "./components/layout/AppShell";
import { HomePage } from "./pages/HomePage";
import { EditorPage } from "./pages/EditorPage";
import { CardsPage } from "./pages/CardsPage";
import { HostPage } from "./pages/HostPage";
import { SettingsPage } from "./pages/SettingsPage";

export const App: React.FC = () => {
  return (
    <HashRouter>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <DeckProvider>
              <AppShell>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/deck/:id" element={<EditorPage />} />
                  <Route path="/deck/:id/cards" element={<CardsPage />} />
                  <Route path="/deck/:id/play" element={<HostPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </AppShell>
            </DeckProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </HashRouter>
  );
};

export default App;
