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

var tape = require('tape');
var _test = require('tape-promise');
var test = _test(tape);
process.env.HFC_LOGGING = '{"debug": "console"}';

var tar = require('tar-fs');
var gunzip = require('gunzip-maybe');
var fs = require('fs-extra');
var grpc = require('grpc');

var Client = require('fabric-client');
var client = new Client();
var testutil = require('./util.js');
var ChannelConfig = require('fabric-client/lib/ChannelConfig.js');

testutil.resetDefaults();
var utils = require('fabric-client/lib/utils.js');
var logger = utils.getLogger('config-envelope-test');

var grpc = require('grpc');
var commonProto = grpc.load(__dirname + '/../../fabric-client/lib/protos/common/common.proto').common;
var configtxProto = grpc.load(__dirname + '/../../fabric-client/lib/protos/common/configtx.proto').common;

var TWO_ORG_MEMBERS_AND_ADMIN = [{
	role: {
		name: 'member',
		mspId: 'org1'
	}
}, {
	role: {
		name: 'member',
		mspId: 'org2'
	}
}, {
	role: {
		name: 'admin',
		mspId: 'masterOrg'
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
		},
		policies : {
			readers : {threshold : 'ANY'},
			writers : {threshold : 'ALL'},
			admins  : {threshold : 'MAJORITY'},
			accept_all : {n_of_signature : ACCEPT_ALL}
		},
		orderers : {
			organizations : [{
				mspid : 'ordererMSP',
				policies : {
					readers : {n_of_signature : ONE_OF_TWO_ORG_MEMBER},
					writers : {n_of_signature : ONE_OF_TWO_ORG_MEMBER},
					admins  : {n_of_signature : ONE_OF_TWO_ORG_MEMBER}
				},
				end_points : ['orderer:7050'],
				kafka_brokers : ['orderer:8888']
			}],
			policies : {
				readers : {threshold : 'ANY'},
				writers : {threshold : 'ALL'},
				admins  : {threshold : 'MAJORITY'}
			}
		},
		peers : {
			organizations : [{
				mspid : 'org1MSP',
				anchor_peers : ['host1:7051', 'host2:7056'],
				policies : {
					readers : {n_of_signature : ONE_OF_TWO_ORG_MEMBER},
					writers : {n_of_signature : ONE_OF_TWO_ORG_MEMBER},
					admins  : {n_of_signature : ONE_OF_TWO_ORG_MEMBER}
				}
			}],
			policies : {
				readers : {threshold : 'ANY'},
				writers : {threshold : 'ALL'},
				admins  : {threshold : 'MAJORITY'}
			},
		}
	}
};

// error tests /////////////
test('\n\n ** ChannelConfig - parameter test **\n\n', function (t) {
	t.throws(
		function () {
			var channelConfig = new ChannelConfig();
		},
		/^Error: MSP manager is required/,
		'checking MSP manager is required'
	);

	t.throws(
		function () {
			var channelConfig = new ChannelConfig({});
			channelConfig.build();
		},
		/^Error: ChannelConfig definition object is required/,
		'Checking ChannelConfig definition object is required'
	);

	t.throws(
		function () {
			var channelConfig = new ChannelConfig({});
			channelConfig.build({});
		},
		/^Error: ChannelConfig "channel" definition object is required/,
		'Checking ChannelConfig "channel" definition object is required'
	);

	t.throws(
		function () {
			var channelConfig = new ChannelConfig({});
			channelConfig.build({channel : {}});
		},
		/^Error: ChannelConfig "settings" definition object is required/,
		'Checking ChannelConfig "settings" definition object is required'
	);

	t.throws(
		function () {
			var channelConfig = new ChannelConfig({});
			channelConfig.build({channel : { settings : {}}});
		},
		/^Error: ChannelConfig "orderers" definition object is required/,
		'Checking ChannelConfig "orderers" definition object is required'
	);

	t.throws(
		function () {
			var channelConfig = new ChannelConfig({});
			channelConfig.build({channel : { settings : {}, orderers : {}}});
		},
		/^Error: ChannelConfig "peers" definition object is required/,
		'Checking ChannelConfig "peers" definition object is required'
	);

	t.throws(
		function () {
			let test_input2 = { channel : {	name : 'mychannel',
				settings : {
					BatchSize : {maxMessageCount : 10, absoluteMaxBytes : 103809024,	preferredMaxBytes : 524288},
					BatchTimeout : '10s',
					HashingAlgorithm : 'SHA256',
					BlockDataHashingStructure : 4294967295,
					ConsensusType : 'solo'},
				orderers : {},
				peers : {}
			}};
			var msp_manager = client.newMSPManager();
			var channelConfig = client.buildChannelConfigUpdate(msp_manager, test_input2);
		},
		/^Error: Missing orderers organizations array/,
		'Checking Missing orderers organizations array'
	);

	t.throws(
		function () {
			let test_input1 = { channel : {	name : 'mychannel',
				settings : {
					BatchSize : {maxMessageCount : 10, absoluteMaxBytes : 103809024,	preferredMaxBytes : 524288},
					BatchTimeout : '10s',
					HashingAlgorithm : 'SHA256',
					BlockDataHashingStructure : 4294967295,
					ConsensusType : 'solo'},
				orderers : {organizations : []},
				peers : {}
			}};
			var msp_manager = client.newMSPManager();
			var channelConfig = client.buildChannelConfigUpdate(msp_manager, test_input1);
		},
		/^Error: Missing peers organizations array/,
		'Checking Missing peers organizations array'
	);

	t.throws(
		function () {
			let test_input = { channel : {
				settings : {
					BatchSize : {maxMessageCount : 10, absoluteMaxBytes : 103809024,	preferredMaxBytes : 524288},
					BatchTimeout : '10s',
					HashingAlgorithm : 'SHA256',
					BlockDataHashingStructure : 4294967295,
					ConsensusType : 'solo'},
				orderers : {organizations : []},
				peers : {}
			}};
			var msp_manager = client.newMSPManager();
			var channelConfig = client.buildChannelConfigUpdate(msp_manager, test_input);
		},
		/^Error: ChannelConfig "name" is required/,
		'Checking ChannelConfig "name" is required'
	);

	t.throws(
		function () {
			let test_input = { channel : {	name : 'mychannel',
				settings : {
					BatchSize : {maxMessageCount : 10, absoluteMaxBytes : 103809024,	preferredMaxBytes : 524288},
					BatchTimeout : '10s',
					HashingAlgorithm : 'SHA256',
					BlockDataHashingStructure : 4294967295,
					ConsensusType : 'solo'},
				orderers : {organizations : [{mspid : 'ordererMSP'}]},
				peers : {}
			}};
			var msp_manager = client.newMSPManager();
			msp_manager.addMSP({rootCerts: [], admins: [], id: 'ordererMSP'});
			var channelConfig = client.buildChannelConfigUpdate(msp_manager, test_input);
		},
		/^Error: Missing "end_points" in orderer organization definition/,
		'Checking Missing "end_points" in orderer organization definition'
	);

	t.throws(
		function () {
			let test_input = { channel : {	name : 'mychannel',
				settings : {
					BatchSize : {maxMessageCount : 10, absoluteMaxBytes : 103809024,	preferredMaxBytes : 524288},
					BatchTimeout : '10s',
					HashingAlgorithm : 'SHA256',
					BlockDataHashingStructure : 4294967295,
					ConsensusType : 'solo'},
				orderers : {organizations : [{ end_points :[],policies : { admins : { threshold : 'ALL'}}}]},
				peers : {organizations : [{mspid : 'org1MSP' ,policies : { admins : { threshold : 'ALL'}}}]}
			}};
			var msp_manager = client.newMSPManager();
			msp_manager.addMSP({rootCerts: [], admins: [], id: 'ordererMSP'});
			msp_manager.addMSP({rootCerts: [], admins: [], id: 'org1MSP'});
			var channelConfig = client.buildChannelConfigUpdate(msp_manager, test_input);
		},
		/^Error: Missing "mspid" value in the organization/,
		'Checking Missing "mspid" value in the organization'
	);


	t.throws(
		function () {
			let test_input = { channel : {	name : 'mychannel',
				settings : {
					BatchSize : {maxMessageCount : 10, absoluteMaxBytes : 103809024,	preferredMaxBytes : 524288},
					BatchTimeout : '10s',
					HashingAlgorithm : 'SHA256',
					BlockDataHashingStructure : 4294967295,
					ConsensusType : 'solo'	},
				orderers : {organizations : [{mspid : 'ordererMSP', end_points :[],policies : { admins : { threshold : 'ALL'}}}]},
				peers : {organizations : [{mspid : 'org1MSP' ,policies : { admins : { threshold : 'ALL'}}}]}
			}};
			var msp_manager = client.newMSPManager();
			msp_manager.addMSP({rootCerts: [], admins: [], id: 'ordererMSP'});
			msp_manager.addMSP({rootCerts: [], admins: [], id: 'org1MSP'});
			var channelConfig = client.buildChannelConfigUpdate(msp_manager, test_input);
		},
		/^Error: Missing "anchor_peers" array in peers orgainization definition/,
		'Checking Missing "anchor_peers" array in peers orgainization definition'
	);

	t.throws(
		function () {
			let test_input = { channel : {	name : 'mychannel',
				settings : {
					BatchSize : {maxMessageCount : 10, absoluteMaxBytes : 103809024,	preferredMaxBytes : 524288},
					BatchTimeout : '10s',
					HashingAlgorithm : 'SHA256',
					BlockDataHashingStructure : 4294967295,
					ConsensusType : 'solo',},
				orderers : {organizations : [{mspid : 'ordererMSP', 'end_points' :['somehost:9090'],policies : { admins : { threshold : 'ALL'}}}]},
				peers : { organizations : [{mspid : 'org1MSP', anchor_peers : ['host:port'],policies : { admins : { threshold : 'ALL'}}}]}
			}};
			var msp_manager = client.newMSPManager();
			msp_manager.addMSP({rootCerts: [], admins: [], id: 'ordererMSP'});
			msp_manager.addMSP({rootCerts: [], admins: [], id: 'org1MSP'});
			var channelConfig = client.buildChannelConfigUpdate(msp_manager, test_input);
		},
		/^Error: Organization org1MSP has an invalid achor peer address ::host:port/,
		'Checking Organization org1MSP has an invalid achor peer address ::host:port'
	);

	t.throws(
		function () {
			let test_input = { channel : { name: 'mychannel',
				settings : {
					BatchSize : {
						maxMessageCount : 10,
						absoluteMaxBytes : 103809024,
						preferredMaxBytes : 524288
					},
					BatchTimeout : '10s',
					HashingAlgorithm : 'SHA256',
					BlockDataHashingStructure : 4294967295,
					ConsensusType : 'solo',},
				orderers : {organizations : [{mspid : 'ordererMSP', 'end_points' :['somehost:9090'],policies : { admins : { threshold : 'BAD'}}}]},
				peers : { organizations : [{mspid : 'org1MSP', anchor_peers : ['host:port'],policies : { admins : { threshold : 'BAD'}}}]},
				policies : { admins : { threshold : 'BAD'}}
			}};
			var msp_manager = client.newMSPManager();
			msp_manager.addMSP({rootCerts: [], admins: [], id: 'ordererMSP'});
			msp_manager.addMSP({rootCerts: [], admins: [], id: 'org1MSP'});
			var channelConfig = client.buildChannelConfigUpdate(msp_manager, test_input);
		},
		/^Error: Implicit Rule is not known ::BAD/,
		'Checking Implicit Rule is not known ::BAD'
	);

	t.end();
});


test('\n\n ** ChannelConfig - MSP check **\n\n', function (t) {


	t.throws(
		function () {
			var msp_manager = client.newMSPManager();
			var channelConfig = client.buildChannelConfigUpdate(msp_manager, test_input);
		},
		/^Error: MSP ordererMSP was not found/,
		'Checking MSP ordererMSP was not found'
	);
	t.end();
});

test('\n\n ** ChannelConfig - basic field check tests **\n\n', function (t) {
	t.doesNotThrow(
		function () {
			try {
				var msp_manager = client.newMSPManager();
				msp_manager.addMSP({rootCerts: [], admins: [], id: 'ordererMSP'});
				msp_manager.addMSP({rootCerts: [], admins: [], id: 'org1MSP'});
				var channelConfigUpdate = client.buildChannelConfigUpdate(msp_manager, test_input);
				t.pass('No exceptions building on a good configuration');

				var chain = client.newChain('test');
				var results = chain.loadConfigUpdate(channelConfigUpdate);
				t.pass('No exceptions reloading the results of the build');

				logger.info(' results found ::%j',results);
				t.equals(results.anchor_peers[0].host,'host1', 'Checking that we found anchor peer host1');
				t.equals(results.anchor_peers[0].port,7051, 'Checking that we found anchor peer port');
				t.equals(results.anchor_peers[1].host,'host2', 'Checking that we found anchor peer host2');
				t.equals(results.anchor_peers[1].port,7056, 'Checking that we found anchor peer port');
				t.equals(results.orderers[0],'orderer:7050', 'Checking that we found orderer');
				t.equals(results.kafka_brokers[0],'orderer:8888', 'Checking that we found kafka broker');
				t.equals(chain._msp_manager.getMSP('ordererMSP').getId(),'ordererMSP', 'Checking that the msp was loaded by the initialize');
				t.equals(chain._msp_manager.getMSP('org1MSP').getId(),'org1MSP', 'Checking that the msp was loaded by the initialize');
				t.equals(results.settings.ConsensusType.type, 'solo', 'Checking for consensus type setting');
				t.equals(results.settings.BatchSize.maxMessageCount, 10, 'Checking for BatchSize setting');
				t.equals(results.settings.HashingAlgorithm.name, 'SHA256', 'Checking for HashingAlgorithm setting');
				t.equals(results.settings.BlockDataHashingStructure.width, 4294967295, 'Checking for BlockDataHashingStructure setting');
			}
			catch(err) {
				logger.error('test -:: %s', err.stack ? err.stack : err);
				throw err;
			}
		},
		null,
		'checking basic input'
	);
	t.end();
});


