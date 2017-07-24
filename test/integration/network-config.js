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
var e2eUtils = require('./e2e/e2eUtils.js');

var channel_name = 'mychannel';

test('\n\n***** use the network configuration file  *****\n\n', function(t) {
	testUtil.resetDefaults();

	// build a 'Client' instance that knows the network
	var client = Client.loadFromConfig('test/fixtures/network.yaml');
	t.pass('Successfully loaded a network configuration');

	var config = null;
	var signatures = [];
	var genesis_block = null;
	var channel = null;

	utils.setConfigSetting('key-value-store', 'fabric-client/lib/impl/FileKeyValueStore.js');

	return Client.newDefaultKeyValueStore({
		path: testUtil.storePathForOrg('peerOrg1')
	}).then((store) => {
		client.setStateStore(store);
		var cryptoSuite = Client.newCryptoSuite();
		cryptoSuite.setCryptoKeyStore(Client.newCryptoKeyStore({path: testUtil.storePathForOrg('peerOrg1')}));
		client.setCryptoSuite(cryptoSuite);

		return testUtil.getSubmitter(client, t, true /*get the org admin*/, 'org1');
	}).then((admin) => {
		t.pass('Successfully enrolled user \'admin\' for org1');
		// use the config update created by the configtx tool
		let envelope_bytes = fs.readFileSync(path.join(__dirname, '../fixtures/channel/mychannel.tx'));
		config = client.extractChannelConfig(envelope_bytes);
		t.pass('Successfull extracted the config update from the configtx envelope');

		// sign the config by admin from org1
		var signature = client.signChannelConfig(config);
		// convert signature to a storable string
		// fabric-client SDK will convert back during create
		var string_signature = signature.toBuffer().toString('hex');
		t.pass('Successfully signed config update');
		// collect signature from org1 admin
		signatures.push(string_signature);

		// make sure we do not reuse the user
		client._userContext = null;
		return testUtil.getSubmitter(client, t, true /*get the org admin*/, 'org2');
	}).then((admin) => {
		t.pass('Successfully enrolled user \'admin\' for org2');

		// sign the config by admin from org2
		var signature = client.signChannelConfig(config);
		t.pass('Successfully signed config update');

		// collect signature from org2 admin
		signatures.push(signature);

		// now we have enough signatures... let's have an admin on the orderer submit
		// make sure we do not reuse the user
		client._userContext = null;
		return testUtil.getOrderAdminSubmitter(client, t);
	}).then((admin) => {
		t.pass('Successfully enrolled user \'admin\' for orderer');

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
		return client.createChannel(request);
	}).then((result) => {
		logger.debug('\n***\n completed the create \n***\n');

		logger.debug(' response ::%j',result);
		t.pass('Successfully created the channel.');
		if(result.status && result.status === 'SUCCESS') {
			return e2eUtils.sleep(5000);
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
		return client.createChannel(request);
	}).then((result) => {

		logger.debug(' response ::%j',result);
		t.failed('Failed, should not have gotten a positive response on second create channel %s', result);
		throw new Error('Failed on second create channel');

	},(err) => {
		if(err.toString().indexOf('BAD_REQUEST') > -1) {
			logger.debug('Successfully got a reject with %s',err);
			t.pass('Successfully got a bad request on second create channel');
		} else {
			t.fail('Failed to get the bad request message ');
			throw new Error('Failed to get the bad request message from the orderer on the second create');
		}
		// we are still logged in as the orderer admin
		let tx_id = client.newTransactionID();
		let request = {
			txId : 	tx_id
		};
		// have the client returned
		channel = client.getChannel(channel_name);

		return channel.getGenesisBlock(request);
	}).then((block) =>{
		t.pass('Successfully got the genesis block');
		genesis_block = block;

		// get the peer org2's admin required to send join channel requests
		client._userContext = null;

		return testUtil.getSubmitter(client, t, true /* get peer org admin */, 'org2');
	}).then((admin) => {
		t.pass('Successfully enrolled org2 admin');
		let tx_id = client.newTransactionID();
		let request = {
			//targets: // this time we will leave blank so that we can use
				       // all the peers assigned to the channel ...some may fail
				       // if the submitter is not allowed, let's see what we get
			block : genesis_block,
			txId : 	tx_id
		};

		return channel.joinChannel(request);
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
		// get the peer org1's admin required to send join channel requests
		client._userContext = null;

		return testUtil.getSubmitter(client, t, true /* get peer org admin */, 'org1');
	}).then((admin) => {
		t.pass('Successfully enrolled org1 admin');
		let tx_id = client.newTransactionID();
		let request = {
			targets: ['peer0.org1.example.com'], // this does assume that we have loaded a
			                                     // network config with a peer by this name
			block : genesis_block,
			txId : 	tx_id
		};

		return channel.joinChannel(request);
	}).then((results) => {
		logger.debug(util.format('Join Channel R E S P O N S E  for a string target: %j', results));

		if(results && results[0] && results[0].response && results[0].response.status == 200) {
			t.pass(util.format('Successfully had peer in organization %s join the channel', 'org1'));
		} else {
			t.fail(' Failed to join channel');
			throw new Error('Failed to join channel');
		}

	}).catch((error) =>{
		logger.error('joinChannel - Failed Proposal. Error: %s', error.stack ? error.stack : error);
		t.fail('Test failed with '+ error);
		t.end();
	});
});
