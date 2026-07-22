import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import ErrorBoundary from "./components/ui/ErrorBoundary";
import { ToastProvider } from "./components/ui/Toast";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary
      label="Dashboard"
      fallback={
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted">
          <p>The dashboard hit an unexpected error.</p>
          <button
            type="button"
            onClick={() => {
              window.location.hash = "";
              window.location.reload();
            }}
            className="rounded-sm border border-edge px-3 py-1.5 font-mono text-[12px] text-brand transition hover:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            Reset to the dashboard
          </button>
        </div>
      }
    >
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
