# Contract Debug UI

Single-file, ABI-driven contract debugger for the Cyrus contracts. No build step, no install, no framework.

## What it is

`index.html` + a few ABI files + a one-line static server. Open in browser, connect MetaMask, pick a preset (Bank5 / Bank8 / Portal11) or paste your own address + ABI, get auto-generated forms for every function. Read calls return their output inline; write calls return a tx hash with an Etherscan link and confirmation status.

## How to run

```bash
cd tools/contract-debug
python3 -m http.server 8080
# then open http://localhost:8080 in a browser with MetaMask
```

(Or any other static-file server: `npx serve`, `caddy`, `darkhttpd`, etc. Just don't use `file://` — most browsers block `window.ethereum` or fetch on file URLs.)

## Presets

| Preset | Address | Network | Status |
|---|---|---|---|
| `CrossChainBank5` | `0x3d6e43cbf157110015edF062173BbeBF78De61B4` | Sepolia | LIVE in production at cyrusthegreat.dev |
| `CrossChainBank8` | `0xb83A814097C70DB79568b663662eA07e77D4D87a` | Sepolia | Deployed, not promoted |
| `CyrusPortal11` | (none) | — | Source only, no deployment yet |

ABIs live in `abis/`. Paste your own ABI in the textarea to test any contract.

## How it handles types

Inputs are parsed from text into the right Solidity type:
- `uint*` / `int*`: parsed as `BigInt(value)` — pass as a decimal string, e.g. `1000000000000000000` for 1 ETH worth of wei.
- `address`: passed as-is (with checksum check).
- `bool`: `true` or `1` = true; anything else = false.
- `bytes*`: passed as-is (must be `0x…`).
- `string`: passed as-is.
- `<type>[]`: paste a JSON array, e.g. `["0xabc...","0xdef..."]` or `["1000","2000"]`.
- `tuple`: paste a JSON object.
- `payable` functions get an extra `msg.value : ETH` field — type a decimal in ETH (e.g. `0.001`), it's converted to wei automatically.

## Why this design

- **One file.** No framework, no Next.js, no Vite, no install. Avoids the macOS hardened-runtime SWC issue we hit with Next.js dev servers.
- **ABI-driven.** Same UI works for Bank5, Bank8, Portal11, or any future contract — just swap the ABI.
- **Window.ethereum only.** Sufficient for desktop MetaMask testing on Sepolia. No WalletConnect QR / Reown integration. If you need mobile-wallet QR scanning, this isn't the right tool.
- **No safety nets.** This is a raw debug tool — every function call is sent as-typed. Don't use on mainnet without thinking twice.

## Adding a new contract preset

1. Drop the ABI JSON into `abis/<Name>.json` (hardhat artifact format `{abi: [...]}` or just a bare array — both work).
2. Edit `index.html`, find the `PRESETS` object near the top of the script, add an entry:
   ```js
   mycontract: {
     address: "0x...",
     abiPath: "abis/MyContract.json",
   },
   ```
3. Add a corresponding `<option>` in the `#preset` `<select>` element.
