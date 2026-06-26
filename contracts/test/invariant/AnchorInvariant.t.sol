// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AnchorRegistry} from "../../src/AnchorRegistry.sol";
import {IAnchorRegistry} from "../../src/IAnchorRegistry.sol";
import {AnchorHandler} from "./handlers/AnchorHandler.sol";

/// @notice Phase B invariants (§6): across random anchor sequences,
///  (1) once anchored, always anchored;
///  (2) the record is immutable / first-seen wins;
///  (3) every emitted event mirrors stored state.
contract AnchorInvariantTest is Test {
    AnchorRegistry internal reg;
    AnchorHandler internal handler;

    function setUp() public {
        reg = new AnchorRegistry();
        handler = new AnchorHandler(reg);

        bytes4[] memory selectors = new bytes4[](2);
        selectors[0] = AnchorHandler.anchor.selector;
        selectors[1] = AnchorHandler.anchorMerkleRoot.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    /// (1) Once a hash is anchored it never reports unanchored again.
    function invariant_onceAnchoredAlwaysAnchored() public view {
        uint256 n = handler.anchoredCount();
        for (uint256 i = 0; i < n; i++) {
            bytes32 h = handler.anchoredHashes(i);
            assertTrue(reg.isAnchored(h), "anchored hash became unanchored");
        }
    }

    /// (2) anchorer & block fields for a hash never change after the first anchor.
    function invariant_recordImmutableFirstSeen() public view {
        uint256 n = handler.anchoredCount();
        for (uint256 i = 0; i < n; i++) {
            bytes32 h = handler.anchoredHashes(i);
            AnchorHandler.Ghost memory g = handler.ghostOf(h);
            IAnchorRegistry.AnchorRecord memory rec = reg.getRecord(h);
            assertEq(rec.anchorer, g.anchorer, "anchorer changed");
            assertEq(rec.blockTimestamp, g.blockTimestamp, "blockTimestamp changed");
            assertEq(rec.blockNumber, g.blockNumber, "blockNumber changed");
            assertEq(rec.algo, g.algo, "algo changed");
            assertEq(rec.isMerkleRoot, g.isMerkleRoot, "isMerkleRoot changed");
            assertEq(rec.metadataHash, g.metadataHash, "metadataHash changed");
        }
    }

    /// (3) For every recorded emitted event, the decoded fields match getRecord.
    function invariant_eventMirrorsStorage() public view {
        uint256 n = handler.anchoredCount();
        for (uint256 i = 0; i < n; i++) {
            bytes32 h = handler.anchoredHashes(i);
            AnchorHandler.Ghost memory g = handler.ghostOf(h);
            IAnchorRegistry.AnchorRecord memory rec = reg.getRecord(h);
            assertEq(g.evtAnchorer, rec.anchorer, "event anchorer != storage");
            assertEq(g.evtAlgo, rec.algo, "event algo != storage");
            assertEq(g.evtIsMerkleRoot, rec.isMerkleRoot, "event isMerkleRoot != storage");
            assertEq(g.evtBlockTimestamp, rec.blockTimestamp, "event timestamp != storage");
        }
    }
}
