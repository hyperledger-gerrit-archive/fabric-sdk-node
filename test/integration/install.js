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
var rewire = require('rewire');

// use rewire to load the module to get access to the private functions to test
var ChainModule = rewire('../../fabric-client/lib/Chain.js');

var log4js = require('log4js');
var logger = log4js.getLogger('install');
logger.setLevel('DEBUG');

var path = require('path');

var hfc = require('fabric-client');
hfc.setLogger(logger);

var util = require('util');
var testUtil = require('../unit/util.js');
var utils = require('fabric-client/lib/utils.js');
var Peer = require('fabric-client/lib/Peer.js');
var Orderer = require('fabric-client/lib/Orderer.js');

var client = new hfc();
var chain_id = 'testchainid';
var orderer = new Orderer('grpc://localhost:7050');
var peer0 = new Peer('grpc://localhost:7051'),
	peer1 = new Peer('grpc://localhost:7056');
var the_user = null;

testUtil.setupChaincodeDeploy();

test('\n\n** Test chaincode install using chaincodePath to create chaincodePackage **\n\n', (t) => {
	var testDesc = null,chaincodePackage = null,chain = null, chainName = null;
	hfc.newDefaultKeyValueStore({
		path: testUtil.KVS
	}).then((store) => {
		client.setStateStore(store);
		return testUtil.getSubmitter(client, t);
	}).then((admin) => {
		t.pass('Successfully enrolled user \'admin\'');
		the_user = admin;
		return admin;
	},
	(err) => {
		t.fail('Failed to enroll user \'admin\'. ' + err);
		t.end();
		throw('Error - Failed to enroll user \'admin\'. ' + err);
	}).then((admin) => {
		var request = {
			chaincodePath: testUtil.CHAINCODE_PATH,
			chaincodeId: 'install',
			chaincodeVersion: 'v0',
		};
		chainName = 'testInstall';
		testDesc = 'using chaincodePath';
		t.comment('installing chainName - '+chainName);
		return install(the_user,chainName,orderer,[peer0],request,testDesc,t)
		.then((info) => {
			if (info === 'success') {
				t.pass('success');
				return the_user;
			} else t.fail(info);
		},
		(err) => {
			t.fail('install reject: '+err);
		}).catch((err) => {
			t.fail('install error');
			t.comment(err.stack ? err.stack : err);
		}).then ((admin) => {
			t.comment('#########################################');
			t.comment('install same chaincode again, should fail');
			t.comment('#########################################');
			return install(the_user,chainName+'0',orderer,[peer0],request,testDesc+'0',t)
			.then((info) => {
				if (info.toString().indexOf('install.v0 exists') > 0) {
					t.pass(info);
				} else t.fail(info);
			},
			(err) => {
				t.fail('install reject: '+err);
			}).catch((err) => {
				t.fail('install error');
				t.comment(err.stack ? err.stack : err);
			});
		});
	});

	t.end();
});

test('\n\n** Test chaincode install using chaincodePackage[byte] **\n\n', (t) => {
	var testDesc = null,chaincodePackage = null,chain = null, chainName = null;
	hfc.newDefaultKeyValueStore({
		path: testUtil.KVS
	}).then((store) => {
		client.setStateStore(store);
		return testUtil.getSubmitter(client, t);
	}).then((admin) => {
		t.pass('Successfully enrolled user \'admin\'');
		the_user = admin;
		return admin;
	},
	(err) => {
		t.fail('Failed to enroll user \'admin\'. ' + err);
		t.end();
		throw('Error - Failed to enroll user \'admin\'. ' + err);
	}).then((admin) => {
		var request = null;
		var chaincodePath = testUtil.CHAINCODE_PATH+'pkg';//not an existing path
		var chaincodeId = 'install-package';
		return createChaincodePackageInBytes(chaincodeId,t)
		.then((chaincodePackage) => {
			request = {
				chaincodePath: chaincodePath,
				chaincodeId: chaincodeId,
				chaincodeVersion: 'v0',
				chaincodePackage: chaincodePackage
			};
			chainName = 'testInstallPackage';
			testDesc = 'using chaincodePackage';
			t.comment('installing chainName - '+chainName);
			return install(the_user,chainName,orderer,[peer0],request,testDesc,t);
		})
		.then((info) => {
			if (info === 'success') {
				t.pass(testDesc+' - success');
				return the_user;
			} else t.fail(testDesc+' - '+info);
		},
		(err) => {
			t.fail(testDesc+' - install reject: '+err);
		}).catch((err) => {
			t.fail(testDesc+' - install error');
			t.comment(err.stack ? err.stack : err);
		}).then ((admin) => {
			t.comment('################################################');
			t.comment('install same chaincodePackage again, should fail');
			t.comment('################################################');
			return install(the_user,chainName+'0',orderer,[peer0],request,testDesc+'0',t)
			.then((info) => {
				if (info.toString().indexOf('install-package.v0 exists') > 0) {
					t.pass(info);
				} else t.fail(info);
			},
			(err) => {
				t.fail(testDesc+' - install same chaincode again - reject: '+err);
			}).catch((err) => {
				t.fail(testDesc+' - install same chaincode again - error');
				t.comment(err.stack ? err.stack : err);
			});
		});
	});

	t.end();
});

function install(user,chainName,orderer,peers,request,testDesc,t) {
	t.comment(util.format('function install %s, %s, %s, %s, %s, %s', user,chainName,orderer,peers,request,testDesc));
	try { // send proposal to endorser
		var error = null;
		var chain = client.newChain(chainName, user);
		chain.addOrderer(orderer);
		for (let i=0; i<peers.length; i++) {
			chain.addPeer(peers[i]);
		}
		var nonce = utils.getNonce();
		var tx_id = chain.buildTransactionID(nonce, user);
		request.txId = tx_id;
		request.nonce = nonce;
		t.comment(util.format(testDesc+' - request %s', JSON.stringify(request)));

		return chain.sendInstallProposal(request)
		.then((results) => {
			var proposalResponses = results[0];
			var proposal = results[1];
			var header   = results[2];
			var all_good = true;
			for(var i in proposalResponses) {
				let one_good = false;
				if (proposalResponses && proposalResponses[i].response && proposalResponses[i].response.status === 200) {
					one_good = true;
					logger.info(testDesc+' - install proposal was good');
				} else {
					logger.error(testDesc+' - install proposal was bad');
					error = proposalResponses[i];
				}
				all_good = all_good & one_good;
			}
			if (all_good) {
				t.comment(testDesc+' - Successfully sent install Proposal and received ProposalResponse');
				return 'success';
			} else {
				t.comment(testDesc+' - Failed to send install Proposal or receive valid response. Response null or status is not 200.');
				if (error) return new Error(error.stack ? error.stack : error);
				else return 'fail';
			}
		},
		(err) => {
			t.comment(testDesc+' - Error in sendInstallProposal');
			return new Error(err.stack ? err.stack : err);
		});
	} catch (err) {
		t.comment(testDesc+' - Error in install function');
		return Promise.reject(new Error(err.stack ? err.stack : err));
	};
}

function createChaincodePackageInBytes (chaincodeId,t) {
	try {
		var packageChaincode = ChainModule.__get__('packageChaincode');
		t.equal(typeof packageChaincode, 'function', 'The rewired module should return the private function here');
		debugger;
		return packageChaincode(false, {
			chaincodePath: testUtil.CHAINCODE_PATH,
			chaincodeId: chaincodeId
		}).then((data) => {
			return data;
		},
		(err) => {
			t.comment('Error in test packageChaincode function');
			return new Error(err.stack ? err.stack : err);
		});
	} catch (err) {
		t.comment('Error in createChaincodePackageInBytes function');
		return Promise.reject(new Error(err.stack ? err.stack : err));
	}
}