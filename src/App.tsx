import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { WagmiProvider } from "wagmi";
import { config } from "@/lib/wagmi";
import { ProgressProvider } from "@/contexts/ProgressContext";
import { BuildBadge } from "@/components/shared/BuildBadge";
import { MainnetComingSoon } from "@/components/shared/MainnetComingSoon";
import { getEffectiveNetworkMode, isMainnetDeployedAnywhere } from "@/config/web3";
import Index from "./pages/Index";
import Claim from "./pages/Claim";
import Pay from "./pages/Pay";
import GetPaid from "./pages/GetPaid";
import Fundraise from "./pages/Fundraise";
import Fund from "./pages/Fund";
import Discover from "./pages/Discover";
import EmbedOnramp from "./pages/EmbedOnramp";
import EmbedBuilder from "./pages/EmbedBuilder";
import Receipt from "./pages/Receipt";
import Privacy from "./pages/Privacy";
import Disclaimer from "./pages/Disclaimer";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// ProgressProvider lives BETWEEN TooltipProvider and the routed tree.
// Position matters: the global <ProgressFlow> it renders must be a
// sibling of every Radix <Dialog> opened by the routes, never trapped
// inside one. That's what lets the progress chip outlive the parent
// modal closing while a tx is still pending.
// Mainnet guard: if the user picked mainnet mode (localStorage) but
// no mainnet contracts exist in the build, render MainnetComingSoon
// in place of the whole route tree. Evaluated once at app boot — a
// mode switch reloads the page, so this re-runs with the new mode.
const _showMainnetGuard =
  getEffectiveNetworkMode() === "mainnet" && !isMainnetDeployedAnywhere();

// Routed shell. /embed/* is CHROME-FREE — no mainnet guard, no BuildBadge —
// so it renders cleanly inside a host site's iframe. Everything else gets the
// normal guard + build badge.
const AppShell = () => {
  const { pathname } = useLocation();

  if (pathname.startsWith("/embed")) {
    return (
      <Routes>
        <Route path="/embed/onramp" element={<EmbedOnramp />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    );
  }

  return (
    <>
      {_showMainnetGuard ? (
        <MainnetComingSoon />
      ) : (
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/claim" element={<Claim />} />
          <Route path="/pay" element={<Pay />} />
          <Route path="/get-paid" element={<GetPaid />} />
          <Route path="/fundraise" element={<Fundraise />} />
          <Route path="/fund" element={<Fund />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/get-embed" element={<EmbedBuilder />} />
          <Route path="/receipt" element={<Receipt />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/disclaimer" element={<Disclaimer />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      )}
      {/* Build badge: fixed bottom-left (bottom-right is the ProgressFlow
          chip stack). Outside Routes so it shows on every non-embed route. */}
      <BuildBadge />
    </>
  );
};

const App = () => (
  <WagmiProvider config={config}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <ProgressProvider>
          <BrowserRouter>
            <AppShell />
          </BrowserRouter>
        </ProgressProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </WagmiProvider>
);

export default App;
