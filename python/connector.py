import json
import web3
import requests
import time

from web3 import Web3, IPCProvider, TestRPCProvider
from solc import compile_source
from web3.contract import ConciseContract

# Loading the Hydro Smart Contract ABI
# Note this is the testnet ABI which is slightly different than the mainnet version
with open('abi.json') as abi_json:
  HydroABI = json.load(abi_json)

# This will need to point to your geth node
w3 = Web3(IPCProvider('{your geth node}'))

# This is the testnet address on Rinkeby. Replace with mainnet address when you are finished testing
contract_address = '{mainnet or testnet address here}'
hydroConctract = w3.eth.contract(HydroABI, contract_address, ContractFactoryClass=ConciseContract)

w3.personal.unlockAccount(w3.eth.accounts[0], '{your account password}')

# Uncomment this to get more hydro tokens in the testnet
# print(hydroConctract.getMoreTokens(transact={'from':w3.eth.accounts[0]}))

headers = {
  "Content-type": "application/json"
}

# Use your Hydro API username and key here
data = {
  "username":"{your hydro api username}",
  "key":"{your hydro api key}"
}

# Uncomment this to perform 1 time whitelisting for an address
# r = requests.post("http://{hydro sandbox or mainnet server}/whitelist/{hydro address}", data=json.dumps(data), headers=headers)
# hydro_address_id = json.loads(r.text)

# Making a call to Hydro API for challenge values
# Replace the hydro_address_id with your account id
r = requests.post("http://{hydro sandbox or mainnet server}/challenge?hydro_address_id={your hydro_address_id}", data=json.dumps(data), headers=headers)
respJson = json.loads(r.text)

# Send the authentication attempt
trxHash = hydroConctract.authenticate(respJson['amount'], respJson['challenge'], respJson['partner_id'], transact={'from':w3.eth.accounts[0]})
print("Transaction Hash: " + trxHash)

# Wait for the transaction to be mined
while (w3.eth.getTransactionReceipt(trxHash) == None):
    print("Waiting for transaction to be mined")
    time.sleep(5)

print("Transaction Mined!")

# After the transaction is mined, we check to see if the account was authenticated correctly
# You will need to replace hydro_address_id here as well
r = requests.post("http://{hydro sandbox or mainnet server}/authenticate?hydro_address_id={your hydro_address_id}", data=json.dumps(data), headers=headers)

if r.text == 'true':
  print("Authentication Successful")
else:
  print("Authentication Failed")
