// Cyrus The Great Vault Configuration
// Dynamic network configuration based on VITE_NETWORK_MODE

import vaultAbiJson from '../contracts/abis/vaultAbi.json';

// Import MetaMask chain switching functions
import { 
  connectMetaMaskToEthMainnet, 
  connectMetaMaskToEthTestnet,
  connectMetaMaskToBscMainnet, 
  connectMetaMaskToBscTestnet,
  connectMetaMaskToBaseMainnet,
  connectMetaMaskToBaseTestnet
} from '../metamask.js';

// Import logging utilities
import { debugLog, debugError } from '@/lib/utils';

export const WEB3_CONFIG = {
  // Network Mode (mainnet or testnet)
  NETWORK_MODE: import.meta.env.VITE_NETWORK_MODE || 'testnet',
  
  // Reown Project ID
  REOWN_PROJECT_ID: import.meta.env.VITE_REOWN_PROJECT_ID,
  
  // Contract Addresses
  CTGVAULT_ETH_CONTRACT: import.meta.env.VITE_NETWORK_MODE === 'mainnet' 
    ? import.meta.env.VITE_CTGVAULT_ETH_MAINNET_CONTRACT
    : import.meta.env.VITE_CTGVAULT_ETH_TESTNET_CONTRACT,
    
  CTGVAULT_BSC_CONTRACT: import.meta.env.VITE_NETWORK_MODE === 'mainnet'
    ? import.meta.env.VITE_CTGVAULT_BSC_MAINNET_CONTRACT
    : import.meta.env.VITE_CTGVAULT_BSC_TESTNET_CONTRACT,
  
  // BASE Contract Addresses
  CTGVAULT_BASE_CONTRACT: import.meta.env.VITE_NETWORK_MODE === 'mainnet'
    ? import.meta.env.VITE_CTGVAULT_BASE_MAINNET_CONTRACT
    : import.meta.env.VITE_CTGVAULT_BASE_TESTNET_CONTRACT,

  // CyrusTresor1 contract addresses (Bank8 + anonymity pool). Deployed to
  // testnets 2026-05-14; mainnet slots are 'notdeployednow' until launch.
  // Frontend code path is GATED by VITE_ENABLE_POOL (see below) — even
  // with valid addresses here, the pool UI stays hidden until the flag flips.
  CTGTRESOR_ETH_CONTRACT: import.meta.env.VITE_NETWORK_MODE === 'mainnet'
    ? import.meta.env.VITE_CTGTRESOR_ETH_MAINNET_CONTRACT
    : import.meta.env.VITE_CTGTRESOR_ETH_TESTNET_CONTRACT,

  CTGTRESOR_BSC_CONTRACT: import.meta.env.VITE_NETWORK_MODE === 'mainnet'
    ? import.meta.env.VITE_CTGTRESOR_BSC_MAINNET_CONTRACT
    : import.meta.env.VITE_CTGTRESOR_BSC_TESTNET_CONTRACT,

  CTGTRESOR_BASE_CONTRACT: import.meta.env.VITE_NETWORK_MODE === 'mainnet'
    ? import.meta.env.VITE_CTGTRESOR_BASE_MAINNET_CONTRACT
    : import.meta.env.VITE_CTGTRESOR_BASE_TESTNET_CONTRACT,

  // HyperEVM (Hyperliquid) contract addresses. Bank8 + CyrusTresor1 both
  // deployed on testnet (2026-05-30). Native HYPE has 18 decimals.
  // Testnet uses MockV3Aggregator for HYPE/USD — see deployMockPriceFeed.ts.
  // Mainnet slots stay empty pending Pyth-adapter work for a real HYPE/USD feed.
  CTGVAULT_HYPER_CONTRACT: import.meta.env.VITE_NETWORK_MODE === 'mainnet'
    ? import.meta.env.VITE_CTGVAULT_HYPER_MAINNET_CONTRACT
    : import.meta.env.VITE_CTGVAULT_HYPER_TESTNET_CONTRACT,

  CTGTRESOR_HYPER_CONTRACT: import.meta.env.VITE_NETWORK_MODE === 'mainnet'
    ? import.meta.env.VITE_CTGTRESOR_HYPER_MAINNET_CONTRACT
    : import.meta.env.VITE_CTGTRESOR_HYPER_TESTNET_CONTRACT,

  // Arbitrum (L2 over Ethereum) contract addresses. Both Bank8 + CyrusTresor1
  // deployed on Arbitrum Sepolia testnet 2026-05-30 (mainnet slots stay
  // "notdeployednow" until launch). Native is ETH (18 dec). Real Chainlink
  // ETH/USD feed available (no Mock needed).
  CTGVAULT_ARB_CONTRACT: import.meta.env.VITE_NETWORK_MODE === 'mainnet'
    ? import.meta.env.VITE_CTGVAULT_ARB_MAINNET_CONTRACT
    : import.meta.env.VITE_CTGVAULT_ARB_TESTNET_CONTRACT,

  CTGTRESOR_ARB_CONTRACT: import.meta.env.VITE_NETWORK_MODE === 'mainnet'
    ? import.meta.env.VITE_CTGTRESOR_ARB_MAINNET_CONTRACT
    : import.meta.env.VITE_CTGTRESOR_ARB_TESTNET_CONTRACT,

  // Feature flag: when 'true' the dapp exposes the Anonymity Pool mode in
  // its UI. Default false — pool routes / components stay dormant in the
  // bundle until the user (a) sets VITE_ENABLE_POOL=true in their .env, AND
  // (b) syncs that to Cloudflare Pages via ctg-sync-env, AND (c) deploys.
  // Provides a kill-switch so we can ship pool code to the bundle without
  // exposing it to live users until we're ready.
  ENABLE_POOL: import.meta.env.VITE_ENABLE_POOL === 'true',

  // Ethereum RPC URLs
  ALCHEMY_ETH_RPC_URL: import.meta.env.VITE_NETWORK_MODE === 'mainnet'
    ? import.meta.env.VITE_ALCHEMY_ETH_MAINNET_RPC_URL
    : import.meta.env.VITE_ALCHEMY_ETH_TESTNET_RPC_URL,
    
  ANKR_ETH_RPC_URL: import.meta.env.VITE_NETWORK_MODE === 'mainnet'
    ? import.meta.env.VITE_ANKR_ETH_MAINNET_RPC_URL
    : import.meta.env.VITE_ANKR_ETH_TESTNET_RPC_URL,
  
  // Binance Smart Chain RPC URLs
  ALCHEMY_BSC_RPC_URL: import.meta.env.VITE_NETWORK_MODE === 'mainnet'
    ? import.meta.env.VITE_ALCHEMY_BSC_MAINNET_RPC_URL
    : import.meta.env.VITE_ALCHEMY_BSC_TESTNET_RPC_URL,
    
  ANKR_BSC_RPC_URL: import.meta.env.VITE_NETWORK_MODE === 'mainnet'
    ? import.meta.env.VITE_ANKR_BSC_MAINNET_RPC_URL
    : import.meta.env.VITE_ANKR_BSC_TESTNET_RPC_URL,
  
  // BASE RPC URLs
  ALCHEMY_BASE_RPC_URL: import.meta.env.VITE_NETWORK_MODE === 'mainnet'
    ? import.meta.env.VITE_ALCHEMY_BASE_MAINNET_RPC_URL
    : import.meta.env.VITE_ALCHEMY_BASE_TESTNET_RPC_URL,
    
  ANKR_BASE_RPC_URL: import.meta.env.VITE_NETWORK_MODE === 'mainnet'
    ? import.meta.env.VITE_ANKR_BASE_MAINNET_RPC_URL
    : import.meta.env.VITE_ANKR_BASE_TESTNET_RPC_URL,

  // HyperEVM RPC URLs. No managed-provider tier (Alchemy/Ankr) yet — we point
  // at the canonical Hyperliquid endpoints by default and let users override
  // via .env if they have a private RPC. Mainnet defaults to the public RPC.
  HYPER_RPC_URL: import.meta.env.VITE_NETWORK_MODE === 'mainnet'
    ? (import.meta.env.VITE_HYPER_MAINNET_RPC_URL || 'https://rpc.hyperliquid.xyz/evm')
    : (import.meta.env.VITE_HYPER_TESTNET_RPC_URL || 'https://rpc.hyperliquid-testnet.xyz/evm'),

  // Arbitrum RPC URLs — canonical Arbitrum endpoints. Override via .env if
  // you have a private RPC (Alchemy/Infura/etc.).
  ALCHEMY_ARB_RPC_URL: import.meta.env.VITE_NETWORK_MODE === 'mainnet'
    ? import.meta.env.VITE_ALCHEMY_ARB_MAINNET_RPC_URL
    : import.meta.env.VITE_ALCHEMY_ARB_TESTNET_RPC_URL,

  ANKR_ARB_RPC_URL: import.meta.env.VITE_NETWORK_MODE === 'mainnet'
    ? (import.meta.env.VITE_ANKR_ARB_MAINNET_RPC_URL || 'https://arb1.arbitrum.io/rpc')
    : (import.meta.env.VITE_ANKR_ARB_TESTNET_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc'),

  // API Keys
  ANKR_API_KEY: import.meta.env.VITE_ANKR_API_KEY,
  ALCHEMY_API_KEY: import.meta.env.VITE_ALCHEMY_API_KEY,
  ETHERSCAN_API_KEY: import.meta.env.VITE_ETHERSCAN_API_KEY,
  BSCSCAN_API_KEY: import.meta.env.VITE_BSCSCAN_API_KEY,
  
  // Etherscan URLs
  ETHERSCAN_ETH_URL: import.meta.env.VITE_ETHERSCAN_ETH_URL || 'https://etherscan.io',
  ETHERSCAN_BSC_URL: import.meta.env.VITE_ETHERSCAN_BSC_URL || 'https://bscscan.com',
  ETHERSCAN_BASE_URL: import.meta.env.VITE_ETHERSCAN_BASE_URL || 'https://basescan.org',
} as const;

// Load vault ABI
export const VAULT_ABI = vaultAbiJson.abi;

// Helper function to get current network info
export const getCurrentNetwork = () => {
  const mode = WEB3_CONFIG.NETWORK_MODE;
  return {
    mode,
    isMainnet: mode === 'mainnet',
    isTestnet: mode === 'testnet',
  };
};

// Helper function to get chain-specific network info
export const getChainNetworkInfo = (chain: 'ETH' | 'BSC' | 'BASE' | 'HYPER' | 'ARB') => {
  const mode = WEB3_CONFIG.NETWORK_MODE;
  return {
    mode,
    isMainnet: mode === 'mainnet',
    isTestnet: mode === 'testnet',
    chainId: chain === 'ETH'
      ? (mode === 'mainnet' ? 1 : 11155111)      // ETH mainnet vs Sepolia
      : chain === 'BSC'
      ? (mode === 'mainnet' ? 56 : 97)           // BSC mainnet vs testnet
      : chain === 'BASE'
      ? (mode === 'mainnet' ? 8453 : 84532)      // BASE mainnet vs Sepolia
      : chain === 'HYPER'
      ? (mode === 'mainnet' ? 999 : 998)         // HyperEVM mainnet vs testnet
      : (mode === 'mainnet' ? 42161 : 421614),   // Arbitrum One vs Arbitrum Sepolia
    chainName: chain === 'ETH' ? 'Ethereum'
      : chain === 'BSC' ? 'Binance Smart Chain'
      : chain === 'BASE' ? 'Base'
      : chain === 'HYPER' ? 'Hyperliquid EVM'
      : 'Arbitrum',
    networkName: chain === 'ETH' ? 'ethereum'
      : chain === 'BSC' ? 'bsc'
      : chain === 'BASE' ? 'base'
      : chain === 'HYPER' ? 'hyperevm'
      : 'arbitrum',
    nativeCurrency: {
      name: chain === 'ETH' ? 'Ether'
        : chain === 'BSC' ? 'BNB'
        : chain === 'BASE' ? 'Ether'
        : chain === 'HYPER' ? 'HYPE'
        : 'Ether',
      symbol: chain === 'ETH' ? 'ETH'
        : chain === 'BSC' ? 'BNB'
        : chain === 'BASE' ? 'ETH'
        : chain === 'HYPER' ? 'HYPE'
        : 'ETH',
      decimals: 18,
    },
  };
};

// Helper function to get contract address for specific chain.
// NOTE: HyperEVM has no Bank8/CTGVAULT deploy — there's only a CyrusTresor1
// (pool) contract there. Bank8 callers asking for HYPER will get undefined.
export const getContractAddress = (chain: 'ETH' | 'BSC' | 'BASE' | 'HYPER' | 'ARB') => {
  if (chain === 'ETH') {
    return WEB3_CONFIG.CTGVAULT_ETH_CONTRACT;
  }
  if (chain === 'BSC') {
    return WEB3_CONFIG.CTGVAULT_BSC_CONTRACT;
  }
  if (chain === 'BASE') {
    return WEB3_CONFIG.CTGVAULT_BASE_CONTRACT;
  }
  if (chain === 'HYPER') {
    return WEB3_CONFIG.CTGVAULT_HYPER_CONTRACT;
  }
  if (chain === 'ARB') {
    return WEB3_CONFIG.CTGVAULT_ARB_CONTRACT;
  }
  throw new Error(`Unsupported chain: ${chain}`);
};

// Helper function to get RPC URL for specific chain.
// HyperEVM has only one RPC option for now (Hyperliquid public endpoint) —
// returns the same URL regardless of the requested provider tier.
export const getRpcUrl = (chain: 'ETH' | 'BSC' | 'BASE' | 'HYPER' | 'ARB', provider: 'ALCHEMY' | 'ANKR') => {
  if (chain === 'ETH') {
    return provider === 'ALCHEMY' ? WEB3_CONFIG.ALCHEMY_ETH_RPC_URL : WEB3_CONFIG.ANKR_ETH_RPC_URL;
  }
  if (chain === 'BSC') {
    return provider === 'ALCHEMY' ? WEB3_CONFIG.ALCHEMY_BSC_RPC_URL : WEB3_CONFIG.ANKR_BSC_RPC_URL;
  }
  if (chain === 'BASE') {
    return provider === 'ALCHEMY' ? WEB3_CONFIG.ALCHEMY_BASE_RPC_URL : WEB3_CONFIG.ANKR_BASE_RPC_URL;
  }
  if (chain === 'HYPER') {
    return WEB3_CONFIG.HYPER_RPC_URL;
  }
  if (chain === 'ARB') {
    return provider === 'ALCHEMY' ? WEB3_CONFIG.ALCHEMY_ARB_RPC_URL : WEB3_CONFIG.ANKR_ARB_RPC_URL;
  }
  throw new Error(`Unsupported chain: ${chain}`);
};

// Helper function to get the best available RPC URL for a chain
export const getBestRpcUrl = (chain: 'ETH' | 'BSC' | 'BASE' | 'HYPER' | 'ARB') => {
  // HyperEVM bypasses the Alchemy/Ankr try-cascade — only one canonical URL.
  if (chain === 'HYPER') {
    return WEB3_CONFIG.HYPER_RPC_URL;
  }
  // Try Alchemy first, then Ankr as fallback
  try {
    const alchemyUrl = getRpcUrl(chain, 'ALCHEMY');
    if (alchemyUrl) return alchemyUrl;
  } catch (error) {
    debugLog(`Alchemy RPC not available for ${chain}`);
  }

  try {
    const ankrUrl = getRpcUrl(chain, 'ANKR');
    if (ankrUrl) return ankrUrl;
  } catch (error) {
    debugLog(`Ankr RPC not available for ${chain}`);
  }

  debugError(`❌ No valid RPC URL available for ${chain}`);
  throw new Error(`No valid RPC URL available for ${chain}. Please check your environment variables.`);
};

// Helper function to get Etherscan URL for specific chain
export const getEtherscanUrl = (chain: 'ETH' | 'BSC' | 'BASE' | 'HYPER' | 'ARB') => {
  const networkMode = WEB3_CONFIG.NETWORK_MODE;
  
  if (chain === 'ETH') {
    return networkMode === 'mainnet' 
      ? 'https://etherscan.io'
      : 'https://sepolia.etherscan.io';
  }
  if (chain === 'BSC') {
    return networkMode === 'mainnet'
      ? 'https://bscscan.com'
      : 'https://testnet.bscscan.com';
  }
  if (chain === 'BASE') {
    return networkMode === 'mainnet'
      ? 'https://basescan.org'
      : 'https://sepolia.basescan.org';
  }
  if (chain === 'HYPER') {
    // Purrsec serves both mainnet + testnet under different subdomains.
    return networkMode === 'mainnet'
      ? 'https://purrsec.com'
      : 'https://testnet.purrsec.com';
  }
  if (chain === 'ARB') {
    return networkMode === 'mainnet'
      ? 'https://arbiscan.io'
      : 'https://sepolia.arbiscan.io';
  }
  throw new Error(`Unsupported chain: ${chain}`);
};

// Chain Switcher Utility Functions
//
// Replaced the original `connectMetaMaskTo*` helpers with wagmi's imperative
// switchChain() action. The original helpers called `window.ethereum.request`
// directly, which silently fails when the wallet is connected via WalletConnect
// (Reown AppKit's default) — the active session goes through a relay, NOT
// through window.ethereum. Symptom: clicking tBSC/tBASE in the dapp's chain
// selector did nothing (no popup, no error, silent no-op). Diagnosed 2026-05-18.
//
// wagmi's switchChain() routes through the active connector so it works for
// injected wallets (MetaMask-direct) AND WalletConnect-connected wallets
// (Rabby via Reown).
export const switchToChain = async (targetChain: 'ETH' | 'BSC' | 'BASE' | 'HYPER' | 'ARB') => {
  const networkMode = WEB3_CONFIG.NETWORK_MODE;
  // Dynamic imports so this file doesn't take on a top-level dependency on the
  // wagmi config (avoids circular import — wagmi.ts itself imports from web3.ts).
  const { switchChain } = await import('@wagmi/core');
  const { config } = await import('@/lib/wagmi');
  const { sepolia, mainnet, bsc, bscTestnet, base, baseSepolia, hyperEvm, hyperliquidEvmTestnet, arbitrum, arbitrumSepolia } = await import('wagmi/chains');

  const chainIdMap = {
    ETH:   networkMode === 'mainnet' ? mainnet.id  : sepolia.id,
    BSC:   networkMode === 'mainnet' ? bsc.id      : bscTestnet.id,
    BASE:  networkMode === 'mainnet' ? base.id     : baseSepolia.id,
    HYPER: networkMode === 'mainnet' ? hyperEvm.id : hyperliquidEvmTestnet.id,
    ARB:   networkMode === 'mainnet' ? arbitrum.id : arbitrumSepolia.id,
  } as const;

  const chainId = chainIdMap[targetChain];
  try {
    await switchChain(config, { chainId });
    debugLog(`✅ Successfully switched to ${targetChain} ${networkMode} (chainId ${chainId})`);
    return true;
  } catch (error) {
    debugError(`❌ Failed to switch to ${targetChain} ${networkMode}:`, error);
    return false;
  }
};

// Get current active chain info
export const getActiveChainInfo = () => {
  const networkMode = WEB3_CONFIG.NETWORK_MODE;
  return {
    networkMode,
    isMainnet: networkMode === 'mainnet',
    isTestnet: networkMode === 'testnet',
    ethChainId:   networkMode === 'mainnet' ? 1     : 11155111,  // ETH mainnet vs Sepolia
    bscChainId:   networkMode === 'mainnet' ? 56    : 97,        // BSC mainnet vs testnet
    baseChainId:  networkMode === 'mainnet' ? 8453  : 84532,     // BASE mainnet vs Sepolia
    hyperChainId: networkMode === 'mainnet' ? 999   : 998,       // HyperEVM mainnet vs testnet
    arbChainId:   networkMode === 'mainnet' ? 42161 : 421614,    // Arbitrum One vs Arbitrum Sepolia
  };
};

// Get comprehensive chain configuration for a specific chain
export const getChainConfig = (chain: 'ETH' | 'BSC' | 'BASE' | 'HYPER' | 'ARB') => {
  const networkMode = WEB3_CONFIG.NETWORK_MODE;
  
  if (chain === 'ETH') {
    return {
      chain,
      networkMode,
      isMainnet: networkMode === 'mainnet',
      isTestnet: networkMode === 'testnet',
      chainId: networkMode === 'mainnet' ? 1 : 11155111,
      contractAddress: getContractAddress('ETH'),
      rpcUrl: getBestRpcUrl('ETH'),
      etherscanUrl: getEtherscanUrl('ETH'),
      nativeCurrency: {
        name: networkMode === 'mainnet' ? 'Ether' : 'Sepolia ETH',
        symbol: 'ETH',
        decimals: 18
      }
    };
  }
  
  if (chain === 'BSC') {
    return {
      chain,
      networkMode,
      isMainnet: networkMode === 'mainnet',
      isTestnet: networkMode === 'testnet',
      chainId: networkMode === 'mainnet' ? 56 : 97,
      contractAddress: getContractAddress('BSC'),
      rpcUrl: getBestRpcUrl('BSC'),
      etherscanUrl: getEtherscanUrl('BSC'),
      nativeCurrency: {
        name: networkMode === 'mainnet' ? 'BNB' : 'tBNB',
        symbol: networkMode === 'mainnet' ? 'BNB' : 'tBNB',
        decimals: 18
      }
    };
  }
  
  if (chain === 'BASE') {
    return {
      chain,
      networkMode,
      isMainnet: networkMode === 'mainnet',
      isTestnet: networkMode === 'testnet',
      chainId: networkMode === 'mainnet' ? 8453 : 84532,
      contractAddress: getContractAddress('BASE'),
      rpcUrl: getBestRpcUrl('BASE'),
      etherscanUrl: getEtherscanUrl('BASE'),
      nativeCurrency: {
        name: networkMode === 'mainnet' ? 'Ether' : 'Sepolia ETH',
        symbol: 'ETH',
        decimals: 18
      }
    };
  }

  if (chain === 'HYPER') {
    // Both Bank8 + CyrusTresor1 deployed 2026-05-30. contractAddress here is
    // the Bank8 (v1 vault) — pool consumers use POOL_TOKENS_BY_CHAIN / usePool.
    return {
      chain,
      networkMode,
      isMainnet: networkMode === 'mainnet',
      isTestnet: networkMode === 'testnet',
      chainId: networkMode === 'mainnet' ? 999 : 998,
      contractAddress: getContractAddress('HYPER'),
      rpcUrl: getBestRpcUrl('HYPER'),
      etherscanUrl: getEtherscanUrl('HYPER'),
      nativeCurrency: {
        name: 'HYPE',
        symbol: 'HYPE',
        decimals: 18
      }
    };
  }

  if (chain === 'ARB') {
    return {
      chain,
      networkMode,
      isMainnet: networkMode === 'mainnet',
      isTestnet: networkMode === 'testnet',
      chainId: networkMode === 'mainnet' ? 42161 : 421614,
      contractAddress: getContractAddress('ARB'),
      rpcUrl: getBestRpcUrl('ARB'),
      etherscanUrl: getEtherscanUrl('ARB'),
      nativeCurrency: {
        name: networkMode === 'mainnet' ? 'Ether' : 'Sepolia ETH',
        symbol: 'ETH',
        decimals: 18
      }
    };
  }

  throw new Error(`Unsupported chain: ${chain}`);
};