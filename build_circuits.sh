circom ./circuits/circuit.circom --wasm --r1cs -o ./build
npx snarkjs groth16 setup build/circuit.r1cs ./circuits/powersOfTau28_hez_final_14.ptau ./build/circuit_0000.zkey
npx snarkjs zkey export verificationkey ./build/circuit_0000.zkey verification_key.json

