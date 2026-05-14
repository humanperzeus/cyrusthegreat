/**
 * Deploys CyrusTresor1.sol to the network selected via `--network <name>`.
 *
 * Usage:
 *   nvm use 22.19.0
 *   cd tools/hardhat-deploy
 *   npx hardhat run scripts/deployCyrusTresor1.ts --network sepolia
 *
 * Required env (in tools/hardhat-deploy/.env):
 *   SEPOLIA_RPC_URL              (or BSC_TESTNET_RPC_URL / BASE_SEPOLIA_RPC_URL)
 *   SEPOLIA_PRIVATE_KEY          (forever-Sepolia-only burner per L-008 / Rule 10)
 *
 * Optional env:
 *   FEE_COLLECTOR                defaults to WALLET1_PUBK
 *   SALT                         hex-32; if unset, a fresh random salt is generated
 *   DRY_RUN=1                    print all args + estimated gas, but do NOT submit
 *
 * Side effects:
 *   - Submits one tx (the constructor call) — costs gas. None on DRY_RUN=1.
 *   - Writes a deployment record JSON to tools/hardhat-deploy/deployments/
 *     so verify.ts can re-load the exact constructor args later.
 */

import { ethers, network } from "hardhat";
import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";

// --------------------------------------------------------------------
//  Per-chain constants — Chainlink price feeds + pool token schedules
// --------------------------------------------------------------------
// Chainlink native/USD price feeds (testnet-only; mainnet should be added later
// alongside the mainnet deploy decision — explicitly NOT here per Rule 10).
const PRICE_FEEDS: Record<string, string> = {
  sepolia:     "0x694AA1769357215DE4FAC081bf1f309aDC325306", // Sepolia ETH/USD
  bscTestnet:  "0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526", // BSC Testnet BNB/USD
  baseSepolia: "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1", // Base Sepolia ETH/USD
};

// Known testnet ERC-20s per chain (must match .env entries used by frontend).
// Native token uses address(0) sentinel.
const ZERO = "0x0000000000000000000000000000000000000000";
const TOKENS: Record<string, { addr: string; symbol: string }[]> = {
  sepolia: [
    { addr: ZERO, symbol: "ETH" },
    { addr: "0xD649712915595bcE7A4BA3a821C64850853FcD02", symbol: "USD1" },
    { addr: "0x4Ed43Ca34731696caa2B813070AB65F18510eaA1", symbol: "WLFI" },
  ],
  bscTestnet:  [{ addr: ZERO, symbol: "tBNB" }],
  baseSepolia: [{ addr: ZERO, symbol: "ETH" }],
};

// Bucket schedules per (network, symbol). Sizes are in HUMAN units (e.g. "0.01"
// ETH or "100" USD1). Converted to wei using the token's decimals at deploy
// time via the on-chain decimals() call. See spec § 5.
const BUCKETS: Record<string, Record<string, string[]>> = {
  sepolia: {
    ETH:  ["0.001", "0.01", "0.1", "1.0"],
    USD1: ["10",    "100",  "1000", "10000"],
    WLFI: ["10",    "100",  "1000", "10000"],
  },
  bscTestnet:  { tBNB: ["0.005", "0.05", "0.5", "5"] },
  baseSepolia: { ETH:  ["0.001", "0.01", "0.1", "1.0"] },
};

// --------------------------------------------------------------------
//  Helpers
// --------------------------------------------------------------------
async function tokenDecimals(addr: string): Promise<number> {
  if (addr === ZERO) return 18; // native token (ETH/BNB) always 18 wei-decimals
  // Minimal ABI — works on any ERC-20 that exposes decimals() (most do).
  const erc20 = new ethers.Contract(
    addr,
    ["function decimals() view returns (uint8)"],
    ethers.provider,
  );
  try {
    return Number(await erc20.decimals());
  } catch (e: any) {
    throw new Error(`Could not read decimals() from ${addr}: ${e?.message || e}`);
  }
}

function envOr(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : fallback;
}

// --------------------------------------------------------------------
//  Main
// --------------------------------------------------------------------
async function main() {
  // Resolve config for the active network.
  const netName = network.name;
  const priceFeed = PRICE_FEEDS[netName];
  const tokens = TOKENS[netName];
  const bucketsByToken = BUCKETS[netName];
  if (!priceFeed || !tokens || !bucketsByToken) {
    throw new Error(
      `No deploy config for network "${netName}". Add an entry to PRICE_FEEDS/TOKENS/BUCKETS in scripts/deployCyrusTresor1.ts.`,
    );
  }

  // Resolve deployer + ensure it's funded.
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error(
      "No signer available. Set SEPOLIA_PRIVATE_KEY (or the equivalent for the active network) in tools/hardhat-deploy/.env.",
    );
  }
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Network:     ${netName} (chainId ${network.config.chainId})`);
  console.log(`Deployer:    ${deployer.address}`);
  console.log(`Balance:     ${ethers.formatEther(balance)} (native)`);

  // Constructor args.
  const feeCollector =
    envOr("FEE_COLLECTOR", "0x84064947bcD9729872c5Be91D2aE50380Cbd691E")!;
  const salt = envOr("SALT", "0x" + randomBytes(32).toString("hex"))!;
  if (!/^0x[a-fA-F0-9]{64}$/.test(salt)) {
    throw new Error(`SALT must be hex-32 (0x + 64 chars); got: ${salt}`);
  }
  const poolTokenAddrs = tokens.map((t) => t.addr);

  // Look up decimals for each token, then convert bucket sizes from human units
  // to wei-style units. Doing this here (not in the contract) keeps the contract
  // cheap and the decimal-awareness explicit in the deploy record.
  console.log("Looking up token decimals…");
  const bucketSchedules: bigint[][] = [];
  for (const t of tokens) {
    const dec = await tokenDecimals(t.addr);
    const sizes = bucketsByToken[t.symbol];
    if (!sizes) throw new Error(`No bucket schedule for ${t.symbol} on ${netName}`);
    const wei = sizes.map((s) => ethers.parseUnits(s, dec));
    bucketSchedules.push(wei);
    console.log(`  ${t.symbol.padEnd(5)} (${dec} dec): ${sizes.join(", ")} → ${wei.map(String).join(", ")}`);
  }

  const zkVerifier = ZERO; // v1: spec § 10
  console.log(`feeCollector: ${feeCollector}`);
  console.log(`salt:         ${salt}`);
  console.log(`priceFeed:    ${priceFeed}`);
  console.log(`zkVerifier:   ${zkVerifier} (v1)`);

  // DRY_RUN: print the constructor args + estimated gas, then bail out.
  // No tx is submitted; no contract is deployed.
  if (envOr("DRY_RUN") === "1") {
    const Factory = await ethers.getContractFactory(
      "contracts/evm/CyrusTresor1.sol:CyrusTresor1",
    );
    const deployTx = await Factory.getDeployTransaction(
      feeCollector,
      salt,
      priceFeed,
      poolTokenAddrs,
      bucketSchedules,
      zkVerifier,
    );
    const estimated = await ethers.provider.estimateGas(deployTx);
    console.log("");
    console.log(`DRY_RUN — estimated gas: ${estimated.toString()}`);
    console.log("DRY_RUN — no transaction submitted. Set DRY_RUN=0 (or unset) to deploy.");
    return;
  }

  // Submit the deploy tx.
  console.log("\nSubmitting deploy tx…");
  const Factory = await ethers.getContractFactory(
    "contracts/evm/CyrusTresor1.sol:CyrusTresor1",
  );
  const contract = await Factory.deploy(
    feeCollector,
    salt,
    priceFeed,
    poolTokenAddrs,
    bucketSchedules,
    zkVerifier,
  );
  const deployTx = contract.deploymentTransaction();
  console.log(`Tx hash:     ${deployTx?.hash}`);

  console.log("Waiting for confirmation…");
  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log(`✅ CyrusTresor1 deployed at: ${addr}`);

  // Persist a deployment record so verify.ts can re-load the exact constructor
  // args. Tracked in git for posterity (no secrets in the record).
  const record = {
    network: netName,
    chainId: Number(network.config.chainId),
    contract: "CyrusTresor1",
    address: addr,
    deployTx: deployTx?.hash,
    deployer: deployer.address,
    blockNumber: deployTx ? (await deployTx.wait())?.blockNumber : null,
    timestamp: new Date().toISOString(),
    constructorArgs: {
      feeCollector,
      salt,
      priceFeed,
      poolTokens: poolTokenAddrs,
      bucketSchedules: bucketSchedules.map((arr) => arr.map(String)),
      zkVerifier,
    },
    // Human-readable bucket schedule for grep-ability.
    poolBucketsHuman: tokens.map((t, i) => ({
      symbol: t.symbol,
      addr: t.addr,
      sizes: bucketsByToken[t.symbol],
    })),
  };
  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `cyrustresor1-${netName}.json`);
  fs.writeFileSync(outFile, JSON.stringify(record, null, 2));
  console.log(`Deployment record: ${outFile}`);

  console.log("");
  console.log("Next steps:");
  console.log(`  1. (optional) Verify on the block explorer:`);
  console.log(`     npx hardhat run scripts/verify.ts --network ${netName}`);
  console.log(`  2. Update cyrusthegreat/.env with the new contract address:`);
  console.log(`     VITE_CTGTRESOR_<CHAIN>_CONTRACT=${addr}`);
  console.log(`  3. Sync to Cloudflare dashboard via tools/cf-sync-env.sh`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
