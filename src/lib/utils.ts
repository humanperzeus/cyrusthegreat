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
