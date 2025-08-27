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
  
  // Use token-specific precision for calculations
  return numBalance.toFixed(decimals);
};

/**
 * Get default precision for a token type
 * @param symbol - Token symbol
 * @returns Default decimal places (fallback only)
 * 
 * NOTE: This is a fallback function. In production, always get decimals
 * from the RPC call via alchemy_getTokenMetadata or contract calls.
 */
export const getDefaultTokenDecimals = (symbol: string): number => {
  // Always default to 18 for safety - the actual decimals should come from RPC
  // This function is only used as a last resort fallback
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
