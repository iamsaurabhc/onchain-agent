// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AnchorRegistry} from "../../src/AnchorRegistry.sol";
import {IAnchorRegistry} from "../../src/IAnchorRegistry.sol";

/// @notice Phase B fuzz: for any valid distinct non-zero hash, the record always
/// reflects the inputs and msg.sender; anchoring never reverts; a second anchor
/// of the same hash always reverts and never overwrites.
contract AnchorRegistryFuzzTest is Test {
    AnchorRegistry internal reg;

    function setUp() public {
        reg = new AnchorRegistry();
    }

    function testFuzz_recordReflectsInputsAndSender(
        bytes32 hash,
        uint8 algo,
        bytes32 metadataHash,
        address caller,
        uint64 ts,
        uint64 bn
    ) public {
        vm.assume(hash != bytes32(0));
        vm.assume(caller != address(0));

        vm.warp(ts);
        vm.roll(bn);

        vm.prank(caller);
        reg.anchor(hash, algo, metadataHash);

        assertTrue(reg.isAnchored(hash));
        IAnchorRegistry.AnchorRecord memory rec = reg.getRecord(hash);
        assertEq(rec.anchorer, caller);
        assertEq(rec.blockTimestamp, ts);
        assertEq(rec.blockNumber, bn);
        assertEq(rec.algo, algo);
        assertFalse(rec.isMerkleRoot);
        assertEq(rec.metadataHash, metadataHash);
    }

    function testFuzz_merkleRootReflectsInputsAndSender(
        bytes32 root,
        uint8 algo,
        bytes32 metadataHash,
        address caller
    ) public {
        vm.assume(root != bytes32(0));
        vm.assume(caller != address(0));

        vm.prank(caller);
        reg.anchorMerkleRoot(root, algo, metadataHash);

        IAnchorRegistry.AnchorRecord memory rec = reg.getRecord(root);
        assertEq(rec.anchorer, caller);
        assertEq(rec.algo, algo);
        assertTrue(rec.isMerkleRoot);
        assertEq(rec.metadataHash, metadataHash);
    }

    function testFuzz_secondAnchorAlwaysRevertsAndPreserves(
        bytes32 hash,
        uint8 algo1,
        uint8 algo2,
        bytes32 meta1,
        bytes32 meta2,
        address caller1,
        address caller2
    ) public {
        vm.assume(hash != bytes32(0));
        vm.assume(caller1 != address(0));
        vm.assume(caller2 != address(0));

        vm.prank(caller1);
        reg.anchor(hash, algo1, meta1);

        vm.prank(caller2);
        vm.expectRevert(abi.encodeWithSelector(IAnchorRegistry.AlreadyAnchored.selector, hash));
        reg.anchor(hash, algo2, meta2);

        IAnchorRegistry.AnchorRecord memory rec = reg.getRecord(hash);
        assertEq(rec.anchorer, caller1);
        assertEq(rec.algo, algo1);
        assertEq(rec.metadataHash, meta1);
    }

    function testFuzz_zeroHashAlwaysReverts(uint8 algo, bytes32 metadataHash) public {
        vm.expectRevert(IAnchorRegistry.ZeroHash.selector);
        reg.anchor(bytes32(0), algo, metadataHash);
    }
}
