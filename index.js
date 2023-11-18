
const express = require('express')
const fs = require('fs')
const { execSync } = require('child_process')
const admin = require("firebase-admin");
// const snarkjs = require('snarkjs')
const circomlibjs = require('circomlibjs')
var bodyParser = require('body-parser')
var cors = require('cors')
const { groth16, plonk } = require('snarkjs');




const serviceAccount = require("./zuck-hunt-firebase-adminsdk.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
let db = admin.firestore()

const app = express()
const port = 3000
app.use(cors())
app.use(bodyParser.json())


app.post('/', async (req, res) => {
    const data = req.body.data
    const poseidon = await circomlibjs.buildPoseidon();
    const hash = poseidon.F.toString(poseidon(data));
    res.json({ data: hash });

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

function makeSalt(length) {
    let result = '';
    const salterStrig = '0123456789bcdefghjkmnpqrstuvwxyz'

    const charactersLength = salterStrig.length;
    let counter = 0;
    while (counter < length) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
        counter += 1;
    }
    return result;
}


app.post('/createHunt', async (req, res) => {
    try {
        const data = req.body
        const name = data.name
        console.log(data)
        const nameProcessed = name.toLocaleLowerCase()
        // const geohash = data.geohash
        const salt = data.salt
        const pHash = data.pHash
        // const geoHashExt = geohash + salt

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
        // fs.copyFileSync('./templates/location.circom.tmp', `${cirDir}/location.circom`)
        const circuitFileTemplate = fs.readFileSync('./templates/circuit.circom.tmp', 'utf8')
        fs.writeFileSync(`${cirDir}/input.json`, JSON.stringify(testInput))
        const circuitFileContent = circuitFileTemplate.replace('${data.geoHashExt}', pHash)
        fs.writeFileSync(`${cirDir}/circuit.circom`, circuitFileContent)
        firestoreDoc.update({ nameProcessed, hint, status: "Created Circuits" })
        const compileCircuit = execSync(`circom ${cirDir}/circuit.circom --wasm --r1cs --output  ./build/${nameProcessed}`);
        firestoreDoc.update({ nameProcessed, hint, status: "Compiled Circuits" })
        const generateWitness = execSync(`node ${buildDir}/circuit_js/generate_witness.js ${buildDir}/circuit_js/circuit.wasm ${cirDir}/input.json ${buildDir}/witness.wtns`);
        firestoreDoc.update({ nameProcessed, hint, status: "Genrated Witness" })
        const generateProvingKey = execSync(`npx snarkjs groth16 setup ${buildDir}/circuit.r1cs ./circuits/powersOfTau28_hez_final_14.ptau ${buildDir}/circuit_0000.zkey `)
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
    const { proof, publicSignals } = await groth16.fullProve(
        testInput,
        `build/circuit_js/circuit.wasm`,
        `build/circuit_0000.zkey`)
    const vKey = JSON.parse(fs.readFileSync(`build/verification_key.json`));
    const zkRes = await groth16.verify(vKey, publicSignals, proof);
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