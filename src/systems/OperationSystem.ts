/**
 * Operation System - Flexible operation handling without hard-coding
 * This allows easy extension of operations without modifying core components
 */

export type OperationType = 'deposit' | 'withdraw' | 'transfer';
export type AssetType = 'native' | 'token';

export interface Asset {
  type: AssetType;
  address?: string; // Only for tokens
  symbol: string;
  decimals: number;
  balance: string;
}

export interface Operation {
  id: string;
  type: OperationType;
  asset: Asset;
  amount: string;
  chain: 'ETH' | 'BSC' | 'BASE';
  timestamp: number;
}

export interface OperationResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  gasUsed?: string;
  fee?: string;
}

export interface OperationHandler {
  canHandle(operation: Operation): boolean;
  execute(operation: Operation): Promise<OperationResult>;
  validate(operation: Operation): Promise<{ valid: boolean; errors: string[] }>;
  estimateGas(operation: Operation): Promise<string>;
  getFee(operation: Operation): Promise<string>;
}

/**
 * Base class for operation handlers
 */
export abstract class BaseOperationHandler implements OperationHandler {
  abstract canHandle(operation: Operation): boolean;
  abstract execute(operation: Operation): Promise<OperationResult>;

  async validate(operation: Operation): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Basic validation
    if (!operation.amount || parseFloat(operation.amount) <= 0) {
      errors.push('Amount must be greater than 0');
    }

    if (operation.asset.type === 'token' && !operation.asset.address) {
      errors.push('Token address is required for token operations');
    }

    if (parseFloat(operation.asset.balance) < parseFloat(operation.amount)) {
      errors.push('Insufficient balance');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  async estimateGas(operation: Operation): Promise<string> {
    // Base gas estimation - can be overridden by specific handlers
    return '21000'; // Base gas for simple transfers
  }

  async getFee(operation: Operation): Promise<string> {
    // This will be implemented by specific handlers
    return '0';
  }
}

/**
 * Registry for operation handlers
 */
export class OperationHandlerRegistry {
  private static handlers: OperationHandler[] = [];

  static register(handler: OperationHandler) {
    this.handlers.push(handler);
  }

  static getHandler(operation: Operation): OperationHandler | null {
    return this.handlers.find(handler => handler.canHandle(operation)) || null;
  }

  static getAllHandlers(): OperationHandler[] {
    return [...this.handlers];
  }
}

/**
 * Main Operation System
 */
export class OperationSystem {
  static async execute(operation: Operation): Promise<OperationResult> {
    const handler = OperationHandlerRegistry.getHandler(operation);

    if (!handler) {
      return {
        success: false,
        error: `No handler found for operation: ${operation.type} ${operation.asset.type}`
      };
    }

    // Validate operation first
    const validation = await handler.validate(operation);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join(', ')
      };
    }

    // Execute operation
    try {
      return await handler.execute(operation);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  static async validate(operation: Operation): Promise<{ valid: boolean; errors: string[] }> {
    const handler = OperationHandlerRegistry.getHandler(operation);

    if (!handler) {
      return {
        valid: false,
        errors: [`No handler found for operation: ${operation.type} ${operation.asset.type}`]
      };
    }

    return await handler.validate(operation);
  }

  static async estimateGas(operation: Operation): Promise<string> {
    const handler = OperationHandlerRegistry.getHandler(operation);

    if (!handler) {
      return '21000'; // Default gas estimate
    }

    return await handler.estimateGas(operation);
  }

  static async getFee(operation: Operation): Promise<string> {
    const handler = OperationHandlerRegistry.getHandler(operation);

    if (!handler) {
      return '0';
    }

    return await handler.getFee(operation);
  }

  // Utility method to create operations
  static createOperation(
    type: OperationType,
    asset: Asset,
    amount: string,
    chain: 'ETH' | 'BSC' | 'BASE'
  ): Operation {
    return {
      id: `${type}-${asset.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      asset,
      amount,
      chain,
      timestamp: Date.now()
    };
  }
}
