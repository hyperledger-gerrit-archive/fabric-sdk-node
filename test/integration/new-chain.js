/**
 * Copyright 2016 IBM All Rights Reserved.
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

if (global && global.hfc) global.hfc.config = undefined;
require('nconf').reset();
var utils = require('fabric-client/lib/utils.js');
utils.setConfigSetting('hfc-logging', '{"debug":"console"}');
var logger = utils.getLogger('new-chain');

var tape = require('tape');
var _test = require('tape-promise');
var test = _test(tape);

var hfc = require('fabric-client');
var util = require('util');
var fs = require('fs');
var path = require('path');
var grpc = require('grpc');
var testUtil = require('../unit/util.js');

var _commonProto = grpc.load(path.join(__dirname, '../../fabric-client/lib/protos/common/common.proto')).common;
var _configtxProto = grpc.load(path.join(__dirname, '../../fabric-client/lib/protos/common/configtx.proto')).common;

var client = new hfc();
hfc.addConfigFile(path.join(__dirname, 'e2e', 'config.json'));
var ORGS = hfc.getConfigSetting('test-network');
var org = 'org1';
var orgName = ORGS[org].name;
client.newCryptoSuite({path: testUtil.storePathForOrg(orgName)});

var caRootsPath = ORGS.orderer.tls_cacerts;
let data = fs.readFileSync(path.join(__dirname, 'e2e', caRootsPath));
let caroots = Buffer.from(data).toString();
var orderer = client.newOrderer(
	ORGS.orderer.url,
	{
		'pem': caroots,
		'ssl-target-name-override': ORGS.orderer['server-hostname']
	}
);

var logger = utils.getLogger('NEW CHAIN');
hfc.setConfigSetting('hfc-logging', '{"debug":"console"}');

var the_user = null;
var config = null;
var signatures = [];

//
//Orderer via member send chain create
//
//Attempt to send a request to the orderer with the sendCreateChain method - fail
// fail due to chain already exist
//
test('\n\n** TEST ** new chain - chain.createChannel() fail due to already exist', function(t) {
	//
	// Create and configure the test chain
	//
	utils.setConfigSetting('key-value-store','fabric-client/lib/impl/FileKeyValueStore.js');
	hfc.newDefaultKeyValueStore({path: testUtil.storePathForOrg(orgName)}
	)
	.then((store) => {
		client.setStateStore(store);

		return testUtil.getOrderAdminSubmitter(client, t);
	}).then((admin) =>{
		t.pass('Successfully enrolled user \'admin\' for orderer');

		data = fs.readFileSync(path.join(__dirname, '../fixtures/channel/mychannel.tx'));
		var envelope = _commonProto.Envelope.decode(data);
		var payload = _commonProto.Payload.decode(envelope.getPayload().toBuffer());
		var configtx = _configtxProto.ConfigUpdateEnvelope.decode(payload.getData().toBuffer());
		config = configtx.getConfigUpdate().toBuffer();

		client._userContext = null;
		return testUtil.getSubmitter(client, t, true /*get the org admin*/, 'org1');
	}).then((admin) => {
		t.pass('Successfully enrolled user \'admin\' for org1');

		// sign the config
		var signature = client.signChannelConfig(config);
		t.pass('Successfully signed config update');
		// collect signature from org1 admin
		// TODO: signature counting against policies on the orderer
		// at the moment is being investigated, but it requires this
		// weird double-signature from each org admin
		signatures.push(signature);
		signatures.push(signature);

		// make sure we do not reuse the user
		client._userContext = null;
		return testUtil.getSubmitter(client, t, true /*get the org admin*/, 'org2');
	}).then((admin) => {
		t.pass('Successfully enrolled user \'admin\' for org2');

		// sign the config
		var signature = client.signChannelConfig(config);
		t.pass('Successfully signed config update');

		// collect signature from org2 admin
		// TODO: signature counting against policies on the orderer
		// at the moment is being investigated, but it requires this
		// weird double-signature from each org admin
		signatures.push(signature);
		signatures.push(signature);

		// make sure we do not reuse the user
		client._userContext = null;
		return testUtil.getOrderAdminSubmitter(client, t);
	}).then((admin) => {
		t.pass('Successfully enrolled user \'admin\' for orderer');
		the_user = admin;

		// sign the config
		var signature = client.signChannelConfig(config);
		t.pass('Successfully signed config update');

		// collect signature from orderer org admin
		// TODO: signature counting against policies on the orderer
		// at the moment is being investigated, but it requires this
		// weird double-signature from each org admin
		signatures.push(signature);
		signatures.push(signature);

		logger.debug('\n***\n done signing \n***\n');

		// build up the create request
		let nonce = utils.getNonce();
		let tx_id = hfc.buildTransactionID(nonce, the_user);
		var request = {
			config: config,
			signatures : signatures,
			name : 'mychannel',
			orderer : orderer,
			txId  : tx_id,
			nonce : nonce
		};

		// send to create request to orderer
		return client.createChannel(request);
	})
	.then((result) => {
		logger.debug(' response ::%j',result);
		t.fail('Failed to get error. response: ' + result.status);
		t.end();
	}, (err) => {
		t.pass('Got back failure error. Error code: ' + err);
		t.end();
	}).catch((err) => {
		t.fail('Test failed due to unexpected reasons. ' + err.stack ? err.stack : err);
		t.end();
	});
});

