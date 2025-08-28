import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import Decimal from 'decimal.js'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 🚨 PRECISION-SAFE DECIMAL CONVERSION UTILITY
 * 
 * This function converts human-readable token amounts to wei (smallest unit)
 * WITHOUT ANY PRECISION LOSS using decimal.js library.
 * 
 * @param amount - Human-readable amount (e.g., "509287.390999000000026626")
 * @param decimals - Token decimal places (e.g., 18 for most ERC20 tokens)
 * @returns BigInt representing the amount in wei
 * 
 * @example
 * convertToWei("509287.390999000000026626", 18)
 * // Returns: 509287390999000000026626n (exact, no precision loss)
 */
export function convertToWei(amount: string | number, decimals: number): bigint {
  try {
    // CRITICAL FIX: Configure Decimal.js for maximum precision
    Decimal.set({ precision: 100, rounding: Decimal.ROUND_DOWN });
    
    // CRITICAL DEBUG: Log the exact input to see where scientific notation comes from
    console.log(`🔍 DEBUG - convertToWei called with:`, {
      amount: amount,
      amountType: typeof amount,
      hasScientificNotation: String(amount).includes('e') || String(amount).includes('E'),
      amountLength: String(amount).length
    });
    
    // Validate inputs
    if (typeof amount !== 'string' && typeof amount !== 'number') {
      throw new Error(`Invalid amount type: ${typeof amount}. Expected string or number.`)
    }
    
    if (typeof decimals !== 'number' || decimals < 0 || decimals > 255) {
      throw new Error(`Invalid decimals: ${decimals}. Expected number between 0-255.`)
    }
    
    // Convert to string and trim whitespace
    const amountStr = String(amount).trim()
    
    // Handle edge cases
    if (amountStr === '' || amountStr === '0' || amountStr === '0.0') {
      return BigInt(0)
    }
    
    // CRITICAL FIX: Handle scientific notation (e.g., 5.0928739099900000003e+23)
    // JavaScript automatically converts large numbers to scientific notation
    let processedAmount = amountStr
    if (amountStr.includes('e') || amountStr.includes('E')) {
      try {
        // Use Decimal.js to convert scientific notation to full decimal string
        const scientificDecimal = new Decimal(amountStr)
        processedAmount = scientificDecimal.toString()
        console.log(`🔧 Scientific notation converted: ${amountStr} → ${processedAmount}`)
      } catch (scientificError) {
        console.error('🚨 Failed to convert scientific notation:', scientificError)
        throw new Error(`Failed to convert scientific notation: ${amountStr}`)
      }
    }
    
    // CRITICAL DEBUG: Log what we're processing
    console.log(`🔍 DEBUG - Processing amount:`, {
      originalAmountStr: amountStr,
      processedAmount: processedAmount,
      hasScientificNotation: processedAmount.includes('e') || processedAmount.includes('E')
    });
    
    // Use Decimal.js for arbitrary precision arithmetic
    const decimalAmount = new Decimal(processedAmount)
    
    // Validate the decimal amount
    if (decimalAmount.isNaN() || decimalAmount.isNegative()) {
      throw new Error(`Invalid amount: ${amountStr}`)
    }
    
    // Calculate wei amount: amount * 10^decimals
    const multiplier = new Decimal(10).pow(decimals)
    const weiAmount = decimalAmount.mul(multiplier)
    
    // CRITICAL FIX: Convert to BigInt without going through toString() which causes scientific notation
    // Use Decimal.js toFixed(0) to get exact integer string, then convert to BigInt
    const weiString = weiAmount.toFixed(0)
    
    // Additional safety: ensure no scientific notation
    if (weiString.includes('e') || weiString.includes('E')) {
      throw new Error(`Scientific notation still present after toFixed(0): ${weiString}`)
    }
    
    const weiBigInt = BigInt(weiString)
    
    // Verify no precision was lost
    const verification = new Decimal(weiBigInt.toString()).div(multiplier)
    
    // CRITICAL DEBUG: Log the precision verification process
    console.log(`🔍 DEBUG - Precision verification:`, {
      originalAmount: amountStr,
      weiBigInt: weiBigInt.toString(),
      multiplier: multiplier.toString(),
      verification: verification.toString(),
      verificationEquals: verification.equals(decimalAmount)
    });
    
    if (!verification.equals(decimalAmount)) {
      console.error(`🚨 PRECISION LOSS DETECTED:`, {
        original: amountStr,
        afterConversion: verification.toString(),
        difference: new Decimal(amountStr).sub(verification).toString()
      });
      throw new Error(`Precision loss detected! Original: ${amountStr}, After conversion: ${verification.toString()}`)
    }
    
    console.log(`✅ Precision verification passed - no loss detected`);
    return weiBigInt
    
  } catch (error) {
    console.error('🚨 convertToWei Error:', error)
    throw new Error(`Failed to convert ${amount} to wei with ${decimals} decimals: ${error}`)
  }
}

/**
 * 🚨 PRECISION-SAFE WEI TO HUMAN READABLE CONVERSION
 * 
 * Converts wei (smallest unit) back to human-readable format
 * WITHOUT ANY PRECISION LOSS.
 * 
 * @param weiAmount - Amount in wei as BigInt or string
 * @param decimals - Token decimal places
 * @returns Human-readable amount as string
 */
export function convertFromWei(weiAmount: bigint | string, decimals: number): string {
  try {
    // CRITICAL FIX: Configure Decimal.js for maximum precision
    Decimal.set({ precision: 100, rounding: Decimal.ROUND_DOWN });
    
    // Validate inputs
    if (typeof weiAmount !== 'bigint' && typeof weiAmount !== 'string') {
      throw new Error(`Invalid weiAmount type: ${typeof weiAmount}. Expected BigInt or string.`)
    }
    
    if (typeof decimals !== 'number' || decimals < 0 || decimals > 255) {
      throw new Error(`Invalid decimals: ${decimals}. Expected number between 0-255.`)
    }
    
    // Convert to string
    const weiStr = weiAmount.toString()
    
    // Handle zero case
    if (weiStr === '0') {
      return '0'
    }
    
    // CRITICAL FIX: Handle scientific notation in wei amounts
    let processedWeiStr = weiStr
    if (weiStr.includes('e') || weiStr.includes('E')) {
      try {
        // Use Decimal.js to convert scientific notation to full decimal string
        const scientificDecimal = new Decimal(weiStr)
        processedWeiStr = scientificDecimal.toString()
        console.log(`🔧 Scientific notation converted in wei: ${weiStr} → ${processedWeiStr}`)
      } catch (scientificError) {
        console.error('🚨 Failed to convert scientific notation in wei:', scientificError)
        throw new Error(`Failed to convert scientific notation in wei: ${weiStr}`)
      }
    }
    
    // Use Decimal.js for precision-safe division
    const weiDecimal = new Decimal(processedWeiStr)
    const divisor = new Decimal(10).pow(decimals)
    
    // Divide wei by 10^decimals to get human-readable amount
    const humanAmount = weiDecimal.div(divisor)
    
    // Return as string to preserve all precision
    return humanAmount.toString()
    
  } catch (error) {
    console.error('🚨 convertFromWei Error:', error)
    throw new Error(`Failed to convert ${weiAmount} from wei with ${decimals} decimals: ${error}`)
  }
}

/**
 * 🚨 PRECISION-SAFE AMOUNT VALIDATION
 * 
 * Validates that an amount can be converted to wei without precision loss.
 * 
 * @param amount - Human-readable amount to validate
 * @param decimals - Token decimal places
 * @returns true if amount is valid, false otherwise
 */
export function validateAmountPrecision(amount: string | number, decimals: number): boolean {
  try {
    convertToWei(amount, decimals)
    return true
  } catch {
    return false
  }
}

/**
 * 🚨 PREVENT SCIENTIFIC NOTATION
 * 
 * Ensures large numbers are never converted to scientific notation.
 * This should be called before any number operations to prevent precision loss.
 * 
 * @param amount - Amount that might be in scientific notation
 * @returns String representation without scientific notation
 */
export function preventScientificNotation(amount: string | number): string {
  try {
    // CRITICAL FIX: Configure Decimal.js for maximum precision
    Decimal.set({ precision: 100, rounding: Decimal.ROUND_DOWN });
    
    // Convert to string first
    const amountStr = String(amount).trim()
    
    // If it's already a clean string without scientific notation, return it
    if (!amountStr.includes('e') && !amountStr.includes('E')) {
      return amountStr
    }
    
    // If it has scientific notation, convert it using Decimal.js
    const decimalAmount = new Decimal(amountStr)
    const cleanAmount = decimalAmount.toString()
    
    console.log(`🔧 Scientific notation prevented: ${amountStr} → ${cleanAmount}`)
    return cleanAmount
    
  } catch (error) {
    console.error('🚨 Failed to prevent scientific notation:', error)
    // Fallback: return original amount as string
    return String(amount)
  }
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
// CRITICAL FIX: Helper function to convert BigInt to full precision string
export const bigIntToFullPrecisionString = (value: bigint): string => {
  try {
    // Method 1: Direct toString(10) - preferred
    const directString = value.toString(10);
    if (!directString.includes('e+') && !directString.includes('E+')) {
      return directString;
    }
    
    // Method 2: Hex conversion fallback
    const hexString = value.toString(16);
    return BigInt('0x' + hexString).toString(10);
  } catch (error) {
    console.error('❌ Failed to convert BigInt to string:', error);
    return '0';
  }
};

export const formatTokenBalance = (balance: number | string, decimals: number = 18): string => {
  // CRITICAL FIX: Handle raw balances (like from Alchemy API) vs human-readable balances
  
  // FIX 1: Warn about number input that may lose precision
  if (typeof balance === 'number') {
    console.warn('⚠️ Balance as number - precision may be lost:', balance);
    balance = balance.toString();
  }
  
  if (typeof balance !== 'string') {
    return '0';
  }
  
  // FIX 2: Detect and warn about scientific notation (indicates upstream precision loss)
  if (balance.includes('e+') || balance.includes('E+')) {
    console.error('🚨 Scientific notation detected - precision likely lost upstream. Raw input:', balance);
    console.error('🚨 This should NOT happen with proper BigInt handling. Check viem version and RPC response.');
    
    // CRITICAL: Use BigNumber.js for better scientific notation handling
    try {
      // Convert scientific notation to full decimal string without precision loss
      const balanceStr = parseFloat(balance).toLocaleString('fullwide', { useGrouping: false });
      console.warn('⚠️ Converted scientific notation to:', balanceStr, '(precision may still be lost)');
      
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
    } catch (error) {
      console.error('❌ Failed to process scientific notation:', error);
      return 'ERROR: Precision lost';
    }
  } else if (balance.includes('.')) {
    // Already human-readable - return as is
    return balance;
  } else {
    // FIX 3: This is the PREFERRED path - raw balance that needs conversion
    // Examples: "509287390999000000000026", "100000000", "1"
    
    try {
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
    } catch (error) {
      console.error('❌ Failed to process raw balance:', balance, error);
      return 'ERROR: Invalid balance';
    }
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
