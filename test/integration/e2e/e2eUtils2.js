/**
 * Copyright 2017 IBM All Rights Reserved.
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
var utils = require('fabric-client/lib/utils.js');
var logger = utils.getLogger('E2E storeless testing');

var tape = require('tape');
var _test = require('tape-promise');
var test = _test(tape);

var path = require('path');
var fs = require('fs');
var util = require('util');

var Client = require('fabric-client');
var EventHub = require('fabric-client/lib/EventHub.js');
var testUtil = require('../../unit/util.js');

var e2e = testUtil.END2END;
Client.addConfigFile(path.join(__dirname, './config.json'));
var ORGS = Client.getConfigSetting('test-network');

var grpc = require('grpc');

var tx_id = null;
var the_user = null;

function invokeChaincode(userOrg, version, t){
	logger.debug('invokeChaincode begin');
	Client.setConfigSetting('request-timeout', 60000);
	var channel_name = Client.getConfigSetting('E2E_CONFIGTX_CHANNEL_NAME', testUtil.END2END.channel);

	var targets = [],
		eventhubs = [];
	var pass_results = null;

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
	})(t, eventhubs, t.end);

	// this is a transaction, will just use org's identity to
	// submit the request. intentionally we are using a different org
	// than the one that instantiated the chaincode, although either org
	// should work properly
	var client = new Client();
	var channel = client.newChannel(channel_name);

	var orgName = ORGS[userOrg].name;
	client.newCryptoSuite();//no cryptoKeyStore

	var caRootsPath = ORGS.orderer.tls_cacerts;
	let data = fs.readFileSync(path.join(__dirname, caRootsPath));
	let caroots = Buffer.from(data).toString();

	channel.addOrderer(
		client.newOrderer(
			ORGS.orderer.url,
			{
				'pem': caroots,
				'ssl-target-name-override': ORGS.orderer['server-hostname']
			}
		)
	);

	var orgName = ORGS[userOrg].name;
	return testUtil.getSubmitter(client, t, userOrg)

	.then((admin) => {

		t.pass('Successfully enrolled user \'admin\'');
		the_user = admin;

		// set up the channel to use each org's 'peer1' for
		// both requests and events
		for (let key in ORGS) {
			if (ORGS.hasOwnProperty(key) && typeof ORGS[key].peer1 !== 'undefined') {
				let data = fs.readFileSync(path.join(__dirname, ORGS[key].peer1['tls_cacerts']));
				let peer = client.newPeer(
					ORGS[key].peer1.requests,
					{
						pem: Buffer.from(data).toString(),
						'ssl-target-name-override': ORGS[key].peer1['server-hostname']
					}
				);
				channel.addPeer(peer);
			}
		}

		// an event listener can only register with a peer in its own org
		let data = fs.readFileSync(path.join(__dirname, ORGS[userOrg].peer1['tls_cacerts']));
		let eh = new EventHub(client);
		eh.setPeerAddr(
			ORGS[userOrg].peer1.events,
			{
				pem: Buffer.from(data).toString(),
				'ssl-target-name-override': ORGS[userOrg].peer1['server-hostname']
			}
		);
		eh.connect();
		eventhubs.push(eh);

		return channel.initialize();

	}).then((nothing) => {
		tx_id = client.newTransactionID(the_user);
		utils.setConfigSetting('E2E_TX_ID', tx_id.getTransactionID());
		logger.info('setConfigSetting("E2E_TX_ID") = %s', tx_id.getTransactionID());
		t.comment(util.format('Sending transaction "%s"', tx_id.getTransactionID()));

		// send proposal to endorser
		var request = {
			chaincodeId : e2e.chaincodeId,
			fcn: 'invoke',
			args: ['move', 'a', 'b','100'],
			txId: tx_id,
		};
		return channel.sendTransactionProposal(request);

	}, (err) => {

		t.fail('Failed to enroll user \'admin\'. ' + err);
		throw new Error('Failed to enroll user \'admin\'. ' + err);
	}).then((results) =>{
		pass_results = results;
		var sleep_time = 0;
		// can use "sleep=30000" to give some time to manually stop and start
		// the peer so the event hub will also stop and start
		if (process.argv.length > 2) {
			if (process.argv[2].indexOf('sleep=') === 0) {
				sleep_time = process.argv[2].split('=')[1];
			}
		}
		t.comment('*****************************************************************************');
		t.comment('stop and start the peer event hub ---- N  O  W ----- you have ' + sleep_time + ' millis');
		t.comment('*****************************************************************************');
		return sleep(sleep_time);
	}).then((nothing) => {

		var proposalResponses = pass_results[0];

		var proposal = pass_results[1];
		var header   = pass_results[2];
		var all_good = true;
		for(var i in proposalResponses) {
			let one_good = false;
			let proposal_response = proposalResponses[i];
			if( proposal_response.response && proposal_response.response.status === 200) {
				t.pass('transaction proposal has response status of good');
				one_good = channel.verifyProposalResponse(proposal_response);
				if(one_good) {
					t.pass(' transaction proposal signature and endorser are valid');
				}
			} else {
				t.fail('transaction proposal was bad');
			}
			all_good = all_good & one_good;
		}
		if (all_good) {
			// check all the read/write sets to see if the same, verify that each peer
			// got the same results on the proposal
			all_good = channel.compareProposalResponseResults(proposalResponses);
			t.pass('compareProposalResponseResults exection did not throw an error');
			if(all_good){
				t.pass(' All proposals have a matching read/writes sets');
			}
			else {
				t.fail(' All proposals do not have matching read/write sets');
			}
		}
		if (all_good) {
			// check to see if all the results match
			t.pass(util.format('Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s", metadata - "%s", endorsement signature: %s', proposalResponses[0].response.status, proposalResponses[0].response.message, proposalResponses[0].response.payload, proposalResponses[0].endorsement.signature));
			var request = {
				proposalResponses: proposalResponses,
				proposal: proposal,
				header: header
			};

			// set the transaction listener and set a timeout of 30sec
			// if the transaction did not get committed within the timeout period,
			// fail the test
			var deployId = tx_id.getTransactionID();

			var eventPromises = [];
			eventhubs.forEach((eh) => {
				let txPromise = new Promise((resolve, reject) => {
					let handle = setTimeout(reject, 120000);

					eh.registerTxEvent(deployId.toString(),
						(tx, code) => {
							clearTimeout(handle);
							eh.unregisterTxEvent(deployId);

							if (code !== 'VALID') {
								t.fail('The balance transfer transaction was invalid, code = ' + code);
								reject();
							} else {
								t.pass('The balance transfer transaction has been committed on peer '+ eh.ep._endpoint.addr);
								resolve();
							}
						},
						(err) => {
							clearTimeout(handle);
							t.pass('Successfully received notification of the event call back being cancelled for '+ deployId);
							resolve();
						}
					);
				});

				eventPromises.push(txPromise);
			});

			var sendPromise = channel.sendTransaction(request);
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
			t.comment('******************************************************************');
			t.comment('To manually run /test/integration/query.js, set the following environment variables:');
			t.comment('export E2E_TX_ID='+'\''+tx_id.getTransactionID()+'\'');
			t.comment('******************************************************************');
			logger.debug('invokeChaincode end');
			return true;
		} else {
			t.fail('Failed to order the transaction. Error code: ' + response.status);
			throw new Error('Failed to order the transaction. Error code: ' + response.status);
		}
	}, (err) => {

		t.fail('Failed to send transaction due to error: ' + err.stack ? err.stack : err);
		throw new Error('Failed to send transaction due to error: ' + err.stack ? err.stack : err);

	});
};

module.exports.invokeChaincode = invokeChaincode;



function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}
module.exports.sleep = sleep;

