/**
 * Migration Utility - Safe migration from useVault to modular hooks
 * This utility helps you migrate components gradually without breaking functionality
 */

import { useTokenManagement } from './useTokenManagement';
import { useBalanceManagement } from './useBalanceManagement';
import { useTransactionManagement } from './useTransactionManagement';
import { useVaultRegistry } from './useVaultRegistry';
import { debugLog } from '@/lib/utils';

// Migration phases
export enum MigrationPhase {
  LEGACY = 'legacy',           // Use old useVault (current state)
  TOKEN_ONLY = 'token_only',   // Use new token management only
  BALANCE_ONLY = 'balance_only', // Use new balance management only
  TRANSACTION_ONLY = 'transaction_only', // Use new transaction management only
  HYBRID = 'hybrid',          // Mix old and new hooks
  FULL_MODULAR = 'full_modular' // Use new modular system
}

// Migration helper hook
export const useVaultMigration = (
  activeChain: 'ETH' | 'BSC' | 'BASE',
  phase: MigrationPhase = MigrationPhase.LEGACY
) => {
  debugLog(`🔄 Vault Migration Phase: ${phase} for chain: ${activeChain}`);

  // Legacy compatibility - import old useVault when needed
  const legacyVault = phase === MigrationPhase.LEGACY ? null : null; // We'll handle this dynamically

  // New modular hooks
  const tokenManagement = useTokenManagement(activeChain);
  const balanceManagement = useBalanceManagement(activeChain);
  const transactionManagement = useTransactionManagement(
    activeChain,
    () => debugLog('✅ Transaction success'),
    (error) => debugLog(`❌ Transaction error: ${error}`)
  );

  // Registry for flexible composition
  const registry = useVaultRegistry(activeChain);

  // Phase-based return values
  const getPhaseData = () => {
    switch (phase) {
      case MigrationPhase.TOKEN_ONLY:
        return {
          // Token data from new system
          walletTokens: tokenManagement.walletTokens,
          vaultTokens: tokenManagement.vaultTokens,
          isLoadingWalletTokens: tokenManagement.isLoadingWalletTokens,
          isLoadingVaultTokens: tokenManagement.isLoadingVaultTokens,
          refetchWalletTokens: tokenManagement.refetchWalletTokens,
          refetchVaultTokens: tokenManagement.refetchVaultTokens,

          // Everything else is placeholder/migration helpers
          walletBalance: '0.00',
          vaultBalance: '0.00',
          currentFee: '0.00',
          isLoading: false,
          isSimulating: false,
          isConfirmed: false,

          // Migration helpers
          _migrationPhase: phase,
          _modularTokenSystem: true
        };

      case MigrationPhase.BALANCE_ONLY:
        return {
          // Balance data from new system
          walletBalance: balanceManagement.walletBalance,
          vaultBalance: balanceManagement.vaultBalance,
          currentFee: balanceManagement.currentFee,
          isLoadingWalletBalance: balanceManagement.isLoadingWalletBalance,
          isLoadingVaultBalance: balanceManagement.isLoadingVaultBalance,
          isLoadingFee: balanceManagement.isLoadingFee,
          refetchWalletBalance: balanceManagement.refetchWalletBalance,
          refetchVaultBalance: balanceManagement.refetchVaultBalance,
          refetchFee: balanceManagement.refetchFee,

          // Everything else is placeholder
          walletTokens: [],
          vaultTokens: [],
          isLoadingWalletTokens: false,
          isLoadingVaultTokens: false,
          isLoading: false,
          isSimulating: false,
          isConfirmed: false,

          // Migration helpers
          _migrationPhase: phase,
          _modularBalanceSystem: true
        };

      case MigrationPhase.TRANSACTION_ONLY:
        return {
          // Transaction data from new system
          isLoading: transactionManagement.transactionStates[activeChain].isLoading,
          isSimulating: transactionManagement.transactionStates[activeChain].isSimulating,
          isConfirmed: false, // We can add this to transaction states if needed
          transactionError: transactionManagement.transactionStates[activeChain].error,

          // Transaction methods
          depositETH: transactionManagement.depositETH,
          withdrawETH: transactionManagement.withdrawETH,
          transferInternalETH: transactionManagement.transferInternalETH,
          depositToken: transactionManagement.depositToken,
          withdrawToken: transactionManagement.withdrawToken,
          transferInternalToken: transactionManagement.transferInternalToken,
          depositMultipleTokens: transactionManagement.depositMultipleTokens,
          withdrawMultipleTokens: transactionManagement.withdrawMultipleTokens,
          transferMultipleTokensInternal: transactionManagement.transferMultipleTokensInternal,

          // Everything else is placeholder
          walletBalance: '0.00',
          vaultBalance: '0.00',
          currentFee: '0.00',
          walletTokens: [],
          vaultTokens: [],
          isLoadingWalletTokens: false,
          isLoadingVaultTokens: false,

          // Migration helpers
          _migrationPhase: phase,
          _modularTransactionSystem: true
        };

      case MigrationPhase.HYBRID:
        return {
          // Mix of new modular systems
          walletTokens: tokenManagement.walletTokens,
          vaultTokens: tokenManagement.vaultTokens,
          isLoadingWalletTokens: tokenManagement.isLoadingWalletTokens,
          isLoadingVaultTokens: tokenManagement.isLoadingVaultTokens,
          refetchWalletTokens: tokenManagement.refetchWalletTokens,
          refetchVaultTokens: tokenManagement.refetchVaultTokens,

          walletBalance: balanceManagement.walletBalance,
          vaultBalance: balanceManagement.vaultBalance,
          currentFee: balanceManagement.currentFee,
          isLoadingWalletBalance: balanceManagement.isLoadingWalletBalance,
          isLoadingVaultBalance: balanceManagement.isLoadingVaultBalance,
          isLoadingFee: balanceManagement.isLoadingFee,
          refetchWalletBalance: balanceManagement.refetchWalletBalance,
          refetchVaultBalance: balanceManagement.refetchVaultBalance,
          refetchFee: balanceManagement.refetchFee,

          isLoading: transactionManagement.transactionStates[activeChain].isLoading,
          isSimulating: transactionManagement.transactionStates[activeChain].isSimulating,
          transactionError: transactionManagement.transactionStates[activeChain].error,

          // All transaction methods
          depositETH: transactionManagement.depositETH,
          withdrawETH: transactionManagement.withdrawETH,
          transferInternalETH: transactionManagement.transferInternalETH,
          depositToken: transactionManagement.depositToken,
          withdrawToken: transactionManagement.withdrawToken,
          transferInternalToken: transactionManagement.transferInternalToken,
          depositMultipleTokens: transactionManagement.depositMultipleTokens,
          withdrawMultipleTokens: transactionManagement.withdrawMultipleTokens,
          transferMultipleTokensInternal: transactionManagement.transferMultipleTokensInternal,

          // Migration helpers
          _migrationPhase: phase,
          _hybridSystem: true
        };

      case MigrationPhase.FULL_MODULAR:
        return {
          // Full modular system
          walletTokens: tokenManagement.walletTokens,
          vaultTokens: tokenManagement.vaultTokens,
          isLoadingWalletTokens: tokenManagement.isLoadingWalletTokens,
          isLoadingVaultTokens: tokenManagement.isLoadingVaultTokens,
          refetchWalletTokens: tokenManagement.refetchWalletTokens,
          refetchVaultTokens: tokenManagement.refetchVaultTokens,

          walletBalance: balanceManagement.walletBalance,
          vaultBalance: balanceManagement.vaultBalance,
          currentFee: balanceManagement.currentFee,
          isLoadingWalletBalance: balanceManagement.isLoadingWalletBalance,
          isLoadingVaultBalance: balanceManagement.isLoadingVaultBalance,
          isLoadingFee: balanceManagement.isLoadingFee,
          refetchWalletBalance: balanceManagement.refetchWalletBalance,
          refetchVaultBalance: balanceManagement.refetchVaultBalance,
          refetchFee: balanceManagement.refetchFee,

          isLoading: transactionManagement.transactionStates[activeChain].isLoading,
          isSimulating: transactionManagement.transactionStates[activeChain].isSimulating,
          transactionError: transactionManagement.transactionStates[activeChain].error,

          // All transaction methods
          depositETH: transactionManagement.depositETH,
          withdrawETH: transactionManagement.withdrawETH,
          transferInternalETH: transactionManagement.transferInternalETH,
          depositToken: transactionManagement.depositToken,
          withdrawToken: transactionManagement.withdrawToken,
          transferInternalToken: transactionManagement.transferInternalToken,
          depositMultipleTokens: transactionManagement.depositMultipleTokens,
          withdrawMultipleTokens: transactionManagement.withdrawMultipleTokens,
          transferMultipleTokensInternal: transactionManagement.transferMultipleTokensInternal,

          // Registry access for advanced usage
          registry,

          // Migration helpers
          _migrationPhase: phase,
          _fullModularSystem: true
        };

      default: // LEGACY or unknown
        return {
          _migrationPhase: MigrationPhase.LEGACY,
          _legacySystem: true,
          _message: 'Using legacy useVault system. Import useVault from @/hooks/useVault'
        };
    }
  };

  return getPhaseData();
};

// Utility function to help with migration
export const createMigrationWrapper = (componentName: string, phase: MigrationPhase) => {
  return {
    componentName,
    phase,
    isLegacy: phase === MigrationPhase.LEGACY,
    isModular: phase !== MigrationPhase.LEGACY,
    migrationStatus: getMigrationStatus(phase),
    nextSteps: getNextSteps(phase)
  };
};

// Helper functions
const getMigrationStatus = (phase: MigrationPhase): string => {
  switch (phase) {
    case MigrationPhase.LEGACY:
      return '🟡 Using legacy system - ready for migration';
    case MigrationPhase.TOKEN_ONLY:
      return '🟢 Token system migrated - stable';
    case MigrationPhase.BALANCE_ONLY:
      return '🟢 Balance system migrated - stable';
    case MigrationPhase.TRANSACTION_ONLY:
      return '🟢 Transaction system migrated - stable';
    case MigrationPhase.HYBRID:
      return '🟠 Mixed system - testing phase';
    case MigrationPhase.FULL_MODULAR:
      return '🟢 Fully migrated - production ready';
    default:
      return '❓ Unknown migration status';
  }
};

const getNextSteps = (phase: MigrationPhase): string[] => {
  switch (phase) {
    case MigrationPhase.LEGACY:
      return [
        '1. Start with token management migration',
        '2. Use MigrationPhase.TOKEN_ONLY',
        '3. Test token functionality thoroughly'
      ];
    case MigrationPhase.TOKEN_ONLY:
      return [
        '1. Migrate balance management next',
        '2. Use MigrationPhase.BALANCE_ONLY',
        '3. Test balance display and fee calculations'
      ];
    case MigrationPhase.BALANCE_ONLY:
      return [
        '1. Migrate transaction management',
        '2. Use MigrationPhase.TRANSACTION_ONLY',
        '3. Test all transaction operations'
      ];
    case MigrationPhase.TRANSACTION_ONLY:
      return [
        '1. Combine all systems',
        '2. Use MigrationPhase.HYBRID',
        '3. Test integration thoroughly'
      ];
    case MigrationPhase.HYBRID:
      return [
        '1. Full migration to modular system',
        '2. Use MigrationPhase.FULL_MODULAR',
        '3. Final testing and cleanup'
      ];
    case MigrationPhase.FULL_MODULAR:
      return [
        '🎉 Migration complete!',
        'Remove migration utilities',
        'Use useVaultModular directly'
      ];
    default:
      return ['Contact migration support'];
  }
};

// Migration progress tracker
export const useMigrationProgress = () => {
  const [progress, setProgress] = useState<Record<string, MigrationPhase>>({});

  const updateComponentProgress = (componentName: string, phase: MigrationPhase) => {
    setProgress(prev => ({ ...prev, [componentName]: phase }));
  };

  const getOverallProgress = () => {
    const components = Object.keys(progress);
    const migratedComponents = components.filter(name => progress[name] === MigrationPhase.FULL_MODULAR);
    return {
      total: components.length,
      migrated: migratedComponents.length,
      remaining: components.length - migratedComponents.length,
      percentage: components.length > 0 ? (migratedComponents.length / components.length) * 100 : 0
    };
  };

  return {
    progress,
    updateComponentProgress,
    getOverallProgress
  };
};

debugLog('📦 Migration utility loaded - ready for gradual migration');
