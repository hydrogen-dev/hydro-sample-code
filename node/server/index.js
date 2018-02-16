const express = require('express');
const cors = require('cors');
const app = express();
const morgan = require('morgan');
const chalk  = require('chalk');
const bodyParser = require('body-parser');
const path = require('path');
const Web3 = require('web3');
const request = require('request-promise');
const nodeModulesPath = path.join(__dirname, '../node_modules');
const Tx = require('ethereumjs-tx');
const EUtil = require('ethereumjs-util');
const abi = require('./interface.json'); //interface for contract

const baseUrl = ''; //baseurl for Hydro API. Use Sandbox for testnet and Production for mainnet
const ethAddress = 'wss://rinkeby.infura.io/ws'; //use websocket address to be able to listen to events
const username = ''; //demo username for Hydro API (plug in your own)
const key = ''; //demo key for Hydro API (plug in your own)
const contractAddress = ''; //contract address
const web3 = new Web3(ethAddress); // using web3.js version 1.0.0-beta.28, node v8.9.1, npm 5.5.1
const HydroContract = new web3.eth.Contract(abi, contractAddress);

let hydro_address_id = 3; //demo hydro_address_id from whitelisting
let amount;
let challenge;
let partner_id;
let accountAddress = ''; //demo account address (plug in your own)
let privateKey = ''; //demo private key associated with account address (plug in your own)

app.use(cors());
app.use(morgan('dev'));
app.use(express.static(nodeModulesPath));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

//our main script
async function main() {

    try {
        if(!accountAddress) {
            //create ethereum account via web3
            console.log(chalk.magentaBright('creating an ethereum account...'));
            account = await createAddress();
            console.log(chalk.green('account'),account);
            accountAddress = account.address;
            privateKey = account.privateKey;
        } 
        if(!hydro_address_id) {
            //one-time whitelist via Hydro API
            console.log(chalk.magentaBright('requesting to whitelist via Hydro API...'));
            hydro_address_id = await whitelistAddress();
            console.log(chalk.green('hydro_address_id'),hydro_address_id);
        }
        if(!amount && !challenge && !partner_id) {
            //ask for "challenge details" via Hydro API
            console.log(chalk.magentaBright('requesting challenge details via Hydro API...'));
            const data = await requestChallengeDetails();
            console.log(chalk.green('data'),data);
            amount = data.amount;
            challenge = data.challenge;
            partner_id = data.partner_id;
        }
        //perform "raindrop" by calling methods in the contract
        console.log(chalk.magentaBright('starting to perform raindrop...'));
        await performRaindrop();

        //check if authenticated via Hydro API
        console.log(chalk.magentaBright('checking if we are authenticated...'));
        await checkIfAuthenticated();
    }
    catch (error) {
        console.error(chalk.red('error'), error);
    }

}

//create ethereum account
async function createAddress() {

    try {
        return await web3.eth.accounts.create();
    }
    catch (error) {
        return Promise.reject(error);
    }

}

//User requests to whitelist an Ethereum address (one-time)
//returns hydro_address_id
async function whitelistAddress() {

    try {
        const options = {
            method: 'POST',
            uri: `${baseUrl}/whitelist/${accountAddress}`,
            headers: {
              'Content-Type': 'application/json'
            },
            body: {
                username: username,
                key: key
            },
            json: true
        };
        return await request(options);
    }
    catch (error) {
        return Promise.reject(error);
    }

}

//Requests challenge details
//Returns amount, challenge, and partner_id
async function requestChallengeDetails() {

    try {
        const options = {
            method: 'POST',
            uri: `${baseUrl}/challenge`,
            headers: {
              'Content-Type': 'application/json'
            },
            qs: {
                hydro_address_id: hydro_address_id
            },
            body: {
                username: username,
                key: key
            },
            json: true
        };
        return await request(options);
    }
    catch (error) {
        return Promise.reject(error);
    }

}

//Checks if address is authenticated
//Returns boolean
async function authenticatedWithHydro() {

    try {
        const options = {
            method: 'POST',
            uri: `${baseUrl}/authenticate`,
            headers: {
              'Content-Type': 'application/json'
            },
            qs: {
                hydro_address_id: hydro_address_id
            },
            body: {
                username: username,
                key: key
            },
            json: true
        };
        return await request(options);
    }
    catch (error) {
        return Promise.reject(error);
    }
    
}

async function checkIfAuthenticated() {

    try {
        const isAuthenticated = await authenticatedWithHydro();
        console.log(chalk.greenBright('Are we authenticated with the Hydro API?'), isAuthenticated)
    }
    catch (error) {
        return Promise.reject(error);
    }

}

//Listens to `sendSignedTransaction` method in the contract
//For now only this method works for sending transactions on Infura network
async function sendSignedTransaction(privateKey, nonce, gasPrice, gasLimit, to, from, data) {

    try {
        const rawTx1 = {
          nonce: nonce,
          gasPrice: gasPrice,
          gasLimit: gasLimit,
          to: to,
          from: from,
          data: data
        };

        const tx1 = new Tx(rawTx1);
        tx1.sign(privateKey);

        const serializedTx = tx1.serialize();
        const serializedTxHex = serializedTx.toString('hex');

        const receipt = await web3.eth.sendSignedTransaction('0x' + serializedTxHex)
            .once('transactionHash', hash => {
                console.log(chalk.green('transaction hash'), hash)
            })
            .once('confirmation', (confNumber, receipt) => {
                console.log(chalk.green('confNumber'), confNumber)
            })
        return receipt;
    }
    catch (error) {
        //Transaction might be still pending or successful even if you get an error
        //Check on Etherscan, for example, if the transaction was successful
        //https://rinkeby.etherscan.io/address/{accountAddress}
        //https://rinkeby.etherscan.io/tx/{transactionHash}
        //Check out this issue with web3 for further details regarding below error message https://github.com/ethereum/web3.js/issues/1102
        //Example: "Transaction was not mined within 50 blocks, please make sure your transaction was properly send. Be aware that it might still be mined!"
        return Promise.reject(error);
    }

}

//via web3, perform "raindrop" by calling `getMoreTokens` and `authenticate` methods in the contract
async function performRaindrop() {

    try {
        //get gas price
        const price = await web3.eth.getGasPrice();
        const priceHex = web3.utils.toHex(price);
        console.log(chalk.green('price'),price);

        //check balance for your information
        const balance = await web3.eth.getBalance(accountAddress);
        console.log(chalk.green('balance'),balance);

        //get gas limit on latest block
        const getBlock = await web3.eth.getBlock("latest");
        const latestGasLimit = getBlock.gasLimit;
        const latestGasLimitHex = web3.utils.toHex(latestGasLimit);
        console.log(chalk.green('latestGasLimit'),latestGasLimit);
        
        //convert private key into buffer
        const privateKeyBuffer = EUtil.toBuffer(privateKey, 'hex');

        //get nonce via transaction count
        const nonce = await web3.eth.getTransactionCount(accountAddress);
        const nonceHex = web3.utils.toHex(nonce);
        console.log(chalk.green('nonce'),nonce);

        //get abi for `getMoreTokens` method in the contract
        const getMoreTokensData = await HydroContract.methods.getMoreTokens().encodeABI();
        //get abi for `authenticate` method in the contract
        const getAuthenticateData = await HydroContract.methods.authenticate(amount, challenge, partner_id).encodeABI();

        //estimate gas for `getMoreTokens`
        const gasForGetMoreTokens = await HydroContract.methods.getMoreTokens().estimateGas()
        const gasHexForGetMoreTokens = web3.utils.toHex(gasForGetMoreTokens);
        console.log(chalk.green('gasForGetMoreTokens'),gasForGetMoreTokens)

        //get receipt for requesting more hydros
        console.log(chalk.magentaBright('requesting more tokens...'));
        const getMoreTokensReceipt = await sendSignedTransaction(privateKeyBuffer, nonceHex, priceHex, gasHexForGetMoreTokens, contractAddress, accountAddress, getMoreTokensData);
        console.log(chalk.green('getMoreTokensReceipt'),getMoreTokensReceipt);

        //update nonce for next transaction
        const newNonce = await web3.eth.getTransactionCount(accountAddress);
        const newNonceHex = web3.utils.toHex(newNonce);
        console.log(chalk.green('newNonce'),newNonce);

        //estimate gas for `authenticate`
        const gasForAuthenticate = await HydroContract.methods.authenticate(amount, challenge, partner_id).estimateGas({from:accountAddress, gas:latestGasLimit});
        const gasHexForAuthenticate = web3.utils.toHex(gasForAuthenticate);
        console.log(chalk.green('gasForAuthenticate'),gasForAuthenticate);

        //get receipt for authenticate
        console.log(chalk.magentaBright('requesting to authenticate...'));
        const authenticateReceipt = await sendSignedTransaction(privateKeyBuffer, newNonceHex, priceHex, gasHexForAuthenticate, contractAddress, accountAddress, getAuthenticateData);
        console.log(chalk.green('authenticateReceipt'),authenticateReceipt);
    }
    catch (error) {
        return Promise.reject(error);
    }

}

// error handling
app.use(function (err, req, res, next) {
    console.error(chalk.red('global error handling'),err);
});

app.listen(3000, function() {
    console.log(chalk.bold('listening on port 3000...'));
    //execute our script!
    main();
});

module.exports = app;