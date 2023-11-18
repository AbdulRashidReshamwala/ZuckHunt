
const express = require('express')
const fs = require('fs')
const { execSync } = require('child_process')
const admin = require("firebase-admin");
const snarkjs = require('snarkjs')
const circomlibjs = require('circomlibjs')
var bodyParser = require('body-parser')
var cors = require('cors')



const serviceAccount = require("./zuck-hunt-firebase-adminsdk.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
let db = admin.firestore()

const app = express()
const port = 3000
app.use(cors())
app.use(bodyParser.json())


app.get('/', async (req, res) => {
    const poseidon = await circomlibjs.buildPoseidon();
    const hash = poseidon.F.toString(poseidon([13]));
    // const hash2 = poseidon.F.toString(poseidon([10, 2]));
    // const t = hash === hash2
    res.send(hash);

})

function execShellCommand(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                console.warn(error);
            }
            resolve(stdout ? stdout : stderr);
        });
    });
}

app.post('/createHunt', async (req, res) => {
    try {
        const data = req.body
        const name = data.name
        console.log(data)
        const nameProcessed = name.toLocaleLowerCase()
        const positionData = data.positionData
        const testInput = data.testInput
        const hint = data.hint
        const buildDir = `./build/${nameProcessed}`
        const cirDir = `./circuits/${nameProcessed}`
        const firestoreDoc = db.collection('hunt_submission').doc(nameProcessed)
        await firestoreDoc.set({ nameProcessed, hint, status: "started" })
        fs.rmSync(cirDir, { recursive: true, force: true });
        fs.mkdirSync(cirDir);
        fs.rmSync(buildDir, { recursive: true, force: true });
        fs.mkdirSync(buildDir);
        fs.copyFileSync('./templates/location.circom.tmp', `${cirDir}/location.circom`)
        const circuitFileTemplate = fs.readFileSync('./templates/circuit.circom.tmp', 'utf8')
        fs.writeFileSync(`${cirDir}/input.json`, JSON.stringify(testInput))
        const circuitFileContent = circuitFileTemplate.replace('${data.lat1}', positionData.lat1).replace('${data.lat2}', positionData.lat2).replace('${data.lon1}', positionData.lon1).replace('${data.lon2}', positionData.lon2)
        fs.writeFileSync(`${cirDir}/circuit.circom`, circuitFileContent)
        firestoreDoc.update({ nameProcessed, hint, status: "Created Circuits" })
        const compileCircuit = execSync(`circom ${cirDir}/circuit.circom --wasm --r1cs --output  ./build/${nameProcessed}`);
        firestoreDoc.update({ nameProcessed, hint, status: "Compiled Circuits" })
        const generateWitness = execSync(`node ${buildDir}/circuit_js/generate_witness.js ${buildDir}/circuit_js/circuit.wasm ${cirDir}/input.json ${buildDir}/witness.wtns`);
        firestoreDoc.update({ nameProcessed, hint, status: "Genrated Witness" })
        const generateProvingKey = execSync(`npx snarkjs groth16 setup ${buildDir}/circuit.r1cs ./circuits/powersOfTau28_hez_final_12.ptau ${buildDir}/circuit_0000.zkey `)
        const generateVerificationKey = execSync(`npx snarkjs zkey export verificationkey ${buildDir}/circuit_0000.zkey ${buildDir}/verification_key.json`)
        firestoreDoc.update({ nameProcessed, hint, status: "Completed" })
        res.json({ ...req.body, msg: "hello world" })
    }
    catch (e) {
        console.log('e')
        res.send(e.toString())
    }
})

app.post('/verifyHunt', async (req, res) => {
    const data = req.body
    const huntName = data.name
    const testInput = data.testInput
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        testInput,
        `build/${huntName}/circuit_js/circuit.wasm`,
        `build/${huntName}/circuit_0000.zkey`)
    const vKey = JSON.parse(fs.readFileSync(`build/${huntName}/verification_key.json`));
    const zkRes = await snarkjs.groth16.verify(vKey, publicSignals, proof);
    res.send({ proof, publicSignals, zkRes })
})

const setup = async () => {
    // wakuNode = await createLightNode({ defaultBootstrap: true });
    // await node.start();
}
setup().then(() => {
    app.listen(port, () => {
        console.log(`Example app listening on port ${port}`)
    })

})