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

// Lifecycle step shape — kept structurally identical to the Bank8
// hooks' `_PS` type (useVault.ts:2282) so a shared App-level
// ProgressFlow can consume both. Duplicated rather than extracted to
// a shared module to keep this commit scope-clean; future cleanup can
// hoist to src/lib/txLifecycle.ts.
type _PSStatus = 'pending' | 'running' | 'done' | 'failed';
type _PS = { label: string; status: _PSStatus; detail?: string };

// Tiny driver mirroring useVault.ts's buildTxLifecycle. Takes the
// labels for THIS flow (commit or reveal) and an onProgress callback,
// returns set/advance/getPhase. Each step emits a fresh snapshot
// (spread copy) so React's state setters see new references.
const buildPoolLifecycle = (
  labels: readonly string[],
  onProgress?: (steps: _PS[]) => void,
) => {
  const steps: _PS[] = labels.map(label => ({ label, status: 'pending' as _PSStatus }));
  let phase = 0;
  const emit = () => onProgress?.(steps.map(s => ({ ...s })));
  return {
    advance(i: number) { phase = i; },
    getPhase() { return phase; },
    set(i: number, status: _PSStatus, detail?: string) {
      steps[i] = { ...steps[i], status, ...(detail !== undefined ? { detail } : {}) };
      emit();
    },
  };
};

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
  commit: (args: { withdrawTo: Address; token: Address; bucketIdx: number; bucketSize: bigint; feeWei: bigint; onProgress?: (steps: _PS[]) => void; }) => Promise<{ claimURL: string; commitment: Hex; txHash: Hex }>;

  /** Reveal an existing notebook entry's commitment. Marks it spent on success. */
  reveal: (entry: NotebookEntry, onProgress?: (steps: _PS[]) => void) => Promise<{ txHash: Hex }>;

  /** Convenience: decode a teleport claim URL and reveal it. */
  revealFromURL: (claimURL: string, onProgress?: (steps: _PS[]) => void) => Promise<{ txHash: Hex }>;

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

  const commit: UsePoolHook['commit'] = useCallback(async ({ withdrawTo, token, bucketIdx, bucketSize, feeWei, onProgress }) => {
    _requireEnabled();
    setIsCommitting(true);
    setLastError(null);

    const isNative = token === NATIVE_TOKEN_ADDRESS;
    const value = isNative ? bucketSize + feeWei : feeWei;

    // Token registry lookup hoisted up-front: we need the symbol +
    // decimals BOTH to label the approve step and to render the
    // amount in the lifecycle details (and later to save into the
    // notebook entry — kept here too so we don't read twice).
    const tokenEntry = (POOL_TOKENS_BY_CHAIN[chainId as number] || [])
      .find((t) => t.address.toLowerCase() === token.toLowerCase());
    const tokenDecimals = tokenEntry?.decimals ?? 18;
    const tokenSymbol = tokenEntry?.symbol ?? (isNative ? "ETH" : "TOKEN");

    // Approval gate (4-step lifecycle): read the FRESH on-chain
    // allowance for ERC-20 tokens. We don't trust the React state
    // useTokenAllowance carries because the user may have revoked /
    // re-approved externally (Revoke.cash, another dapp) since the
    // page rendered. If the on-chain read fails for any reason, fall
    // through to the commit attempt and let the contract decide.
    let needsApproval = false;
    if (!isNative && publicClient && account) {
      try {
        const currentAllowance = await publicClient.readContract({
          address: token,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [account, contractAddress as Address],
        }) as bigint;
        needsApproval = currentAllowance < bucketSize;
      } catch {
        // Allowance read failed — best to attempt the commit anyway.
        // On-chain transferFrom will revert with a clear message and
        // the lifecycle's step-2 catch block surfaces it.
      }
    }

    // Lifecycle: 4 steps when approval needed, 3 when not.
    //  - approve step (index 0, when present): wallet sign of the
    //    ERC-20 approve(spender=pool, amount=bucketSize) tx, plus the
    //    receipt wait so the subsequent commitToPool sees the new
    //    allowance.
    //  - The remaining 3 steps mirror the Bank8 commit/deposit shape:
    //    Sign → Confirm → Saved. Two-act pattern: this is the commit
    //    ACT; the reveal ACT runs as its own session (see reveal()).
    const approveOffset = needsApproval ? 1 : 0;
    const labels = needsApproval
      ? [`Approve ${tokenSymbol}`, 'Sign commit in wallet', 'Confirm commit on-chain', 'Saved to notebook']
      : ['Sign commit in wallet', 'Confirm commit on-chain', 'Saved to notebook'];
    const lc = buildPoolLifecycle(labels, onProgress);
    try {
      // Step 0: Approve (only when needed)
      if (needsApproval) {
        setIsApproving(true);
        try {
          lc.set(0, 'running', `Open your wallet and sign approve(${formatUnits(bucketSize, tokenDecimals)} ${tokenSymbol})…`);
          const approveTxHash = (await writeContractAsync({
            address: token,
            abi: erc20Abi,
            functionName: 'approve',
            args: [contractAddress as Address, bucketSize],
          })) as Hex;
          if (publicClient) {
            try {
              const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveTxHash });
              if (approveReceipt.status !== 'success') {
                throw new Error(`approve reverted on-chain (block ${approveReceipt.blockNumber})`);
              }
            } catch (e) {
              lc.set(0, 'failed', e instanceof Error ? e.message : String(e));
              throw e;
            }
          }
          lc.set(0, 'done', `Approved ${formatUnits(bucketSize, tokenDecimals)} ${tokenSymbol}`);
          lc.advance(1);
        } finally {
          setIsApproving(false);
        }
      }

      // Build the claim (generates entropy, normalizes addresses, computes commitment)
      const { claim, commitment } = newClaim({
        withdrawTo,
        token,
        bucketIdx,
        contractAddress: contractAddress as Address,
        chainId: chainId as number,
      });

      const signStepIdx = approveOffset;       // 0 (no approve) or 1 (with approve)
      const confirmStepIdx = approveOffset + 1; // 1 or 2
      const savedStepIdx = approveOffset + 2;   // 2 or 3

      lc.set(signStepIdx, 'running', 'Open your wallet and sign commitToPool…');
      const txHash = (await writeContractAsync({
        address: contractAddress as Address,
        abi: CTGTRESOR_ABI,
        functionName: 'commitToPool',
        args: [commitment, token, bucketIdx],
        value,
      })) as Hex;
      lc.set(signStepIdx, 'done', `Signed & broadcast — tx ${txHash.slice(0, 10)}…`);
      lc.advance(confirmStepIdx);
      lc.set(confirmStepIdx, 'running', 'Waiting for on-chain confirmation…');

      // Wait for the actual receipt before advancing the lifecycle past
      // the confirm step. Without this, the UI would jump to "Saved"
      // before the commit was actually mined, and a revert would
      // surface later through lastError instead of as a failed step.
      let blockNumber: bigint | undefined;
      if (publicClient) {
        try {
          const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
          if (receipt.status !== 'success') {
            throw new Error(`commitToPool reverted on-chain (block ${receipt.blockNumber})`);
          }
          blockNumber = receipt.blockNumber;
        } catch (e) {
          lc.set(confirmStepIdx, 'failed', e instanceof Error ? e.message : String(e));
          throw e;
        }
      }
      lc.set(confirmStepIdx, 'done', blockNumber != null ? `Confirmed in block ${blockNumber}` : 'Confirmed');

      lc.advance(savedStepIdx);
      lc.set(savedStepIdx, 'running', 'Saving to notebook…');

      // Read currentEpoch AFTER the receipt resolves so depositEpoch
      // reflects what the contract actually stored.
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

      // tokenEntry was hoisted to the top of commit() so the approve
      // step can label itself with the correct symbol + decimals.
      // Reuse here for the notebook entry — single source of truth.
      const entry: NotebookEntry = {
        claim,
        commitment,
        commitTx: txHash,
        depositEpoch,
        savedAt: new Date().toISOString(),
        spent: false,
        bucketSizeWei: bucketSize.toString(),
        tokenDecimals,
        tokenSymbol,
      };
      const next = [entry, ..._loadNotebook()];
      _saveNotebook(next);
      setNotebook(next);

      const claimURL = buildClaimURL(`${window.location.origin}/claim`, claim);
      lc.set(savedStepIdx, 'done', `Saved — eligible to reveal at epoch ${depositEpoch + 1}`);
      return { claimURL, commitment, txHash };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastError(msg);
      // Only mark the current phase failed if we haven't already
      // flagged step 1 above. The receipt-fail path already set step 1
      // to 'failed' before throwing.
      lc.set(lc.getPhase(), 'failed', msg);
      throw e;
    } finally {
      setIsCommitting(false);
    }
  }, [_requireEnabled, writeContractAsync, contractAddress, chainId, publicClient, account]);

  const reveal: UsePoolHook['reveal'] = useCallback(async (entry, onProgress) => {
    _requireEnabled();
    setIsRevealing(true);
    setLastError(null);
    // Two-act pattern act 2: this is the REVEAL act, run as its own
    // ProgressFlow session after the user comes back from the wait
    // (visible in the Notebook entry).
    const lc = buildPoolLifecycle(
      ['Sign in wallet', 'Confirm on-chain', 'Finalize & refresh'],
      onProgress,
    );
    try {
      // Sanity check: claim's contract+chain should match the active connection.
      if (entry.claim.contractAddress.toLowerCase() !== (contractAddress as string).toLowerCase()) {
        throw new Error(`Claim targets a different contract (${entry.claim.contractAddress}) — switch chain or use the right wallet`);
      }
      if (entry.claim.chainId !== chainId) {
        throw new Error(`Claim is for chainId ${entry.claim.chainId} but wallet is on ${chainId}`);
      }

      lc.set(0, 'running', 'Open your wallet and sign revealFromPool…');
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
      lc.set(0, 'done', `Signed & broadcast — tx ${txHash.slice(0, 10)}…`);
      lc.advance(1);
      lc.set(1, 'running', 'Waiting for on-chain confirmation…');

      let blockNumber: bigint | undefined;
      if (publicClient) {
        try {
          const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
          if (receipt.status !== 'success') {
            throw new Error(`revealFromPool reverted on-chain (block ${receipt.blockNumber})`);
          }
          blockNumber = receipt.blockNumber;
        } catch (e) {
          lc.set(1, 'failed', e instanceof Error ? e.message : String(e));
          throw e;
        }
      }
      lc.set(1, 'done', blockNumber != null ? `Confirmed in block ${blockNumber}` : 'Confirmed');

      lc.advance(2);
      lc.set(2, 'running', 'Marking entry spent in your notebook…');

      // Mark entry spent in the notebook
      const all = _loadNotebook();
      const updated = all.map((e) =>
        e.commitment === entry.commitment ? { ...e, spent: true, revealTx: txHash } : e,
      );
      _saveNotebook(updated);
      setNotebook(updated);
      lc.set(2, 'done', `Funds delivered to ${entry.claim.withdrawTo.slice(0, 8)}…${entry.claim.withdrawTo.slice(-6)}`);

      return { txHash };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastError(msg);
      lc.set(lc.getPhase(), 'failed', msg);
      throw e;
    } finally {
      setIsRevealing(false);
    }
  }, [_requireEnabled, writeContractAsync, contractAddress, chainId, publicClient]);

  const revealFromURL: UsePoolHook['revealFromURL'] = useCallback(async (claimURL, onProgress) => {
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
    // Forward onProgress so the recipient-side /claim page sees the
    // same 3-step lifecycle that the depositor-side Notebook does.
    const result = await reveal(entry, onProgress);
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
