/**
 * DonateForm — direct-deposit donation flow for /fund campaigns.
 *
 * Architectural pivot from the original /fund design (2026-06-20):
 *   - Originally /fund routed to /pay, which uses CyrusTeleport's
 *     commit-reveal pool. Anonymous, but if the donor never shared the
 *     claim URL with the recipient (the normal case for anonymous
 *     donations to strangers), funds got locked forever.
 *   - This form skips the pool entirely. Standard ERC-20 transfer from
 *     donor's wallet to recipient. Public on-chain. Recipient receives
 *     INSTANTLY. No URL to lose, no 1-hour wait, no risk of locked
 *     funds.
 *
 * Donor anonymity is GONE in this flow — donor's address is publicly
 * linked to recipient on chain. That's the deliberate trade-off: for
 * fundraising, fund-arrival reliability beats pool-based anonymity. If
 * a donor wants anonymity, they should use /pay (which keeps the URL
 * responsibility with them and warns up-front).
 *
 * Native ETH/BNB donations: NOT supported in v1. Would need
 * sendTransaction() which has no event for progress tracking. Defer
 * until /fund has indexer support. Form filters out native from the
 * token picker.
 *
 * Amount is free-form (any positive number) — not bucket-locked. This
 * is a big UX win over the pool flow which forced fixed bucket sizes.
 */

import { useState, useMemo } from "react";
import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { erc20Abi, parseUnits, formatUnits, type Address, type Hex } from "viem";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HeartHandshake, Check, ExternalLink, AlertTriangle, Coins, Wallet } from "lucide-react";
import { POOL_TOKENS_BY_CHAIN, NATIVE_TOKEN_ADDRESS, usePoolTokenBalance } from "@/hooks/usePool";
import { useConnectWallet } from "@/hooks/useConnectWallet";
import { useFundraise } from "@/hooks/useFundraise";
import { OnrampSection } from "@/components/shared/OnrampSection";

interface DonateFormProps {
  recipient: Address;
  /** Token symbol the campaign was created with — used to default-select */
  tokenSymbol: string;
  /** Optional preset suggested amounts ("5,10,25,50,100"). Custom input always available. */
  suggestedAmounts?: string[];
  /**
   * When set, donate through the CyrusFundraise contract's donate(id) —
   * accurate per-campaign accounting + 0.1%/$0.10 fee auto-split. When
   * omitted (legacy ?to= campaigns), fall back to a plain ERC-20 transfer
   * straight to the recipient with no fee.
   */
  campaignId?: number;
  /** Called after a confirmed donation so the parent can refetch raised. */
  onDonated?: () => void;
}

const explorerFor = (chainId: number, txHash: string): string => {
  if (chainId === 11155111) return `https://sepolia.etherscan.io/tx/${txHash}`;
  if (chainId === 1)        return `https://etherscan.io/tx/${txHash}`;
  if (chainId === 97)       return `https://testnet.bscscan.com/tx/${txHash}`;
  if (chainId === 56)       return `https://bscscan.com/tx/${txHash}`;
  if (chainId === 84532)    return `https://sepolia.basescan.org/tx/${txHash}`;
  if (chainId === 8453)     return `https://basescan.org/tx/${txHash}`;
  if (chainId === 421614)   return `https://sepolia.arbiscan.io/tx/${txHash}`;
  if (chainId === 42161)    return `https://arbiscan.io/tx/${txHash}`;
  return "#";
};

const DEFAULT_SUGGESTED = ["5", "10", "25", "50", "100"];

export const DonateForm: React.FC<DonateFormProps> = ({
  recipient,
  tokenSymbol,
  suggestedAmounts = DEFAULT_SUGGESTED,
  campaignId,
  onDonated,
}) => {
  const { address: account, isConnected } = useAccount();
  const connectWallet = useConnectWallet();
  const chainId = useChainId();
  const { writeContractAsync } = useWriteContract();
  const { donate: fundraiseDonate } = useFundraise();
  const contractMode = campaignId != null;

  // Resolve which tokens are donatable on this chain (ERC-20 only —
  // native filtered out for v1). If the requested tokenSymbol matches
  // an ERC-20 on this chain, default to it; else fall back to first
  // ERC-20 in the registry.
  const allTokens = POOL_TOKENS_BY_CHAIN[chainId] ?? [];
  const erc20Tokens = useMemo(
    () => allTokens.filter(t => t.address !== NATIVE_TOKEN_ADDRESS),
    [allTokens],
  );
  const requestedToken = useMemo(
    () => erc20Tokens.find(t => t.symbol.toLowerCase() === tokenSymbol.toLowerCase()),
    [erc20Tokens, tokenSymbol],
  );
  const [selectedTokenSymbol, setSelectedTokenSymbol] = useState<string>(
    requestedToken?.symbol ?? erc20Tokens[0]?.symbol ?? tokenSymbol,
  );
  const selectedToken = useMemo(
    () => erc20Tokens.find(t => t.symbol === selectedTokenSymbol),
    [erc20Tokens, selectedTokenSymbol],
  );

  const tokenAddress = selectedToken?.address;
  const tokenDecimals = selectedToken?.decimals ?? 18;

  const { balance } = usePoolTokenBalance(tokenAddress, account);

  const [amount, setAmount] = useState<string>("");
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [stage, setStage] = useState<"idle" | "signing" | "pending" | "done" | "failed">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Wait for receipt when tx is in mempool — confirms the donation
  // actually landed before flipping to "done".
  const { isLoading: waitingForReceipt, isSuccess: receiptOK } = useWaitForTransactionReceipt({
    hash: txHash ?? undefined,
    query: { enabled: !!txHash },
  });
  useMemo(() => {
    if (contractMode) return; // contract mode drives stage manually (donate() awaits its own receipt)
    if (waitingForReceipt) setStage("pending");
    else if (receiptOK && txHash) setStage("done");
  }, [waitingForReceipt, receiptOK, txHash, contractMode]);

  const amountWei = useMemo(() => {
    if (!amount || !/^\d+(\.\d+)?$/.test(amount)) return undefined;
    try { return parseUnits(amount, tokenDecimals); } catch { return undefined; }
  }, [amount, tokenDecimals]);
  const amountValid = amountWei !== undefined && amountWei > 0n;
  const hasEnough = amountWei != null && balance >= amountWei;

  const canDonate =
    isConnected && tokenAddress && amountValid && hasEnough && stage === "idle";

  const handleDonate = async () => {
    if (!canDonate || !tokenAddress || !amountWei) return;
    setStage("signing");
    setErrorMessage(null);
    setTxHash(null);
    try {
      if (contractMode && campaignId != null) {
        // Contract mode: approve (if needed) + donate(id). donate() waits for
        // the receipt internally, so flip straight to "done" when it resolves.
        setStage("pending");
        const { txHash: hash } = await fundraiseDonate({
          campaignId, token: tokenAddress, amount: amountWei,
        });
        setTxHash(hash);
        setStage("done");
        onDonated?.();
      } else {
        // Legacy: plain ERC-20 transfer straight to the recipient (no fee).
        const hash = (await writeContractAsync({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "transfer",
          args: [recipient, amountWei],
        })) as Hex;
        setTxHash(hash);
        setStage("pending"); // useWaitForTransactionReceipt will flip to "done"
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setErrorMessage(message);
      setStage("failed");
    }
  };

  const handleReset = () => {
    setAmount("");
    setTxHash(null);
    setStage("idle");
    setErrorMessage(null);
  };

  if (erc20Tokens.length === 0) {
    return (
      <Card className="p-4 bg-gradient-card backdrop-blur border-yellow-500/30">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            No ERC-20 tokens configured for this chain. Direct-deposit donations work for ERC-20 only
            in v1 (native ETH/BNB/HYPE tracking requires an indexer — coming later). Switch your wallet
            to a chain with stablecoins configured (Sepolia has USD1).
          </p>
        </div>
      </Card>
    );
  }

  // Success state
  if (stage === "done" && txHash) {
    return (
      <Card className="p-4 bg-emerald-500/5 border-emerald-500/30 space-y-3">
        <div className="flex items-center gap-2">
          <Check className="w-5 h-5 text-emerald-400" />
          <p className="text-sm font-medium text-emerald-200">Donation confirmed — thank you!</p>
        </div>
        <p className="text-xs text-muted-foreground">
          {amount} {selectedTokenSymbol} sent to <code className="font-mono">{recipient.slice(0, 8)}…{recipient.slice(-6)}</code> —
          it's in their wallet now. Confirm it on the block explorer below.
        </p>
        <a
          href={explorerFor(chainId, txHash)}
          target="_blank" rel="noreferrer noopener"
          className="text-xs text-vault-primary hover:underline inline-flex items-center gap-1"
        >
          View transaction on explorer <ExternalLink className="w-3 h-3" />
        </a>
        <Button variant="outline" onClick={handleReset} className="w-full text-xs">
          Donate again
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-gradient-card backdrop-blur border-vault-primary/30 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <HeartHandshake className="w-5 h-5 text-vault-primary" />
        <h3 className="text-base font-semibold">Donate to this campaign</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        {contractMode
          ? <>On-chain donation via the campaign contract. Instant, and it updates the live total below. A 0.1% fee applies (min $0.10). Your wallet is publicly visible — for anonymous donations use <a href="/pay" className="text-vault-primary hover:underline">/pay</a>.</>
          : <>Direct on-chain transfer. Instant. Your wallet address is publicly visible — for anonymous donations use <a href="/pay" className="text-vault-primary hover:underline">/pay</a> instead.</>}
      </p>

      {/* Token picker — ERC-20 only, defaults to campaign's choice */}
      {erc20Tokens.length > 1 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">Token</Label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {erc20Tokens.map(t => (
              <button
                key={t.address}
                type="button"
                onClick={() => setSelectedTokenSymbol(t.symbol)}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors border ${
                  selectedTokenSymbol === t.symbol
                    ? "bg-vault-primary/20 border-vault-primary/60 text-vault-primary"
                    : "bg-vault-primary/5 border-vault-primary/20 text-muted-foreground hover:border-vault-primary/40"
                }`}
              >
                {t.symbol}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Amount — preset buttons + custom input */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Amount</Label>
        <div className="grid grid-cols-5 gap-1.5">
          {suggestedAmounts.map(amt => (
            <button
              key={amt}
              type="button"
              onClick={() => setAmount(amt)}
              className={`px-2 py-1.5 rounded text-xs font-mono transition-colors border ${
                amount === amt
                  ? "bg-vault-primary/20 border-vault-primary/60 text-vault-primary"
                  : "bg-vault-primary/5 border-vault-primary/20 text-muted-foreground hover:border-vault-primary/40"
              }`}
            >
              {amt}
            </button>
          ))}
        </div>
        <Input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="Or enter a custom amount"
          className="text-sm font-mono"
        />
      </div>

      {/* Balance pre-flight */}
      {account && amountWei && (
        <div className={`rounded-md border px-3 py-2 text-xs font-mono flex items-center gap-2 ${
          hasEnough ? "border-vault-primary/15 bg-vault-primary/5" : "border-red-500/40 bg-red-500/10"
        }`}>
          <Coins className={`w-3.5 h-3.5 ${hasEnough ? "text-emerald-400" : "text-red-400"}`} />
          <span className="text-muted-foreground">Balance:</span>
          <span className={hasEnough ? "text-emerald-200" : "text-red-300"}>
            {formatUnits(balance, tokenDecimals)} {selectedTokenSymbol}
          </span>
          {!hasEnough && (
            <span className="text-red-300/90 ml-auto">need {amount}</span>
          )}
        </div>
      )}

      {errorMessage && stage === "failed" && (
        <div className="text-xs text-red-400 font-mono whitespace-pre-wrap">{errorMessage}</div>
      )}

      {!isConnected ? (
        <Button
          onClick={connectWallet}
          className="w-full bg-gradient-vault text-primary-foreground shadow-vault hover:opacity-90 text-base py-5"
        >
          <Wallet className="w-4 h-4 mr-2" /> Connect wallet to donate
        </Button>
      ) : (
        <Button
          onClick={handleDonate}
          disabled={!canDonate}
          className="w-full bg-vault-primary text-background hover:bg-vault-primary/90 text-base py-5"
        >
          {(() => {
            if (stage === "signing")  return "Sign in your wallet…";
            if (stage === "pending")  return "Confirming on-chain…";
            if (!amountValid)         return "Enter an amount";
            if (!hasEnough)           return `Need ${amount} ${selectedTokenSymbol}`;
            return `Donate ${amount} ${selectedTokenSymbol}`;
          })()}
        </Button>
      )}

      {/* No crypto to donate? Buy some — the SAME reusable onramp engine as
          /pay (one artifact, rendered consistently everywhere). */}
      <OnrampSection
        recipientAddress={account}
        amountFiat={amount || undefined}
        cryptoSymbol={selectedTokenSymbol}
      />
    </Card>
  );
};
