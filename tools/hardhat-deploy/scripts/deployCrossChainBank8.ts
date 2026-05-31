/**
 * Deploys CrossChainBank8.sol to the network selected via `--network <name>`.
 *
 * Companion to deployCyrusTresor1.ts. Uses the same .env + hardhat config so
 * a single hardhat setup handles BOTH contracts. (Earlier, Bank8 had its own
 * shell-script deploy infrastructure at contracts/evm/deploy_crosschainbank8.sh,
 * which depended on hardhat assets that have since been removed from the repo —
 * this replaces it cleanly.)
 *
 * Usage:
 *   nvm use 22.19.0
 *   cd tools/hardhat-deploy
 *   npx hardhat run scripts/deployCrossChainBank8.ts --network sepolia
 *
 * Required env (in tools/hardhat-deploy/.env):
 *   SEPOLIA_PRIVATE_KEY          (or HYPER_TESTNET_PRIVATE_KEY for hyperEvmTestnet)
 *   FEE_COLLECTOR                (forced — no hardcoded default so we can't
 *                                 accidentally send fees to a leaked address)
 *   <network>_RPC_URL            (SEPOLIA_RPC_URL / BSC_TESTNET_RPC_URL / etc.)
 *
 * Optional env:
 *   SALT                         hex-32; if unset, a fresh random salt is generated
 *   PRICE_FEED_OVERRIDE          override the per-chain Chainlink feed (used on
 *                                HyperEVM where no real feed exists yet — pair
 *                                with deployMockPriceFeed.ts)
 *   DRY_RUN=1                    print constructor args + estimated gas, no submit
 */

import { ethers, network } from "hardhat";
import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";

// Per-chain Chainlink native/USD feeds. Same set as deployCyrusTresor1.ts.
const PRICE_FEEDS: Record<string, string> = {
  sepolia:         "0x694AA1769357215DE4FAC081bf1f309aDC325306", // Sepolia ETH/USD
  bscTestnet:      "0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526", // BSC Testnet BNB/USD
  baseSepolia:     "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1", // Base Sepolia ETH/USD
  arbitrumSepolia: "0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165", // Arbitrum Sepolia ETH/USD (live, verified 2026-05-31)
  // hyperEvmTestnet: no canonical Chainlink HYPE/USD on HyperEVM yet — pass
  // PRICE_FEED_OVERRIDE with the MockV3Aggregator from deployMockPriceFeed.ts.
  // Bank8 was deployed via this path on 2026-05-30.
};

function envOr(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : fallback;
}

async function main() {
  const netName = network.name;
  const priceFeed = envOr("PRICE_FEED_OVERRIDE") || PRICE_FEEDS[netName];
  if (!priceFeed) {
    throw new Error(
      `No price feed for network "${netName}". Add to PRICE_FEEDS in scripts/deployCrossChainBank8.ts, or set PRICE_FEED_OVERRIDE.`,
    );
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(priceFeed)) {
    throw new Error(`Resolved priceFeed is not a 20-byte address: "${priceFeed}"`);
  }

  // FEE_COLLECTOR is REQUIRED — no hardcoded default. This prevents accidentally
  // sending fees to a previously-used (potentially leaked) address.
  const feeCollector = envOr("FEE_COLLECTOR");
  if (!feeCollector) {
    throw new Error(
      "FEE_COLLECTOR env var is required. Set it in tools/hardhat-deploy/.env to the wallet that should receive vault fees.",
    );
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(feeCollector)) {
    throw new Error(`FEE_COLLECTOR is not a 20-byte address: "${feeCollector}"`);
  }

  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error(`No signer for "${netName}". Check your private-key env var.`);
  }

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Network:      ${netName} (chainId ${network.config.chainId})`);
  console.log(`Deployer:     ${deployer.address}`);
  console.log(`Balance:      ${ethers.formatEther(balance)} (native)`);

  const salt = envOr("SALT", "0x" + randomBytes(32).toString("hex"))!;
  if (!/^0x[a-fA-F0-9]{64}$/.test(salt)) {
    throw new Error(`SALT must be hex-32 (0x + 64 chars); got: ${salt}`);
  }

  console.log(`feeCollector: ${feeCollector}`);
  console.log(`salt:         ${salt}`);
  console.log(`priceFeed:    ${priceFeed}`);

  if (envOr("DRY_RUN") === "1") {
    const Factory = await ethers.getContractFactory(
      "contracts/evm/CrossChainBank8.sol:CrossChainBank8",
    );
    const deployTx = await Factory.getDeployTransaction(feeCollector, salt, priceFeed);
    const estimated = await ethers.provider.estimateGas(deployTx);
    console.log("");
    console.log(`DRY_RUN — estimated gas: ${estimated.toString()}`);
    console.log("DRY_RUN — no transaction submitted.");
    return;
  }

  console.log("\nSubmitting deploy tx…");
  const Factory = await ethers.getContractFactory(
    "contracts/evm/CrossChainBank8.sol:CrossChainBank8",
  );
  const contract = await Factory.deploy(feeCollector, salt, priceFeed);
  const deployTx = contract.deploymentTransaction();
  console.log(`Tx hash:      ${deployTx?.hash}`);

  console.log("Waiting for confirmation…");
  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log(`✅ CrossChainBank8 deployed at: ${addr}`);

  const record = {
    network: netName,
    chainId: Number(network.config.chainId),
    contract: "CrossChainBank8",
    address: addr,
    deployTx: deployTx?.hash,
    deployer: deployer.address,
    blockNumber: deployTx ? (await deployTx.wait())?.blockNumber : null,
    timestamp: new Date().toISOString(),
    constructorArgs: { feeCollector, salt, priceFeed },
  };
  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `crosschainbank8-${netName}.json`);
  fs.writeFileSync(outFile, JSON.stringify(record, null, 2));
  console.log(`Deployment record: ${outFile}`);

  console.log("");
  console.log("Next: update cyrusthegreat/.env with:");
  const envKey =
    netName === "sepolia" ? "VITE_CTGVAULT_ETH_TESTNET_CONTRACT"
    : netName === "bscTestnet" ? "VITE_CTGVAULT_BSC_TESTNET_CONTRACT"
    : netName === "baseSepolia" ? "VITE_CTGVAULT_BASE_TESTNET_CONTRACT"
    : `VITE_CTGVAULT_<${netName.toUpperCase()}>_CONTRACT`;
  console.log(`   ${envKey}=${addr}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
