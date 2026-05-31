/**
 * usePool — React hook for CyrusTresor1's anonymity pool surface.
 *
 * Wraps the contract's commitToPool / revealFromPool / getPoolBucketSize /
 * currentEpoch / collectFees into a single hook for the dapp UI.
 *
 * State management:
 *  - Submitted commits + their secrets are stored in localStorage under
 *    'ctg.tresor1.commits.v1'. This is the "notebook" — if the user clears
 *    it before revealing, their funds become unrecoverable (the secret is
 *    only on-chain inside the commitment hash, not as plaintext).
 *  - Notebook entries flip from {spent: false} → {spent: true} after a
 *    successful reveal.
 *
 * NOT in this hook (yet):
 *  - UI components (those will be in src/components/pool/...)
 *  - Route wiring (App.tsx update is the final step that exposes pool to
 *    live users — only happens once VITE_ENABLE_POOL=true)
 *
 * This hook reads `WEB3_CONFIG.ENABLE_POOL` and refuses to do anything if
 * it's false. So even if a component imports this hook, calling commitToPool()
 * before the flag is flipped produces a clear error rather than weird state.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt, usePublicClient, useReadContract, useReadContracts } from 'wagmi';
import { parseUnits, formatUnits, erc20Abi, type Address, type Hex } from 'viem';
import CyrusTresor1Artifact from '@/contracts/abis/CyrusTresor1.json';
import { WEB3_CONFIG } from '@/config/web3';
import {
  type TeleportClaim,
  computeCommitment,
  newClaim,
  decodeTeleportClaim,
  buildClaimURL,
} from '@/lib/poolURI';

const CTGTRESOR_ABI = (CyrusTresor1Artifact as { abi: readonly unknown[] }).abi;

// Notebook persistence key — versioned so future schema changes don't clobber.
const NOTEBOOK_KEY = 'ctg.tresor1.commits.v1';

/** Sentinel for native (ETH/BNB) — must match the contract's address(0) check. */
export const NATIVE_TOKEN_ADDRESS: Address = '0x0000000000000000000000000000000000000000';

/** Tokens shown in the pool UI per chain. Native first. Decimals hardcoded for
 *  known tokens — for unknown tokens, use useTokenDecimals(token) to read on-chain. */
export interface PoolTokenEntry { address: Address; symbol: string; decimals: number; }
export const POOL_TOKENS_BY_CHAIN: Record<number, PoolTokenEntry[]> = {
  // Sepolia (current deploy has ETH+USD1+WLFI configured; WLFI hidden in UI per
  // 2026-05-18 stablecoin-only UX decision — can re-enable by adding it back here).
  11155111: [
    { address: NATIVE_TOKEN_ADDRESS, symbol: 'ETH',  decimals: 18 },
    { address: '0xD649712915595bcE7A4BA3a821C64850853FcD02', symbol: 'USD1', decimals: 18 },
  ],
  97: [
    { address: NATIVE_TOKEN_ADDRESS, symbol: 'tBNB', decimals: 18 },
  ],
  84532: [
    { address: NATIVE_TOKEN_ADDRESS, symbol: 'ETH',  decimals: 18 },
  ],
  // HyperEVM testnet (998). Native HYPE only for v1 — ERC-20 stablecoin
  // additions (USDC-on-HyperEVM-testnet, USDT-on-HyperEVM-testnet) pending
  // canonical-address discovery.
  998: [
    { address: NATIVE_TOKEN_ADDRESS, symbol: 'HYPE', decimals: 18 },
  ],
  // Arbitrum Sepolia testnet (421614). Native ETH only for v1 — ERC-20
  // stablecoin additions deferred until canonical testnet addresses settle.
  421614: [
    { address: NATIVE_TOKEN_ADDRESS, symbol: 'ETH', decimals: 18 },
  ],
  // Mainnet entries will be added during the mainnet deploy per
  // MAINNET_DEPLOY_CHECKLIST.md (ETH, USDC=6dec, USDT=6dec, USD1).
};

/** A notebook entry = a claim + on-chain metadata + state. */
export interface NotebookEntry {
  claim: TeleportClaim;
  commitment: Hex;
  /** Tx hash of the commitToPool call */
  commitTx: Hex;
  /** Tx hash of the revealFromPool call (only set after reveal) */
  revealTx?: Hex;
  /** Epoch number recorded at commit time */
  depositEpoch: number;
  /** ISO timestamp the commit was recorded locally */
  savedAt: string;
  /** Becomes true after a successful reveal */
  spent: boolean;
  /** Bucket size in wei (token's smallest unit). Stored so display is decimal-aware
   *  without needing to refetch the schedule. OPTIONAL — older entries from before
   *  this field was added won't have it; display falls back to "bucket N" then. */
  bucketSizeWei?: string;
  /** Token's decimals at commit time. e.g. 18 for ETH/USD1, 6 for USDC/USDT. */
  tokenDecimals?: number;
  /** Display symbol at commit time. e.g. "ETH", "USD1", "USDC". */
  tokenSymbol?: string;
}

function _loadNotebook(): NotebookEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(NOTEBOOK_KEY);
    return raw ? (JSON.parse(raw) as NotebookEntry[]) : [];
  } catch {
    return [];
  }
}

function _saveNotebook(entries: NotebookEntry[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(NOTEBOOK_KEY, JSON.stringify(entries));
}

/** Resolve the CyrusTresor1 contract address for the active chainId. */
function contractAddressForChain(chainId: number | undefined): Address | null {
  if (!chainId) return null;
  // chainId → WEB3_CONFIG slot mapping. Mainnet/testnet selection is already
  // handled inside web3.ts via VITE_NETWORK_MODE.
  if (chainId === 1 || chainId === 11155111) return WEB3_CONFIG.CTGTRESOR_ETH_CONTRACT as Address;
  if (chainId === 56 || chainId === 97) return WEB3_CONFIG.CTGTRESOR_BSC_CONTRACT as Address;
  if (chainId === 8453 || chainId === 84532) return WEB3_CONFIG.CTGTRESOR_BASE_CONTRACT as Address;
  if (chainId === 999 || chainId === 998) return WEB3_CONFIG.CTGTRESOR_HYPER_CONTRACT as Address;
  if (chainId === 42161 || chainId === 421614) return WEB3_CONFIG.CTGTRESOR_ARB_CONTRACT as Address;
  return null;
}

export interface UsePoolHook {
  /** Whether the pool feature is enabled by the build's VITE_ENABLE_POOL flag */
  enabled: boolean;
  /** Resolved CyrusTresor1 address for the active chain, or null */
  contractAddress: Address | null;

  /** All locally-tracked commits, most recent first */
  notebook: NotebookEntry[];
  /** Filter to pending (un-revealed) entries */
  pendingNotebook: NotebookEntry[];

  /** State flags */
  isCommitting: boolean;
  isRevealing: boolean;
  lastError: string | null;

  /**
   * Generate fresh entropy, commit to the pool. The bucketSize + dynamic
   * fee in native token are sent as msg.value (or transferFrom-pulled for
   * ERC-20s — that path is TODO until we add token approval handling).
   * @returns the claim URL the depositor can share with the recipient
   */
  commit: (args: { withdrawTo: Address; token: Address; bucketIdx: number; bucketSize: bigint; feeWei: bigint; }) => Promise<{ claimURL: string; commitment: Hex; txHash: Hex }>;

  /** Reveal an existing notebook entry's commitment. Marks it spent on success. */
  reveal: (entry: NotebookEntry) => Promise<{ txHash: Hex }>;

  /** Convenience: decode a teleport claim URL and reveal it. */
  revealFromURL: (claimURL: string) => Promise<{ txHash: Hex }>;

  /** Clear the entire notebook. DESTRUCTIVE: unrevealed commits become unrecoverable. */
  clearNotebook: () => void;

  /** ERC-20 token approval — sets allowance(user, contract) to `amount`. No-op
   *  for native token (returns immediately). Throws if disabled. */
  approveToken: (args: { token: Address; amount: bigint }) => Promise<{ txHash: Hex }>;

  /** State flag for the approve flow */
  isApproving: boolean;
}

export const usePool = (): UsePoolHook => {
  const { address: account } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [notebook, setNotebook] = useState<NotebookEntry[]>(_loadNotebook);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // Sync state ↔ localStorage when other tabs / windows modify it
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === NOTEBOOK_KEY) setNotebook(_loadNotebook());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const enabled = WEB3_CONFIG.ENABLE_POOL;
  const contractAddress = contractAddressForChain(chainId);

  const _requireEnabled = useCallback(() => {
    if (!enabled) throw new Error('Pool feature disabled (VITE_ENABLE_POOL is not true)');
    if (!contractAddress) throw new Error(`CyrusTresor1 not deployed on chainId ${chainId}`);
    if (!account) throw new Error('Wallet not connected');
  }, [enabled, contractAddress, chainId, account]);

  const commit: UsePoolHook['commit'] = useCallback(async ({ withdrawTo, token, bucketIdx, bucketSize, feeWei }) => {
    _requireEnabled();
    setIsCommitting(true);
    setLastError(null);
    try {
      // Build the claim (generates entropy, normalizes addresses, computes commitment)
      const { claim, commitment } = newClaim({
        withdrawTo,
        token,
        bucketIdx,
        contractAddress: contractAddress as Address,
        chainId: chainId as number,
      });

      // Native vs ERC-20 distinction:
      //  - native (address(0)): msg.value = bucketSize + fee
      //  - erc20:                msg.value = fee only; tokens pulled via transferFrom.
      //    Allowance MUST be set ≥ bucketSize via approveToken() BEFORE calling commit().
      //    The CommitForm UI enforces this via the live useTokenAllowance hook;
      //    if a caller bypasses it, the on-chain transferFrom will revert.
      const isNative = token === NATIVE_TOKEN_ADDRESS;
      const value = isNative ? bucketSize + feeWei : feeWei;

      const txHash = (await writeContractAsync({
        address: contractAddress as Address,
        abi: CTGTRESOR_ABI,
        functionName: 'commitToPool',
        args: [commitment, token, bucketIdx],
        value,
      })) as Hex;

      // Read currentEpoch AFTER the tx is in flight; we'll capture the on-chain
      // depositEpoch later when the receipt resolves. For the notebook UX, use
      // the current epoch as best-effort estimate.
      let depositEpoch = 0;
      try {
        if (publicClient) {
          const epoch = (await publicClient.readContract({
            address: contractAddress as Address,
            abi: CTGTRESOR_ABI,
            functionName: 'currentEpoch',
          })) as bigint;
          depositEpoch = Number(epoch);
        }
      } catch {
        // Best effort — if RPC is flaky, notebook can be patched up by re-running ct-1.
      }

      // Look up the token's display metadata from the per-chain registry so we
      // can render decimal-aware amounts in the notebook + claim URL UI later
      // (this matters on mainnet where USDC/USDT use 6 decimals — formatEther
      // would render their amounts as ~1e-12 of expected).
      const tokenEntry = (POOL_TOKENS_BY_CHAIN[chainId as number] || [])
        .find((t) => t.address.toLowerCase() === token.toLowerCase());

      const entry: NotebookEntry = {
        claim,
        commitment,
        commitTx: txHash,
        depositEpoch,
        savedAt: new Date().toISOString(),
        spent: false,
        bucketSizeWei: bucketSize.toString(),
        tokenDecimals: tokenEntry?.decimals ?? 18,
        tokenSymbol: tokenEntry?.symbol ?? (isNative ? "ETH" : "???"),
      };
      const next = [entry, ..._loadNotebook()];
      _saveNotebook(next);
      setNotebook(next);

      const claimURL = buildClaimURL(`${window.location.origin}/claim`, claim);
      return { claimURL, commitment, txHash };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastError(msg);
      throw e;
    } finally {
      setIsCommitting(false);
    }
  }, [_requireEnabled, writeContractAsync, contractAddress, chainId, publicClient]);

  const reveal: UsePoolHook['reveal'] = useCallback(async (entry) => {
    _requireEnabled();
    setIsRevealing(true);
    setLastError(null);
    try {
      // Sanity check: claim's contract+chain should match the active connection.
      if (entry.claim.contractAddress.toLowerCase() !== (contractAddress as string).toLowerCase()) {
        throw new Error(`Claim targets a different contract (${entry.claim.contractAddress}) — switch chain or use the right wallet`);
      }
      if (entry.claim.chainId !== chainId) {
        throw new Error(`Claim is for chainId ${entry.claim.chainId} but wallet is on ${chainId}`);
      }

      const txHash = (await writeContractAsync({
        address: contractAddress as Address,
        abi: CTGTRESOR_ABI,
        functionName: 'revealFromPool',
        args: [
          entry.claim.secret,
          entry.claim.userSalt,
          entry.claim.withdrawTo,
          entry.claim.token,
          entry.claim.bucketIdx,
          '0x', // zkProof: empty in v1
        ],
      })) as Hex;

      // Mark entry spent in the notebook
      const all = _loadNotebook();
      const updated = all.map((e) =>
        e.commitment === entry.commitment ? { ...e, spent: true, revealTx: txHash } : e,
      );
      _saveNotebook(updated);
      setNotebook(updated);

      return { txHash };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastError(msg);
      throw e;
    } finally {
      setIsRevealing(false);
    }
  }, [_requireEnabled, writeContractAsync, contractAddress, chainId]);

  const revealFromURL: UsePoolHook['revealFromURL'] = useCallback(async (claimURL) => {
    const claim = decodeTeleportClaim(claimURL);
    const commitment = computeCommitment(claim);
    // Dedup: if this commitment is ALREADY in the notebook (e.g. user is both
    // depositor and recipient, or they re-opened a claim URL they previously
    // saved), reuse that entry. reveal() will mark it spent in-place. Prevents
    // duplicate notebook entries with the same commitment hash.
    const all = _loadNotebook();
    const existing = all.find((e) => e.commitment === commitment);
    if (existing?.spent) {
      throw new Error('This commitment is already marked as revealed in your notebook. If the on-chain reveal failed, reset the notebook entry and try again.');
    }
    const entry: NotebookEntry = existing ?? {
      claim,
      commitment,
      commitTx: '0x' as Hex, // unknown — recipient may not have the commit tx hash
      depositEpoch: 0,        // unknown; contract enforces the wait anyway
      savedAt: new Date().toISOString(),
      spent: false,
    };
    const result = await reveal(entry);
    // reveal() above already updated the existing entry (or no-op'd if not present).
    // Only add a NEW entry if it wasn't already in the notebook.
    if (!existing) {
      const fresh = [{ ...entry, spent: true, revealTx: result.txHash }, ..._loadNotebook()];
      _saveNotebook(fresh);
      setNotebook(_loadNotebook());
    }
    return result;
  }, [reveal]);

  const clearNotebook = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(NOTEBOOK_KEY);
    setNotebook([]);
  }, []);

  const approveToken: UsePoolHook['approveToken'] = useCallback(async ({ token, amount }) => {
    _requireEnabled();
    if (token === NATIVE_TOKEN_ADDRESS) {
      throw new Error('Native token does not require approval');
    }
    setIsApproving(true);
    setLastError(null);
    try {
      const txHash = (await writeContractAsync({
        address: token,
        abi: erc20Abi,
        functionName: 'approve',
        args: [contractAddress as Address, amount],
      })) as Hex;
      // Wait for the receipt so subsequent allowance reads reflect the new value.
      // Also poll the allowance directly after — wagmi's useReadContract cache
      // can lag behind the receipt by a render cycle, and the caller's refetch
      // hook reference may be stale. This guarantees the on-chain new allowance
      // is observed before approveToken resolves.
      if (publicClient) {
        try {
          await publicClient.waitForTransactionReceipt({ hash: txHash });
          // Poll for up to 8s: read allowance() directly until it reflects the
          // new value, then return. Bounded so a failed approve doesn't hang.
          const owner = account as Address;
          for (let i = 0; i < 4; i++) {
            const current = await publicClient.readContract({
              address: token,
              abi: erc20Abi,
              functionName: 'allowance',
              args: [owner, contractAddress as Address],
            }) as bigint;
            if (current >= amount) break;
            await new Promise((r) => setTimeout(r, 2_000));
          }
        } catch { /* network hiccup — caller's refetchInterval will catch up */ }
      }
      return { txHash };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastError(msg);
      throw e;
    } finally {
      setIsApproving(false);
    }
  }, [_requireEnabled, writeContractAsync, contractAddress, publicClient, account]);

  const pendingNotebook = notebook.filter((e) => !e.spent);

  return {
    enabled,
    contractAddress,
    notebook,
    pendingNotebook,
    isCommitting,
    isRevealing,
    isApproving,
    lastError,
    commit,
    reveal,
    revealFromURL,
    clearNotebook,
    approveToken,
  };
};

// Re-export utility used by formatters in UI components
export { formatUnits, parseUnits };

/**
 * Read the bucket schedule for a given token from CyrusTresor1 on the active chain.
 * Returns the array of bucket sizes (in wei) AND an isLoading flag.
 * NB: bucket count varies per token per chain (e.g. Sepolia ETH has 4; BSC has 4).
 *     We probe up to MAX_BUCKETS_PROBE, stopping on revert.
 */
const MAX_BUCKETS_PROBE = 8;
export function usePoolBucketSizes(token: Address | undefined): { sizes: bigint[]; isLoading: boolean } {
  const chainId = useChainId();
  const addr = contractAddressForChain(chainId);
  const probeCalls = useMemo(() => {
    if (!addr || !token) return [];
    return Array.from({ length: MAX_BUCKETS_PROBE }).map((_, i) => ({
      address: addr,
      abi: CTGTRESOR_ABI as unknown[],
      functionName: 'getPoolBucketSize',
      args: [token, i],
    } as Parameters<typeof useReadContracts>[0]['contracts'][number]));
  }, [addr, token]);

  const { data, isLoading } = useReadContracts({
    contracts: probeCalls,
    query: { enabled: !!addr && !!token && WEB3_CONFIG.ENABLE_POOL, staleTime: 60_000 },
  });

  const sizes: bigint[] = [];
  if (data) {
    for (const entry of data) {
      if (entry.status === 'success' && typeof entry.result === 'bigint') sizes.push(entry.result);
      else break; // first revert = out of range, schedule ends here
    }
  }
  return { sizes, isLoading };
}

/** Read the current dynamic fee in wei. Refreshes every block via wagmi defaults. */
export function usePoolCurrentFee(): { feeWei: bigint | undefined; isLoading: boolean } {
  const chainId = useChainId();
  const addr = contractAddressForChain(chainId);
  const { data, isLoading } = useReadContract({
    address: addr ?? undefined,
    abi: CTGTRESOR_ABI,
    functionName: 'getCurrentFeeInWei',
    query: { enabled: !!addr && WEB3_CONFIG.ENABLE_POOL, staleTime: 30_000 },
  });
  return { feeWei: data as bigint | undefined, isLoading };
}

/** Read the current allowance(owner, spender) for an ERC-20 token.
 *  Returns 2^256-1 (effectively infinite) for the native sentinel so callers
 *  can use the same comparison logic uniformly. */
export function useTokenAllowance(token: Address | undefined, owner: Address | undefined): { allowance: bigint; isLoading: boolean; refetch: () => void } {
  const chainId = useChainId();
  const spender = contractAddressForChain(chainId);
  const isNative = token === NATIVE_TOKEN_ADDRESS;
  const { data, isLoading, refetch } = useReadContract({
    address: isNative ? undefined : token,
    abi: erc20Abi,
    functionName: 'allowance',
    args: owner && spender ? [owner, spender] : undefined,
    query: { enabled: !!owner && !!spender && !!token && !isNative && WEB3_CONFIG.ENABLE_POOL, refetchInterval: 8_000 },
  });
  const allowance = isNative
    ? (2n ** 256n - 1n)
    : ((data as bigint | undefined) ?? 0n);
  return { allowance, isLoading, refetch: () => { refetch(); } };
}

/** Read ERC-20 decimals() on-chain. Returns 18 for native sentinel without an RPC call. */
export function useTokenDecimals(token: Address | undefined): { decimals: number; isLoading: boolean } {
  const isNative = token === NATIVE_TOKEN_ADDRESS;
  const { data, isLoading } = useReadContract({
    address: isNative ? undefined : token,
    abi: erc20Abi,
    functionName: 'decimals',
    query: { enabled: !!token && !isNative, staleTime: Infinity },
  });
  return { decimals: isNative ? 18 : ((data as number | undefined) ?? 18), isLoading };
}

/** Read the current epoch number from the contract. */
export function usePoolCurrentEpoch(): { epoch: number | undefined; isLoading: boolean } {
  const chainId = useChainId();
  const addr = contractAddressForChain(chainId);
  const { data, isLoading } = useReadContract({
    address: addr ?? undefined,
    abi: CTGTRESOR_ABI,
    functionName: 'currentEpoch',
    query: { enabled: !!addr && WEB3_CONFIG.ENABLE_POOL, staleTime: 60_000 },
  });
  return { epoch: data !== undefined ? Number(data) : undefined, isLoading };
}
