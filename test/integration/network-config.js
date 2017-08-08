/**
 * Copyright 2017 IBM All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an 'AS IS' BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */
'use strict';

var utils = require('fabric-client/lib/utils.js');
var logger = utils.getLogger('Network Config');

var tape = require('tape');
var _test = require('tape-promise');
var test = _test(tape);

var Client = require('fabric-client');
var util = require('util');
var fs = require('fs');
var path = require('path');
var grpc = require('grpc');

var testUtil = require('../unit/util.js');

var channel_name = 'mychannel';

test('\n\n***** use the network configuration file  *****\n\n', function(t) {
	testUtil.resetDefaults();

	// build a 'Client' instance that knows the network
	//  this network config does not have the client information, we will
	//  load that later so that we can switch this client to be in a different
	//  organization
	var client = Client.loadFromConfig('test/fixtures/network.yaml');
	t.pass('Successfully loaded a network configuration');

	var config = null;
	var signatures = [];
	var genesis_block = null;
	var channel = null;
	var query_tx_id = null;

	// lets load the client information for this organization
	// the file only has the client section
	client.loadFromConfig('test/fixtures/org1.yaml');
		// tell this client instance where the state and key stores are located
	client.setStoresFromConfig()
	.then((nothing) => {
		t.pass('Successfully created the key value store  and crypto store based on the config and network config');
		// This step is to set the user context for the actions.
		// The user will be enrolled and get a certificate from the CA defined
		// in the organization defined in the client section of the last
		// network configuration loaded.
		return client.setUserFromConfig('admin', 'adminpw', true);
	}).then((admin) => {
		t.pass('Successfully enrolled user \'admin\' for org1');
		// get the config envelope created by the configtx tool
		let envelope_bytes = fs.readFileSync(path.join(__dirname, '../fixtures/channel/mychannel.tx'));
		// have the sdk get the config update object from the envelope
		// the config update object is what is required to be signed by all
		// participating organizations
		config = client.extractChannelConfig(envelope_bytes);
		t.pass('Successfully extracted the config update from the configtx envelope');

		// sign the config by admin from org1
		var signature = client.signChannelConfig(config);
		// convert signature to a storable string
		// fabric-client SDK will convert any strings it finds back
		// to GRPC protobuf objects during the channel create
		var string_signature = signature.toBuffer().toString('hex');
		t.pass('Successfully signed config update');
		// collect signature from org1 admin
		signatures.push(string_signature);

		/*
		 * switch to organization org2
		 */

		return client.loadFromConfig('test/fixtures/org2.yaml');
	}).then((nothing) =>{
		t.pass('Successfully loaded the client configuration for org2');

		// reset the stores to be using the ones for this organization
		return client.setStoresFromConfig();
	}).then((nothing) =>{
		t.pass('Successfully set the stores for org2');

		// reset the user context to be a user from org2
		return client.setUserFromConfig('admin', 'adminpw', true);
	}).then((admin) => {
		t.pass('Successfully enrolled user \'admin\' for org2');

		// sign the config by admin from org2
		var signature = client.signChannelConfig(config);
		t.pass('Successfully signed config update');

		// collect signature from org2 admin
		signatures.push(signature);

		// now we have enough signatures...

		// build up the create request
		let tx_id = client.newTransactionID();
		let request = {
			config: config,
			signatures : signatures,
			name : channel_name,
			orderer : 'orderer.example.com', //this assumes we have loaded a network config
			txId  : tx_id
		};

		// send create request to orderer
		return client.createChannel(request); //logged in as org2
	}).then((result) => {
		logger.debug('\n***\n completed the create \n***\n');

		logger.debug(' response ::%j',result);
		t.pass('Successfully created the channel.');
		if(result.status && result.status === 'SUCCESS') {
			return sleep(5000);
		} else {
			t.fail('Failed to create the channel. ');
			throw new Error('Failed to create the channel. ');
		}
	}).then((nothing) => {
		t.pass('Successfully waited to make sure new channel was created.');

		// build up the create request, but this time let's
		// not include the orderer and have the SDK find it
		// in the network configuration
		let tx_id = client.newTransactionID();
		let request = {
			config: config,
			signatures : signatures,
			name : channel_name,
			//orderer :  again this assumes we have loaded a network config
			txId  : tx_id
		};

		// send create request to orderer, now this should fail as we have already
		// created the channel, but it needs to fail with the BAD_REQUEST. This
		// indicates that an orderer got the submission, meaning that leaving the
		// orderer setting out of the request the SDK was able to find an orderer
		// in the network configuration
		return client.createChannel(request); //logged in as org2
	}).then((result) => {

		logger.debug(' response ::%j',result);
		t.failed('Failed, should not have gotten a positive response on second create channel %s', result);
		throw new Error('Failed on second create channel');

	},(err) => {
		if(err.toString().indexOf('BAD_REQUEST') > -1) {
			logger.debug('Successfully got a reject with %s',err);
			t.pass('Successfully got a bad request on second create channel');
		} else {
			logger.error('Failed test. Error: ' + err.stack ? err.stack : err);
			t.fail('Failed to get the bad request message ');
			throw new Error('Failed to get the bad request message from the orderer on the second create');
		}

		// have the client build a channel with all peers and orderers
		channel = client.getChannel(channel_name);

		// we are still logged in as the orderer admin
		let tx_id = client.newTransactionID();
		let request = {
			txId : 	tx_id
		};

		return channel.getGenesisBlock(request); //logged in as org2
	}).then((block) =>{
		t.pass('Successfully got the genesis block');
		genesis_block = block;

		let tx_id = client.newTransactionID();
		let request = {
			//targets: // this time we will leave blank so that we can use
				       // all the peers assigned to the channel ...some may fail
				       // if the submitter is not allowed, let's see what we get
			block : genesis_block,
			txId : 	tx_id
		};

		return channel.joinChannel(request); //logged in as org2
	}).then((results) => {
		logger.debug(util.format('Join Channel R E S P O N S E using default targets: %j', results));

		// first of the results should not have good status as submitter does not have permission
		if(results && results[0] && results[0].response && results[0].response.status == 200) {
			t.fail(util.format('Successfully had peer in organization %s join the channel', 'org1'));
			throw new Error('Should not have been able to join channel with this submitter');
		} else {
			t.pass(' Submitter on "org2" Failed to have peer on org1 channel');
		}

		// second of the results should have good status
		if(results && results[1] && results[1].response && results[1].response.status == 200) {
			t.pass(util.format('Successfully had peer in organization %s join the channel', 'org2'));
		} else {
			t.fail(' Failed to join channel');
			throw new Error('Failed to join channel');
		}

		/*
		 * switch to organization org1
		 */
		client.loadFromConfig('test/fixtures/org1.yaml');

		return client.setStoresFromConfig();
	}).then((nothing) => {
		t.pass('Successfully created the key value store  and crypto store based on the config and network config');

		return client.setUserFromConfig('admin', 'adminpw', true);
	}).then((admin) => {
		t.pass('Successfully enrolled user \'admin\' for org1');
		let tx_id = client.newTransactionID();
		let request = {
			targets: ['peer0.org1.example.com'], // this does assume that we have loaded a
			                                     // network config with a peer by this name
			block : genesis_block,
			txId : 	tx_id
		};

		return channel.joinChannel(request); //logged in as org1
	}).then((results) => {
		logger.debug(util.format('Join Channel R E S P O N S E  for a string target: %j', results));

		if(results && results[0] && results[0].response && results[0].response.status == 200) {
			t.pass(util.format('Successfully had peer in organization %s join the channel', 'org1'));
		} else {
			t.fail(' Failed to join channel on org1');
			throw new Error('Failed to join channel on org1');
		}

		process.env.GOPATH = path.join(__dirname, '../fixtures');

		// send proposal to endorser
		var request = {
			targets: ['peer0.org1.example.com'],
			chaincodePath: 'github.com/example_cc',
			chaincodeId: 'example',
			chaincodeVersion: 'v1',
			chaincodePackage: ''
		};

		return client.installChaincode(request); //still logged as org1
	}).then((results) => {
		if(results && results[0] && results[0][0].response && results[0][0].response.status == 200) {
			t.pass('Successfully installed chain code on org1');
		} else {
			t.fail(' Failed to install chaincode on org1');
			throw new Error('Failed to install chain code on org1');
		}

		/*
		 * switch to organization org2
		 */

		client.loadFromConfig('test/fixtures/org2.yaml');

		return client.setStoresFromConfig();
	}).then((nothing) => {
		t.pass('Successfully created the key value store  and crypto store based on the config and network config');

		return client.setUserFromConfig('admin', 'adminpw', true);
	}).then((admin) => {
		t.pass('Successfully enrolled user \'admin\' for org2');
		// send proposal to endorser
		var request = {
			targets: ['peer0.org2.example.com'],
			chaincodePath: 'github.com/example_cc',
			chaincodeId: 'example',
			chaincodeVersion: 'v1',
			chaincodePackage: ''
		};

		return client.installChaincode(request); // now logged in as org2
	}).then((results) => {
		if(results && results[0] && results[0][0].response && results[0][0].response.status == 200) {
			t.pass('Successfully installed chain code on org2');
		} else {
			t.fail(' Failed to install chaincode');
			throw new Error('Failed to install chain code');
		}

		let tx_id = client.newTransactionID();
		let request = {
			chaincodePath: 'github.com/example_cc',
			chaincodeId: 'example',
			chaincodeVersion: 'v1',
			args: ['a', '100', 'b', '200'],
			txId: tx_id
			// targets is not required, however the logged in user may not have
			// admin access to all the peers defined in the network configuration
			//targets: ['peer0.org1.example.com'],
		};

		return channel.sendInstantiateProposal(request); //logged in as org2
	}).then((results) => {
		var proposalResponses = results[0];
		var proposal = results[1];
		if (proposalResponses && proposalResponses[0].response && proposalResponses[0].response.status === 200) {
			t.pass('Successfully sent Proposal and received ProposalResponse');
			var request = {
				proposalResponses: proposalResponses,
				proposal: proposal,
				admin : true
				//orderer : not specifying, the first orderer defined in the
				//          network configuration for this channel will be used
			};

			return channel.sendTransaction(request); // logged in as org2
		} else {
			t.fail('Failed to send  Proposal or receive valid response. Response null or status is not 200. exiting...');
			throw new Error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
		}
	}).then((response) => {
		if (!(response instanceof Error) && response.status === 'SUCCESS') {
			t.pass('Successfully sent transaction to instantiate the chaincode to the orderer.');
			return sleep(10000); // use sleep for now until the eventhub is integrated into the network config changes
		} else {
			t.fail('Failed to order the transaction to instantiate the chaincode. Error code: ' + response.status);
			throw new Error('Failed to order the transaction to instantiate the chaincode. Error code: ' + response.status);
		}
	}).then((results) => {
		t.pass('Successfully waited for chaincodes to startup');
		/*
		 * switch to organization org1
		 */

		client.loadFromConfig('test/fixtures/org1.yaml');

		return client.setStoresFromConfig();
	}).then((nothing) => {
		t.pass('Successfully created the key value store  and crypto store based on the config and network config');

		return client.setUserFromConfig('admin', 'adminpw', true);
	}).then((admin) => {
		t.pass('Successfully enrolled user \'admin\' for org1');

		let tx_id = client.newTransactionID();
		query_tx_id = tx_id.getTransactionID();
		var request = {
			chaincodeId : 'example',
			fcn: 'move',
			args: ['a', 'b','100'],
			txId: tx_id
			//targets - Letting default to all endorsing peers defined on the channel in the network configuration
		};

		return channel.sendTransactionProposal(request); //logged in as org1
	}).then((results) => {
		var proposalResponses = results[0];
		var proposal = results[1];
		var all_good = true;
		for(var i in proposalResponses) {
			let one_good = false;
			let proposal_response = proposalResponses[i];
			if( proposal_response.response && proposal_response.response.status === 200) {
				t.pass('transaction proposal has response status of good');
				one_good = true;
			} else {
				t.fail('transaction proposal was bad');
			}
			all_good = all_good & one_good;
		}

		if (!all_good) {
			t.fail('Failed to send invoke Proposal or receive valid response. Response null or status is not 200. exiting...');
			throw new Error('Failed to send invoke Proposal or receive valid response. Response null or status is not 200. exiting...');
		}
		var request = {
			proposalResponses: proposalResponses,
			proposal: proposal,
			admin : true
		};

		return channel.sendTransaction(request); //logged in as org1
	}).then((response) => {
		if (!(response instanceof Error) && response.status === 'SUCCESS') {
			t.pass('Successfully sent transaction to invoke the chaincode to the orderer.');
			return sleep(3000); // use sleep until the eventhub is integrated into the network config changes
		} else {
			t.fail('Failed to order the transaction to invoke the chaincode. Error code: ' + response.status);
			Promise.reject(new Error('Failed to order the transaction to invoke the chaincode. Error code: ' + response.status));
		}
	}).then((results) => {
		var request = {
			chaincodeId : 'example',
			fcn: 'query',
			args: ['b']
		};

		return channel.queryByChaincode(request); //logged in as user on org1
	}).then((response_payloads) => {
		if (response_payloads) {
			for(let i = 0; i < response_payloads.length; i++) {
				t.equal(
					response_payloads[i].toString('utf8'),
					'300',
					'checking query results are correct that user b has 300 now after the move');
			}
		} else {
			t.fail('response_payloads is null');
			throw new Error('Failed to get response on query');
		}

		return client.queryChannels('peer0.org1.example.com'); //logged in as user on org1
	}).then((results) => {
		logger.debug(' queryChannels ::%j',results);
		t.equals('mychannel', results.channels[0].channel_id, 'Should be able to find our channel');
		client._userContext = null;

		return testUtil.getSubmitter(client, t, true /* get peer org admin */, 'org1');
	}).then((admin) => {
		t.pass('Successfully enrolled org1 admin');

		return client.queryInstalledChaincodes('peer0.org1.example.com'); //logged in as admin on org1
	}).then((results) => {
		logger.debug(' queryInstalledChaincodes ::%j',results);
		t.equals('example', results.chaincodes[0].name, 'Should be able to find our chaincode');

		return channel.queryBlock(1);
	}).then((results) => {
		logger.debug(' queryBlock ::%j',results);
		t.equals(1, results.header.number.low, 'Should be able to find our block number');

		return channel.queryInfo();
	}).then((results) => {
		logger.debug(' queryInfo ::%j',results);
		t.equals(3, results.height.low, 'Should be able to find our block height');

		return channel.queryBlockByHash(results.previousBlockHash);
	}).then((results) => {
		logger.debug(' queryBlockHash ::%j',results);
		t.equals(1, results.header.number.low, 'Should be able to find our block number by hash');

		return channel.queryInstantiatedChaincodes();
	}).then((results) => {
		logger.debug(' queryInstantiatedChaincodes ::%j',results);
		t.equals('example', results.chaincodes[0].name, 'Should be able to find our chaincode');

		return channel.queryTransaction(query_tx_id);
	}).then((results) => {
		logger.debug(' queryTransaction ::%j',results);
		t.equals(0, results.validationCode, 'Should be able to find our transaction validationCode');

		return channel.queryBlock(1,'peer0.org1.example.com');
	}).then((results) => {
		logger.debug(' queryBlock ::%j',results);
		t.equals(1, results.header.number.low, 'Should be able to find our block number');

		return channel.queryInfo('peer0.org1.example.com');
	}).then((results) => {
		logger.debug(' queryInfo ::%j',results);
		t.equals(3, results.height.low, 'Should be able to find our block height');

		return channel.queryBlockByHash(results.previousBlockHash, 'peer0.org1.example.com');
	}).then((results) => {
		logger.debug(' queryBlockHash ::%j',results);
		t.equals(1, results.header.number.low, 'Should be able to find our block number by hash');

		return channel.queryInstantiatedChaincodes('peer0.org1.example.com');
	}).then((results) => {
		logger.debug(' queryInstantiatedChaincodes ::%j',results);
		t.equals('example', results.chaincodes[0].name, 'Should be able to find our chaincode');

		return channel.queryTransaction(query_tx_id,'peer0.org1.example.com');
	}).then((results) => {
		logger.debug(' queryTransaction ::%j',results);
		t.equals(0, results.validationCode, 'Should be able to find our transaction validationCode');
		return true;
	}).then((results) => {
		t.end();

	}).catch((error) =>{
		logger.error('catch network config test error:: %s', error.stack ? error.stack : error);
		t.fail('Test failed with '+ error);
		t.end();
	});
});

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}