// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AnchorRegistry} from "../../src/AnchorRegistry.sol";
import {MerkleBuilder} from "../utils/MerkleBuilder.sol";

/// @notice Phase C Merkle fuzz (§6): for random trees of random size, every
/// member verifies through the registry, and a random non-member never does.
/// Trees are built with the parity-checked MerkleBuilder (see MerkleAnchor.t.sol).
contract MerkleFuzzTest is Test {
    AnchorRegistry internal reg;

    function setUp() public {
        reg = new AnchorRegistry();
    }

    /// @dev Distinct, non-zero leaves derived deterministically from a fuzzed seed.
    function _leaves(uint256 seed, uint256 size) internal pure returns (bytes32[] memory leaves) {
        leaves = new bytes32[](size);
        for (uint256 i = 0; i < size; i++) {
            leaves[i] = keccak256(abi.encode(seed, i));
        }
    }

    /// Every member of a random tree verifies against its anchored root.
    function testFuzz_allMembersVerify(uint256 seed, uint8 rawSize) public {
        uint256 size = bound(rawSize, 1, 64);
        bytes32[] memory leaves = _leaves(seed, size);
        bytes32 root = MerkleBuilder.buildRoot(leaves);

        // Fresh registry per run so a repeated fuzz seed can never duplicate-revert.
        AnchorRegistry r = new AnchorRegistry();
        r.anchorMerkleRoot(root, 0x20, bytes32(0));
        assertTrue(r.isAnchored(root), "root anchored");

        for (uint256 i = 0; i < size; i++) {
            bytes32[] memory proof = MerkleBuilder.getProof(leaves, i);
            assertTrue(r.verifyMerkle(root, leaves[i], proof), "member must verify");
        }
    }

    /// A random non-member never verifies, even using a real member's proof.
    function testFuzz_nonMemberNeverVerifies(uint256 seed, uint8 rawSize, bytes32 candidate)
        public
        view
    {
        uint256 size = bound(rawSize, 1, 64);
        bytes32[] memory leaves = _leaves(seed, size);
        bytes32 root = MerkleBuilder.buildRoot(leaves);

        for (uint256 i = 0; i < size; i++) {
            vm.assume(candidate != leaves[i]);
        }

        bytes32[] memory member0 = MerkleBuilder.getProof(leaves, 0);
        assertFalse(reg.verifyMerkle(root, candidate, member0), "non-member must not verify");
    }
}
