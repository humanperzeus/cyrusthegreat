import { useConnect, useDisconnect, useAccount } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Wallet } from 'lucide-react'

export const WalletConnector = () => {
  const { connectors, connect } = useConnect()
  const { disconnect } = useDisconnect()
  const { isConnected, address } = useAccount()

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  if (isConnected) {
    return (
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">
          {address && formatAddress(address)}
        </span>
        <Button variant="outline" size="sm" onClick={() => disconnect()}>
          Disconnect
        </Button>
      </div>
    )
  }

  // Friendly, stable labels regardless of the raw connector.name (which
  // for injected can be "Injected" or a detected wallet name). Keeps the
  // main-page connector clean now that there are two connectors (injected
  // for browser extensions + walletConnect for mobile/QR).
  const labelFor = (connector: { id: string; type: string; name: string }) => {
    if (connector.type === 'injected' || connector.id === 'injected') return 'Browser wallet (MetaMask / Rabby)';
    if (connector.id === 'walletConnect' || connector.type === 'walletConnect') return 'WalletConnect / mobile';
    return `Connect with ${connector.name}`;
  };

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-center">Connect your wallet to access the vault</p>
      <div className="flex flex-col gap-2">
        {connectors.map((connector) => (
          <Button
            key={connector.uid}
            onClick={() => connect({ connector })}
            size="lg"
            className="bg-gradient-vault text-primary-foreground shadow-vault"
          >
            <Wallet className="w-4 h-4 mr-2" />
            {labelFor(connector)}
          </Button>
        ))}
      </div>
    </div>
  )
}