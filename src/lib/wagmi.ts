import { http, createConfig } from 'wagmi'
import { sepolia, mainnet, bsc, bscTestnet } from 'wagmi/chains'
import { walletConnect } from 'wagmi/connectors'
import { WEB3_CONFIG, getCurrentNetwork, getBestRpcUrl } from '@/config/web3'

// Get current network configuration
const currentNetwork = getCurrentNetwork();

// Support both ETH and BSC chains
const chains = currentNetwork.isMainnet 
  ? [mainnet, bsc] as const 
  : [sepolia, bscTestnet] as const;

// Dynamic transport configuration for all supported chains
const transports = {
  // ETH chains
  [mainnet.id]: http(getBestRpcUrl('ETH')),
  [sepolia.id]: http(getBestRpcUrl('ETH')),
  // BSC chains
  [bsc.id]: http(getBestRpcUrl('BSC')),
  [bscTestnet.id]: http(getBestRpcUrl('BSC')),
} as const;

export const config = createConfig({
  chains,
  connectors: [
    walletConnect({ projectId: WEB3_CONFIG.REOWN_PROJECT_ID }),
  ],
  transports: transports as any, // Type assertion to avoid complex typing issues
})