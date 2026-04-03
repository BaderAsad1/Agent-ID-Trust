const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

/**
 * Test suite for AgentIDRegistrar.
 *
 * These tests use a MOCK ERC-8004 registry (deployed locally)
 * because we can't fork mainnet in basic Hardhat tests.
 *
 * The mock implements the same register() / transferFrom / setAgentURI
 * behavior as the real IdentityRegistryUpgradeable.
 */

describe("AgentIDRegistrar", function () {
  let registrar, registry;
  let owner, minter, platformWallet, user1, user2, attacker;

  // Deploy a minimal mock ERC-8004 registry for testing
  async function deployMockRegistry() {
    const MockFactory = await ethers.getContractFactory("MockERC8004");
    const mock = await MockFactory.deploy();
    await mock.waitForDeployment();
    return mock;
  }

  beforeEach(async function () {
    [owner, minter, platformWallet, user1, user2, attacker] = await ethers.getSigners();

    // Deploy mock registry
    registry = await deployMockRegistry();

    // Deploy registrar as UUPS proxy
    const AgentIDRegistrar = await ethers.getContractFactory("AgentIDRegistrar");
    registrar = await upgrades.deployProxy(
      AgentIDRegistrar,
      [
        await registry.getAddress(),
        minter.address,
        platformWallet.address,
        "https://api.getagent.id/v1/agent-card/"
      ],
      { initializer: "initialize", kind: "uups" }
    );
    await registrar.waitForDeployment();

    // Platform wallet approves registrar to move its NFTs
    await registry.connect(platformWallet).setApprovalForAll(await registrar.getAddress(), true);
  });

  // ═══════════════════════════════════════════════════
  //  INITIALIZATION
  // ═══════════════════════════════════════════════════

  describe("Initialization", function () {
    it("should set registry address correctly", async function () {
      expect(await registrar.registry()).to.equal(await registry.getAddress());
    });

    it("should set minter correctly", async function () {
      expect(await registrar.minter()).to.equal(minter.address);
    });

    it("should set platform wallet correctly", async function () {
      expect(await registrar.platformWallet()).to.equal(platformWallet.address);
    });

    it("should mark the platform wallet as an approved custody wallet", async function () {
      expect(await registrar.isCustodyWallet(platformWallet.address)).to.be.true;
    });

    it("should set base agent card URI correctly", async function () {
      expect(await registrar.baseAgentCardURI()).to.equal("https://api.getagent.id/v1/agent-card/");
    });

    it("should set owner to deployer", async function () {
      expect(await registrar.owner()).to.equal(owner.address);
    });

    it("should report version 1.2.0", async function () {
      expect(await registrar.version()).to.equal("1.2.0");
    });

    it("should start with 0 total handles", async function () {
      expect(await registrar.totalHandles()).to.equal(0);
    });

    it("should reject re-initialization", async function () {
      await expect(
        registrar.initialize(
          await registry.getAddress(),
          minter.address,
          platformWallet.address,
          "https://x.com/"
        )
      ).to.be.reverted;
    });
  });

  // ═══════════════════════════════════════════════════
  //  HANDLE REGISTRATION
  // ═══════════════════════════════════════════════════

  describe("registerHandle", function () {
    it("should register a valid handle", async function () {
      const tx = await registrar.connect(minter).registerHandle("openclaw", 3, 1900000000);
      await expect(tx).to.emit(registrar, "HandleRegistered");

      expect(await registrar.handleRegistered("openclaw")).to.be.true;
      expect(await registrar.totalHandles()).to.equal(1);
    });

    it("should register handle with agentId 0 correctly", async function () {
      // This tests the sentinel fix — first mint gets agentId 0
      await registrar.connect(minter).registerHandle("first", 3, 1900000000);
      expect(await registrar.handleRegistered("first")).to.be.true;

      const [agentId, , , ,] = await registrar.resolveHandle("first");
      expect(agentId).to.equal(0); // agentId 0 should work fine
    });

    it("should set correct tier", async function () {
      await registrar.connect(minter).registerHandle("abc", 1, 1900000000);
      expect(await registrar.handleTier("abc")).to.equal(1);
    });

    it("should set correct expiry", async function () {
      await registrar.connect(minter).registerHandle("test123", 3, 1900000000);
      expect(await registrar.handleExpiry("test123")).to.equal(1900000000);
    });

    it("should transfer NFT to platform wallet", async function () {
      await registrar.connect(minter).registerHandle("myagent", 3, 1900000000);
      const agentId = await registrar.handleToAgentId("myagent");
      expect(await registry.ownerOf(agentId)).to.equal(platformWallet.address);
    });

    it("should reject duplicate handle", async function () {
      await registrar.connect(minter).registerHandle("unique", 3, 1900000000);
      await expect(
        registrar.connect(minter).registerHandle("unique", 3, 1900000000)
      ).to.be.revertedWithCustomError(registrar, "HandleAlreadyRegistered");
    });

    it("should reject reserved handle", async function () {
      await registrar.connect(owner).reserveHandles(["admin"]);
      await expect(
        registrar.connect(minter).registerHandle("admin", 3, 1900000000)
      ).to.be.revertedWithCustomError(registrar, "HandleIsReserved");
    });

    it("should reject invalid tier 0", async function () {
      await expect(
        registrar.connect(minter).registerHandle("valid", 0, 1900000000)
      ).to.be.revertedWithCustomError(registrar, "InvalidTier");
    });

    it("should reject invalid tier 4", async function () {
      await expect(
        registrar.connect(minter).registerHandle("valid", 4, 1900000000)
      ).to.be.revertedWithCustomError(registrar, "InvalidTier");
    });

    it("should reject a 3-char handle with non-premium tier", async function () {
      await expect(
        registrar.connect(minter).registerHandle("abc", 2, 1900000000)
      ).to.be.revertedWithCustomError(registrar, "InvalidTier");
    });

    it("should reject a 4-char handle with non-standard tier", async function () {
      await expect(
        registrar.connect(minter).registerHandle("four", 1, 1900000000)
      ).to.be.revertedWithCustomError(registrar, "InvalidTier");
    });

    it("should reject a 5+ char handle with non-basic tier", async function () {
      await expect(
        registrar.connect(minter).registerHandle("basic", 2, 1900000000)
      ).to.be.revertedWithCustomError(registrar, "InvalidTier");
    });

    it("should reject non-minter caller", async function () {
      await expect(
        registrar.connect(attacker).registerHandle("hacked", 3, 1900000000)
      ).to.be.revertedWithCustomError(registrar, "OnlyMinter");
    });
  });

  // ═══════════════════════════════════════════════════
  //  HANDLE VALIDATION
  // ═══════════════════════════════════════════════════

  describe("Handle validation", function () {
    it("should reject too short (2 chars)", async function () {
      await expect(
        registrar.connect(minter).registerHandle("ab", 3, 1900000000)
      ).to.be.revertedWithCustomError(registrar, "HandleTooShort");
    });

    it("should accept minimum length (3 chars)", async function () {
      await registrar.connect(minter).registerHandle("abc", 1, 1900000000);
      expect(await registrar.handleRegistered("abc")).to.be.true;
    });

    it("should accept a 4-char handle with standard tier", async function () {
      await registrar.connect(minter).registerHandle("four", 2, 1900000000);
      expect(await registrar.handleRegistered("four")).to.be.true;
    });

    it("should reject too long (33 chars)", async function () {
      const long = "a".repeat(33);
      await expect(
        registrar.connect(minter).registerHandle(long, 3, 1900000000)
      ).to.be.revertedWithCustomError(registrar, "HandleTooLong");
    });

    it("should accept maximum length (32 chars)", async function () {
      const max = "a".repeat(32);
      await registrar.connect(minter).registerHandle(max, 3, 1900000000);
      expect(await registrar.handleRegistered(max)).to.be.true;
    });

    it("should reject uppercase", async function () {
      await expect(
        registrar.connect(minter).registerHandle("Hello", 3, 1900000000)
      ).to.be.revertedWithCustomError(registrar, "HandleInvalidChars");
    });

    it("should reject special characters", async function () {
      await expect(
        registrar.connect(minter).registerHandle("he!lo", 3, 1900000000)
      ).to.be.revertedWithCustomError(registrar, "HandleInvalidChars");
    });

    it("should reject starting hyphen", async function () {
      await expect(
        registrar.connect(minter).registerHandle("-hello", 3, 1900000000)
      ).to.be.revertedWithCustomError(registrar, "HandleInvalidChars");
    });

    it("should reject ending hyphen", async function () {
      await expect(
        registrar.connect(minter).registerHandle("hello-", 3, 1900000000)
      ).to.be.revertedWithCustomError(registrar, "HandleInvalidChars");
    });

    it("should accept middle hyphen", async function () {
      await registrar.connect(minter).registerHandle("my-agent", 3, 1900000000);
      expect(await registrar.handleRegistered("my-agent")).to.be.true;
    });

    it("should accept numbers", async function () {
      await registrar.connect(minter).registerHandle("agent42", 3, 1900000000);
      expect(await registrar.handleRegistered("agent42")).to.be.true;
    });

    it("should reject spaces", async function () {
      await expect(
        registrar.connect(minter).registerHandle("my agent", 3, 1900000000)
      ).to.be.revertedWithCustomError(registrar, "HandleInvalidChars");
    });
  });

  // ═══════════════════════════════════════════════════
  //  isHandleAvailable
  // ═══════════════════════════════════════════════════

  describe("isHandleAvailable", function () {
    it("should return true for available handle", async function () {
      const [available, reason] = await registrar.isHandleAvailable("newhandle");
      expect(available).to.be.true;
      expect(reason).to.equal("");
    });

    it("should return false for registered handle", async function () {
      await registrar.connect(minter).registerHandle("taken", 3, 1900000000);
      const [available, reason] = await registrar.isHandleAvailable("taken");
      expect(available).to.be.false;
      expect(reason).to.equal("Already registered");
    });

    it("should return false for reserved handle", async function () {
      await registrar.connect(owner).reserveHandles(["reserved"]);
      const [available, reason] = await registrar.isHandleAvailable("reserved");
      expect(available).to.be.false;
      expect(reason).to.equal("Reserved");
    });

    it("should return false for too short", async function () {
      const [available, reason] = await registrar.isHandleAvailable("ab");
      expect(available).to.be.false;
      expect(reason).to.equal("Too short (min 3)");
    });

    it("should return false for a retired handle", async function () {
      await registrar.connect(minter).registerHandle("expired", 3, 1);
      await ethers.provider.send("evm_increaseTime", [7776001]);
      await ethers.provider.send("evm_mine");
      await registrar.connect(owner).releaseHandle("expired");

      const [available, reason] = await registrar.isHandleAvailable("expired");
      expect(available).to.be.false;
      expect(reason).to.equal("Retired after on-chain anchoring");
    });
  });

  // ═══════════════════════════════════════════════════
  //  READERS
  // ═══════════════════════════════════════════════════

  describe("Read functions", function () {
    it("should return the current agent card URI", async function () {
      await registrar.connect(minter).registerHandle("card-test", 3, 1900000000);
      expect(await registrar.getAgentCardURI("card-test")).to.equal(
        "https://api.getagent.id/v1/agent-card/card-test"
      );
    });

    it("should reject getAgentCardURI for an unknown handle", async function () {
      await expect(
        registrar.getAgentCardURI("missing")
      ).to.be.revertedWithCustomError(registrar, "HandleNotRegistered");
    });

    it("should return the handle for an agentId", async function () {
      await registrar.connect(minter).registerHandle("lookup", 3, 1900000000);
      const agentId = await registrar.handleToAgentId("lookup");
      expect(await registrar.getHandleByAgentId(agentId)).to.equal("lookup");
    });

    it("should expose the reserved-handle getter", async function () {
      await registrar.connect(owner).reserveHandles(["reserved"]);
      const hash = ethers.keccak256(ethers.toUtf8Bytes("reserved"));
      expect(await registrar.reserved(hash)).to.be.true;
    });

    it("should expose whether a handle has been retired", async function () {
      await registrar.connect(minter).registerHandle("expired", 3, 1);
      await ethers.provider.send("evm_increaseTime", [7776001]);
      await ethers.provider.send("evm_mine");
      await registrar.connect(owner).releaseHandle("expired");

      expect(await registrar.handleRetired("expired")).to.be.true;
    });
  });

  // ═══════════════════════════════════════════════════
  //  RENEWAL
  // ═══════════════════════════════════════════════════

  describe("renewHandle", function () {
    it("should update expiry", async function () {
      await registrar.connect(minter).registerHandle("renew-me", 3, 1900000000);
      await registrar.connect(minter).renewHandle("renew-me", 2000000000);
      expect(await registrar.handleExpiry("renew-me")).to.equal(2000000000);
    });

    it("should reject non-minter", async function () {
      await registrar.connect(minter).registerHandle("renew-me", 3, 1900000000);
      await expect(
        registrar.connect(attacker).renewHandle("renew-me", 2000000000)
      ).to.be.revertedWithCustomError(registrar, "OnlyMinter");
    });

    it("should reject unregistered handle", async function () {
      await expect(
        registrar.connect(minter).renewHandle("nonexistent", 2000000000)
      ).to.be.revertedWithCustomError(registrar, "HandleNotRegistered");
    });

    it("should reject non-increasing expiry", async function () {
      await registrar.connect(minter).registerHandle("renew-me", 3, 1900000000);
      await expect(
        registrar.connect(minter).renewHandle("renew-me", 1900000000)
      ).to.be.revertedWithCustomError(registrar, "ExpiryMustIncrease");
    });

    it("should reject renewing to a past timestamp", async function () {
      await registrar.connect(minter).registerHandle("renew-old", 3, 1);
      await ethers.provider.send("evm_setNextBlockTimestamp", [1800000000]);
      await ethers.provider.send("evm_mine");

      await expect(
        registrar.connect(minter).renewHandle("renew-old", 1700000000)
      ).to.be.revertedWithCustomError(registrar, "ExpiryMustBeInFuture");
    });
  });

  // ═══════════════════════════════════════════════════
  //  TRANSFER TO USER
  // ═══════════════════════════════════════════════════

  describe("transferToUser", function () {
    it("should transfer NFT to user wallet", async function () {
      await registrar.connect(minter).registerHandle("claim-me", 3, 1900000000);
      await registrar.connect(minter).transferToUser("claim-me", user1.address);

      const agentId = await registrar.handleToAgentId("claim-me");
      expect(await registry.ownerOf(agentId)).to.equal(user1.address);
    });

    it("should reject zero address", async function () {
      await registrar.connect(minter).registerHandle("claim-me", 3, 1900000000);
      await expect(
        registrar.connect(minter).transferToUser("claim-me", ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(registrar, "ZeroAddress");
    });

    it("should reject non-minter", async function () {
      await registrar.connect(minter).registerHandle("claim-me", 3, 1900000000);
      await expect(
        registrar.connect(attacker).transferToUser("claim-me", user1.address)
      ).to.be.revertedWithCustomError(registrar, "OnlyMinter");
    });

    it("should still transfer from the original custody wallet after platform wallet rotation", async function () {
      await registrar.connect(minter).registerHandle("claim-me", 3, 1900000000);

      await registrar.connect(owner).setPlatformWallet(user2.address);

      await registrar.connect(minter).transferToUser("claim-me", user1.address);

      const agentId = await registrar.handleToAgentId("claim-me");
      expect(await registry.ownerOf(agentId)).to.equal(user1.address);
    });

    it("should reject transfers once a handle is no longer in platform custody", async function () {
      await registrar.connect(minter).registerHandle("claim-me", 3, 1900000000);
      await registrar.connect(minter).transferToUser("claim-me", user1.address);

      await registry.connect(user1).setApprovalForAll(await registrar.getAddress(), true);

      await expect(
        registrar.connect(minter).transferToUser("claim-me", user2.address)
      ).to.be.revertedWithCustomError(registrar, "HandleNotInCustody");
    });

    it("should reject claims from a revoked custody wallet even if approval still exists", async function () {
      await registrar.connect(minter).registerHandle("claim-me", 3, 1900000000);
      await registrar.connect(owner).setPlatformWallet(user2.address);
      await registrar.connect(owner).setCustodyWallet(platformWallet.address, false);

      await expect(
        registrar.connect(minter).transferToUser("claim-me", user1.address)
      ).to.be.revertedWithCustomError(registrar, "HandleNotInCustody");
    });
  });

  // ═══════════════════════════════════════════════════
  //  SUSPEND / REACTIVATE / RELEASE
  // ═══════════════════════════════════════════════════

  describe("Suspend / Reactivate / Release", function () {
    beforeEach(async function () {
      await registrar.connect(minter).registerHandle("managed", 3, 1900000000);
    });

    it("should suspend a handle", async function () {
      await registrar.connect(owner).suspendHandle("managed");
      expect(await registrar.handleActive("managed")).to.be.false;
    });

    it("should reactivate a handle", async function () {
      await registrar.connect(owner).suspendHandle("managed");
      await registrar.connect(owner).reactivateHandle("managed");
      expect(await registrar.handleActive("managed")).to.be.true;
    });

    it("should reject suspend from non-owner", async function () {
      await expect(
        registrar.connect(minter).suspendHandle("managed")
      ).to.be.reverted; // OwnableUnauthorizedAccount
    });

    it("should reject release before grace period", async function () {
      await expect(
        registrar.connect(owner).releaseHandle("managed")
      ).to.be.revertedWithCustomError(registrar, "GracePeriodActive");
    });

    it("should release after grace period", async function () {
      // Register with expiry in the past
      await registrar.connect(minter).registerHandle("expired", 3, 1); // expired at timestamp 1
      // Fast forward time past grace period (90 days = 7776000 seconds)
      await ethers.provider.send("evm_increaseTime", [7776001]);
      await ethers.provider.send("evm_mine");

      await registrar.connect(owner).releaseHandle("expired");
      expect(await registrar.handleRegistered("expired")).to.be.false;
      expect(await registrar.handleRetired("expired")).to.be.true;
      expect(await registrar.totalHandles()).to.equal(1); // "managed" still exists
    });

    it("should scrub ERC-8004 metadata for a released handle that is still in approved custody", async function () {
      await registrar.connect(minter).registerHandle("expired", 3, 1);
      const agentId = await registrar.handleToAgentId("expired");

      await ethers.provider.send("evm_increaseTime", [7776001]);
      await ethers.provider.send("evm_mine");

      await registrar.connect(owner).releaseHandle("expired");

      expect(await registry.getMetadata(agentId, "agentid.handle")).to.equal("0x");
      expect(await registry.getMetadata(agentId, "agentid.tier")).to.equal("0x");
      expect(await registry.getMetadata(agentId, "agentid.status")).to.equal(
        ethers.hexlify(ethers.toUtf8Bytes("released"))
      );
      expect(await registry.tokenURI(agentId)).to.equal(
        "https://api.getagent.id/v1/agent-card/_released"
      );
    });

    it("should not allow a released handle to be registered again", async function () {
      await registrar.connect(minter).registerHandle("expired", 3, 1);

      await ethers.provider.send("evm_increaseTime", [7776001]);
      await ethers.provider.send("evm_mine");

      await registrar.connect(owner).releaseHandle("expired");

      await expect(
        registrar.connect(minter).registerHandle("expired", 3, 1900000000)
      ).to.be.revertedWithCustomError(registrar, "HandleRetired");
    });

    it("should retire a released handle even if the old NFT is already user-owned", async function () {
      await registrar.connect(minter).registerHandle("expired", 3, 1);
      const agentId = await registrar.handleToAgentId("expired");
      await registrar.connect(minter).transferToUser("expired", user1.address);

      await ethers.provider.send("evm_increaseTime", [7776001]);
      await ethers.provider.send("evm_mine");

      await registrar.connect(owner).releaseHandle("expired");

      expect(await registrar.handleRegistered("expired")).to.be.false;
      expect(await registrar.handleRetired("expired")).to.be.true;
      expect(await registry.ownerOf(agentId)).to.equal(user1.address);
      expect(await registry.getMetadata(agentId, "agentid.handle")).to.equal(
        ethers.hexlify(ethers.toUtf8Bytes("expired"))
      );
    });
  });

  // ═══════════════════════════════════════════════════
  //  ADMIN
  // ═══════════════════════════════════════════════════

  describe("Admin functions", function () {
    it("should allow owner to change minter", async function () {
      await registrar.connect(owner).setMinter(user2.address);
      expect(await registrar.minter()).to.equal(user2.address);
    });

    it("should reject non-owner changing minter", async function () {
      await expect(
        registrar.connect(attacker).setMinter(attacker.address)
      ).to.be.reverted;
    });

    it("should reject zero address for minter", async function () {
      await expect(
        registrar.connect(owner).setMinter(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(registrar, "ZeroAddress");
    });

    it("should allow owner to update the base agent card URI", async function () {
      await registrar.connect(owner).setBaseAgentCardURI("https://new.example/");
      expect(await registrar.baseAgentCardURI()).to.equal("https://new.example/");
    });

    it("should support two-step ownership transfers", async function () {
      await registrar.connect(owner).transferOwnership(user2.address);
      expect(await registrar.pendingOwner()).to.equal(user2.address);

      await registrar.connect(user2).acceptOwnership();
      expect(await registrar.owner()).to.equal(user2.address);
    });

    it("should unreserve a handle", async function () {
      await registrar.connect(owner).reserveHandles(["freed"]);
      await registrar.connect(owner).unreserveHandle("freed");
      const [available] = await registrar.isHandleAvailable("freed");
      expect(available).to.be.true;
    });

    it("should mark a new platform wallet as a custody wallet", async function () {
      await registrar.connect(owner).setPlatformWallet(user2.address);
      expect(await registrar.platformWallet()).to.equal(user2.address);
      expect(await registrar.isCustodyWallet(user2.address)).to.be.true;
      expect(await registrar.isCustodyWallet(platformWallet.address)).to.be.true;
    });

    it("should allow owner to manage custody wallet approvals", async function () {
      await registrar.connect(owner).setCustodyWallet(user2.address, true);
      expect(await registrar.isCustodyWallet(user2.address)).to.be.true;

      await registrar.connect(owner).setCustodyWallet(user2.address, false);
      expect(await registrar.isCustodyWallet(user2.address)).to.be.false;
    });

    it("should keep the current platform wallet on the custody allowlist", async function () {
      await expect(
        registrar.connect(owner).setCustodyWallet(platformWallet.address, false)
      ).to.be.revertedWithCustomError(registrar, "PlatformWalletMustRemainCustodyWallet");
    });

    it("should reject zero address for custody wallet updates", async function () {
      await expect(
        registrar.connect(owner).setCustodyWallet(ethers.ZeroAddress, true)
      ).to.be.revertedWithCustomError(registrar, "ZeroAddress");
    });
  });

  // ═══════════════════════════════════════════════════
  //  PAUSING
  // ═══════════════════════════════════════════════════

  describe("Pausing", function () {
    beforeEach(async function () {
      await registrar.connect(minter).registerHandle("paused", 3, 1900000000);
    });

    it("should allow owner to pause and unpause", async function () {
      await registrar.connect(owner).pause();
      expect(await registrar.paused()).to.be.true;

      await registrar.connect(owner).unpause();
      expect(await registrar.paused()).to.be.false;
    });

    it("should reject pausing from non-owner", async function () {
      await expect(
        registrar.connect(attacker).pause()
      ).to.be.reverted;
    });

    it("should block registerHandle while paused", async function () {
      await registrar.connect(owner).pause();
      await expect(
        registrar.connect(minter).registerHandle("blocked", 3, 1900000000)
      ).to.be.revertedWithCustomError(registrar, "EnforcedPause");
    });

    it("should block renewHandle while paused", async function () {
      await registrar.connect(owner).pause();
      await expect(
        registrar.connect(minter).renewHandle("paused", 2000000000)
      ).to.be.revertedWithCustomError(registrar, "EnforcedPause");
    });

    it("should block transferToUser while paused", async function () {
      await registrar.connect(owner).pause();
      await expect(
        registrar.connect(minter).transferToUser("paused", user1.address)
      ).to.be.revertedWithCustomError(registrar, "EnforcedPause");
    });

    it("should block updateAgentCardURI while paused", async function () {
      await registrar.connect(owner).pause();
      await expect(
        registrar.connect(minter).updateAgentCardURI("paused", "https://new.example/card")
      ).to.be.revertedWithCustomError(registrar, "EnforcedPause");
    });
  });

  // ═══════════════════════════════════════════════════
  //  UPGRADEABLE
  // ═══════════════════════════════════════════════════

  describe("Upgradeability", function () {
    it("should preserve state after upgrade", async function () {
      // Register a handle
      await registrar.connect(minter).registerHandle("survives", 3, 1900000000);
      await registrar.connect(owner).setCustodyWallet(user2.address, true);

      // Upgrade
      const AgentIDRegistrar = await ethers.getContractFactory("AgentIDRegistrar");
      const upgraded = await upgrades.upgradeProxy(await registrar.getAddress(), AgentIDRegistrar, { kind: "uups" });

      // State should be preserved
      expect(await upgraded.handleRegistered("survives")).to.be.true;
      expect(await upgraded.totalHandles()).to.equal(1);
      expect(await upgraded.minter()).to.equal(minter.address);
      expect(await upgraded.isCustodyWallet(user2.address)).to.be.true;
    });

    it("should reject upgrade from non-owner", async function () {
      const AgentIDRegistrar = await ethers.getContractFactory("AgentIDRegistrar", attacker);
      await expect(
        upgrades.upgradeProxy(await registrar.getAddress(), AgentIDRegistrar, { kind: "uups" })
      ).to.be.reverted;
    });
  });
});
