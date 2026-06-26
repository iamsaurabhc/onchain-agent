// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AnchorRegistry} from "../../src/AnchorRegistry.sol";
import {IAnchorRegistry} from "../../src/IAnchorRegistry.sol";

/// @notice Phase B regression tests: anchoring records exactly the right fields,
/// events mirror storage, duplicates never overwrite, and the read paths behave.
/// Golden cases are driven by fixtures/anchor_requests/manifest.json (no .sol
/// edits to add a case).
contract AnchorRegistryTest is Test {
    // Local copies of the registry events for vm.expectEmit assertions.
    event Anchored(
        bytes32 indexed hash,
        address indexed anchorer,
        uint8 algo,
        bool isMerkleRoot,
        uint64 blockTimestamp
    );
    event MerkleRootAnchored(
        bytes32 indexed root, address indexed anchorer, uint8 algo, uint64 blockTimestamp
    );

    struct Case {
        string name;
        bytes32 hash;
        uint8 algo;
        bytes32 metadataHash;
        bool isMerkleRoot;
        address anchorer;
        uint64 blockTimestamp;
        uint64 blockNumber;
    }

    function _loadCase(string memory name) internal view returns (Case memory c) {
        string memory json =
            vm.readFile(string.concat("../fixtures/anchor_requests/", name, ".json"));
        c.name = name;
        c.hash = vm.parseJsonBytes32(json, ".hash");
        c.algo = uint8(vm.parseJsonUint(json, ".algo"));
        c.metadataHash = vm.parseJsonBytes32(json, ".metadataHash");
        c.isMerkleRoot = vm.parseJsonBool(json, ".isMerkleRoot");
        c.anchorer = vm.parseJsonAddress(json, ".anchorer");
        c.blockTimestamp = uint64(vm.parseJsonUint(json, ".blockTimestamp"));
        c.blockNumber = uint64(vm.parseJsonUint(json, ".blockNumber"));
    }

    /// @dev Anchor one golden case against a fresh registry and assert the stored
    /// record, the emitted event, and the isAnchored toggle all match the golden.
    function _assertCaseAnchorsToGolden(Case memory c) internal {
        AnchorRegistry reg = new AnchorRegistry();

        vm.warp(c.blockTimestamp);
        vm.roll(c.blockNumber);

        assertFalse(reg.isAnchored(c.hash), string.concat("pre isAnchored: ", c.name));

        vm.expectEmit(true, true, true, true, address(reg));
        if (c.isMerkleRoot) {
            emit MerkleRootAnchored(c.hash, c.anchorer, c.algo, c.blockTimestamp);
        } else {
            emit Anchored(c.hash, c.anchorer, c.algo, c.isMerkleRoot, c.blockTimestamp);
        }

        vm.prank(c.anchorer);
        if (c.isMerkleRoot) {
            reg.anchorMerkleRoot(c.hash, c.algo, c.metadataHash);
        } else {
            reg.anchor(c.hash, c.algo, c.metadataHash);
        }

        assertTrue(reg.isAnchored(c.hash), string.concat("post isAnchored: ", c.name));

        IAnchorRegistry.AnchorRecord memory rec = reg.getRecord(c.hash);
        assertEq(rec.anchorer, c.anchorer, string.concat("anchorer: ", c.name));
        assertEq(rec.blockTimestamp, c.blockTimestamp, string.concat("timestamp: ", c.name));
        assertEq(rec.blockNumber, c.blockNumber, string.concat("blockNumber: ", c.name));
        assertEq(rec.algo, c.algo, string.concat("algo: ", c.name));
        assertEq(rec.isMerkleRoot, c.isMerkleRoot, string.concat("isMerkleRoot: ", c.name));
        assertEq(rec.metadataHash, c.metadataHash, string.concat("metadataHash: ", c.name));
    }

    function test_allGoldenCasesAnchorAndMirror() public {
        string memory manifest = vm.readFile("../fixtures/anchor_requests/manifest.json");
        uint256 count = vm.parseJsonUint(manifest, ".count");

        for (uint256 i = 0; i < count; i++) {
            string memory name =
                vm.parseJsonString(manifest, string.concat(".cases[", vm.toString(i), "].name"));
            _assertCaseAnchorsToGolden(_loadCase(name));
        }
    }

    function test_isAnchoredTogglesFalseToTrue() public {
        AnchorRegistry reg = new AnchorRegistry();
        bytes32 h = keccak256("toggle");
        assertFalse(reg.isAnchored(h));
        reg.anchor(h, 0x01, bytes32(0));
        assertTrue(reg.isAnchored(h));
    }

    function test_getRecordZeroedWhenAbsent() public {
        AnchorRegistry reg = new AnchorRegistry();
        IAnchorRegistry.AnchorRecord memory rec = reg.getRecord(keccak256("absent"));
        assertEq(rec.anchorer, address(0));
        assertEq(rec.blockTimestamp, 0);
        assertEq(rec.blockNumber, 0);
        assertEq(rec.algo, 0);
        assertFalse(rec.isMerkleRoot);
        assertEq(rec.metadataHash, bytes32(0));
    }

    function test_duplicateAnchorRevertsAndPreservesOriginal() public {
        AnchorRegistry reg = new AnchorRegistry();
        bytes32 h = keccak256("dup");

        vm.warp(1_000);
        vm.roll(10);
        vm.prank(address(0xAAA1));
        reg.anchor(h, 0x01, bytes32(uint256(0xdead)));

        // A later, different caller/time must not overwrite the first-seen record.
        vm.warp(2_000);
        vm.roll(20);
        vm.prank(address(0xBBB2));
        vm.expectRevert(abi.encodeWithSelector(IAnchorRegistry.AlreadyAnchored.selector, h));
        reg.anchor(h, 0x02, bytes32(uint256(0xbeef)));

        IAnchorRegistry.AnchorRecord memory rec = reg.getRecord(h);
        assertEq(rec.anchorer, address(0xAAA1), "anchorer preserved");
        assertEq(rec.blockTimestamp, 1_000, "timestamp preserved");
        assertEq(rec.blockNumber, 10, "blockNumber preserved");
        assertEq(rec.algo, 0x01, "algo preserved");
        assertEq(rec.metadataHash, bytes32(uint256(0xdead)), "metadataHash preserved");
    }

    function test_duplicateAcrossAnchorAndMerkleReverts() public {
        AnchorRegistry reg = new AnchorRegistry();
        bytes32 h = keccak256("dup-cross");
        reg.anchor(h, 0x01, bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(IAnchorRegistry.AlreadyAnchored.selector, h));
        reg.anchorMerkleRoot(h, 0x20, bytes32(0));
    }

    function test_zeroHashReverts() public {
        AnchorRegistry reg = new AnchorRegistry();
        vm.expectRevert(IAnchorRegistry.ZeroHash.selector);
        reg.anchor(bytes32(0), 0x01, bytes32(0));

        vm.expectRevert(IAnchorRegistry.ZeroHash.selector);
        reg.anchorMerkleRoot(bytes32(0), 0x20, bytes32(0));
    }

    function test_unknownButWellFormedAlgoIsStored() public {
        AnchorRegistry reg = new AnchorRegistry();
        bytes32 h = keccak256("unknown-algo");
        uint8 weirdAlgo = 0x7f;
        reg.anchor(h, weirdAlgo, bytes32(0));
        assertEq(reg.getRecord(h).algo, weirdAlgo);
    }

    function test_merkleRootMarksRecordAndStaysAnchored() public {
        AnchorRegistry reg = new AnchorRegistry();
        bytes32 root = keccak256("root");
        reg.anchorMerkleRoot(root, 0x20, bytes32(0));
        assertTrue(reg.isAnchored(root));
        assertTrue(reg.getRecord(root).isMerkleRoot);
    }
}
