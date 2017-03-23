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

// This is an end-to-end test that focuses on exercising all parts of the fabric APIs
// in a happy-path scenario
'use strict';

process.env.HFC_LOGGING = '{"debug": "console"}';
var tape = require('tape');
var _test = require('tape-promise');
var test = _test(tape);

var path = require('path');
var fs = require('fs');
var util = require('util');

var hfc = require('fabric-client');
var utils = require('fabric-client/lib/utils.js');
var EventHub = require('fabric-client/lib/EventHub.js');
var testUtil = require('../unit/util.js');

var logger = utils.getLogger('upgrade-chaincode');

var e2e = testUtil.END2END;
hfc.addConfigFile(path.join(__dirname, './e2e/config.json'));
var ORGS = hfc.getConfigSetting('test-network');

var caRootsPath = ORGS.orderer.tls_cacerts;
let data = fs.readFileSync(path.join(__dirname, '/test', caRootsPath));
let caroots = Buffer.from(data).toString();

var tx_id = null;
var nonce = null;
var the_user = null;
var allEventhubs = [];

testUtil.setupChaincodeDeploy();

var version = 'v1';
if (process.argv.length > 2) {
	version = process.argv[2];
}
logger.info('This execution will use version: %s', version);

test('\n\n***** U P G R A D E flow: chaincode install *****\n\n', (t) => {
	installChaincode('org1', t)
	.then(() => {
		t.pass('Successfully installed chaincode in peers of organization "org1"');
		return installChaincode('org2', t);
	}, (err) => {
		t.fail('Failed to install chaincode in peers of organization "org1". ' + err.stack ? err.stack : err);
		t.end();
	}).then(() => {
		t.pass('Successfully installed chaincode in peers of organization "org2"');
		t.end();
	}, (err) => {
		t.fail('Failed to install chaincode in peers of organization "org2". ' + err.stack ? err.stack : err);
		t.end();
	}).catch((err) => {
		t.fail('Test failed due to unexpected reasons. ' + err.stack ? err.stack : err);
		t.end();
	});
});

function installChaincode(org, t) {
	var client = new hfc();
	var chain = client.newChain(testUtil.END2END.channel);

	chain.addOrderer(
		client.newOrderer(
			ORGS.orderer.url,
			{
				'pem': caroots,
				'ssl-target-name-override': ORGS.orderer['server-hostname']
			}
		)
	);

	var orgName = ORGS[org].name;

	var targets = [];
	for (let key in ORGS[org]) {
		if (ORGS[org].hasOwnProperty(key)) {
			if (key.indexOf('peer') === 0) {
				let data = fs.readFileSync(path.join(__dirname, '/test', ORGS[org][key]['tls_cacerts']));
				let peer = client.newPeer(
					ORGS[org][key].requests,
					{
						pem: Buffer.from(data).toString(),
						'ssl-target-name-override': ORGS[org][key]['server-hostname']
					}
				);

				targets.push(peer);
				chain.addPeer(peer);
			}
		}
	}

	return hfc.newDefaultKeyValueStore({
		path: testUtil.storePathForOrg(orgName)
	}).then((store) => {
		client.setStateStore(store);
		return testUtil.getSubmitter(client, t, org);
	}).then((admin) => {
		t.pass('Successfully enrolled user \'admin\'');
		the_user = admin;

		nonce = utils.getNonce();
		tx_id = client.buildTransactionID(nonce, the_user);

		// send proposal to endorser
		var request = {
			targets: targets,
			chaincodePath: testUtil.CHAINCODE_UPGRADE_PATH,
			chaincodeId: e2e.chaincodeId,
			chaincodeVersion: version,
			txId: tx_id,
			nonce: nonce
		};

		return client.installChaincode(request);
	},
	(err) => {
		t.fail('Failed to enroll user \'admin\'. ' + err);
		throw new Error('Failed to enroll user \'admin\'. ' + err);
	}).then((results) => {
		var proposalResponses = results[0];

		var proposal = results[1];
		var header   = results[2];
		var all_good = true;
		for(var i in proposalResponses) {
			let one_good = false;
			if (proposalResponses && proposalResponses[i].response && proposalResponses[i].response.status === 200) {
				one_good = true;
				logger.info('install proposal was good');
			} else {
				logger.error('install proposal was bad');
			}
			all_good = all_good & one_good;
		}
		if (all_good) {
			t.pass(util.format('Successfully sent install Proposal and received ProposalResponse: Status - %s', proposalResponses[0].response.status));
		} else {
			t.fail('Failed to send install Proposal or receive valid response. Response null or status is not 200. exiting...');
		}
	},
	(err) => {
		t.fail('Failed to send install proposal due to error: ' + err.stack ? err.stack : err);
		throw new Error('Failed to send install proposal due to error: ' + err.stack ? err.stack : err);
	});
}

test('\n\n***** U P G R A D E flow: upgrade chaincode *****', (t) => {
	// override t.end function so it'll always disconnect the event hub
	t.end = ((context, ehs, f) => {
		return function() {
			for(var key in ehs) {
				var eventhub = ehs[key];
				if (eventhub && eventhub.isconnected()) {
					logger.info('Disconnecting the event hub');
					eventhub.disconnect();
				}
			}

			f.apply(context, arguments);
		};
	})(t, allEventhubs, t.end);

	// this is a transaction, will just use org1's identity to
	// submit the request
	var org = 'org1';
	var client = new hfc();
	var chain = client.newChain(e2e.channel);
	chain.addOrderer(
		client.newOrderer(
			ORGS.orderer.url,
			{
				'pem': caroots,
				'ssl-target-name-override': ORGS.orderer['server-hostname']
			}
		)
	);
	var orgName = ORGS[org].name;

	var eventhubs = [];
	var targets = [];
	for (let key in ORGS[org]) {
		if (ORGS[org].hasOwnProperty(key)) {
			if (key.indexOf('peer1') === 0) {
				let data = fs.readFileSync(path.join(__dirname, '/test', ORGS[org][key]['tls_cacerts']));
				let peer = client.newPeer(
					ORGS[org][key].requests,
					{
						pem: Buffer.from(data).toString(),
						'ssl-target-name-override': ORGS[org][key]['server-hostname']
					}
				);

				targets.push(peer);
				chain.addPeer(peer);
				let eh = new EventHub();
				eh.setPeerAddr(
					ORGS[org][key].events,
					{
						pem: Buffer.from(data).toString(),
						'ssl-target-name-override': ORGS[org][key]['server-hostname']
					}
				);
				eh.connect();
				eventhubs.push(eh);
				allEventhubs.push(eh);
			}
		}
	}

	return hfc.newDefaultKeyValueStore({
		path: testUtil.storePathForOrg(orgName)
	}).then((store) => {
		client.setStateStore(store);
		return testUtil.getSubmitter(client, t, org);

	}).then((admin) => {

		t.pass('Successfully enrolled user \'admin\'');
		the_user = admin;

		// read the config block from the orderer for the chain
		// and initialize the verify MSPs based on the participating
		// organizations
		return chain.initialize();
	}, (err) => {

		t.fail('Failed to enroll user \'admin\'. ' + err);
		throw new Error('Failed to enroll user \'admin\'. ' + err);

	}).then((success) => {

		nonce = utils.getNonce();
		tx_id = client.buildTransactionID(nonce, the_user);

		// send proposal to endorser
		var request = {
			chaincodePath: testUtil.CHAINCODE_PATH,
			chaincodeId: e2e.chaincodeId,
			chaincodeVersion: version,
			fcn: 'init',
			args: ['a', '100', 'b', '200'],
			chainId: e2e.channel,
			txId: tx_id,
			nonce: nonce
		};

		return chain.sendUpgradeProposal(request);

	}, (err) => {

		t.fail('Failed to initialize the chain');
		throw new Error('Failed to initialize the chain');

	}).then((results) => {

		var proposalResponses = results[0];

		var proposal = results[1];
		var header   = results[2];
		var all_good = true;
		for(var i in proposalResponses) {
			let one_good = false;
			let proposalResponse = proposalResponses[i];
			if(proposalResponse instanceof Error) {
				logger.error('upgrade proposal was bad %s',proposalResponse);
			}
			else if (proposalResponse.response && proposalResponse.response.status === 200) {
				one_good = true;
				logger.info('upgrade proposal was good');
			}
			else {
				logger.error('upgrade proposal was bad');
			}
			all_good = all_good & one_good;
		}
		if (all_good) {
			t.pass(util.format('Successfully sent Proposal and received ProposalResponse'));
			var request = {
				proposalResponses: proposalResponses,
				proposal: proposal,
				header: header
			};

			// set the transaction listener and set a timeout of 30sec
			// if the transaction did not get committed within the timeout period,
			// fail the test
			var deployId = tx_id.toString();

			var eventPromises = [];
			eventhubs.forEach((eh) => {
				let txPromise = new Promise((resolve, reject) => {
					let handle = setTimeout(reject, 30000);

					eh.registerTxEvent(deployId.toString(), (tx, code) => {
						t.pass('The chaincode upgrade transaction has been committed on peer '+ eh.ep.addr);
						clearTimeout(handle);
						eh.unregisterTxEvent(deployId);

						if (code !== 'VALID') {
							t.fail('The chaincode upgrade transaction was invalid, code = ' + code);
							reject();
						} else {
							t.pass('The chaincode upgrade transaction was valid.');
							resolve();
						}
					});
				});

				eventPromises.push(txPromise);
			});

			var sendPromise = chain.sendTransaction(request);
			return Promise.all([sendPromise].concat(eventPromises))
			.then((results) => {

				logger.debug('Event promise all complete and testing complete');
				return results[0]; // the first returned value is from the 'sendPromise' which is from the 'sendTransaction()' call

			}).catch((err) => {

				t.fail('Failed to send upgrade transaction and get notifications within the timeout period.');
				throw new Error('Failed to send upgrade transaction and get notifications within the timeout period.');

			});

		} else {
			t.fail('Failed to send upgrade Proposal or receive valid response. Response null or status is not 200. exiting...');
			throw new Error('Failed to send upgrade Proposal or receive valid response. Response null or status is not 200. exiting...');
		}
	}, (err) => {

		t.fail('Failed to send upgrade proposal due to error: ' + err.stack ? err.stack : err);
		throw new Error('Failed to send upgrade proposal due to error: ' + err.stack ? err.stack : err);

	}).then((response) => {

		if (response.status === 'SUCCESS') {
			t.pass('Successfully sent transaction to the orderer.');
		} else {
			t.fail('Failed to order the transaction. Error code: ' + response.status);
			throw new Error('Failed to order the transaction. Error code: ' + response.status);
		}
	}, (err) => {

		t.fail('Failed to send upgrade due to error: ' + err.stack ? err.stack : err);
		throw new Error('Failed to send upgrade due to error: ' + err.stack ? err.stack : err);

	});
});


test('\n\n***** U P G R A D E flow: invoke new chaincode *****', (t) => {
	// override t.end function so it'll always disconnect the event hub
	t.end = ((context, ehs, f) => {
		return function() {
			for(var key in ehs) {
				var eventhub = ehs[key];
				if (eventhub && eventhub.isconnected()) {
					logger.info('Disconnecting the event hub');
					eventhub.disconnect();
				}
			}

			f.apply(context, arguments);
		};
	})(t, allEventhubs, t.end);

	var org = 'org1';
	var client = new hfc();
	var chain = client.newChain(e2e.channel);

	chain.addOrderer(
		client.newOrderer(
			ORGS.orderer.url,
			{
				'pem': caroots,
				'ssl-target-name-override': ORGS.orderer['server-hostname']
			}
		)
	);
	var orgName = ORGS[org].name;

	var targets = [],
		eventhubs = [];

	for (let key in ORGS[org]) {
		if (ORGS[org].hasOwnProperty(key)) {
			if (key.indexOf('peer1') === 0) {
				let data = fs.readFileSync(path.join(__dirname, '/test', ORGS[org][key]['tls_cacerts']));
				let peer = client.newPeer(
					ORGS[org][key].requests,
					{
						pem: Buffer.from(data).toString(),
						'ssl-target-name-override': ORGS[org][key]['server-hostname']
					}
				);
				chain.addPeer(peer);

				let eh = new EventHub();
				eh.setPeerAddr(
					ORGS[org][key].events,
					{
						pem: Buffer.from(data).toString(),
						'ssl-target-name-override': ORGS[org][key]['server-hostname']
					}
				);
				eh.connect();
				eventhubs.push(eh);
				allEventhubs.push(eh);
			}
		}
	}

	return hfc.newDefaultKeyValueStore({
		path: testUtil.storePathForOrg(orgName)
	}).then((store) => {

		client.setStateStore(store);
		return testUtil.getSubmitter(client, t, org);

	}).then((admin) => {

		t.pass('Successfully enrolled user \'admin\'');
		the_user = admin;

		nonce = utils.getNonce();
		tx_id = client.buildTransactionID(nonce, the_user);

		t.comment(util.format('Sending transaction "%s"', tx_id));

		// send proposal to endorser
		var request = {
			chaincodeId : e2e.chaincodeId,
			chaincodeVersion : version,
			fcn: 'invoke',
			args: ['move', 'a', 'b','100'],
			chainId: e2e.channel,
			txId: tx_id,
			nonce: nonce
		};
		return chain.sendTransactionProposal(request);

	}, (err) => {

		t.fail('Failed to enroll user \'admin\'. ' + err);
		throw new Error('Failed to enroll user \'admin\'. ' + err);

	}).then((results) => {

		var proposalResponses = results[0];

		var proposal = results[1];
		var header   = results[2];
		var all_good = true;
		for(var i in proposalResponses) {
			let one_good = false;
			let proposalResponse = proposalResponses[i];
			if(proposalResponse instanceof Error) {
				logger.error('invoke proposal was bad %s',proposalResponse);
			}
			else if (proposalResponse.response && proposalResponse.response.status === 200) {
				one_good = true;
				logger.info('invoke proposal was good');
			}
			else {
				logger.error('invoke proposal was bad');
			}
			all_good = all_good & one_good;
		}
		if (all_good) {
			t.pass(util.format('Successfully sent invoke Proposal and received ProposalResponse'));
			var request = {
				proposalResponses: proposalResponses,
				proposal: proposal,
				header: header
			};

			// set the transaction listener and set a timeout of 30sec
			// if the transaction did not get committed within the timeout period,
			// fail the test
			var deployId = tx_id.toString();

			var eventPromises = [];
			eventhubs.forEach((eh) => {
				let txPromise = new Promise((resolve, reject) => {
					let handle = setTimeout(reject, 30000);

					eh.registerTxEvent(deployId.toString(), (tx, code) => {
						clearTimeout(handle);
						eh.unregisterTxEvent(deployId);

						if (code !== 'VALID') {
							t.fail('The balance transfer transaction was invalid, code = ' + code);
							reject();
						} else {
							t.pass('The balance transfer transaction has been committed on peer '+ eh.ep.addr);
							resolve();
						}
					});
				});

				eventPromises.push(txPromise);
			});

			var sendPromise = chain.sendTransaction(request);
			return Promise.all([sendPromise].concat(eventPromises))
			.then((results) => {

				logger.debug(' event promise all complete and testing complete');
				return results[0]; // the first returned value is from the 'sendPromise' which is from the 'sendTransaction()' call

			}).catch((err) => {

				t.fail('Failed to send transaction and get notifications within the timeout period.');
				throw new Error('Failed to send transaction and get notifications within the timeout period.');

			});

		} else {
			t.fail('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
			throw new Error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
		}
	}, (err) => {

		t.fail('Failed to send proposal due to error: ' + err.stack ? err.stack : err);
		throw new Error('Failed to send proposal due to error: ' + err.stack ? err.stack : err);

	}).then((response) => {

		if (response.status === 'SUCCESS') {
			t.pass('Successfully sent transaction to the orderer.');
		} else {
			t.fail('Failed to order the transaction. Error code: ' + response.status);
			throw new Error('Failed to order the transaction. Error code: ' + response.status);
		}
	}, (err) => {

		t.fail('Failed to send transaction due to error: ' + err.stack ? err.stack : err);
		throw new Error('Failed to send transaction due to error: ' + err.stack ? err.stack : err);

	});
});

test('\n\n***** U P G R A D E flow: query new chaincode *****', (t) => {
	var org = 'org1';
	var client = new hfc();
	var chain = client.newChain(e2e.channel);

	var orgName = ORGS[org].name;

	for (let key in ORGS[org]) {
		if (ORGS[org].hasOwnProperty(key)) {
			if (key.indexOf('peer1') === 0) {
				let data = fs.readFileSync(path.join(__dirname, '/test', ORGS[org][key]['tls_cacerts']));
				let peer = client.newPeer(
					ORGS[org][key].requests,
					{
						pem: Buffer.from(data).toString(),
						'ssl-target-name-override': ORGS[org][key]['server-hostname']
					}
				);
				chain.addPeer(peer);
			}
		}
	}

	return hfc.newDefaultKeyValueStore({
		path: testUtil.storePathForOrg(orgName)
	}).then((store) => {

		client.setStateStore(store);
		return testUtil.getSubmitter(client, t, org);

	}).then((admin) => {
		the_user = admin;

		nonce = utils.getNonce();
		tx_id = client.buildTransactionID(nonce, the_user);

		// send query
		var request = {
			chaincodeId : e2e.chaincodeId,
			chaincodeVersion : version,
			chainId: e2e.channel,
			txId: tx_id,
			nonce: nonce,
			fcn: 'invoke',
			args: ['query','b']
		};
		return chain.queryByChaincode(request);
	},
	(err) => {
		t.comment('Failed to get submitter \'admin\'');
		t.fail('Failed to get submitter \'admin\'. Error: ' + err.stack ? err.stack : err );
		t.end();
	}).then((response_payloads) => {
		if (response_payloads) {
			for(let i = 0; i < response_payloads.length; i++) {
				t.equal(response_payloads[i].toString('utf8'),'410','checking query results are correct that user b has 410 now after the move');
			}
			t.end();
		} else {
			t.fail('response_payloads is null');
			t.end();
		}
	},
	(err) => {
		t.fail('Failed to send query due to error: ' + err.stack ? err.stack : err);
		t.end();
	}).catch((err) => {
		t.fail('Failed to end to end test with error:' + err.stack ? err.stack : err);
		t.end();
	});
});

test('\n\n **** E R R O R  T E S T I N G on upgrade call', (t) => {
	var org = 'org1';
	var client = new hfc();
	var chain = client.newChain(e2e.channel);
	chain.addOrderer(
		client.newOrderer(
			ORGS.orderer.url,
			{
				'pem': caroots,
				'ssl-target-name-override': ORGS.orderer['server-hostname']
			}
		)
	);
	var orgName = ORGS[org].name;

	var targets = [];
	for (let key in ORGS[org]) {
		if (ORGS[org].hasOwnProperty(key)) {
			if (key.indexOf('peer1') === 0) {
				let data = fs.readFileSync(path.join(__dirname, '/test', ORGS[org][key]['tls_cacerts']));
				let peer = client.newPeer(
					ORGS[org][key].requests,
					{
						pem: Buffer.from(data).toString(),
						'ssl-target-name-override': ORGS[org][key]['server-hostname']
					}
				);
				targets.push(peer);
				chain.addPeer(peer);
			}
		}
	}

	hfc.newDefaultKeyValueStore({
		path: testUtil.storePathForOrg(orgName)
	})
	.then((store) => {
		client.setStateStore(store);
		return testUtil.getSubmitter(client, t, org);
	})
	.then((admin) => {
		t.pass('Successfully enrolled user \'admin\'');
		the_user = admin;

		return chain.initialize();

	})
	.then((nothing) => {
		t.pass('Successfully initialized channel');
		nonce = utils.getNonce();
		tx_id = client.buildTransactionID(nonce, the_user);

		// send proposal to endorser
		var request = {
			chaincodePath: testUtil.CHAINCODE_UPGRADE_PATH,
			chaincodeId : e2e.chaincodeId,
			chaincodeVersion : version,
			chainId: e2e.channel,
			fcn: 'init',
			args: ['a', '500', 'b', '600'],
			txId: tx_id,
			nonce: nonce
		};

		return chain.sendUpgradeProposal(request);

	}).then((results) => {
		checkResults(results, 'chain code with the same version exists', t);
		return Promise.resolve(true);
	}, (err) => {
		t.fail('This should not have thrown an Error ::'+ err);
		return Promise.resolve(true);
	}).then((nothing) => {
		nonce = utils.getNonce();
		tx_id = client.buildTransactionID(nonce, the_user);

		// send proposal to endorser
		var request = {
			chaincodePath: testUtil.CHAINCODE_UPGRADE_PATH,
			chaincodeId: 'dummy',
			chaincodeVersion: version,
			fcn: 'init',
			args: ['a', '500', 'b', '600'],
			chainId: e2e.channel,
			txId: tx_id,
			nonce: nonce
		};

		return chain.sendUpgradeProposal(request);

	}).then((results) => {
		checkResults(results, 'chaincode not found', t);
		return Promise.resolve(true);
	}, (err) => {
		t.pass('This should have thrown an Error ::'+ err);
		return Promise.resolve(true);
	}).then((nothing) => {
		nonce = utils.getNonce();
		tx_id = client.buildTransactionID(nonce, the_user);

		// send proposal to endorser
		var request = {
			chaincodePath: testUtil.CHAINCODE_UPGRADE_PATH,
			chaincodeId: e2e.chaincodeId,
			chaincodeVersion: 'v333333333',
			fcn: 'init',
			args: ['a', '500', 'b', '600'],
			chainId: e2e.channel,
			txId: tx_id,
			nonce: nonce
		};

		return chain.sendUpgradeProposal(request);

	}).then((results) => {
		checkResults(results, 'no such file or directory', t);
	}, (err) => {
		t.fail('This should not have thrown an Error ::'+ err);
	}).catch((err) => {
		t.fail('Got an Error along the way :: '+ err);
	});
	t.end();
});

function checkResults(results, error_snip, t) {
	var proposalResponses = results[0];
	for(var i in proposalResponses) {
		let proposal_response = proposalResponses[i];
		if(proposal_response instanceof Error) {
			logger.info(' Got the error %s', proposal_response.error);
			if(proposal_response.toString().indexOf(error_snip) > 0) {
				t.pass(' Successfully got the error '+ error_snip);
			}
			else {
				t.fail(' Failed to get error '+ error_snip);
			}
		}
		else {
			t.fail(' Failed to get an error returned :: No Error returned , should have had an error with '+ error_snip);
		}
	}
}

