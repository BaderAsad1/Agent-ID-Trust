import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying AgentIDHandle with account:", deployer.address);

  const chainName = process.env.CHAIN_NAME || "base";
  const minterAddress = process.env.BASE_PLATFORM_WALLET || deployer.address;
  const baseMetadataURI = process.env.BASE_METADATA_URI || "https://getagent.id/api/v1/metadata/";

  console.log("Chain:", chainName);
  console.log("Minter:", minterAddress);
  console.log("Base Metadata URI:", baseMetadataURI);

  const AgentIDHandle = await ethers.getContractFactory("AgentIDHandle");
  const contract = await AgentIDHandle.deploy(
    deployer.address,
    minterAddress,
    baseMetadataURI,
  );

  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log("\nAgentIDHandle deployed to:", address);
  console.log("\nAdd to env:");
  console.log(`BASE_HANDLE_CONTRACT=${address}`);
  console.log(`BASE_PLATFORM_WALLET=${minterAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
