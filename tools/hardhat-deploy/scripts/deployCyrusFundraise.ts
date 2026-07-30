/**
 * Deploys CyrusFundraise.sol to the network selected via `--network <name>`.
 *
 * CyrusFundraise has a NO-ARG constructor (non-custodial registry, no price
 * feed, no buckets), so this is the simplest deploy in the repo.
 *
 * Usage:
 *   nvm use 22.19.0
 *   cd tools/hardhat-deploy
 *   npx hardhat run scripts/deployCyrusFundraise.ts --network sepolia
 *
 * Required env (in tools/hardhat-deploy/.env):
 *   SEPOLIA_RPC_URL      (or the matching *_RPC_URL for the chosen network)
 *   SEPOLIA_PRIVATE_KEY  (forever-Sepolia-only burner per Rule 10)
 *
 * Optional env:
 *   FEE_COLLECTOR        who receives the 0.1% platform fee. Defaults to the
 *                        deployer address (the burner) if unset.
 *   DRY_RUN=1            print deployer + estimated gas, but do NOT submit
 *
 * Side effects:
 *   - Submits ONE tx (the constructor) — costs gas. None on DRY_RUN=1.
 *   - Writes a deployment record JSON to tools/hardhat-deploy/deployments/.
 */

import { ethers, network } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const netName = network.name;
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error(
      "No signer — set SEPOLIA_PRIVATE_KEY (or the matching key) in tools/hardhat-deploy/.env",
    );
  }

  // Fee collector: explicit FEE_COLLECTOR env, else the deployer itself.
  const feeCollector =
    process.env.FEE_COLLECTOR && process.env.FEE_COLLECTOR.length > 0
      ? process.env.FEE_COLLECTOR
      : deployer.address;

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Network:       ${netName}`);
  console.log(`Deployer:      ${deployer.address}`);
  console.log(`Balance:       ${ethers.formatEther(balance)} (native)`);
  console.log(`Fee collector: ${feeCollector}  (0.1% of donations)`);

  const Factory = await ethers.getContractFactory("CyrusFundraise");
  const deployTx = await Factory.getDeployTransaction(feeCollector);
  const estGas = await ethers.provider.estimateGas({ ...deployTx, from: deployer.address });
  console.log(`Est. gas:      ${estGas.toString()}`);

  if (process.env.DRY_RUN === "1") {
    console.log("DRY_RUN=1 → not submitting. Remove DRY_RUN to deploy for real.");
    return;
  }

  console.log("Deploying CyrusFundraise…");
  const contract = await Factory.deploy(feeCollector);
  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log(`Deployed CyrusFundraise at: ${addr}`);

  // Sanity reads — fresh deploy: nextId=1, feeCollector wired, FEE_BPS=10.
  const nextId = await contract.nextId();
  const wiredFeeCollector = await contract.feeCollector();
  const feeBps = await contract.FEE_BPS();
  console.log(`Sanity: nextId=${nextId} (exp 1), feeCollector=${wiredFeeCollector}, FEE_BPS=${feeBps} (exp 10)`);

  const record = {
    contract: "CyrusFundraise",
    network: netName,
    address: addr,
    deployer: deployer.address,
    txHash: contract.deploymentTransaction()?.hash ?? null,
    timestamp: new Date().toISOString(),
    constructorArgs: { feeCollector },
  };
  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `cyrusfundraise-${netName}.json`);
  fs.writeFileSync(outFile, JSON.stringify(record, null, 2));
  console.log(`Deployment record: ${outFile}`);

  console.log("");
  console.log("Next steps:");
  console.log(`  1. Add the address to cyrusthegreat/.env:`);
  console.log(`     VITE_CYRUSFUNDRAISE_${netName.toUpperCase()}_CONTRACT=${addr}`);
  console.log(`  2. Sync to Cloudflare dashboard via tools/cf-sync-env.sh`);
  console.log(`  3. Wire the frontend (useFundraise hook + Fundraise/Fund pages).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
