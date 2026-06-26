// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

/// @notice Differential parity: Solidity keccak256/sha256 (and salted variants) must
/// match the shared golden fixtures produced by packages/hash-core.
contract KeccakParityTest is Test {
    uint8 internal constant ALGO_KECCAK256 = 0x01;
    uint8 internal constant ALGO_SHA256 = 0x02;
    uint8 internal constant ALGO_KECCAK256_SALTED = 0x11;
    uint8 internal constant ALGO_SHA256_SALTED = 0x12;

    function test_allPayloadsMatchGoldens() public view {
        string memory manifestJson = vm.readFile("../fixtures/manifest.json");
        uint256 count = vm.parseJsonUint(manifestJson, ".count");

        for (uint256 i = 0; i < count; i++) {
            string memory base = string.concat(".payloads[", vm.toString(i), "]");
            string memory name = vm.parseJsonString(manifestJson, string.concat(base, ".name"));
            uint8 algo = uint8(vm.parseJsonUint(manifestJson, string.concat(base, ".algo")));
            _assertPayloadParity(name, algo);
        }
    }

    function _assertPayloadParity(string memory name, uint8 algo) internal view {
        bytes memory payload = vm.readFileBinary(string.concat("../fixtures/payloads/", name));
        string memory expectedJson =
            vm.readFile(string.concat("../fixtures/expected/", name, ".json"));
        bytes32 expected = vm.parseJsonBytes32(expectedJson, ".hash");

        bytes32 computed;
        if (algo == ALGO_KECCAK256) {
            computed = keccak256(payload);
        } else if (algo == ALGO_SHA256) {
            computed = sha256(payload);
        } else if (algo == ALGO_KECCAK256_SALTED || algo == ALGO_SHA256_SALTED) {
            bytes32 salt = vm.parseJsonBytes32(expectedJson, ".salt");
            bytes memory preimage = abi.encodePacked(salt, payload);
            computed = algo == ALGO_KECCAK256_SALTED ? keccak256(preimage) : sha256(preimage);
        } else {
            revert("unsupported algo for direct hash parity");
        }

        assertEq(computed, expected, string.concat("parity mismatch: ", name));
    }
}
