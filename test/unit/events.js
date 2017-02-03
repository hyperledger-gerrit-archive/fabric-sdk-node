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

var tape = require('tape');
var _test = require('tape-promise');
var test = _test(tape);
process.env.HFC_LOGGING = '{"debug": "console"}';
var log4js = require('log4js');
var logger = log4js.getLogger('E2E');
logger.setLevel('DEBUG');

var path = require('path');

var hfc = require('fabric-client');
hfc.setLogger(logger);

var util = require('util');
var testUtil = require('./util.js');
var utils = require('fabric-client/lib/utils.js');
var Peer = require('fabric-client/lib/Peer.js');
var Orderer = require('fabric-client/lib/Orderer.js');
var EventHub = require('fabric-client/lib/EventHub.js');

var client = new hfc();
var chain = client.newChain('testChain-e2e');

var webUser = null;
var chaincode_id = 'end2end';
var chain_id = 'testchainid';
var tx_id = null;
var nonce = null;
var peer0 = new Peer('grpc://localhost:7051');
var peer1 = new Peer('grpc://localhost:7056');
//var peer2 = new Peer('grpc://localhost:7060');
//peer0.setEventSourceURL('grpc://localhost:7053');
//peer1.setEventSourceURL('grpc://localhost:7058');
//peer2.setEventSourceURL('grpc://localhost:7062');

var steps = [];
if (process.argv.length > 2) {
	for (let i=2; i<process.argv.length; i++) {
		steps.push(process.argv[i]);
	}
}
var useSteps = false;
if (steps.length > 0 &&
	(steps.indexOf('step1') > -1 || steps.indexOf('step2') > -1 || steps.indexOf('step3') > -1))
	useSteps = true;
logger.info('Found steps: %s', steps, 'useSteps: '+useSteps);

testUtil.setupChaincodeDeploy();

chain.addOrderer(new Orderer('grpc://localhost:7050'));
chain.addPeer(peer0);
chain.addPeer(peer1);
//chain.addPeer(peer2);

var eh = null;

var transaction_list = [];
function transaction_callback(event) {
	if(event.cancel) {
		console.log(' **************** E V E N T  C A L L B A C K cancelling');
		return;
	}
	console.log(' **************** E V E N T  C A L L B A C K processing transaction =%s',event.txID);
	var found = false;
	for(var i in transaction_list) {
		var transaction = transaction_list[i];
		if(transaction.txID == event.txID && transaction.peerURL == event.peerURL) {
			transaction.status = 'complete';
			console.log(' changed txID:'+ transaction.txID + ' from:'+ transaction.peerURL);
			found = true;
		}
	}
	if(!found) {
		console.log('transaction txID:'+event.txID+ ' from:'+ event.peerURL + ' was not found');
	}
}

test(' \n\n **** EventHub testing, must be run after end-to-end so that chaincode is deployed\n', function(t) {
	hfc.newDefaultKeyValueStore({
		path: testUtil.KVS
	}).then( function (store) {
		client.setStateStore(store);
		var promise = testUtil.getSubmitter(client, t);

		// override t.end function so it'll always disconnect the event hub
		t.end = (function(context, chain, f) {
			return function() {
				logger.info('Disconnecting the event hub');
				chain.disconnectEventSource();

				f.apply(context, arguments);
			};
		})(t, chain, t.end);

		if (!useSteps || steps.indexOf('step1') >= 0) {
			logger.info('Executing step1');
			promise = promise.then(
				function(admin) {
					t.pass('Successfully enrolled user \'admin\'');
					webUser = admin;

					// setup event hub to get notified when transactions are committed
					try {
						var dummy = chain.connectEventSource();
						t.fail('The connect event source should have failed');
					}
					catch(error) {
						console.log('Chain-connectEventSource failed - %s',error.stack ? error.stack : error);
						t.pass('This is supposed to fail');
					}

					try {
						peer0.setEventSourceURL('grpc://localhost:7053');
						var eh3 = chain.connectEventSource();

						var eh2 = chain.connectEventSource();
						t.equal(eh3._url,eh2._url,'Should be the same event hub');
						peer1.setEventSourceURL('grpc://localhost:7058');
						eh = chain.connectEventSource();
						t.notEqual(eh._url,eh2._url,'Should not be the same event hub');
						chain.setTransactionEventListener(transaction_callback);
						t.pass('Successfully added a listner to the event hubs');
						t.equal(chain._event_hubs.length,2,'Should only be two hubs now');
					}
					catch(error) {
						console.log('Chain-connectEventSource failed - %s',error.stack ? error.stack : error);
						t.fail('Test hit exception');
						t.end();

					}

//					try {
//						peer2.setEventSourceURL('grpc://localhost:7062');
//						var eh4 = chain.connectEventSource();
//						eh4.registerCreator('fakecert', transaction_callback);
//						t.fail(' the connected should fail');
//					}
//					catch(error) {
//						console.log('event hub failed - %s',error.stack ? error.stack : error);
//						t.fail('Test hit exception');
//						t.end();
//
//					}

					return;
				}
			);
		}



		if (!useSteps || steps.indexOf('step2') >= 0) {
			promise = promise.then(
				function(data) {
					logger.info('Executing step2');

					// we may get to this point from the sleep() call above
					// or from skipping step1 altogether. if coming directly
					// to this step then "data" will be the webUser
					if (typeof data !== 'undefined' && data !== null) {
						webUser = data;
					}

					return;
				},
				function(err) {
					t.fail('Failed to get transaction notification within the timeout period');
					t.end();
				}
			).then(
				function() {
					tx_id = '2345'; //utils.buildTransactionID({length:12});
					nonce = utils.getNonce();
					// send proposal to endorser
					var request = {
						chaincodeId : chaincode_id,
						fcn: 'invoke',
						args: ['move', 'a', 'b','100'],
						chainId: chain_id,
						txId: tx_id,
						nonce: nonce
					};
					transaction_list.push({txID : tx_id, status : 'pending'});
					return chain.sendTransactionProposal(request);
				},
				function(err) {
					t.fail('Failed to wait due to error: ' + err.stack ? err.stack : err);
					t.end();
				}
			).then(
				function(results) {
					var all_good = false;
					if (results) {
						var proposalResponses = results[0];
						var proposal = results[1];
						var header   = results[2];

						all_good = true;
						for(var i in proposalResponses) {
							let one_good = false;
							if (proposalResponses && proposalResponses[i].response && proposalResponses[i].response.status === 200) {
								one_good = true;
								logger.info('move proposal was good');
							} else {
								logger.error('move proposal was bad');
							}
							all_good = all_good & one_good;
						}
					}
					if (all_good) {
						t.pass('Successfully obtained transaction endorsements.'); // + JSON.stringify(proposalResponses));
						var request = {
							proposalResponses: proposalResponses,
							proposal: proposal,
							header: header
						};
						return chain.sendTransaction(request);
					} else {
						t.fail('Failed to obtain transaction endorsements. Error code: '
							+ (results ? results : 'Results are null'));
						t.end();
					}
				},
				function(err) {
					t.fail('Failed to send transaction proposal due to error: ' + err.stack ? err.stack : err);
					t.end();
				}
			).then(
				function(response) {
					if (response.status === 'SUCCESS') {
						t.pass('Successfully ordered endorsement transaction.');
						return new Promise((resolve, reject) => {
							var handle = setTimeout(reject, 30000);

							eh.registerTxEvent(tx_id.toString(), (tx) => {
								if(tx.unregisterTxCallback) {
									t.pass('The chaincode move transaction has been successfully cancelled for tx ' + tx.txID);
								}
								else {
									t.pass('The chaincode move transaction has been successfully committed for tx ' + tx);
								}
								clearTimeout(handle);

								if (!useSteps) {
									resolve();
								} else if (steps.length === 1 && steps[0] === 'step2') {
									t.end();
									resolve();
								}
							});
						});
					} else {
						t.fail('Failed to order the endorsement of the transaction. Error code: ' + response.status);
						t.end();
					}
				},
				function(err) {
					t.fail('Failed to send transaction proposal due to error: ' + err.stack ? err.stack : err);
					t.end();
				}
			);
		}

		if (!useSteps || steps.indexOf('step3') >= 0) {
			promise = promise.then(
				function(data) {
					logger.info('Executing step3');

					// we may get to this point from the sleep() call above
					// or from skipping step1 altogether. if coming directly
					// to this step then "data" will be the webUser
					if (typeof data !== 'undefined' && data !== null) {
						webUser = data;
					}

					return;
				},
				function(err) {
					t.fail('Failed to get transaction notification within the timeout period');
					t.end();
				}
			).then(
				function() {
					// send query
					var request = {
						targets: [peer0, peer1],
						chaincodeId : chaincode_id,
						chainId: chain_id,
						txId: utils.buildTransactionID(),
						nonce: utils.getNonce(),
						fcn: 'invoke',
						args: ['query','b']
					};
					return chain.queryByChaincode(request);
				},
				function(err) {
					t.fail('Failed to wait-- error: ' + err.stack ? err.stack : err);
					t.end();
				}
			).then(
				function(response_payloads) {
					for(let i = 0; i < response_payloads.length; i++) {
						t.equal(response_payloads[i].toString('utf8'),'400','checking query results are correct that user b has 400 now after the move');
					}
					// check all transactions to see if in the correct state
					for(var i in transaction_list) {
						var transaction = transaction_list[i];
						logger.debug(' transaction %j', transaction );

						if(transaction.status == 'complete') {
							t.pass(' Transaction callback status is correct');
						}
						else {
							t.fail(' Transaction callback status is not correct');
						}
					}
					t.end();
				},
				function(err) {
					t.fail('Failed to send query due to error: ' + err.stack ? err.stack : err);
					t.end();
				}
			).catch(
				function(err) {
					t.fail('Failed to end to end test with error:' + err.stack ? err.stack : err);
					t.end();
				}
			);
		}
	});
});
