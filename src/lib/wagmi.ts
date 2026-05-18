import { http, createConfig } from 'wagmi'
import { sepolia, mainnet, bsc, bscTestnet, base, baseSepolia, hyperEvm, hyperliquidEvmTestnet } from 'wagmi/chains'
import { walletConnect } from 'wagmi/connectors'
import { WEB3_CONFIG, getCurrentNetwork, getBestRpcUrl } from '@/config/web3'

// Get current network configuration
const currentNetwork = getCurrentNetwork();

// Support ETH, BSC, BASE, and HyperEVM (Hyperliquid).
// HyperEVM testnet (chainId 998) joined 2026-05-19 — pool-only, no Bank8.
const chains = currentNetwork.isMainnet
  ? [mainnet, bsc, base, hyperEvm] as const
  : [sepolia, bscTestnet, baseSepolia, hyperliquidEvmTestnet] as const;

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
} as const;

export const config = createConfig({
  chains,
  connectors: [
    walletConnect({ projectId: WEB3_CONFIG.REOWN_PROJECT_ID }),
  ],
  transports: transports as any, // Type assertion to avoid complex typing issues
})