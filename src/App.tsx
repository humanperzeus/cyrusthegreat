import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { WagmiProvider } from "wagmi";
import { config } from "@/lib/wagmi";
import { ProgressProvider } from "@/contexts/ProgressContext";
import { BuildBadge } from "@/components/shared/BuildBadge";
import Index from "./pages/Index";
import Claim from "./pages/Claim";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// ProgressProvider lives BETWEEN TooltipProvider and the routed tree.
// Position matters: the global <ProgressFlow> it renders must be a
// sibling of every Radix <Dialog> opened by the routes, never trapped
// inside one. That's what lets the progress chip outlive the parent
// modal closing while a tx is still pending.
const App = () => (
  <WagmiProvider config={config}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <ProgressProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/claim" element={<Claim />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            {/* Build badge: fixed bottom-left (bottom-right is the
                ProgressFlow chip stack). Mounted outside Routes so it
                shows on every route including the 404. */}
            <BuildBadge />
          </BrowserRouter>
        </ProgressProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </WagmiProvider>
);

export default App;
