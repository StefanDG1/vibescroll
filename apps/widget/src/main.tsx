import { createRoot } from "react-dom/client";
import { HostProvider } from "./host";
import { CompactApp } from "./compact-app";
import "./compact.css";
createRoot(document.getElementById("root")!).render(
  <HostProvider>
    <CompactApp />
  </HostProvider>,
);
