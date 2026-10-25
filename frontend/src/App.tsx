import React from "react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AnimatedRoutes } from "./components/AnimatedRoutes";
import { AppLayout } from "./components/layout/AppLayout";
import { ScrollToTop } from "./components/ScrollToTop";
import { Toaster } from "./components/ui/toaster";
import { Toaster as Sonner } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { AuthProvider } from "./lib/auth";
import { ThemeProvider } from "./lib/theme";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A free backend can be slow to wake; one quiet retry beats showing an
      // error the user would only have to dismiss and retry by hand.
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

const App: React.FC = () => (
  <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <TooltipProvider delayDuration={200}>
            <ScrollToTop />
            <AppLayout>
              <AnimatedRoutes />
            </AppLayout>
            <Toaster />
            <Sonner />
          </TooltipProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
