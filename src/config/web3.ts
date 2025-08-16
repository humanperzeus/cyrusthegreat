// Cyrus The Great Vault Configuration
// Dynamic network configuration based on VITE_NETWORK_MODE

import vaultAbiJson from '../contracts/abis/vaultAbi.json';

// Import MetaMask chain switching functions
import { 
  connectMetaMaskToEthMainnet, 
  connectMetaMaskToEthTestnet,
  connectMetaMaskToBscMainnet, 
  connectMetaMaskToBscTestnet 
} from '../metamask.js';

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
  
  // API Keys
  ANKR_API_KEY: import.meta.env.VITE_ANKR_API_KEY,
  ALCHEMY_API_KEY: import.meta.env.VITE_ALCHEMY_API_KEY,
  ETHERSCAN_API_KEY: import.meta.env.VITE_ETHERSCAN_API_KEY,
  BSCSCAN_API_KEY: import.meta.env.VITE_BSCSCAN_API_KEY,
  
  // Etherscan URLs
  ETHERSCAN_ETH_URL: import.meta.env.VITE_ETHERSCAN_ETH_URL || 'https://etherscan.io',
  ETHERSCAN_BSC_URL: import.meta.env.VITE_ETHERSCAN_BSC_URL || 'https://bscscan.com',
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
    // CRITICAL FIX: Remove hardcoded ETH chainId - this was causing the bug!
    // chainId: mode === 'mainnet' ? 1 : 11155111, // ❌ OLD: Always returned ETH chain ID
    // bscChainId: mode === 'mainnet' ? 56 : 97, // ❌ OLD: Unused and confusing
  };
};

// NEW: Helper function to get chain-specific network info
export const getChainNetworkInfo = (chain: 'ETH' | 'BSC') => {
  const mode = WEB3_CONFIG.NETWORK_MODE;
  return {
    mode,
    isMainnet: mode === 'mainnet',
    isTestnet: mode === 'testnet',
    chainId: chain === 'ETH' 
      ? (mode === 'mainnet' ? 1 : 11155111)  // ETH mainnet vs Sepolia
      : (mode === 'mainnet' ? 56 : 97),      // BSC mainnet vs testnet
    chainName: chain === 'ETH' ? 'Ethereum' : 'Binance Smart Chain',
    networkName: chain === 'ETH' ? 'ethereum' : 'bsc',
    nativeCurrency: {
      name: chain === 'ETH' ? 'Ether' : 'BNB',
      symbol: chain === 'ETH' ? 'ETH' : 'BNB',
      decimals: 18,
    },
  };
};

// Helper function to get contract address for specific chain
export const getContractAddress = (chain: 'ETH' | 'BSC') => {
  if (chain === 'ETH') {
    return WEB3_CONFIG.CTGVAULT_ETH_CONTRACT;
  }
  if (chain === 'BSC') {
    return WEB3_CONFIG.CTGVAULT_BSC_CONTRACT;
  }
  throw new Error(`Unsupported chain: ${chain}`);
};

// Helper function to get RPC URL for specific chain
export const getRpcUrl = (chain: 'ETH' | 'BSC', provider: 'ALCHEMY' | 'ANKR') => {
  if (chain === 'ETH') {
    return provider === 'ALCHEMY' ? WEB3_CONFIG.ALCHEMY_ETH_RPC_URL : WEB3_CONFIG.ANKR_ETH_RPC_URL;
  }
  if (chain === 'BSC') {
    return provider === 'ALCHEMY' ? WEB3_CONFIG.ALCHEMY_BSC_RPC_URL : WEB3_CONFIG.ANKR_BSC_RPC_URL;
  }
  throw new Error(`Unsupported chain: ${chain}`);
};

// Helper function to get the best available RPC URL for a chain
export const getBestRpcUrl = (chain: 'ETH' | 'BSC') => {
  // Try Alchemy first, then Ankr as fallback
  try {
    const alchemyUrl = getRpcUrl(chain, 'ALCHEMY');
    if (alchemyUrl) return alchemyUrl;
  } catch (error) {
    console.log(`Alchemy RPC not available for ${chain}`);
  }
  
  try {
    const ankrUrl = getRpcUrl(chain, 'ANKR');
    if (ankrUrl) return ankrUrl;
  } catch (error) {
    console.log(`Ankr RPC not available for ${chain}`);
  }
  
  // Fallback RPCs
  if (chain === 'ETH') {
    return WEB3_CONFIG.NETWORK_MODE === 'mainnet' 
      ? 'https://rpc.ankr.com/eth'
      : 'https://rpc.sepolia.org';
  }
  if (chain === 'BSC') {
    return WEB3_CONFIG.NETWORK_MODE === 'mainnet'
      ? 'https://bsc-dataseed.binance.org'
      : 'https://data-seed-prebsc-1-s1.binance.org:8545';
  }
  
  throw new Error(`No RPC URL available for ${chain}`);
};

// Helper function to get Etherscan URL for specific chain
export const getEtherscanUrl = (chain: 'ETH' | 'BSC') => {
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
  throw new Error(`Unsupported chain: ${chain}`);
};

// Chain Switcher Utility Functions
export const switchToChain = async (targetChain: 'ETH' | 'BSC') => {
  const networkMode = WEB3_CONFIG.NETWORK_MODE;
  
  try {
    if (targetChain === 'ETH') {
      if (networkMode === 'mainnet') {
        await connectMetaMaskToEthMainnet();
      } else {
        await connectMetaMaskToEthTestnet();
      }
    } else if (targetChain === 'BSC') {
      if (networkMode === 'mainnet') {
        await connectMetaMaskToBscMainnet();
      } else {
        await connectMetaMaskToBscTestnet();
      }
    }
    
    console.log(`✅ Successfully switched to ${targetChain} ${networkMode}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to switch to ${targetChain} ${networkMode}:`, error);
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
    ethChainId: networkMode === 'mainnet' ? 1 : 11155111, // ETH mainnet vs Sepolia
    bscChainId: networkMode === 'mainnet' ? 56 : 97, // BSC mainnet vs testnet
  };
};

// Get comprehensive chain configuration for a specific chain
export const getChainConfig = (chain: 'ETH' | 'BSC') => {
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
  
  throw new Error(`Unsupported chain: ${chain}`);
};