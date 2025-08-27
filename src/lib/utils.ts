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
  if (shouldLog()) {
    console.error(...args);
  }
};

/**
 * Format balance with token-specific precision
 * @param balance - The balance amount
 * @param decimals - The token's decimal places
 * @returns Formatted balance string with correct precision
 */
export const formatTokenBalance = (balance: number | string, decimals: number = 18): string => {
  const numBalance = typeof balance === 'string' ? parseFloat(balance) : balance;
  
  if (numBalance === 0) {
    return '0'.padEnd(decimals + 1, '0');
  }
  
  // CRITICAL FIX: Prevent rounding down of small balances
  // For very small balances, show more precision to avoid "0.000000" display
  if (numBalance < 0.000001 && decimals >= 6) {
    // For balances smaller than 0.000001, show up to 12 decimal places
    return numBalance.toFixed(Math.min(12, decimals));
  }
  
  // CRITICAL FIX: For tokens with 6 decimals (like PYUSD), show more precision for small amounts
  if (decimals === 6 && numBalance < 0.000001) {
    // Show up to 9 decimal places for very small 6-decimal tokens
    return numBalance.toFixed(9);
  }
  
  // Use token-specific precision for calculations
  return numBalance.toFixed(decimals);
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
