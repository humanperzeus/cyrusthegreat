import { useConnect } from 'wagmi';

/**
 * One-call wallet connect used by the payment/donation/claim forms so their
 * OWN primary button can trigger the connect when disconnected — one
 * affordance, where the action is (no separate connector card per page).
 *
 * Smart pick (see src/lib/wagmi.ts connector order):
 *   - If a browser-extension wallet is present (window.ethereum), use the
 *     `injected` connector → native one-click popup, and it reconnects
 *     instantly + silently on every page load.
 *   - Otherwise fall back to `walletConnect` → QR / mobile.
 *
 * Same connectors + same wagmi store the main-page connector uses, so the
 * connection is unified and persists across all pages.
 */
export function useConnectWallet(): () => void {
  const { connect, connectors } = useConnect();
  return () => {
    const hasInjected =
      typeof window !== 'undefined' &&
      (window as unknown as { ethereum?: unknown }).ethereum != null;

    const injected = connectors.find((c) => c.type === 'injected' || c.id === 'injected');
    const walletConnect = connectors.find((c) => c.id === 'walletConnect' || c.type === 'walletConnect');

    const chosen = (hasInjected && injected) ? injected : (walletConnect ?? connectors[0]);
    if (chosen) connect({ connector: chosen });
  };
}
