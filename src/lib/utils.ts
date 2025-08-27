import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Logging utility that respects VITE_LOG_MODE environment variable
 * Only logs when VITE_LOG_MODE=dev or VITE_LOG_MODE=debug
 */
export const shouldLog = (): boolean => {
  const logMode = import.meta.env.VITE_LOG_MODE;
  return logMode === 'dev' || logMode === 'debug';
};

/**
 * Conditional console.log that only executes when logging is enabled
 */
export const debugLog = (...args: any[]): void => {
  if (shouldLog()) {
    console.log(...args);
  }
};

/**
 * Conditional console.warn that only executes when logging is enabled
 */
export const debugWarn = (...args: any[]): void => {
  if (shouldLog()) {
    console.warn(...args);
  }
};

/**
 * Error logging that always shows (important for debugging)
 * But can be controlled by VITE_LOG_MODE if needed
 */
export const debugError = (...args: any[]): void => {
  console.error(...args);
};

/**
 * Format balance with token-specific precision
 * @param balance - The balance amount (can be raw units or human-readable)
 * @param decimals - The token's decimal places
 * @returns Formatted balance string with correct precision
 */
export const formatTokenBalance = (balance: number | string, decimals: number = 18): string => {
  // CRITICAL FIX: Handle raw balances (like from Alchemy API) vs human-readable balances
  if (typeof balance === 'string') {
    // CRITICAL FIX: Check for scientific notation first
    if (balance.includes('e+') || balance.includes('E+')) {
      // Scientific notation - always process
      const balanceStr = parseFloat(balance).toLocaleString('fullwide', { useGrouping: false });
      const rawBalanceBigInt = BigInt(balanceStr);
      const divisor = BigInt(10 ** decimals);
      const quotient = rawBalanceBigInt / divisor;
      const remainder = rawBalanceBigInt % divisor;
      
      if (remainder === 0n) {
        return quotient.toString();
      } else {
        let remainderStr = remainder.toString().padStart(decimals, '0');
        while (remainderStr.endsWith('0') && remainderStr.length > 1) {
          remainderStr = remainderStr.slice(0, -1);
        }
        return quotient.toString() + '.' + remainderStr;
      }
    } else if (balance.includes('.')) {
      // Already human-readable - return as is
      return balance;
    } else {
      // CRITICAL FIX: This is a raw balance that needs conversion
      // Examples: "509287390999000000000026", "100000000", "1"
      
      const rawBalanceBigInt = BigInt(balance);
      const divisor = BigInt(10 ** decimals);
      const quotient = rawBalanceBigInt / divisor;
      const remainder = rawBalanceBigInt % divisor;
      
      if (remainder === 0n) {
        // Clean whole numbers - no unnecessary decimal places
        return quotient.toString();
      } else {
        // Format with proper decimal places, but trim unnecessary trailing zeros
        let remainderStr = remainder.toString().padStart(decimals, '0');
        
        // Trim trailing zeros for cleaner display
        while (remainderStr.endsWith('0') && remainderStr.length > 1) {
          remainderStr = remainderStr.slice(0, -1);
        }
        
        return quotient.toString() + '.' + remainderStr;
      }
    }
  } else {
    // Number input - convert to string
    return balance.toString();
  }
};

/**
 * Fetch token decimals from contract
 * @param tokenAddress - The token contract address
 * @param publicClient - Viem public client for contract calls
 * @returns Promise<number> - The token's decimal places
 */
export const fetchTokenDecimals = async (
  tokenAddress: string, 
  publicClient: any
): Promise<number> => {
  try {
    // Standard ERC20 decimals() function
    const decimals = await publicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi: [{
        constant: true,
        inputs: [],
        name: "decimals",
        outputs: [{ name: "", type: "uint8" }],
        type: "function"
      }],
      functionName: "decimals"
    });
    
    console.log(`✅ Fetched decimals for ${tokenAddress}: ${decimals}`);
    return Number(decimals);
  } catch (error) {
    console.error(`❌ Failed to fetch decimals for ${tokenAddress}:`, error);
    
    // Fallback: try to get from Alchemy if available
    try {
      const response = await fetch(`/api/alchemy/getTokenMetadata?address=${tokenAddress}`);
      if (response.ok) {
        const data = await response.json();
        if (data.decimals !== undefined) {
          console.log(`✅ Got decimals from Alchemy for ${tokenAddress}: ${data.decimals}`);
          return data.decimals;
        }
      }
    } catch (alchemyError) {
      console.error(`❌ Alchemy fallback failed for ${tokenAddress}:`, alchemyError);
    }
    
    // Last resort: return 18 (most common for ERC20)
    console.warn(`⚠️ Using fallback decimals (18) for ${tokenAddress}`);
    return 18;
  }
};

export const fetchTokenSymbol = async (
  tokenAddress: string, 
  publicClient: any
): Promise<string> => {
  try {
    // Standard ERC20 symbol() function
    const symbol = await publicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi: [{
        constant: true,
        inputs: [],
        name: "symbol",
        outputs: [{ name: "", type: "string" }],
        type: "function"
      }],
      functionName: "symbol"
    });
    
    console.log(`✅ Fetched symbol for ${tokenAddress}: ${symbol}`);
    return symbol as string;
  } catch (error) {
    console.error(`❌ Failed to fetch symbol for ${tokenAddress}:`, error);
    
    // Fallback: try to get from Alchemy if available
    try {
      const response = await fetch(`/api/alchemy/getTokenMetadata?address=${tokenAddress}`);
      if (response.ok) {
        const data = await response.json();
        if (data.symbol) {
          console.log(`✅ Got symbol from Alchemy for ${tokenAddress}: ${data.symbol}`);
          return data.symbol;
        }
      }
    } catch (alchemyError) {
      console.error(`❌ Alchemy fallback failed for ${tokenAddress}:`, alchemyError);
    }
    
    // Last resort: return address prefix
    console.warn(`⚠️ Using fallback symbol for ${tokenAddress}`);
    return tokenAddress.slice(0, 6) + '...' + tokenAddress.slice(-4);
  }
};

/**
 * Get default precision for a token type (DEPRECATED - use fetchTokenDecimals instead)
 * @param symbol - Token symbol
 * @returns Default decimal places (fallback only)
 * 
 * NOTE: This function is deprecated. Use fetchTokenDecimals to get actual decimals
 * from the contract or RPC calls.
 */
export const getDefaultTokenDecimals = (symbol: string): number => {
  console.warn(`⚠️ getDefaultTokenDecimals is deprecated for ${symbol}. Use fetchTokenDecimals instead.`);
  return 18;
};

/**
 * Convert Wei to Ether with full precision (no rounding)
 * @param wei - Amount in Wei as bigint or string
 * @returns Amount in Ether with full 18 decimal precision
 */
export const weiToEtherFullPrecision = (wei: bigint | string): string => {
  try {
    const weiBigInt = typeof wei === 'string' ? BigInt(wei) : wei;
    
    // Debug logging to see what we're processing
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 weiToEtherFullPrecision input:', { wei, weiBigInt: weiBigInt.toString() });
    }
    
    // Handle zero case
    if (weiBigInt === 0n) {
      return '0.000000000000000000';
    }
    
    const divisor = BigInt(10 ** 18);
    const quotient = weiBigInt / divisor;
    const remainder = weiBigInt % divisor;
    
    // Format with full precision
    if (remainder === 0n) {
      return quotient.toString() + '.000000000000000000';
    }
    
    // Pad remainder to exactly 18 digits
    const remainderStr = remainder.toString().padStart(18, '0');
    const result = quotient.toString() + '.' + remainderStr;
    
    // Debug logging to see the result
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 weiToEtherFullPrecision result:', { quotient: quotient.toString(), remainder: remainder.toString(), remainderStr, result });
    }
    
    return result;
  } catch (error) {
    console.error('Error converting Wei to Ether:', error);
    return '0.000000000000000000';
  }
};
