import { useAccount, useDisconnect } from "wagmi";
import { Button } from "@/components/ui/button";

/**
 * Top-right DISCONNECT control for the standalone pages (Pay / Fund / Claim /
 * GetPaid / Fundraise / Discover).
 *
 * Shows ONLY when connected (green dot + short address + "Disconnect"). When
 * disconnected it renders nothing — each action page already has its own
 * contextual connect button in the form ("Connect wallet to pay/donate/…"),
 * which is the better, single place to connect. No duplicate top connect.
 */
export const WalletStatusChip = () => {
  const { isConnected, address } = useAccount();
  const { disconnect } = useDisconnect();

  if (!isConnected || !address) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-mono text-muted-foreground inline-flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-emerald-400" aria-hidden />
        {address.slice(0, 6)}…{address.slice(-4)}
      </span>
      <Button variant="outline" size="sm" onClick={() => disconnect()} className="h-7 text-xs">
        Disconnect
      </Button>
    </div>
  );
};
