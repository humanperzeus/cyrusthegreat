/**
 * Deploys MockV3Aggregator (contracts/evm/mocks/MockV3Aggregator.sol) to the
 * network selected via `--network <name>`. ONLY use on chains where no real
 * Chainlink native/USD feed exists. Currently: HyperEVM Testnet (chainId 998).
 *
 * Why a script of its own (not a step inside deployCyrusTresor1.ts):
 *   - Keeps each script single-intent per Rule 1.
 *   - Operator visually confirms the printed mock address, pastes it into
 *     PRICE_FEEDS["hyperEvmTestnet"] (or sets PRICE_FEED_OVERRIDE env), then
 *     runs the CyrusTresor1 deploy with explicit knowledge of the oracle.
 *   - Same posture as the foundry-test MockV3Aggregator: testnet-only,
 *     per workflow_rules.md Rule 10.
 *
 * Usage:
 *   cd tools/hardhat-deploy
 *   npx hardhat run scripts/deployMockPriceFeed.ts --network hyperEvmTestnet
 *
 * Env overrides:
 *   MOCK_PRICE_USD       price in whole USD (default "40")
 *   MOCK_PRICE_DECIMALS  decimals (default "8" — matches real Chainlink USD feeds)
 *   DRY_RUN=1            print args + estimated gas, no submit
 */

import { ethers, network } from "hardhat";
import fs from "fs";
import path from "path";

function envOr(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : fallback;
}

async function main() {
  const netName = network.name;
  const priceUsd = Number(envOr("MOCK_PRICE_USD", "40")!);
  const decimals = Number(envOr("MOCK_PRICE_DECIMALS", "8")!);
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
    throw new Error(`MOCK_PRICE_USD must be a positive number; got ${priceUsd}`);
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error(`MOCK_PRICE_DECIMALS must be 0..18; got ${decimals}`);
  }
  const answer = BigInt(Math.round(priceUsd * 10 ** decimals));

  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error(
      `No signer for network "${netName}". Set the private-key env (e.g. HYPER_TESTNET_PRIVATE_KEY) in tools/hardhat-deploy/.env.`,
    );
  }

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Network:        ${netName} (chainId ${network.config.chainId})`);
  console.log(`Deployer:       ${deployer.address}`);
  console.log(`Balance:        ${ethers.formatEther(balance)} (native)`);
  console.log(`Mock price:     ${priceUsd} USD (${decimals} dec → answer = ${answer.toString()})`);

  if (envOr("DRY_RUN") === "1") {
    const Factory = await ethers.getContractFactory(
      "contracts/evm/mocks/MockV3Aggregator.sol:MockV3Aggregator",
    );
    const deployTx = await Factory.getDeployTransaction(decimals, answer);
    const est = await ethers.provider.estimateGas(deployTx);
    console.log("");
    console.log(`DRY_RUN — estimated gas: ${est.toString()}`);
    console.log("DRY_RUN — no transaction submitted.");
    return;
  }

  console.log("\nSubmitting deploy tx…");
  const Factory = await ethers.getContractFactory(
    "contracts/evm/mocks/MockV3Aggregator.sol:MockV3Aggregator",
  );
  const mock = await Factory.deploy(decimals, answer);
  const dtx = mock.deploymentTransaction();
  console.log(`Tx hash:        ${dtx?.hash}`);

  console.log("Waiting for confirmation…");
  await mock.waitForDeployment();
  const addr = await mock.getAddress();
  console.log(`✅ MockV3Aggregator deployed at: ${addr}`);

  const record = {
    network: netName,
    chainId: Number(network.config.chainId),
    contract: "MockV3Aggregator",
    address: addr,
    deployTx: dtx?.hash,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    constructorArgs: { decimals, answer: answer.toString(), priceUsd },
    note:
      "Testnet-only mock — never deploy on mainnet. Permissionless setPrice(). " +
      "Replace with a real Chainlink (or Pyth-adapter) feed before any mainnet path.",
  };
  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `mock-pricefeed-${netName}.json`);
  fs.writeFileSync(outFile, JSON.stringify(record, null, 2));
  console.log(`Deployment record: ${outFile}`);

  console.log("");
  console.log("Next step:");
  console.log(`  Either set PRICE_FEED_OVERRIDE=${addr} in your shell, OR paste`);
  console.log(`  this address into PRICE_FEEDS["${netName}"] in deployCyrusTresor1.ts,`);
  console.log(`  then run:`);
  console.log(`     npx hardhat run scripts/deployCyrusTresor1.ts --network ${netName}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
