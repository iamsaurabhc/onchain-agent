// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AnchorRegistry} from "../../../src/AnchorRegistry.sol";
import {MerkleBuilder} from "../../utils/MerkleBuilder.sol";

/// @notice Invariant actor: anchors random Merkle trees (built with the
/// parity-checked MerkleBuilder) and records each root's leaf set so the
/// invariant suite can assert membership soundness and non-membership across
/// random sequences. Never reverts (skips zero/duplicate roots) to satisfy the
/// `fail_on_revert = true` invariant config.
contract MerkleHandler {
    AnchorRegistry public immutable reg;

    bytes32[] public roots;
    mapping(bytes32 => bool) public known;
    mapping(bytes32 => bytes32[]) internal _leavesOf;

    constructor(AnchorRegistry _reg) {
        reg = _reg;
    }

    function rootCount() external view returns (uint256) {
        return roots.length;
    }

    function leavesOf(bytes32 root) external view returns (bytes32[] memory) {
        return _leavesOf[root];
    }

    /// @dev Build a random tree (1..16 distinct, non-zero leaves) and anchor its
    /// root, recording the leaf set. Duplicate roots are skipped (would revert).
    function anchorTree(uint256 seed, uint8 rawSize) external {
        uint256 size = (uint256(rawSize) % 16) + 1;
        bytes32[] memory leaves = new bytes32[](size);
        for (uint256 i = 0; i < size; i++) {
            leaves[i] = keccak256(abi.encode(seed, i));
        }

        bytes32 root = MerkleBuilder.buildRoot(leaves);
        if (root == bytes32(0) || known[root]) return;

        reg.anchorMerkleRoot(root, 0x20, bytes32(0));

        known[root] = true;
        roots.push(root);
        _leavesOf[root] = leaves;
    }
}
