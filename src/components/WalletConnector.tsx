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
            Connect with {connector.name}
          </Button>
        ))}
      </div>
    </div>
  )
}