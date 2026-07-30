/**
 * Block-explorer source verification for a previously-deployed CyrusTresor1.
 *
 * Re-loads the constructor arguments from the deployment record JSON written
 * by scripts/deployCyrusTresor1.ts and submits them to the appropriate
 * Etherscan/BSCScan/BaseScan instance via `hardhat-verify`.
 *
 * Usage:
 *   nvm use 22.19.0
 *   cd tools/hardhat-deploy
 *   npx hardhat run scripts/verify.ts --network sepolia
 *
 * Required env (in tools/hardhat-deploy/.env):
 *   ETHERSCAN_API_KEY        (for sepolia + mainnet)
 *   BSCSCAN_API_KEY          (for bscTestnet + bsc)
 *   BASESCAN_API_KEY         (for baseSepolia + base)
 *
 * Optional env:
 *   CONTRACT_NAME            defaults to "CyrusTresor1"
 *   FORCE=1                  bypass already-verified check and re-submit
 *
 * Side effects:
 *   - Submits a verification request to the block explorer (idempotent;
 *     re-submitting an already-verified contract is a no-op).
 *   - Does NOT modify the deployment record or any local files.
 *   - Does NOT cost gas (verification is off-chain).
 */

import { run, network } from "hardhat";
import fs from "fs";
import path from "path";

interface DeploymentRecord {
  network: string;
  chainId: number;
  contract: string;
  address: string;
  deployTx: string;
  deployer: string;
  blockNumber: number | null;
  timestamp: string;
  constructorArgs: {
    feeCollector: string;
    salt: string;
    priceFeed: string;
    poolTokens: string[];
    bucketSchedules: string[][]; // stringified bigints
    zkVerifier: string;
  };
}

async function main() {
  const contractName = process.env.CONTRACT_NAME || "CyrusTresor1";
  const recordPath = path.join(
    __dirname,
    "..",
    "deployments",
    `${contractName.toLowerCase()}-${network.name}.json`,
  );
  if (!fs.existsSync(recordPath)) {
    throw new Error(
      `No deployment record at ${recordPath}\n` +
        `Run scripts/deployCyrusTresor1.ts on this network first, or copy a record into deployments/.`,
    );
  }

  const record: DeploymentRecord = JSON.parse(fs.readFileSync(recordPath, "utf-8"));
  if (record.network !== network.name) {
    throw new Error(
      `Record network mismatch: file says "${record.network}", --network passed "${network.name}".`,
    );
  }

  // Re-hydrate the constructor args in the order the constructor expects them.
  // bucketSchedules came back as string[][] for JSON-safety; convert to BigInt[][].
  const args = [
    record.constructorArgs.feeCollector,
    record.constructorArgs.salt,
    record.constructorArgs.priceFeed,
    record.constructorArgs.poolTokens,
    record.constructorArgs.bucketSchedules.map((arr) => arr.map((s) => BigInt(s))),
    record.constructorArgs.zkVerifier,
  ];

  console.log(`Verifying ${contractName} at ${record.address} on ${network.name}…`);
  console.log(`  Deploy tx:     ${record.deployTx}`);
  console.log(`  Deployed:      ${record.timestamp}`);
  console.log(`  Deployer:      ${record.deployer}`);
  console.log("  Constructor args (in order):");
  console.log(`    feeCollector:    ${record.constructorArgs.feeCollector}`);
  console.log(`    salt:            ${record.constructorArgs.salt}`);
  console.log(`    priceFeed:       ${record.constructorArgs.priceFeed}`);
  console.log(`    poolTokens:      [${record.constructorArgs.poolTokens.join(", ")}]`);
  console.log(`    bucketSchedules: ${JSON.stringify(record.constructorArgs.bucketSchedules)}`);
  console.log(`    zkVerifier:      ${record.constructorArgs.zkVerifier}`);
  console.log("");

  try {
    await run("verify:verify", {
      address: record.address,
      constructorArguments: args,
      // Pin the exact contract source path so verify doesn't get confused if
      // another contract happens to share the name.
      contract: `contracts/evm/CyrusTresor1.sol:${contractName}`,
    });
    console.log("✅ Verification request submitted (or already verified).");
  } catch (e: any) {
    const msg = e?.message || String(e);
    if (/already verified/i.test(msg) && process.env.FORCE !== "1") {
      console.log("ℹ️  Contract is already verified on this explorer. Use FORCE=1 to re-submit.");
      return;
    }
    throw e;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
