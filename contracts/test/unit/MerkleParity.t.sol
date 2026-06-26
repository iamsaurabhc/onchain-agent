// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @notice Merkle membership proofs built off-chain (merkletreejs, sorted-pair keccak)
/// must verify via OpenZeppelin MerkleProof against the same golden root.
contract MerkleParityTest is Test {
    function test_batch1MembersVerify() public view {
        string memory batchJson = vm.readFile("../fixtures/merkle/batch1.json");
        bytes32 root = vm.parseJsonBytes32(batchJson, ".root");
        bytes32[] memory leaves = vm.parseJsonBytes32Array(batchJson, ".leaves");

        for (uint256 i = 0; i < leaves.length; i++) {
            bytes32 leaf = leaves[i];
            string memory proofPath = string.concat(".proofArrays[", vm.toString(i), "]");
            bytes32[] memory proof = vm.parseJsonBytes32Array(batchJson, proofPath);
            assertTrue(
                MerkleProof.verify(proof, root, leaf),
                string.concat("member proof failed for leaf ", vm.toString(leaf))
            );
        }
    }

    function test_tamperedLeafFails() public view {
        string memory batchJson = vm.readFile("../fixtures/merkle/batch1.json");
        bytes32 root = vm.parseJsonBytes32(batchJson, ".root");
        bytes32[] memory leaves = vm.parseJsonBytes32Array(batchJson, ".leaves");
        bytes32 leaf = leaves[0];
        bytes32[] memory proof = vm.parseJsonBytes32Array(batchJson, ".proofArrays[0]");

        bytes32 tampered = bytes32(uint256(leaf) ^ uint256(1));
        assertFalse(MerkleProof.verify(proof, root, tampered));
    }
}
