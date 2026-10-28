import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HostProvider } from "./host";
import { WidgetApp } from "./app";
import "./style.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 15000,
      gcTime: 300000,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});
const entry = document.documentElement.dataset.entry ?? "workspace";
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <HostProvider>
      <WidgetApp compact={entry === "card"} exportViewer={entry === "export"} />
    </HostProvider>
  </QueryClientProvider>,
);
