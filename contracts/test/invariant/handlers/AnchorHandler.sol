// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Vm} from "forge-std/Vm.sol";
import {AnchorRegistry} from "../../../src/AnchorRegistry.sol";

/// @notice Invariant actor: anchors random hashes from a bounded set of senders,
/// advancing time, and records a ghost of the intended record plus the record
/// decoded from the emitted event, so the invariant suite can assert
/// "first-seen wins" and "event mirrors storage" across random sequences.
contract AnchorHandler {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 private constant ANCHORED_SIG =
        keccak256("Anchored(bytes32,address,uint8,bool,uint64)");
    bytes32 private constant MERKLE_SIG =
        keccak256("MerkleRootAnchored(bytes32,address,uint8,uint64)");

    AnchorRegistry public immutable reg;

    address[] internal actors;

    /// @dev Ghost mirror captured at first anchor for each hash.
    struct Ghost {
        bool seen;
        address anchorer; // intended (msg.sender) and event-decoded must agree
        uint64 blockTimestamp; // intended block.timestamp
        uint64 blockNumber; // intended block.number
        uint8 algo;
        bool isMerkleRoot;
        bytes32 metadataHash;
        // Event-decoded values (independent of getRecord) for event<->storage check.
        address evtAnchorer;
        uint8 evtAlgo;
        bool evtIsMerkleRoot;
        uint64 evtBlockTimestamp;
    }

    mapping(bytes32 => Ghost) internal ghosts;
    bytes32[] public anchoredHashes;

    constructor(AnchorRegistry _reg) {
        reg = _reg;
        actors.push(address(0xA11CE));
        actors.push(address(0xB0B));
        actors.push(address(0xCA1));
        actors.push(address(0xD00D));
    }

    function anchoredCount() external view returns (uint256) {
        return anchoredHashes.length;
    }

    function ghostOf(bytes32 hash) external view returns (Ghost memory) {
        return ghosts[hash];
    }

    function anchor(uint256 actorSeed, bytes32 hash, uint8 algo, bytes32 metadataHash) external {
        _doAnchor(actorSeed, hash, algo, metadataHash, false);
    }

    function anchorMerkleRoot(uint256 actorSeed, bytes32 root, uint8 algo, bytes32 metadataHash)
        external
    {
        _doAnchor(actorSeed, root, algo, metadataHash, true);
    }

    function _doAnchor(
        uint256 actorSeed,
        bytes32 hash,
        uint8 algo,
        bytes32 metadataHash,
        bool isMerkleRoot
    ) internal {
        if (hash == bytes32(0)) return; // contract rejects; skip to keep the run going
        if (reg.isAnchored(hash)) return; // duplicate would revert; skip

        address actor = actors[actorSeed % actors.length];

        // Advance time so stored timestamps/blocks vary across the sequence.
        vm.warp(block.timestamp + 1 + (actorSeed % 100));
        vm.roll(block.number + 1);

        uint64 ts = uint64(block.timestamp);
        uint64 bn = uint64(block.number);

        vm.recordLogs();
        vm.prank(actor);
        if (isMerkleRoot) {
            reg.anchorMerkleRoot(hash, algo, metadataHash);
        } else {
            reg.anchor(hash, algo, metadataHash);
        }
        Vm.Log[] memory logs = vm.getRecordedLogs();

        Ghost storage g = ghosts[hash];
        g.seen = true;
        g.anchorer = actor;
        g.blockTimestamp = ts;
        g.blockNumber = bn;
        g.algo = algo;
        g.isMerkleRoot = isMerkleRoot;
        g.metadataHash = metadataHash;

        _decodeEvent(g, logs, hash, isMerkleRoot);

        anchoredHashes.push(hash);
    }

    /// @dev Pull the registry event for `hash` out of the recorded logs and store
    /// its fields on the ghost, independent of any storage read.
    function _decodeEvent(Ghost storage g, Vm.Log[] memory logs, bytes32 hash, bool isMerkleRoot)
        internal
    {
        bytes32 wantSig = isMerkleRoot ? MERKLE_SIG : ANCHORED_SIG;
        for (uint256 i = 0; i < logs.length; i++) {
            Vm.Log memory l = logs[i];
            if (l.topics.length < 3) continue;
            if (l.topics[0] != wantSig) continue;
            if (l.topics[1] != hash) continue;

            g.evtAnchorer = address(uint160(uint256(l.topics[2])));
            if (isMerkleRoot) {
                (uint8 a, uint64 t) = abi.decode(l.data, (uint8, uint64));
                g.evtAlgo = a;
                g.evtIsMerkleRoot = true;
                g.evtBlockTimestamp = t;
            } else {
                (uint8 a, bool m, uint64 t) = abi.decode(l.data, (uint8, bool, uint64));
                g.evtAlgo = a;
                g.evtIsMerkleRoot = m;
                g.evtBlockTimestamp = t;
            }
            return;
        }
        revert("handler: anchor event not found in logs");
    }
}
