// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Test-only Merkle tree builder that mirrors merkletreejs configured
/// with { sortPairs: true, hashLeaves: false } and the default carry-odd rule
/// (an odd trailing node is promoted to the next level unchanged, not
/// duplicated). Leaf order is preserved. Roots and proofs produced here are
/// accepted by OpenZeppelin `MerkleProof.verify` and match the off-chain
/// hash-core merkle library. Parity is locked against the shared goldens in
/// MerkleAnchor.t.sol before any fuzz/invariant suite relies on it.
library MerkleBuilder {
    /// @dev Commutative (sorted) pair hash so proofs are order-independent.
    function _hashPair(bytes32 a, bytes32 b) private pure returns (bytes32) {
        return a <= b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    /// @dev Reduce one level to the next, carrying an odd trailing node up.
    function _nextLevel(bytes32[] memory level) private pure returns (bytes32[] memory next) {
        uint256 n = level.length;
        next = new bytes32[]((n + 1) / 2);
        for (uint256 i = 0; i < n; i += 2) {
            next[i / 2] = (i + 1 < n) ? _hashPair(level[i], level[i + 1]) : level[i];
        }
    }

    /// @notice Build the Merkle root over pre-hashed leaves (leaf order preserved).
    function buildRoot(bytes32[] memory leaves) internal pure returns (bytes32) {
        require(leaves.length > 0, "MerkleBuilder: empty leaves");
        bytes32[] memory level = leaves;
        while (level.length > 1) {
            level = _nextLevel(level);
        }
        return level[0];
    }

    /// @notice Build the sorted-pair proof for the leaf at `index`.
    function getProof(bytes32[] memory leaves, uint256 index)
        internal
        pure
        returns (bytes32[] memory proof)
    {
        require(index < leaves.length, "MerkleBuilder: index out of range");

        bytes32[] memory scratch = new bytes32[](_maxDepth(leaves.length));
        uint256 count = 0;
        bytes32[] memory level = leaves;
        uint256 idx = index;
        while (level.length > 1) {
            uint256 pair = idx ^ 1; // sibling index within the current level
            if (pair < level.length) {
                scratch[count++] = level[pair];
            }
            level = _nextLevel(level);
            idx /= 2;
        }

        proof = new bytes32[](count);
        for (uint256 i = 0; i < count; i++) {
            proof[i] = scratch[i];
        }
    }

    /// @dev ceil(log2(n)) — the number of reduction steps and the upper bound
    /// on a proof's length, used to size the scratch buffer.
    function _maxDepth(uint256 n) private pure returns (uint256 depth) {
        while (n > 1) {
            n = (n + 1) / 2;
            depth++;
        }
    }
}
