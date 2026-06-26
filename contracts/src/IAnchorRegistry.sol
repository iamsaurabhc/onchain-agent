// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IAnchorRegistry
/// @notice Payload-agnostic anchoring registry. The chain never sees a payload
/// schema: it stores only a bytes32 hash, a 1-byte algorithm tag, and an
/// optional bytes32 metadata hash. See docs/PHASE_ANCHOR_VERIFY.md §4.
interface IAnchorRegistry {
    /// @notice Immutable, first-seen record for an anchored hash (§4.1).
    struct AnchorRecord {
        address anchorer; // who anchored (msg.sender)
        uint64 blockTimestamp; // block.timestamp at anchor
        uint64 blockNumber; // block.number at anchor
        uint8 algo; // algorithm tag (§3.1)
        bool isMerkleRoot; // true if `hash` is a Merkle root
        bytes32 metadataHash; // optional caller-bound context; 0x0 if unused
    }

    /// @notice Emitted on every successful direct anchor; fields mirror storage.
    event Anchored(
        bytes32 indexed hash,
        address indexed anchorer,
        uint8 algo,
        bool isMerkleRoot,
        uint64 blockTimestamp
    );

    /// @notice Emitted on every successful Merkle-root anchor; fields mirror storage.
    event MerkleRootAnchored(
        bytes32 indexed root, address indexed anchorer, uint8 algo, uint64 blockTimestamp
    );

    /// @notice The hash was already anchored; the original record is preserved.
    error AlreadyAnchored(bytes32 hash);

    /// @notice The zero hash is not anchorable (keeps isAnchored(0x0) == false meaningful).
    error ZeroHash();

    // --- Write ---

    /// @notice Anchor a direct hash with its algorithm tag and optional metadata.
    function anchor(bytes32 hash, uint8 algo, bytes32 metadataHash) external;

    /// @notice Anchor a Merkle root (isMerkleRoot = true) with its algorithm tag and metadata.
    function anchorMerkleRoot(bytes32 root, uint8 algo, bytes32 metadataHash) external;

    // --- Read ---

    /// @notice True once `hash` has been anchored; never reverts to false (§6 invariant).
    function isAnchored(bytes32 hash) external view returns (bool);

    /// @notice The stored record for `hash` (zeroed struct if never anchored).
    function getRecord(bytes32 hash) external view returns (AnchorRecord memory);

    /// @notice Verify a Merkle membership proof (OZ sorted-pair). Pure: does not
    /// require `root` to be anchored; compose with isAnchored(root) at the call site.
    function verifyMerkle(bytes32 root, bytes32 leaf, bytes32[] calldata proof)
        external
        pure
        returns (bool);
}
