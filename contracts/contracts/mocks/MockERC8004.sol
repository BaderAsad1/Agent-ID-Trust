// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

/**
 * @title MockERC8004
 * @notice Minimal mock of the ERC-8004 IdentityRegistryUpgradeable for local testing.
 * @dev Implements the same register() behavior: _safeMint to msg.sender,
 *      auto-increment agentId starting from 0, sets tokenURI, stores metadata.
 *      Also clears agentWallet on transfer (mimics real registry behavior).
 */
contract MockERC8004 is ERC721URIStorage {

    struct MetadataEntry {
        string metadataKey;
        bytes metadataValue;
    }

    uint256 private _lastId;
    bool private _started; // track if first mint happened (to handle id=0)

    mapping(uint256 => mapping(string => bytes)) private _metadata;

    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    event MetadataSet(uint256 indexed agentId, string indexed indexedKey, string key, bytes value);

    constructor() ERC721("MockAgentIdentity", "MAGENT") {}

    function register(string memory agentURI) external returns (uint256 agentId) {
        if (!_started) {
            agentId = 0;
            _started = true;
        } else {
            agentId = _lastId + 1;
        }
        _lastId = agentId;

        _metadata[agentId]["agentWallet"] = abi.encodePacked(msg.sender);
        _safeMint(msg.sender, agentId);
        _setTokenURI(agentId, agentURI);

        emit Registered(agentId, agentURI, msg.sender);
        emit MetadataSet(agentId, "agentWallet", "agentWallet", abi.encodePacked(msg.sender));
    }

    function register(string memory agentURI, MetadataEntry[] memory metadata) external returns (uint256 agentId) {
        if (!_started) {
            agentId = 0;
            _started = true;
        } else {
            agentId = _lastId + 1;
        }
        _lastId = agentId;

        _metadata[agentId]["agentWallet"] = abi.encodePacked(msg.sender);
        _safeMint(msg.sender, agentId);
        _setTokenURI(agentId, agentURI);

        emit Registered(agentId, agentURI, msg.sender);
        emit MetadataSet(agentId, "agentWallet", "agentWallet", abi.encodePacked(msg.sender));

        for (uint256 i; i < metadata.length; i++) {
            require(keccak256(bytes(metadata[i].metadataKey)) != keccak256("agentWallet"), "reserved key");
            _metadata[agentId][metadata[i].metadataKey] = metadata[i].metadataValue;
            emit MetadataSet(agentId, metadata[i].metadataKey, metadata[i].metadataKey, metadata[i].metadataValue);
        }
    }

    function setAgentURI(uint256 agentId, string calldata newURI) external {
        require(
            msg.sender == ownerOf(agentId) ||
            isApprovedForAll(ownerOf(agentId), msg.sender) ||
            msg.sender == getApproved(agentId),
            "Not authorized"
        );
        _setTokenURI(agentId, newURI);
    }

    function setMetadata(uint256 agentId, string memory key, bytes memory value) external {
        require(
            msg.sender == ownerOf(agentId) ||
            isApprovedForAll(ownerOf(agentId), msg.sender) ||
            msg.sender == getApproved(agentId),
            "Not authorized"
        );
        _metadata[agentId][key] = value;
    }

    function getMetadata(uint256 agentId, string memory key) external view returns (bytes memory) {
        return _metadata[agentId][key];
    }

    function getAgentWallet(uint256 agentId) external view returns (address) {
        bytes memory data = _metadata[agentId]["agentWallet"];
        if (data.length == 0) return address(0);
        return address(bytes20(data));
    }

    // Mimic ERC-8004 behavior: clear agentWallet on transfer
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            _metadata[tokenId]["agentWallet"] = "";
        }
        return super._update(to, tokenId, auth);
    }
}
