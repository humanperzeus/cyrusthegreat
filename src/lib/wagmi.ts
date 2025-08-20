import { http, createConfig } from 'wagmi'
import { sepolia, mainnet, bsc, bscTestnet, base, baseSepolia } from 'wagmi/chains'
import { walletConnect } from 'wagmi/connectors'
import { WEB3_CONFIG, getCurrentNetwork, getBestRpcUrl } from '@/config/web3'

// Get current network configuration
const currentNetwork = getCurrentNetwork();

// Support ETH, BSC, and BASE chains
const chains = currentNetwork.isMainnet 
  ? [mainnet, bsc, base] as const 
  : [sepolia, bscTestnet, baseSepolia] as const;

// Dynamic transport configuration for all supported chains
const transports = {
  // ETH chains
  [mainnet.id]: http(getBestRpcUrl('ETH')),
  [sepolia.id]: http(getBestRpcUrl('ETH')),
  // BSC chains
  [bsc.id]: http(getBestRpcUrl('BSC')),
  [bscTestnet.id]: http(getBestRpcUrl('BSC')),
  // BASE chains
  [base.id]: http(getBestRpcUrl('BASE')),
  [baseSepolia.id]: http(getBestRpcUrl('BASE')),
} as const;

export const config = createConfig({
  chains,
  connectors: [
    walletConnect({ projectId: WEB3_CONFIG.REOWN_PROJECT_ID }),
  ],
  transports: transports as any, // Type assertion to avoid complex typing issues
})