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
var logger = log4js.getLogger('E2E');
logger.setLevel('DEBUG');

var path = require('path');
var util = require('util');
var hfc = require('hfc');
hfc.setLogger(logger);
var utils = require('hfc/lib/utils.js');
var Peer = require('hfc/lib/Peer.js');
var Orderer = require('hfc/lib/Orderer.js');
var EventHub = require('hfc/lib/EventHub.js');
var helper = require('./helper.js');
var fs = require('fs');
var os = require('os');

var copService = require('hfc-cop/lib/FabricCOPImpl.js');

process.env.GOPATH = path.join(__dirname, '../test/fixtures');

var chain;
var webUser = null;
var chaincodeID;
var channelID;
var tx_id = null;
var nonce = null;
var peers = [];
var CHAINCODE_PATH;
var keyValStore;
var config;
var ca_client;
var eventhub;

var client = new hfc();

init();

function init() {
	try {
		config = JSON.parse(fs.readFileSync(__dirname + '/config.json', 'utf8'));
	} catch (err) {
		console.log('config.json is missing or invalid file, Rerun the program with right file');
		console.log(err);
		process.exit();
	}

	chain = client.newChain(config.chainName);
	chaincodeID = config.chaincodeID;
	channelID = config.channelID;
	CHAINCODE_PATH = config.chaincodePath;

	setupNetwork();
	end2end();
}

function setupNetwork() {
	ca_client = new copService(config.caserver.ca_url);
	chain.addOrderer(new Orderer(config.orderer.orderer_url));
	eventhub = new EventHub();
	eventhub.setPeerAddr(config.events[0].event_url);
	eventhub.connect();
	for (var i = 0; i < config.peers.length; i++) {
		peers.push(new Peer(config.peers[i].peer_url));
		chain.addPeer(peers[i]);
	}
}

// Make sure disconnect the eventhub on exit
process.on('exit', function() {
	if (eventhub && eventhub.isconnected()) {
		logger.info('Disconnecting the event hub');
		eventhub.disconnect();
	}
});

function end2end() {

	hfc.newDefaultKeyValueStore({
		path: config.keyValueStore
	}).then(function(store) {
		client.setStateStore(store);
		var users = config.users;
		var promise = helper.getSubmitter(users[0].username, users[0].secret, client, ca_client);

		logger.info('Executing Deploy');
		promise = promise.then(
			function(admin) {
				logger.info('Successfully enrolled user \'admin\'');
				webUser = admin;
				tx_id = utils.buildTransactionID({
					length: 12
				});
				nonce = utils.getNonce();
				var args = helper.getArgs(config.deployRequest.args);
				// send proposal to endorser
				var request = {
					chaincodePath: CHAINCODE_PATH,
					chaincodeId: chaincodeID,
					fcn: config.deployRequest.functionName,
					args: args,
					chainId: channelID,
					txId: tx_id,
					nonce: nonce,
					'dockerfile-contents': config.dockerfile_contents
				};
				return chain.sendDeploymentProposal(request);
			},
			function(err) {
				logger.error('Failed to enroll user \'admin\'. ' + err);
				process.exit();
			}
		).then(
			function(results) {
				return helper.processProposal(chain, results, 'deploy');
			},
			function(err) {
				logger.error('Failed to send deployment proposal due to error: ' + err.stack ? err.stack : err);
				process.exit();
			}
		);

		promise = promise.then(
			function(response) {
				if (response.status === 'SUCCESS') {
					logger.info('Successfully sent deployment transaction to the orderer.');
					return new Promise((resolve, reject) => {
						var handle = setTimeout(reject, parseInt(config.waitTime));

						eventhub.registerTxEvent(tx_id.toString(), (tx) => {
							logger.info('The chaincode deploy transaction has been successfully committed');
							clearTimeout(handle);
							setTimeout(resolve, parseInt(config.waitTime));
						});
					});
				} else {
					logger.error('Failed to order the deployment endorsement. Error code: ' + response.status);
					process.exit();
				}
			},
			function(err) {
				logger.error('Failed to send deployment e due to error: ' + err.stack ? err.stack : err);
				process.exit();
			}
		);

		promise = promise.then(
			function(data) {
				logger.info('Executing Invoke ...');

				// we may get to this point from the sleep() call above
				// if coming directly then "data" will be the webUser
				if (typeof data !== 'undefined' && data !== null) {
					webUser = data;
				}

				return Promise.resolve();
			}
		).then(
			function() {
				tx_id = utils.buildTransactionID({
					length: 12
				});
				nonce = utils.getNonce();
				var args = helper.getArgs(config.invokeRequest.args);
				// send proposal to endorser
				var request = {
					chaincodeId: chaincodeID,
					fcn: config.invokeRequest.functionName,
					args: args,
					chainId: channelID,
					txId: tx_id,
					nonce: nonce
				};
				return chain.sendTransactionProposal(request);
			},
			function(err) {
				logger.error('Failed to wait due to error: ' + err.stack ? err.stack : err);
				process.exit();
			}
		).then(
			function(results) {
				return helper.processProposal(chain, results, 'move');
			},
			function(err) {
				logger.error('Failed to send transaction proposal due to error: ' + err.stack ? err.stack : err);
				process.exit();
			}
		);

		promise = promise.then(
			function(response) {
				if (response.status === 'SUCCESS') {
					logger.info('Successfully ordered endorsement transaction.');
				} else {
					logger.error('Failed to order the endorsement of the transaction. Error code: ' + response.status);
				}
				return new Promise((resolve, reject) => {
					var handle = setTimeout(reject, parseInt(config.waitTime));

					eventhub.registerTxEvent(tx_id.toString(), (tx) => {
						logger.info('The chaincode transaction has been successfully committed');
						clearTimeout(handle);
						setTimeout(resolve, parseInt(config.waitTime));
					});
				});
			},
			function(err) {
				logger.error('Failed to send transaction proposal due to error: ' + err.stack ? err.stack : err);
				process.exit();
			}
		);

		promise = promise.then(
			function(data) {
				logger.info('Executing Query');

				// we may get to this point from the sleep() call above
				// hence "data" will be the webUser
				if (typeof data !== 'undefined' && data !== null) {
					webUser = data;
				}

				return Promise.resolve();
			}
		).then(
			function() {
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
				logger.error('Failed to wait-- error: ' + err.stack ? err.stack : err);
				process.exit();
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
	});
}
