// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AnchorRegistry} from "../../src/AnchorRegistry.sol";
import {IAnchorRegistry} from "../../src/IAnchorRegistry.sol";
import {MerkleBuilder} from "../utils/MerkleBuilder.sol";

/// @notice Phase C Merkle unit suite, manifest-driven over fixtures/merkle/*.json:
///  (1) Builder parity — the in-Solidity MerkleBuilder reproduces the golden root
///      and every golden proof, locking the builder (used by the fuzz/invariant
///      suites) to the off-chain merkletreejs library.
///  (2) Registry flow — anchorMerkleRoot emits MerkleRootAnchored, isAnchored(root)
///      toggles to true, and reg.verifyMerkle accepts every member's proof while
///      rejecting tampered proofs and declared non-members (the composed
///      "leaf is in an anchored batch" claim, doc §4.3).
contract MerkleAnchorTest is Test {
    event MerkleRootAnchored(
        bytes32 indexed root, address indexed anchorer, uint8 algo, uint64 blockTimestamp
    );

    uint8 internal constant ALGO_MERKLE = 0x20;

    struct Tree {
        string file;
        bytes32 root;
        bytes32[] leaves;
        bytes32[] nonMembers;
    }

    function _treeFiles() internal view returns (string[] memory files) {
        string memory manifest = vm.readFile("../fixtures/merkle/manifest.json");
        uint256 count = vm.parseJsonUint(manifest, ".count");
        files = new string[](count);
        for (uint256 i = 0; i < count; i++) {
            files[i] =
                vm.parseJsonString(manifest, string.concat(".trees[", vm.toString(i), "].file"));
        }
    }

    function _loadTree(string memory file)
        internal
        view
        returns (Tree memory t, string memory json)
    {
        json = vm.readFile(string.concat("../fixtures/merkle/", file));
        t.file = file;
        t.root = vm.parseJsonBytes32(json, ".root");
        t.leaves = vm.parseJsonBytes32Array(json, ".leaves");
        t.nonMembers = vm.parseJsonBytes32Array(json, ".nonMembers");
    }

    function _proofAt(string memory json, uint256 i) internal pure returns (bytes32[] memory) {
        return vm.parseJsonBytes32Array(json, string.concat(".proofArrays[", vm.toString(i), "]"));
    }

    /// @dev (1) The Solidity builder must reproduce the golden root and proofs.
    function test_builderMatchesGoldens() public view {
        string[] memory files = _treeFiles();
        for (uint256 f = 0; f < files.length; f++) {
            (Tree memory t, string memory json) = _loadTree(files[f]);

            assertEq(
                MerkleBuilder.buildRoot(t.leaves),
                t.root,
                string.concat("builder root mismatch: ", t.file)
            );

            for (uint256 i = 0; i < t.leaves.length; i++) {
                bytes32[] memory golden = _proofAt(json, i);
                bytes32[] memory built = MerkleBuilder.getProof(t.leaves, i);
                assertEq(built.length, golden.length, string.concat("proof len: ", t.file));
                for (uint256 j = 0; j < golden.length; j++) {
                    assertEq(built[j], golden[j], string.concat("proof elem: ", t.file));
                }
            }
        }
    }

    /// @dev (2) Anchor each golden root and verify membership through the registry.
    function test_anchorAndVerifyMembersAcrossAllTrees() public {
        string[] memory files = _treeFiles();
        for (uint256 f = 0; f < files.length; f++) {
            (Tree memory t, string memory json) = _loadTree(files[f]);
            _runTree(t, json);
        }
    }

    function _runTree(Tree memory t, string memory json) internal {
        AnchorRegistry reg = new AnchorRegistry();
        address anchorer = address(0xA9C);

        assertFalse(reg.isAnchored(t.root), string.concat("pre isAnchored: ", t.file));

        vm.expectEmit(true, true, true, true, address(reg));
        emit MerkleRootAnchored(t.root, anchorer, ALGO_MERKLE, uint64(block.timestamp));
        vm.prank(anchorer);
        reg.anchorMerkleRoot(t.root, ALGO_MERKLE, bytes32(0));

        assertTrue(reg.isAnchored(t.root), string.concat("post isAnchored: ", t.file));
        assertTrue(reg.getRecord(t.root).isMerkleRoot, string.concat("isMerkleRoot: ", t.file));

        for (uint256 i = 0; i < t.leaves.length; i++) {
            bytes32 leaf = t.leaves[i];
            bytes32[] memory proof = _proofAt(json, i);
            assertTrue(
                reg.verifyMerkle(t.root, leaf, proof),
                string.concat("member must verify: ", t.file)
            );
            bytes32[] memory tampered = _tamper(proof);
            assertFalse(
                reg.verifyMerkle(t.root, leaf, tampered),
                string.concat("tampered proof must fail: ", t.file)
            );
        }

        bytes32[] memory member0Proof = _proofAt(json, 0);
        for (uint256 k = 0; k < t.nonMembers.length; k++) {
            assertFalse(
                reg.verifyMerkle(t.root, t.nonMembers[k], member0Proof),
                string.concat("non-member must not verify: ", t.file)
            );
        }
    }

    /// @dev Flip the first proof element; for an empty proof (size-1 tree) return
    /// a bogus single-element proof so verification is still forced to fail.
    function _tamper(bytes32[] memory proof) internal pure returns (bytes32[] memory out) {
        if (proof.length == 0) {
            out = new bytes32[](1);
            out[0] = bytes32(type(uint256).max);
            return out;
        }
        out = new bytes32[](proof.length);
        for (uint256 i = 0; i < proof.length; i++) {
            out[i] = proof[i];
        }
        out[0] = bytes32(uint256(out[0]) ^ 1);
    }
}
