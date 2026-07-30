/**
 * useFundraise — thin client for the CyrusFundraise contract.
 *
 * Powers the id-based fundraising flow:
 *   - createCampaign() → submits the tx, parses the CampaignCreated event
 *     from the receipt, returns the on-chain campaign id.
 *   - donate() → approves the fundraise contract if needed, then donate(id,
 *     amount). The contract splits the fee and forwards both legs; nothing
 *     is held.
 *   - useCampaign(id) → reads getCampaign(id) + polls raisedOf(id), giving
 *     the /fund page an EXACT live progress number in a single eth_call
 *     (no getLogs, no free-tier block-range limit).
 *
 * Only deployed on Sepolia (chainId 11155111) for now. On any other chain
 * `contractAddress` is null and callers fall back to the legacy direct-
 * transfer flow.
 */

import { useCallback } from 'react';
import {
  useAccount, useChainId, useWriteContract, usePublicClient, useReadContract,
} from 'wagmi';
import { erc20Abi, decodeEventLog, type Address, type Hex } from 'viem';
import CyrusFundraiseArtifact from '@/contracts/abis/CyrusFundraise.json';
import { WEB3_CONFIG } from '@/config/web3';

export const FUNDRAISE_ABI = (CyrusFundraiseArtifact as { abi: readonly unknown[] }).abi;

const isValidAddress = (a: unknown): a is Address =>
  typeof a === 'string' && /^0x[a-fA-F0-9]{40}$/.test(a);

/** Resolve the CyrusFundraise address for a chain (Sepolia-only for now). */
export function fundraiseAddressForChain(chainId: number | undefined): Address | null {
  if (!chainId) return null;
  if (chainId === 1 || chainId === 11155111) {
    return isValidAddress(WEB3_CONFIG.CYRUSFUNDRAISE_ETH_CONTRACT)
      ? (WEB3_CONFIG.CYRUSFUNDRAISE_ETH_CONTRACT as Address)
      : null;
  }
  return null; // other chains not deployed yet
}

export interface CampaignData {
  recipient: Address;
  token: Address;
  goal: bigint;
  raised: bigint;
  minFee: bigint;
  createdAt: bigint;
  active: boolean;
  listed: boolean;
  title: string;
}

export interface UseFundraiseHook {
  /** Resolved CyrusFundraise address for the active chain, or null. */
  contractAddress: Address | null;
  /** Create a campaign; returns the on-chain id parsed from the event. */
  createCampaign: (args: {
    recipient: Address; token: Address; goalWei: bigint; title: string; metaURI?: string; listed?: boolean;
  }) => Promise<{ id: number; txHash: Hex }>;
  /** Donate to a campaign; approves the fundraise contract first if needed. */
  donate: (args: {
    campaignId: number; token: Address; amount: bigint;
  }) => Promise<{ txHash: Hex }>;
}

export function useFundraise(): UseFundraiseHook {
  const { address: account } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const contractAddress = fundraiseAddressForChain(chainId);

  const createCampaign = useCallback<UseFundraiseHook['createCampaign']>(async ({
    recipient, token, goalWei, title, metaURI = '', listed = false,
  }) => {
    if (!contractAddress) throw new Error('Fundraise contract is not deployed on this chain.');
    const txHash = (await writeContractAsync({
      address: contractAddress,
      abi: FUNDRAISE_ABI,
      functionName: 'createCampaign',
      args: [recipient, token, goalWei, title, metaURI, listed],
    })) as Hex;

    let id = 0;
    if (publicClient) {
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') {
        throw new Error(`createCampaign reverted on-chain (block ${receipt.blockNumber}).`);
      }
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({ abi: FUNDRAISE_ABI, data: log.data, topics: log.topics });
          if (decoded.eventName === 'CampaignCreated') {
            id = Number((decoded.args as { id: bigint }).id);
            break;
          }
        } catch {
          // not our event — skip
        }
      }
    }
    if (!id) throw new Error('Campaign created but the id could not be read from the receipt.');
    return { id, txHash };
  }, [contractAddress, writeContractAsync, publicClient]);

  const donate = useCallback<UseFundraiseHook['donate']>(async ({ campaignId, token, amount }) => {
    if (!contractAddress) throw new Error('Fundraise contract is not deployed on this chain.');

    // Approve the fundraise contract for the full amount (the contract pulls
    // fee + rest via two transferFrom calls totalling `amount`).
    if (account && publicClient) {
      try {
        const allowance = (await publicClient.readContract({
          address: token, abi: erc20Abi, functionName: 'allowance',
          args: [account, contractAddress],
        })) as bigint;
        if (allowance < amount) {
          const approveHash = (await writeContractAsync({
            address: token, abi: erc20Abi, functionName: 'approve',
            args: [contractAddress, amount],
          })) as Hex;
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        }
      } catch {
        // Allowance read failed — attempt the donate anyway; it reverts cleanly
        // if the allowance is insufficient.
      }
    }

    const txHash = (await writeContractAsync({
      address: contractAddress,
      abi: FUNDRAISE_ABI,
      functionName: 'donate',
      args: [BigInt(campaignId), amount],
    })) as Hex;
    if (publicClient) {
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') {
        throw new Error(`donate reverted on-chain (block ${receipt.blockNumber}).`);
      }
    }
    return { txHash };
  }, [contractAddress, account, publicClient, writeContractAsync]);

  return { contractAddress, createCampaign, donate };
}

/**
 * Read a campaign + its live raised total. Polls every 30s so the /fund
 * progress bar stays current. Returns undefined while loading or if the id
 * doesn't exist / the contract isn't on this chain.
 */
export function useCampaign(id: number | undefined): {
  campaign: CampaignData | undefined;
  isLoading: boolean;
  refetch: () => void;
} {
  const chainId = useChainId();
  const addr = fundraiseAddressForChain(chainId);
  const enabled = !!addr && id != null && id > 0;

  const { data, isLoading, refetch } = useReadContract({
    address: addr ?? undefined,
    abi: FUNDRAISE_ABI,
    functionName: 'getCampaign',
    args: id != null ? [BigInt(id)] : undefined,
    query: { enabled, refetchInterval: 30_000 },
  });

  const campaign = data
    ? (data as unknown as CampaignData)
    : undefined;

  // A non-existent id returns a zeroed struct (recipient == address(0)).
  const exists = campaign && isValidAddress(campaign.recipient) &&
    campaign.recipient !== '0x0000000000000000000000000000000000000000';

  return {
    campaign: exists ? campaign : undefined,
    isLoading,
    refetch: () => { void refetch(); },
  };
}

export interface ListedCampaign extends CampaignData {
  id: number;
}

/**
 * Public directory feed for /discover. One eth_call to getListedCampaigns
 * returns every LISTED campaign (ids + structs) — no getLogs, no backend.
 * Polls every 30s so raised totals stay live. Empty when the contract isn't
 * on this chain.
 */
export function useListedCampaigns(): {
  campaigns: ListedCampaign[];
  isLoading: boolean;
  refetch: () => void;
} {
  const chainId = useChainId();
  const addr = fundraiseAddressForChain(chainId);

  const { data, isLoading, refetch } = useReadContract({
    address: addr ?? undefined,
    abi: FUNDRAISE_ABI,
    functionName: 'getListedCampaigns',
    args: [1n, 100000n], // scan from id 1; contract clamps the upper bound to nextId-1
    query: { enabled: !!addr, refetchInterval: 30_000 },
  });

  // getListedCampaigns returns (uint256[] ids, Campaign[] list).
  const [ids, list] = (data as [readonly bigint[], readonly CampaignData[]] | undefined) ?? [[], []];
  const campaigns: ListedCampaign[] = ids.map((id, i) => ({ ...list[i], id: Number(id) }));

  return { campaigns, isLoading, refetch: () => { void refetch(); } };
}
