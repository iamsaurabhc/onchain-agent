// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IAnchorRegistry} from "./IAnchorRegistry.sol";

/// @title AnchorRegistry
/// @notice Tiny, payload-agnostic registry that records a bytes32 hash with its
/// algorithm tag and optional metadata, immutably (first-seen wins) and with
/// events that mirror storage. See docs/PHASE_ANCHOR_VERIFY.md §4.
contract AnchorRegistry is IAnchorRegistry {
    /// @dev hash => record. A record exists iff `anchorer != address(0)`.
    mapping(bytes32 => AnchorRecord) private _records;

    /// @inheritdoc IAnchorRegistry
    function anchor(bytes32 hash, uint8 algo, bytes32 metadataHash) external {
        AnchorRecord storage rec = _anchor(hash, algo, metadataHash, false);
        emit Anchored(hash, rec.anchorer, rec.algo, rec.isMerkleRoot, rec.blockTimestamp);
    }

    /// @inheritdoc IAnchorRegistry
    function anchorMerkleRoot(bytes32 root, uint8 algo, bytes32 metadataHash) external {
        AnchorRecord storage rec = _anchor(root, algo, metadataHash, true);
        emit MerkleRootAnchored(root, rec.anchorer, rec.algo, rec.blockTimestamp);
    }

    /// @inheritdoc IAnchorRegistry
    function isAnchored(bytes32 hash) external view returns (bool) {
        return _records[hash].anchorer != address(0);
    }

    /// @inheritdoc IAnchorRegistry
    function getRecord(bytes32 hash) external view returns (AnchorRecord memory) {
        return _records[hash];
    }

    /// @inheritdoc IAnchorRegistry
    function verifyMerkle(bytes32 root, bytes32 leaf, bytes32[] calldata proof)
        external
        pure
        returns (bool)
    {
        return MerkleProof.verify(proof, root, leaf);
    }

    /// @dev Shared first-seen-wins write path. Reverts on the zero hash or a
    /// duplicate; the algo tag is stored verbatim (unknown tags are allowed).
    function _anchor(bytes32 hash, uint8 algo, bytes32 metadataHash, bool isMerkleRoot)
        private
        returns (AnchorRecord storage rec)
    {
        if (hash == bytes32(0)) revert ZeroHash();
        rec = _records[hash];
        if (rec.anchorer != address(0)) revert AlreadyAnchored(hash);

        rec.anchorer = msg.sender;
        rec.blockTimestamp = uint64(block.timestamp);
        rec.blockNumber = uint64(block.number);
        rec.algo = algo;
        rec.isMerkleRoot = isMerkleRoot;
        rec.metadataHash = metadataHash;
    }
}
