// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AgentIDHandle
 * @dev ERC-721 NFT contract for Agent ID handles on Base.
 *      Each handle is a unique token. The minter role can mint new handles.
 *      The contract owner can update the minter and base metadata URI.
 */
contract AgentIDHandle is ERC721, ERC721Enumerable, Ownable {
    string private _baseMetadataURI;
    address public minter;

    uint256 private _nextTokenId;

    mapping(uint256 => string) private _handleByTokenId;
    mapping(string => uint256) private _tokenIdByHandle;
    mapping(string => bool) private _handleMinted;

    event HandleMinted(address indexed to, uint256 indexed tokenId, string handle);
    event HandleTransferred(address indexed from, address indexed to, uint256 indexed tokenId, string handle);
    event MinterUpdated(address indexed oldMinter, address indexed newMinter);
    event BaseURIUpdated(string newBaseURI);

    error HandleAlreadyMinted(string handle);
    error HandleNotFound(string handle);
    error NotMinter();

    modifier onlyMinter() {
        if (msg.sender != minter) revert NotMinter();
        _;
    }

    constructor(
        address initialOwner,
        address _minter,
        string memory baseMetadataURI_
    ) ERC721("AgentIDHandle", "AGENTID") Ownable(initialOwner) {
        minter = _minter;
        _baseMetadataURI = baseMetadataURI_;
        _nextTokenId = 1;
    }

    /**
     * @dev Mint a new handle NFT to a recipient address.
     * @param to The address to mint to (platform custody wallet).
     * @param handle The normalized handle string (e.g. "alice").
     * @return tokenId The minted token ID.
     */
    function mintHandle(address to, string calldata handle) external onlyMinter returns (uint256 tokenId) {
        if (_handleMinted[handle]) revert HandleAlreadyMinted(handle);

        tokenId = _nextTokenId++;
        _handleByTokenId[tokenId] = handle;
        _tokenIdByHandle[handle] = tokenId;
        _handleMinted[handle] = true;

        _safeMint(to, tokenId);
        emit HandleMinted(to, tokenId, handle);
    }

    /**
     * @dev Resolve a handle to its token ID.
     * @param handle The handle to look up.
     * @return tokenId The token ID, or 0 if not minted.
     */
    function resolveHandle(string calldata handle) external view returns (uint256 tokenId) {
        if (!_handleMinted[handle]) return 0;
        return _tokenIdByHandle[handle];
    }

    /**
     * @dev Get the handle string for a given token ID.
     * @param tokenId The token ID.
     * @return handle The handle string.
     */
    function handleOf(uint256 tokenId) external view returns (string memory handle) {
        return _handleByTokenId[tokenId];
    }

    /**
     * @dev Check if a handle has been minted.
     */
    function isHandleMinted(string calldata handle) external view returns (bool) {
        return _handleMinted[handle];
    }

    /**
     * @dev Update the minter address.
     */
    function setMinter(address newMinter) external onlyOwner {
        emit MinterUpdated(minter, newMinter);
        minter = newMinter;
    }

    /**
     * @dev Update the base metadata URI.
     */
    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        _baseMetadataURI = newBaseURI;
        emit BaseURIUpdated(newBaseURI);
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseMetadataURI;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        string memory base = _baseURI();
        string memory handle = _handleByTokenId[tokenId];
        if (bytes(base).length == 0) {
            return handle;
        }
        return string(abi.encodePacked(base, handle));
    }

    // Required overrides for ERC721Enumerable

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override(ERC721, ERC721Enumerable) returns (address) {
        address from = super._update(to, tokenId, auth);
        if (from != address(0) && to != address(0)) {
            string memory handle = _handleByTokenId[tokenId];
            emit HandleTransferred(from, to, tokenId, handle);
        }
        return from;
    }

    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
