/**
 * Copyright 2016 IBM All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */
// This is Sample end-to-end standalone program that focuses on exercising all
// parts of the fabric APIs in a happy-path scenario
'use strict';

var log4js = require('log4js');
var logger = log4js.getLogger('INVOKE');
var config = require('./config.json');
var helper = require('./helper.js');
var hfc = require('fabric-client');

var path = require('path');
var util = require('util');
var utils = require('fabric-client/lib/utils.js');
var Peer = require('fabric-client/lib/Peer.js');
var Orderer = require('fabric-client/lib/Orderer.js');
var helper = require('./helper.js');

logger.setLevel('DEBUG');

var client = new hfc();
var chain;
var chaincodeID;
var channelID;
var CHAINCODE_PATH;
var peers = [];
var webUser = null;
var tx_id = null;
var nonce = null;

init();

function init() {
	chain = client.newChain(config.chainName);
	chaincodeID = config.chaincodeID;
	channelID = config.channelID;
	CHAINCODE_PATH = config.chaincodePath;
	helper.setupChaincodeDeploy();
	setupNetwork();
}

function setupNetwork() {
	chain.addOrderer(new Orderer(config.orderer.orderer_url));
	for (var i = 0; i < config.peers.length; i++) {
		peers.push(new Peer(config.peers[i].peer_url));
		chain.addPeer(peers[i]);
	}
}

hfc.newDefaultKeyValueStore({
	path: config.keyValueStore
}).then(function(store) {
	client.setStateStore(store);
	var users = config.users;

	return helper.getSubmitter(client);
}).then(
	function(admin) {
		logger.info('Successfully enrolled user \'admin\'');
		webUser = admin;

		logger.info('Executing Query');
		var targets = [];
		for (var i = 0; i < peers.length; i++) {
			targets.push(peers[i]);
		}
		var args = helper.getArgs(config.queryRequest.args);
		//chaincode query request
		var request = {
			targets: targets,
			chaincodeId: chaincodeID,
			chainId: channelID,
			txId: utils.buildTransactionID(),
			nonce: utils.getNonce(),
			fcn: config.queryRequest.functionName,
			args: args
		};
		// Query chaincode
		return chain.queryByChaincode(request);
	},
	function(err) {
		logger.error('Failed to enroll user \'admin\'. ' + err);
	}
).then(
	function(response_payloads) {
		for (let i = 0; i < response_payloads.length; i++) {
			logger.info('############### Query results after the move on PEER%j, User "b" now has  %j', i, response_payloads[i].toString('utf8'));
		}
		process.exit();
	},
	function(err) {
		logger.error('Failed to send query due to error: ' + err.stack ? err.stack : err);
		process.exit();
	}
).catch(
	function(err) {
		logger.error('Failed to end to end test with error:' + err.stack ? err.stack : err);
		process.exit();
	}
);
