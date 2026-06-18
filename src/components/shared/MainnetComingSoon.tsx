/**
 * MainnetComingSoon — hard guard rendered when the user picked mainnet
 * mode but NO mainnet contracts are deployed across any of the 5
 * supported chains (see isMainnetDeployedAnywhere() in web3.ts).
 *
 * Replaces the whole route tree — we don't let the user navigate to
 * a Bank8 vault that has no contract address, or to /claim with no
 * pool deployment. Just one centered card explaining the state +
 * a one-click switch back to testnet (no manual localStorage poking).
 *
 * Auto-relaxes when even ONE mainnet address gets added to .env and
 * a new build is deployed — isMainnetDeployedAnywhere() returns true,
 * the guard in App.tsx skips this component, and the normal app
 * renders for that chain.
 */

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Globe2, Beaker } from "lucide-react";
import { setNetworkMode } from "@/config/web3";

export const MainnetComingSoon = () => {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="max-w-md w-full p-8 bg-gradient-card backdrop-blur border-vault-primary/30 text-center">
        <div className="flex justify-center mb-4">
          <div className="p-3 rounded-full bg-vault-primary/15">
            <Globe2 className="w-8 h-8 text-vault-primary" />
          </div>
        </div>
        <h1 className="text-xl font-semibold mb-2">Mainnet not yet deployed</h1>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          Bank8 and CyrusTresor1 contracts aren't deployed on any mainnet chain yet.
          Switch back to testnet to use the dapp, or wait for the mainnet launch.
        </p>
        <Button
          type="button"
          onClick={() => setNetworkMode("testnet")}
          className="w-full bg-vault-primary text-background hover:bg-vault-primary/90"
        >
          <Beaker className="w-4 h-4 mr-2" />
          Switch back to testnet
        </Button>
      </Card>
    </div>
  );
};
