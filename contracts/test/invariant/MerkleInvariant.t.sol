// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AnchorRegistry} from "../../src/AnchorRegistry.sol";
import {MerkleBuilder} from "../utils/MerkleBuilder.sol";
import {MerkleHandler} from "./handlers/MerkleHandler.sol";

/// @notice Phase C Merkle invariants (§6): across random anchor sequences,
///  (1) every member of an anchored tree verifies against its root, and the
///      root stays anchored once seen;
///  (2) no non-member leaf ever verifies against an anchored root.
contract MerkleInvariantTest is Test {
    AnchorRegistry internal reg;
    MerkleHandler internal handler;

    function setUp() public {
        reg = new AnchorRegistry();
        handler = new MerkleHandler(reg);

        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = MerkleHandler.anchorTree.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    /// (1) Membership soundness: every recorded member verifies; root stays anchored.
    function invariant_membersAlwaysVerify() public view {
        uint256 n = handler.rootCount();
        for (uint256 r = 0; r < n; r++) {
            bytes32 root = handler.roots(r);
            assertTrue(reg.isAnchored(root), "anchored root became unanchored");

            bytes32[] memory leaves = handler.leavesOf(root);
            for (uint256 i = 0; i < leaves.length; i++) {
                bytes32[] memory proof = MerkleBuilder.getProof(leaves, i);
                assertTrue(reg.verifyMerkle(root, leaves[i], proof), "member must verify");
            }
        }
    }

    /// (2) Non-membership: deterministic non-members never verify against any root.
    function invariant_noNonMemberVerifies() public view {
        uint256 n = handler.rootCount();
        for (uint256 r = 0; r < n; r++) {
            bytes32 root = handler.roots(r);
            bytes32[] memory leaves = handler.leavesOf(root);
            bytes32[] memory proof0 = MerkleBuilder.getProof(leaves, 0);

            for (uint256 k = 0; k < 4; k++) {
                bytes32 cand = keccak256(abi.encode("non-member", root, k));
                if (_isMember(leaves, cand)) continue;
                assertFalse(reg.verifyMerkle(root, cand, proof0), "non-member must not verify");
            }
        }
    }

    function _isMember(bytes32[] memory leaves, bytes32 x) internal pure returns (bool) {
        for (uint256 i = 0; i < leaves.length; i++) {
            if (leaves[i] == x) return true;
        }
        return false;
    }
}
