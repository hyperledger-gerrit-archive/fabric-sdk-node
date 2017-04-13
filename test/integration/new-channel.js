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

var utils = require('fabric-client/lib/utils.js');
utils.setConfigSetting('hfc-logging', '{"debug":"console"}');
var logger = utils.getLogger('E2E create-channel');

var tape = require('tape');
var _test = require('tape-promise');
var test = _test(tape);

var Client = require('fabric-client');
var util = require('util');
var fs = require('fs');
var path = require('path');

var testUtil = require('../unit/util.js');

var the_user = null;

Client.addConfigFile(path.join(__dirname, './config.json'));
var ORGS = Client.getConfigSetting('test-network');

//
//Attempt to send a request to the orderer with the sendCreateChain method
//
test('\n\n***** SDK Built config update  create flow  *****\n\n', function(t) {
	//
	// Create and configure the test chain
	//
	var client = new Client();
	var msp_manager = client.newMSPManager();

	var caRootsPath = ORGS.orderer.tls_cacerts;
	let data = fs.readFileSync(path.join(__dirname,'/test', caRootsPath));
	let caroots = Buffer.from(data).toString();

	var orderer = client.newOrderer(
		ORGS.orderer.url,
		{
			'pem': caroots,
			'ssl-target-name-override': ORGS.orderer['server-hostname']
		}
	);


	var TWO_ORG_MEMBERS_AND_ADMIN = [{
		role: {
			name: 'member',
			mspId: 'Org1MSP'
		}
	}, {
		role: {
			name: 'member',
			mspId: 'Org2MSP'
		}
	}, {
		role: {
			name: 'admin',
			mspId: 'Org1MSP'
		}
	}];

	var ONE_OF_TWO_ORG_MEMBER = {
		identities: TWO_ORG_MEMBERS_AND_ADMIN,
		policy: {
			'1-of': [{ 'signed-by': 0 }, { 'signed-by': 1 }]
		}
	};

	var ACCEPT_ALL = {
		identities: [],
		policy: {
			'0-of': []
		}
	};

	var test_input = {
		channel : {
			name : 'mychannel',
			version : 3,
			settings : {
				BatchSize : {
					maxMessageCount : 10,
					absoluteMaxBytes : 103809024,
					preferredMaxBytes : 524288
				},
				BatchTimeout : '10s',
				HashingAlgorithm : 'SHA256',
				BlockDataHashingStructure : 4294967295,
				ConsensusType : 'solo',
				CreationPolicy : 'AcceptAllPolicy'
			},
			policies : {
				Readers : {threshold : 'ANY'},
				Writers : {threshold : 'ANY'},
				Admins  : {threshold : 'ANY'},
				AcceptAllPolicy : {n_of_signature : ACCEPT_ALL}
			},
			orderers : {
				organizations : [{
					mspid : 'OrdererMSP',
					policies : {
						Readers : {n_of_signature : ACCEPT_ALL},
						Writers : {n_of_signature : ACCEPT_ALL},
						Admins  : {n_of_signature : ACCEPT_ALL}
					},
					end_points : ['orderer0:7050']
				}],
				policies : {
					Readers : {threshold : 'ANY'},
					Writers : {threshold : 'ANY'},
					Admins  : {threshold : 'ANY'},
					AcceptAllPolicy : {n_of_signature : ACCEPT_ALL},
					BlockValidation : {threshold : 'ANY' , sub_policy : 'Writers'}
				}
			},
			peers : {
				organizations : [{
					mspid : 'Org1MSP',
					anchor_peers : ['peer0:7051', 'peer1:7056'],
					policies : {
						Readers : {n_of_signature : ACCEPT_ALL},
						Writers : {n_of_signature : ACCEPT_ALL},
						Admins  : {n_of_signature : ACCEPT_ALL}
					}
				},{
					mspid : 'Org2MSP',
					anchor_peers : ['peer2:8051', 'peer3:8056'],
					policies : {
						Readers : {n_of_signature : ACCEPT_ALL},
						Writers : {n_of_signature : ACCEPT_ALL},
						Admins  : {n_of_signature : ACCEPT_ALL}
					}
				}],
				policies : {
					Readers : {threshold : 'ANY'},
					Writers : {threshold : 'ANY'},
					Admins  : {threshold : 'ANY'}
				},
			}
		}
	};

	var config_update = null;
	var signatures = [];

	// Acting as a client in org1 when creating the channel
	var org = ORGS.org1.name;

	utils.setConfigSetting('key-value-store', 'fabric-client/lib/impl/FileKeyValueStore.js');
	return Client.newDefaultKeyValueStore({
		path: testUtil.storePathForOrg(org)
	}).then((store) => {
		client.setStateStore(store);

		return testUtil.getSubmitter(client, t, 'org1');
	}).then((admin) => {
		t.pass('Successfully enrolled user \'admin\'');
		the_user = admin;

		msp_manager.addMSP( loadMSPConfig('OrdererMSP', 'orderer', 'ordererOrg1'));

		msp_manager.addMSP( loadMSPConfig('Org1MSP', 'peer', 'peerOrg1'));

		msp_manager.addMSP( loadMSPConfig('Org2MSP', 'peer', 'peerOrg2'));

		// have the SDK build the config update object
		config_update = client.buildChannelConfigUpdate(msp_manager, test_input);
		t.pass('Successfully built config update');

		// sign the config
		var signature = client.signChannelConfigUpdate(config_update);
		t.pass('Successfully signed config update');

		// collect all signatures
		signatures.push(signature);

		// build up the create request
		let nonce = utils.getNonce();
		let tx_id = Client.buildTransactionID(nonce, the_user);
		var request = {
			config_update : config_update,
			signatures : signatures,
			name : 'mychannel',
			orderer : orderer,
			txId  : tx_id,
			nonce : nonce
		};

		// send to create request to orderer
		return client.createChannel(request);
	})
	.then((chain) => {
		logger.debug(' response ::%j',chain);

		if (chain) {
			var test_orderers = chain.getOrderers();
			if(test_orderers) {
				var test_orderer = test_orderers[0];
				if(test_orderer === orderer) {
					t.pass('Successfully created the channel.');
				}
				else {
					t.fail('Chain did not have the orderer.');
				}
			}
			return sleep(5000);
		} else {
			t.fail('Failed to create the channel. ');
			t.end();
		}
	}, (err) => {
		t.fail('Failed to initialize the channel: ' + err.stack ? err.stack : err);
		t.end();
	})
	.then((nothing) => {
		t.pass('Successfully waited to make sure new channel was created.');
		t.end();
	}, (err) => {
		t.fail('Failed to sleep due to error: ' + err.stack ? err.stack : err);
		t.end();
	});
});

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function loadMSPConfig(name, type, org) {
	var msp = {};
	msp.id = name;
	msp.rootCerts = readAllFiles(path.join(__dirname, '../fixtures/channel/crypto-config/', type +'Organizations/', org, 'msp/cacerts/'));
	msp.admins = readAllFiles(path.join(__dirname, '../fixtures/channel/crypto-config/', type +'Organizations/', org, 'msp/admincerts/'));
	return msp;
}

function readAllFiles(dir) {
	var files = fs.readdirSync(dir);
	var certs = [];
	files.forEach((file_name) => {
		let file_path = path.join(dir,file_name);
		console.log(' looking at file ::'+file_path);
		let data = fs.readFileSync(file_path);
		certs.push(data);
	});
	return certs;
}