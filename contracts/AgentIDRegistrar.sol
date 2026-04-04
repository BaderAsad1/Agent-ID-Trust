// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

struct MetadataEntry {
    string metadataKey;
    bytes metadataValue;
}

interface IERC8004 {
    function register(string memory agentURI, MetadataEntry[] memory metadata) external returns (uint256 agentId);
    function register(string memory agentURI) external returns (uint256 agentId);
    function setAgentURI(uint256 agentId, string calldata newURI) external;
    function setMetadata(uint256 agentId, string memory metadataKey, bytes memory metadataValue) external;
    function ownerOf(uint256 tokenId) external view returns (address);
    function transferFrom(address from, address to, uint256 tokenId) external;
    function tokenURI(uint256 tokenId) external view returns (string memory);
    function getMetadata(uint256 agentId, string memory metadataKey) external view returns (bytes memory);
    function getAgentWallet(uint256 agentId) external view returns (address);
    function setApprovalForAll(address operator, bool approved) external;
    function isApprovedForAll(address owner, address operator) external view returns (bool);
}

/**
 * @title AgentIDRegistrar v1.2.0
 * @notice UUPS-upgradeable .agentid namespace registrar for ERC-8004 Identity Registries.
 * @dev See docs/DEVELOPER-GUIDE.md for full explanation.
 *
 *  Built against IdentityRegistryUpgradeable v2.0.0 source code.
 *
 *  Mainnet registry: 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
 *  Testnet registry: 0x8004A818BFB912233c491871b3d84c89A494BD9e
 */
contract AgentIDRegistrar is
    Initializable,
    Ownable2StepUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    IERC721Receiver
{
    // ═══════════════════════════════════════════════════════════
    //  STORAGE
    // ═══════════════════════════════════════════════════════════

    /// @custom:storage-location erc7201:agentid.registrar.storage
    struct RegistrarStorage {
        IERC8004 registry;
        address minter;
        address platformWallet;
        string baseAgentCardURI;

        mapping(string => uint256) handleToAgentId;
        mapping(uint256 => string) agentIdToHandle;
        mapping(string => uint8) handleTier;
        mapping(string => uint256) handleExpiry;
        mapping(string => bool) handleActive;
        mapping(string => bool) handleRegistered; // FIX #1: separate from agentId to handle id=0
        mapping(bytes32 => bool) reserved;
        uint256 totalHandles;
        mapping(address => bool) custodyWallets;
        mapping(string => bool) handleRetired;
    }

    // keccak256(abi.encode(uint256(keccak256("agentid.registrar.storage")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant STORAGE_LOCATION =
        0xabad143de99b314d4a8cea60675c49d560c6fc254053ababcd048e7126f23c00;

    function _getStorage() private pure returns (RegistrarStorage storage $) {
        bytes32 slot = STORAGE_LOCATION;
        assembly {
            $.slot := slot
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════

    event HandleRegistered(string handle, uint256 indexed agentId, address indexed custodian, uint8 tier, uint256 expiresAt);
    event HandleRenewed(string handle, uint256 newExpiry);
    event HandleTransferred(string handle, uint256 indexed agentId, address indexed from, address indexed to);
    event HandleSuspended(string handle);
    event HandleReactivated(string handle);
    event HandleReleased(string handle, uint256 indexed agentId);
    event MinterUpdated(address indexed oldMinter, address indexed newMinter);
    event PlatformWalletUpdated(address indexed oldWallet, address indexed newWallet);
    event CustodyWalletUpdated(address indexed wallet, bool approved);
    event BaseAgentCardURIUpdated(string oldURI, string newURI);

    // ═══════════════════════════════════════════════════════════
    //  ERRORS
    // ═══════════════════════════════════════════════════════════

    error OnlyMinter();
    error HandleAlreadyRegistered();
    error HandleIsReserved();
    error HandleInvalidChars();
    error HandleTooShort();
    error HandleTooLong();
    error HandleNotRegistered();
    error HandleNotInCustody();
    error InvalidTier();
    error HandleRetired();
    error ExpiryMustIncrease();
    error ExpiryMustBeInFuture();
    error PlatformWalletMustRemainCustodyWallet();
    error ZeroAddress();
    error GracePeriodActive();

    // ═══════════════════════════════════════════════════════════
    //  MODIFIER
    // ═══════════════════════════════════════════════════════════

    modifier onlyMinter() {
        RegistrarStorage storage $ = _getStorage();
        if (msg.sender != $.minter) revert OnlyMinter();
        _;
    }

    // ═══════════════════════════════════════════════════════════
    //  CONSTRUCTOR + INITIALIZER
    // ═══════════════════════════════════════════════════════════

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the registrar. Called once after proxy deployment.
     * @param _registry      ERC-8004 IdentityRegistry address on this chain
     * @param _minter        Backend relayer wallet address
     * @param _platformWallet Platform custody wallet address
     * @param _baseAgentCardURI Base URI for agent cards (e.g. "https://api.getagent.id/v1/agent-card/")
     */
    function initialize(
        address _registry,
        address _minter,
        address _platformWallet,
        string memory _baseAgentCardURI
    ) public initializer {
        if (_registry == address(0)) revert ZeroAddress();
        if (_minter == address(0)) revert ZeroAddress();
        if (_platformWallet == address(0)) revert ZeroAddress();

        __Ownable_init(msg.sender);
        __Ownable2Step_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        RegistrarStorage storage $ = _getStorage();
        $.registry = IERC8004(_registry);
        $.minter = _minter;
        $.platformWallet = _platformWallet;
        $.baseAgentCardURI = _baseAgentCardURI;
        $.custodyWallets[_platformWallet] = true;
    }

    // ═══════════════════════════════════════════════════════════
    //  CORE: REGISTER HANDLE
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Register a .agentid handle by minting an ERC-8004 identity.
     * @dev Called by backend minter AFTER payment verified off-chain.
     *
     *  Flow:
     *   1. Validate handle + tier
     *   2. Check not registered, not reserved
     *   3. Call registry.register(agentCardURI, metadata[])
     *      → registry._safeMint(this, agentId) → triggers onERC721Received
     *      → registry sets agentWallet = address(this)
     *      → registry stores our metadata ("agentid.handle", "agentid.tier")
     *   4. Transfer NFT to platformWallet
     *      → registry._update() clears agentWallet (by design)
     *   5. Store namespace mapping
     *
     * @param handle    3-32 chars, lowercase a-z 0-9 hyphens, no start/end hyphen
     * @param tier      1=premium(3char), 2=standard(4char), 3=basic(5+)
     * @param expiresAt Unix timestamp when registration expires
     * @return agentId  The ERC-8004 tokenId assigned
     */
    function registerHandle(
        string calldata handle,
        uint8 tier,
        uint256 expiresAt
    ) external onlyMinter whenNotPaused nonReentrant returns (uint256 agentId) {
        RegistrarStorage storage $ = _getStorage();

        // ── Validate ─────────────────────────────────────
        _validateHandle(handle);
        if ($.handleRegistered[handle]) revert HandleAlreadyRegistered();
        if ($.handleRetired[handle]) revert HandleRetired();
        if ($.reserved[keccak256(abi.encodePacked(handle))]) revert HandleIsReserved();
        _validateTier(handle, tier);

        // ── Build agent card URI ─────────────────────────
        string memory agentCardURI = string.concat($.baseAgentCardURI, handle);

        // ── Build metadata array ─────────────────────────
        // "agentWallet" is RESERVED by registry — do not include
        MetadataEntry[] memory metadata = new MetadataEntry[](2);
        metadata[0] = MetadataEntry("agentid.handle", abi.encodePacked(handle));
        metadata[1] = MetadataEntry("agentid.tier", abi.encodePacked(tier));

        // ── Mint on ERC-8004 ─────────────────────────────
        agentId = $.registry.register(agentCardURI, metadata);

        // ── Transfer to platform custody ─────────────────
        $.registry.transferFrom(address(this), $.platformWallet, agentId);

        // ── Store namespace ──────────────────────────────
        $.handleToAgentId[handle] = agentId;
        $.agentIdToHandle[agentId] = handle;
        $.handleTier[handle] = tier;
        $.handleExpiry[handle] = expiresAt;
        $.handleActive[handle] = true;
        $.handleRegistered[handle] = true;

        unchecked { $.totalHandles++; }

        emit HandleRegistered(handle, agentId, $.platformWallet, tier, expiresAt);
    }

    // ═══════════════════════════════════════════════════════════
    //  RENEWAL
    // ═══════════════════════════════════════════════════════════

    function renewHandle(string calldata handle, uint256 newExpiry) external onlyMinter whenNotPaused {
        RegistrarStorage storage $ = _getStorage();
        if (!$.handleRegistered[handle]) revert HandleNotRegistered();
        if (newExpiry <= $.handleExpiry[handle]) revert ExpiryMustIncrease();
        if (newExpiry <= block.timestamp) revert ExpiryMustBeInFuture();
        $.handleExpiry[handle] = newExpiry;
        emit HandleRenewed(handle, newExpiry);
    }

    // ═══════════════════════════════════════════════════════════
    //  TRANSFER TO USER (CLAIM)
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Transfer an NFT from platform custody to a user's wallet.
     * @dev Prerequisite: platformWallet must have called
     *      registry.setApprovalForAll(address(this), true)
     */
    function transferToUser(
        string calldata handle,
        address userWallet
    ) external onlyMinter whenNotPaused nonReentrant {
        if (userWallet == address(0)) revert ZeroAddress();
        RegistrarStorage storage $ = _getStorage();
        if (!$.handleRegistered[handle]) revert HandleNotRegistered();
        uint256 agentId = $.handleToAgentId[handle];
        address currentOwner = $.registry.ownerOf(agentId);
        if (!$.custodyWallets[currentOwner]) revert HandleNotInCustody();

        $.registry.transferFrom(currentOwner, userWallet, agentId);
        emit HandleTransferred(handle, agentId, currentOwner, userWallet);
    }

    // ═══════════════════════════════════════════════════════════
    //  UPDATE AGENT CARD URI
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Update the agentURI for a handle's ERC-8004 identity.
     * @dev Only works while NFT is in platform custody (or this contract is approved operator).
     */
    function updateAgentCardURI(
        string calldata handle,
        string calldata newURI
    ) external onlyMinter whenNotPaused {
        RegistrarStorage storage $ = _getStorage();
        if (!$.handleRegistered[handle]) revert HandleNotRegistered();
        uint256 agentId = $.handleToAgentId[handle];
        $.registry.setAgentURI(agentId, newURI);
    }

    // ═══════════════════════════════════════════════════════════
    //  READ FUNCTIONS
    // ═══════════════════════════════════════════════════════════

    function resolveHandle(string calldata handle) external view returns (
        uint256 agentId,
        address nftOwner,
        uint8 tier,
        bool active,
        bool expired
    ) {
        RegistrarStorage storage $ = _getStorage();
        if (!$.handleRegistered[handle]) revert HandleNotRegistered();
        agentId = $.handleToAgentId[handle];
        nftOwner = $.registry.ownerOf(agentId);
        tier = $.handleTier[handle];
        active = $.handleActive[handle];
        expired = block.timestamp > $.handleExpiry[handle];
    }

    function isHandleAvailable(string calldata handle) external view returns (bool available, string memory reason) {
        RegistrarStorage storage $ = _getStorage();
        uint256 len = bytes(handle).length;
        if (len < 3) return (false, "Too short (min 3)");
        if (len > 32) return (false, "Too long (max 32)");
        if (!_isValidChars(handle)) return (false, "Invalid chars (a-z 0-9 hyphens)");
        if ($.reserved[keccak256(abi.encodePacked(handle))]) return (false, "Reserved");
        if ($.handleRetired[handle]) return (false, "Retired after on-chain anchoring");
        if ($.handleRegistered[handle]) return (false, "Already registered");
        return (true, "");
    }

    function getAgentCardURI(string calldata handle) external view returns (string memory) {
        RegistrarStorage storage $ = _getStorage();
        if (!$.handleRegistered[handle]) revert HandleNotRegistered();
        uint256 agentId = $.handleToAgentId[handle];
        return $.registry.tokenURI(agentId);
    }

    function getHandleByAgentId(uint256 agentId) external view returns (string memory) {
        RegistrarStorage storage $ = _getStorage();
        return $.agentIdToHandle[agentId];
    }

    // ═══════════════════════════════════════════════════════════
    //  PUBLIC STATE READERS
    // ═══════════════════════════════════════════════════════════

    function registry() external view returns (address) {
        return address(_getStorage().registry);
    }

    function minter() external view returns (address) {
        return _getStorage().minter;
    }

    function platformWallet() external view returns (address) {
        return _getStorage().platformWallet;
    }

    function baseAgentCardURI() external view returns (string memory) {
        return _getStorage().baseAgentCardURI;
    }

    function totalHandles() external view returns (uint256) {
        return _getStorage().totalHandles;
    }

    function isCustodyWallet(address wallet) external view returns (bool) {
        return _getStorage().custodyWallets[wallet];
    }

    function handleToAgentId(string calldata handle) external view returns (uint256) {
        return _getStorage().handleToAgentId[handle];
    }

    function handleRegistered(string calldata handle) external view returns (bool) {
        return _getStorage().handleRegistered[handle];
    }

    function handleTier(string calldata handle) external view returns (uint8) {
        return _getStorage().handleTier[handle];
    }

    function handleExpiry(string calldata handle) external view returns (uint256) {
        return _getStorage().handleExpiry[handle];
    }

    function handleActive(string calldata handle) external view returns (bool) {
        return _getStorage().handleActive[handle];
    }

    function handleRetired(string calldata handle) external view returns (bool) {
        return _getStorage().handleRetired[handle];
    }

    function reserved(bytes32 hash) external view returns (bool) {
        return _getStorage().reserved[hash];
    }

    // ═══════════════════════════════════════════════════════════
    //  NAMESPACE ADMIN (OWNER ONLY)
    // ═══════════════════════════════════════════════════════════

    function reserveHandles(string[] calldata handles) external onlyOwner {
        RegistrarStorage storage $ = _getStorage();
        for (uint256 i; i < handles.length; i++) {
            $.reserved[keccak256(abi.encodePacked(handles[i]))] = true;
        }
    }

    function unreserveHandle(string calldata handle) external onlyOwner {
        _getStorage().reserved[keccak256(abi.encodePacked(handle))] = false;
    }

    function suspendHandle(string calldata handle) external onlyOwner {
        RegistrarStorage storage $ = _getStorage();
        if (!$.handleRegistered[handle]) revert HandleNotRegistered();
        $.handleActive[handle] = false;
        emit HandleSuspended(handle);
    }

    function reactivateHandle(string calldata handle) external onlyOwner {
        RegistrarStorage storage $ = _getStorage();
        if (!$.handleRegistered[handle]) revert HandleNotRegistered();
        $.handleActive[handle] = true;
        emit HandleReactivated(handle);
    }

    /**
     * @notice Retire an expired handle after the grace period.
     * @dev Only callable after expiry + 90 day grace period.
     *      Released handles are intentionally not reusable unless a future
     *      contract version introduces explicit supersession/versioning.
     *      If the old NFT is still in approved custody, its ERC-8004 metadata
     *      is scrubbed before the namespace mapping is cleared.
     */
    function releaseHandle(string calldata handle) external onlyOwner {
        RegistrarStorage storage $ = _getStorage();
        if (!$.handleRegistered[handle]) revert HandleNotRegistered();
        if (block.timestamp <= $.handleExpiry[handle] + 90 days) revert GracePeriodActive();

        uint256 agentId = $.handleToAgentId[handle];
        address currentOwner = $.registry.ownerOf(agentId);

        if (_canScrubReleasedHandle($, currentOwner)) {
            $.registry.setMetadata(agentId, "agentid.handle", bytes(""));
            $.registry.setMetadata(agentId, "agentid.tier", bytes(""));
            $.registry.setMetadata(agentId, "agentid.status", abi.encodePacked("released"));
            $.registry.setAgentURI(agentId, string.concat($.baseAgentCardURI, "_released"));
        }

        delete $.handleToAgentId[handle];
        delete $.agentIdToHandle[agentId];
        delete $.handleTier[handle];
        delete $.handleExpiry[handle];
        delete $.handleActive[handle];
        delete $.handleRegistered[handle];
        $.handleRetired[handle] = true;

        unchecked { $.totalHandles--; }

        emit HandleReleased(handle, agentId);
    }

    // ═══════════════════════════════════════════════════════════
    //  ADMIN SETTINGS (OWNER ONLY)
    // ═══════════════════════════════════════════════════════════

    function setMinter(address _minter) external onlyOwner {
        if (_minter == address(0)) revert ZeroAddress();
        RegistrarStorage storage $ = _getStorage();
        emit MinterUpdated($.minter, _minter);
        $.minter = _minter;
    }

    function setPlatformWallet(address _wallet) external onlyOwner {
        if (_wallet == address(0)) revert ZeroAddress();
        RegistrarStorage storage $ = _getStorage();
        emit PlatformWalletUpdated($.platformWallet, _wallet);
        $.platformWallet = _wallet;
        $.custodyWallets[_wallet] = true;
        emit CustodyWalletUpdated(_wallet, true);
    }

    function setCustodyWallet(address wallet, bool approved) external onlyOwner {
        if (wallet == address(0)) revert ZeroAddress();
        RegistrarStorage storage $ = _getStorage();
        if (!approved && wallet == $.platformWallet) revert PlatformWalletMustRemainCustodyWallet();
        $.custodyWallets[wallet] = approved;
        emit CustodyWalletUpdated(wallet, approved);
    }

    function setBaseAgentCardURI(string calldata _uri) external onlyOwner {
        RegistrarStorage storage $ = _getStorage();
        emit BaseAgentCardURIUpdated($.baseAgentCardURI, _uri);
        $.baseAgentCardURI = _uri;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ═══════════════════════════════════════════════════════════
    //  INTERNAL: HANDLE VALIDATION
    // ═══════════════════════════════════════════════════════════

    function _validateHandle(string calldata handle) internal pure {
        bytes memory b = bytes(handle);
        if (b.length < 3) revert HandleTooShort();
        if (b.length > 32) revert HandleTooLong();
        if (b[0] == 0x2d || b[b.length - 1] == 0x2d) revert HandleInvalidChars();
        for (uint256 i; i < b.length; i++) {
            bytes1 c = b[i];
            bool ok = (c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39) || (c == 0x2d);
            if (!ok) revert HandleInvalidChars();
        }
    }

    function _isValidChars(string calldata handle) internal pure returns (bool) {
        bytes memory b = bytes(handle);
        if (b[0] == 0x2d || b[b.length - 1] == 0x2d) return false;
        for (uint256 i; i < b.length; i++) {
            bytes1 c = b[i];
            if (!((c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39) || (c == 0x2d))) return false;
        }
        return true;
    }

    function _validateTier(string calldata handle, uint8 tier) internal pure {
        uint256 len = bytes(handle).length;
        if (len == 3) {
            if (tier != 1) revert InvalidTier();
            return;
        }
        if (len == 4) {
            if (tier != 2) revert InvalidTier();
            return;
        }
        if (tier != 3) revert InvalidTier();
    }

    function _canScrubReleasedHandle(
        RegistrarStorage storage $,
        address currentOwner
    ) internal view returns (bool) {
        return $.custodyWallets[currentOwner] && $.registry.isApprovedForAll(currentOwner, address(this));
    }

    // ═══════════════════════════════════════════════════════════
    //  UUPS UPGRADE AUTHORIZATION
    // ═══════════════════════════════════════════════════════════

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ═══════════════════════════════════════════════════════════
    //  ERC-721 RECEIVER
    // ═══════════════════════════════════════════════════════════

    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    // ═══════════════════════════════════════════════════════════
    //  VERSION
    // ═══════════════════════════════════════════════════════════

    function version() external pure returns (string memory) {
        return "1.2.0";
    }
}
