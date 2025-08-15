import { http, createConfig } from 'wagmi'
import { sepolia, mainnet } from 'wagmi/chains'
import { walletConnect } from 'wagmi/connectors'
import { WEB3_CONFIG, getCurrentNetwork } from '@/config/web3'

// Get current network configuration
const currentNetwork = getCurrentNetwork();

// Dynamic chain configuration based on network mode
const chains = currentNetwork.isMainnet ? [mainnet] as const : [sepolia] as const;

// Dynamic transport configuration
const transports = currentNetwork.isMainnet 
  ? { [mainnet.id]: http(WEB3_CONFIG.ALCHEMY_ETH_RPC_URL) }
  : { [sepolia.id]: http(WEB3_CONFIG.ALCHEMY_ETH_RPC_URL) };

export const config = createConfig({
  chains,
  connectors: [
    walletConnect({ projectId: WEB3_CONFIG.REOWN_PROJECT_ID }),
  ],
  transports: transports as any, // Type assertion to avoid complex typing issues
})