
const express = require('express')
const fs = require('fs')
const circomlibjs = require('circomlibjs')
var bodyParser = require('body-parser')
var cors = require('cors')
const { groth16, plonk } = require('snarkjs');
const ethers = require("ethers");
const ABI = require("./abi.json");


const app = express()
const port = 3000
app.use(cors())
app.use(bodyParser.json())
const privateKey = process.env.PK;
const lineaProvider = 'https://linea-goerli.infura.io/v3/75d20dcf6d4c4ad294404cdcd6c5408e';
const provider = new ethers.providers.JsonRpcProvider(lineaProvider);



app.post('/', async (req, res) => {
    const data = req.body.data
    const poseidon = await circomlibjs.buildPoseidon();
    const hash = poseidon.F.toString(poseidon(data));
    res.json({ data: hash });

})

app.get('/data', async (req, res) => {
    const contractAddress = "0xF989741E4A965A16a4606161E52aE98c78E440b4";
    const ownerAccount = new ethers.Wallet(privateKey, provider);
    const myContract = new ethers.Contract(contractAddress, ABI, ownerAccount);
    const balance = await myContract.balanceOf("0x237ae8ff0815AED78d8A76c1267Bb1922492d4D7")
    console.log('My nfts', balance)
    const list = []
    for (let i = 0; i < balance; i++) {
        const tokenURI = await myContract.tokenURI(i);
        const owner = await myContract.ownerOf((i))
        list.push({ id: i, tokenURI: tokenURI, owner: owner })
    }
    res.json(list)

})
// console.log(process.env.PK)

app.post('/mint', async (req, res) => {
    console.log(req.body)
    const imgURI = req.body.img
    const receiver = req.body.add
    console.log(req.add)
    const vKey = JSON.parse(fs.readFileSync(`build/verification_key.json`));
    const zkRes = await groth16.verify(vKey, req.body.publicSignals, req.body.proof);
    // res.send("done")

    const ownerAccount = new ethers.Wallet(privateKey, provider);
    const contractAddress = "0xF989741E4A965A16a4606161E52aE98c78E440b4";
    const myContract = new ethers.Contract(contractAddress, ABI, ownerAccount);
    const tx = await myContract.mintNFT(imgURI, receiver);
    console.log("Hash of tx: ", tx.hash)
    const receipt = await tx.wait();
    res.send(receipt)
})


app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
