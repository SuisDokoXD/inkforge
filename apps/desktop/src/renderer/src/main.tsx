import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { queryClient } from "./lib/query-client";
import { configurePlatformApi } from "./lib/api";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("#root not found");

// Keep Electron's preload implementation behind the same platform boundary
// used by the Android renderer build.
if (window.inkforge) configurePlatformApi(window.inkforge);

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
