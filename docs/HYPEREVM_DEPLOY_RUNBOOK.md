# HyperEVM Testnet — Deploy Runbook

Drafted 2026-05-19. Status: code-ready, deploy pending operator action.

This is the step-by-step for getting CyrusTresor1 live on HyperEVM Testnet
(chainId 998, native HYPE) as the dapp's 4th supported chain. The frontend +
hardhat config + deploy scripts are all ready; only the on-chain deploys are
left.

## 0. Chain facts

- **chainId**: 998 (testnet) — 999 reserved for mainnet
- **RPC**: `https://rpc.hyperliquid-testnet.xyz/evm` (also Chainlink-hosted:
  `https://rpcs.chain.link/hyperevm/testnet`)
- **Native token**: HYPE (18 decimals)
- **Block explorer**: https://testnet.purrsec.com
- **Faucet**: per Hyperliquid docs — they rotate; check
  https://hyperliquid.gitbook.io/hyperliquid-docs/onboarding/how-to-use-the-hyperevm

## 1. Oracle choice — MockV3Aggregator (testnet only)

No Chainlink HYPE/USD data feed exists on HyperEVM testnet. Pyth is deployed
(at `0x2880aB155794e7179c9eE2e38200202908C17B43`) but adapting CyrusTresor1's
constructor from `AggregatorV3Interface` to Pyth's API is mainnet-grade work
we've deferred.

For testnet, deploy `contracts/evm/mocks/MockV3Aggregator.sol` with HYPE pegged
at a hardcoded `$40` (8 decimals to match Chainlink's USD-feed convention).
That gives a stable `~$0.10` dynamic fee at any HYPE market price. This is
acceptable per workflow_rules.md Rule 10 (testnet-only burner posture).

**Do not deploy this mock on any mainnet.** The contract has `setPrice()`
permissionless on purpose — anyone could shift the fee on production.

## 2. Burner key

Fund a fresh HyperEVM Testnet burner with HYPE from the faucet. You can
either:

- Reuse `SEPOLIA_PRIVATE_KEY` (the existing Sepolia burner) — `hardhat.config.ts`
  auto-falls-back to it if no HyperEVM-specific key is set.
- Set `HYPER_TESTNET_PRIVATE_KEY` in `tools/hardhat-deploy/.env` for a dedicated
  HyperEVM-only burner (cleaner separation, also fine).

Either way: testnet-only key, never any real funds, never committed.

## 3. Deploy steps

```bash
# 0. Setup (one-time per shell)
nvm use 22.19.0
cd tools/hardhat-deploy

# 1. Deploy MockV3Aggregator first. This is the HYPE/USD oracle.
#    Default: HYPE = $40, 8 decimals. Override via MOCK_PRICE_USD / MOCK_PRICE_DECIMALS.
npx hardhat run scripts/deployMockPriceFeed.ts --network hyperEvmTestnet

# Output ends with the deployed address, e.g.:
#   ✅ MockV3Aggregator deployed at: 0xABCD…
# Also writes deployments/mock-pricefeed-hyperEvmTestnet.json.

# 2. Pass the mock address to the CyrusTresor1 deploy. Two options:
#    (a) Export it as PRICE_FEED_OVERRIDE for one-shot:
export PRICE_FEED_OVERRIDE=0xABCD...  # ← paste the address from step 1
npx hardhat run scripts/deployCyrusTresor1.ts --network hyperEvmTestnet

#    (b) Or paste the address permanently into PRICE_FEEDS["hyperEvmTestnet"]
#        in scripts/deployCyrusTresor1.ts (then no env var needed). Choose (a)
#        if you might redeploy the mock; choose (b) if this is the final mock.

# Output ends with:
#   ✅ CyrusTresor1 deployed at: 0xDEAD…

# 3. Verify on the block explorer (optional but recommended).
#    Purrsec uses a different verification path than Etherscan — confirm whether
#    `npx hardhat verify` works against it, or upload source manually via the UI.
```

## 4. Wire the contract address into the frontend

```bash
# In cyrusthegreat/.env (gitignored), add:
VITE_CTGTRESOR_HYPER_TESTNET_CONTRACT=0xDEAD...     # ← the CyrusTresor1 address

# Then sync to Cloudflare Pages:
../tools/cf-sync-env.sh    # alias: ctg-sync-env. Lives in CYRUS/tools/, NOT inside this repo.
# After the sync, Cloudflare→Pages→cyrusthegreat→Deployments→latest→⋯→Retry
# deployment. Env updates alone don't auto-redeploy.
```

Optional: also add the mock address to `.env` for grep-ability —
`VITE_HYPER_TESTNET_MOCK_PRICEFEED=0xABCD...` — though nothing in the frontend
consumes it (it's just operational hygiene).

## 5. Verify end-to-end

1. Open the dapp. Connect Rabby (or any WalletConnect-compatible wallet).
2. Add HyperEVM Testnet to the wallet manually if it's not detected — chainId
   998, RPC `https://rpc.hyperliquid-testnet.xyz/evm`, symbol `HYPE`.
3. Switch to v2 (pool) mode. The chain switcher should show four chips:
   `tETH · tBSC · tBASE · tHYPE`.
4. Click `tHYPE`. Rabby pops up, requests the chain switch. Accept.
5. The contract footer should read `CyrusTresor1: 0xDEAD…` (your address from
   step 3).
6. Commit `0.001 HYPE` to bucket 0. Confirm tx on testnet.purrsec.com.
7. Wait one epoch (>1 hour). Open the `/claim?c=…` URL from the notebook.
8. Reveal the commitment to your own address. Confirm the recipient receives
   `0.001 HYPE`.

If all 8 steps pass, HyperEVM is live as the 4th chain.

## 6. Known gaps to close later

- **ERC-20 stablecoins on HyperEVM testnet** — `POOL_TOKENS_BY_CHAIN[998]`
  currently only has native HYPE. Once canonical USDC/USDT testnet addresses
  are identified, add them to the registry + the deploy script's `TOKENS`
  map + `BUCKETS` map.
- **Real oracle for mainnet** — `CyrusTresor1.sol` still expects an
  `AggregatorV3Interface`. Mainnet path requires either a Chainlink HYPE/USD
  feed (track availability) or a Pyth adapter contract. NOT in scope until
  audit funding materializes (see `docs/AUDIT_RFP.md`).
- **Verify support on purrsec** — hardhat-verify's Etherscan v2 API doesn't
  know about purrsec; manual upload may be required.
- **HyperCore oracle option** — Hyperliquid's native HyperCore oracle is
  readable from HyperEVM (see Quicknode's guide). Could replace the mock
  for a more realistic testnet experience, but adds another integration
  layer that needs its own verification.
