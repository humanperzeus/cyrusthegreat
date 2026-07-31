# CYRUS on Solana — clean port of the three EVM contracts

Anchor workspace with one program per EVM contract. Written 2026‑07‑31, replacing an
earlier 1,926‑line `lib.rs` that covered only the vault and had never been compiled.

| EVM contract | Solana program | Program ID |
|---|---|---|
| `CrossChainBank8.sol` | `cyrus-vault` | `BGgf2b4L3q2Ekei7QxMEw2WNdzU7ffeARqoS7UaeKRuf` |
| `CyrusTresor1.sol` | `cyrus-tresor` | `9rZHsP3T2n1symzKxyqzE6Ah7VTvTRcvw24DZXjFpDd7` |
| `CyrusFundraise.sol` | `cyrus-fundraise` | `9rWybqkAm9hQZvwTJNCXLo2YNYLhuJHPwa9eQL3NF99H` |

## Status — read this before trusting anything here

| Stage | State |
|---|---|
| Typechecks (`cargo check --workspace`) | ✅ 0 errors |
| Unit tests (`cargo test --workspace`) | ✅ **12 passed, 0 failed** |
| BPF artifact (`anchor build`) | ❌ **blocked** — see below |
| Deployed to devnet/testnet | ❌ not yet |
| Integrated into the dapp | ❌ not yet |

**The BPF build is blocked by a toolchain issue, not by this code.** `cargo-build-sbf`
ships its own cargo **1.84**, while the current dependency graph
(`anchor-lang → solana-program → blake3 → digest → crypto-common`, and separately
`borsh-derive → proc-macro-crate → toml_edit → toml_datetime`) pulls crates that require
`edition2024`, stabilised in cargo 1.85. Pinning individual crates just moves the failure
to the next one — `anchor build` re-resolves and finds another.

Known fixes, in order of preference:
1. `avm install 1.1.2 && avm use 1.1.2` — newer Anchor ships newer platform‑tools.
   (Attempted here; the download timed out. Retry — it is a network issue, not a wall.)
2. `agave-install init <newer>` to get a platform‑tools whose cargo is ≥ 1.85.
3. Vendor a `Cargo.lock` with every `edition2024` crate pinned down and build with
   `--locked`, ensuring nothing re-resolves.

Until one of those lands, `cargo check` and `cargo test` are the strongest available
verification, and both are green. That is deliberately short of "it works".

## What could not be ported literally

Solidity → Anchor is a re-architecture, not a translation. The substantive differences
are documented at the top of each `lib.rs`; the ones that change behaviour:

- **Storage.** `mapping(bytes32 => uint256)` keyed by `keccak(user, token, salt)` becomes
  one PDA per `(owner, mint)`. Enumeration (`getMyVaultedTokens`) moves to a client-side
  `getProgramAccounts` filter, which is why the EVM `MAX_TOKENS_PER_USER = 200` cap and
  the "max 5 new tokens per tx" anti-spam rule are gone — they existed only to bound an
  on-chain list that no longer exists. Rent already prices account creation.
- **The fee oracle.** EVM reads Chainlink for a $0.10-equivalent fee at call time. Solana
  has no Chainlink; Pyth or Switchboard are the equivalents. Rather than bake in an
  oracle that cannot be built or tested here, `Config.fee_lamports` is set at
  `initialize` and updatable by the authority. `charge_fee` is the single choke point —
  swapping in a Pyth read touches that one function.
- **`block.chainid`** has no Solana equivalent, so the pool commitment binds the
  **program id** instead. It differs per deployment and per cluster, giving the same
  "not replayable elsewhere" property.
- **Commitment freshness** is enforced by `init` on the commitment PDA rather than a
  `depositEpoch == 0` sentinel. This is strictly stronger: a duplicate commitment fails
  at account creation, in the runtime, before any program logic runs.
- **`nonReentrant`** is dropped — Solana locks the accounts a transaction touches.
- **Strings are length-capped** (`title` 64, `meta_uri` 128). Solana accounts are
  fixed-size at creation; the EVM version's unbounded strings are not expressible.

## What is preserved exactly, and is tested

- **Fundraise fee: 0.1%** (`FEE_BPS = 10 / 10_000`) with a per-campaign `minFee` floor,
  0 for native donations. Pinned by unit test against the value the live Sepolia
  deployment produced on 2026‑07‑31 (a 0.002 ETH donation → 0.000002 ETH fee).
- **Non-custodial forwarding.** Fee and remainder move donor → collector and
  donor → recipient inside the same instruction. The program never holds donor funds.
- **`raised` counts gross**, so the dapp's progress bar means the same on both chains.
- **Epoch length 3600s** and the requirement that a reveal lands in a *later* epoch than
  its deposit — that separation is the privacy property, not an inconvenience.
- **Every field is bound into the commitment hash**, including `withdraw_to`. Rewriting
  the payout target produces a different hash and fails. Unit-tested.

## Privacy caveat

Unchanged from the EVM original: this is **k-anonymity within an epoch+bucket cohort,
not cryptographic anonymity**. An observer watching a bucket with one participant in an
epoch can link commit to reveal. The UI must keep saying so.

## Next steps

1. Unblock the BPF build (options above).
2. `anchor build && anchor deploy --provider.cluster devnet`.
3. Port the E2E suite used against Sepolia: deposit→withdraw, create→donate with the fee
   read from the event, commit→reveal across an epoch boundary, plus a replay attempt
   that must fail.
4. Only then wire the dapp. `VITE_CTGVAULT_SOLANA_TESTNET_PROGRAM` currently points at
   `BXAFYZ4SVLvNJ5rVfYprvaMy88ffQGt4iseromVYTcEw`, which exists on **no** cluster and is
   the old program's never-deployed id — it must be repointed or removed.
