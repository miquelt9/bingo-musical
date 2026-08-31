import React from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { DeckProvider } from "./state/DeckContext";
import { ThemeProvider } from "./state/ThemeContext";
import { ToastProvider } from "./state/ToastContext";
import { AppShell } from "./components/layout/AppShell";
import { HomePage } from "./pages/HomePage";
import { EditorPage } from "./pages/EditorPage";
import { CardsPage } from "./pages/CardsPage";
import { HostPage } from "./pages/HostPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ImportPage } from "./pages/ImportPage";
import { SharedDeckPage } from "./pages/SharedDeckPage";
import { useRouteAnalytics } from "./hooks/useRouteAnalytics";

function AppRoutes() {
  useRouteAnalytics();

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/deck/:id" element={<EditorPage />} />
      <Route path="/deck/:id/cards" element={<CardsPage />} />
      <Route path="/deck/:id/play" element={<HostPage />} />
      <Route path="/import" element={<ImportPage />} />
      <Route path="/share/:shareId" element={<SharedDeckPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export const App: React.FC = () => {
  return (
    <HashRouter>
      <ThemeProvider>
        <ToastProvider>
          <DeckProvider>
            <AppShell>
              <AppRoutes />
            </AppShell>
          </DeckProvider>
        </ToastProvider>
      </ThemeProvider>
    </HashRouter>
  );
};

export default App;
