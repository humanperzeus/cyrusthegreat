import { http, createConfig } from 'wagmi'
import { sepolia, mainnet, bsc, bscTestnet, base, baseSepolia, hyperEvm, hyperliquidEvmTestnet, arbitrum, arbitrumSepolia } from 'wagmi/chains'
import { walletConnect } from 'wagmi/connectors'
import { WEB3_CONFIG, getCurrentNetwork, getBestRpcUrl } from '@/config/web3'

// Get current network configuration
const currentNetwork = getCurrentNetwork();

// Support ETH, BSC, BASE, HyperEVM (Hyperliquid), and Arbitrum.
// HyperEVM testnet (998) joined 2026-05-19 — pool-only, no Bank8.
// Arbitrum Sepolia (421614) joined 2026-05-30 — both Bank8 + Tresor1.
const chains = currentNetwork.isMainnet
  ? [mainnet, bsc, base, hyperEvm, arbitrum] as const
  : [sepolia, bscTestnet, baseSepolia, hyperliquidEvmTestnet, arbitrumSepolia] as const;

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
  // HyperEVM chains — single canonical RPC per network mode (no managed tier yet)
  [hyperEvm.id]: http(getBestRpcUrl('HYPER')),
  [hyperliquidEvmTestnet.id]: http(getBestRpcUrl('HYPER')),
  // Arbitrum chains
  [arbitrum.id]: http(getBestRpcUrl('ARB')),
  [arbitrumSepolia.id]: http(getBestRpcUrl('ARB')),
} as const;

export const config = createConfig({
  chains,
  connectors: [
    walletConnect({ projectId: WEB3_CONFIG.REOWN_PROJECT_ID }),
  ],
  transports: transports as any, // Type assertion to avoid complex typing issues
})