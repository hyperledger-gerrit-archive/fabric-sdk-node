/**
 * Copyright 2016-2017 IBM All Rights Reserved.
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
var client_utils = require('fabric-client/lib/client-utils.js');
var logger = utils.getLogger('unit.client');

var tape = require('tape');
var _test = require('tape-promise');
var test = _test(tape);
var path = require('path');
var util = require('util');

var Client = require('fabric-client');
var utils = require('fabric-client/lib/utils.js');
var User = require('fabric-client/lib/User.js');
var Peer = require('fabric-client/lib/Peer.js');
var Orderer = require('fabric-client/lib/Orderer.js');
var Organization = require('fabric-client/lib/Organization.js');
var NetworkConfig = require('fabric-client/lib/impl/NetworkConfig101.js');
var testutil = require('./util.js');

var caImport;

var grpc = require('grpc');
var _configtxProto = grpc.load(__dirname + '/../../fabric-client/lib/protos/common/configtx.proto').common;
var rewire = require('rewire');
var ClientRewired = rewire('fabric-client/lib/Client.js');

test('\n\n ** configuration testing **\n\n', function (t) {
	testutil.resetDefaults();

	t.throws(
		function() {
			var c = Client.loadFromConfig();
		},
		/Path must be a string./,
		'Should not be able to instantiate a new instance of "Client" without a valid path to the configuration');

	t.throws(
		function() {
			var c = Client.loadFromConfig('/');
		},
		/EISDIR: illegal operation on a directory/,
		'Should not be able to instantiate a new instance of "Client" without an actual configuration file');

	t.throws(
		function() {
			var c = Client.loadFromConfig('something');
		},
		/ENOENT: no such file or directory/,
		'Should not be able to instantiate a new instance of "Client" without an actual configuration file');

	t.doesNotThrow(
		() => {
			var c = Client.loadFromConfig('test/fixtures/network.json');
			logger.debug(' the network looks like ::%j',c._network);
		},
		null,
		'Should be able to instantiate a new instance of "Client" with a valid path to the configuration'
	);

	t.doesNotThrow(
		() => {
			var c = Client.loadFromConfig('test/fixtures/network.json');
			logger.debug(' the network looks like ::%j',c._network);
			var channel = c.newChannel('mychannel');
		},
		null,
		'Should be able to instantiate a new instance of "Channel" without the definition in the network configuration'
	);

	t.throws(
		() => {
			var c = Client.loadFromConfig('test/fixtures/network.json');
			logger.debug(' the network looks like ::%j',c._network);
			var channel = c.getChannel('dummy');
		},
		/Channel not found for name/,
		'Should not be able to instantiate a new instance of "Channel" without the definition in the network configuration'
	);

	t.doesNotThrow(
		() => {
			var c = Client.loadFromConfig('test/fixtures/network.yaml');
			logger.debug(' the network looks like ::%j',c._network);
			var channel = c.newChannel('mychannel');
		},
		null,
		'Should be able to instantiate a new instance of "Channel" without the definition in the network configuration'
	);

	var network_config = {};

	t.doesNotThrow(
		() => {
			var client = new Client();
			client._network_config = new NetworkConfig(network_config, client);
			var channel = client.newChannel('mychannel');
		},
		null,
		'Should be able to instantiate a new instance of "Channel" with blank definition in the network configuration'
	);

	network_config.channels = {
		'mychannel' : {
		}
	};

	t.doesNotThrow(
		() => {
			var client = new Client();
			client._network_config = new NetworkConfig(network_config, client);
			var channel = client.newChannel('mychannel');
			t.equals('mychannel',channel.getName(),'Channel should be named');
		},
		null,
		'Should be able to instantiate a new instance of "Channel" with an empty channel definition in the network configuration'
	);

	network_config.channels = {
		'mychannel' : {
			orderers : ['orderer0']
		}
	};

	network_config.orderers = {
		'orderer0' : {
			url : 'grpcs://localhost:7050',
			'tlsCACerts' : {
				path : 'test/fixtures/channel/crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/tlscacerts/example.com-cert.pem'
			}
		}
	};

	t.doesNotThrow(
		() => {
			var client = new Client();
			client._network_config = new NetworkConfig(network_config, client);
			var channel = client.getChannel('mychannel');
			t.equals('mychannel',channel.getName(),'Channel should be named');
			var orderer = channel.getOrderers()[0];
			if(orderer instanceof Orderer) t.pass('Successfully got an orderer');
			else t.fail('Failed to get an orderer');
		},
		null,
		'Should be able to instantiate a new instance of "Channel" with only orderer definition in the network configuration'
	);

	network_config.channels = {
		'mychannel' : {
			peers : {
				peer1 : {},
				peer2 : {},
				peer3 : {},
				peer4 : {}
			},
			orderers : ['orderer0']
		}
	};
	network_config.orgainizations = { 'org1' : {} };

	t.doesNotThrow(
		() => {
			var client = new Client();
			client._network_config = new NetworkConfig(network_config, client);
			var channel = client.getChannel('mychannel');
			t.equals('mychannel',channel.getName(),'Channel should be named');
			t.equals(channel.getPeers().length, 0, 'Peers should be empty');
			var orderer = channel.getOrderers()[0];
			if(orderer instanceof Orderer) t.pass('Successfully got an orderer');
			else t.fail('Failed to get an orderer');
		},
		null,
		'Should be able to instantiate a new instance of "Channel" with org that does not exist in the network configuration'
	);

	network_config.organizations = {
		'org1' : {
			peers : ['peer1','peer2']
		},
		'org2' : {
			peers : ['peer3','peer4']
		}
	};

	t.doesNotThrow(
		() => {
			var client = new Client();
			client._network_config = new NetworkConfig(network_config, client);
			var channel = client.getChannel('mychannel');
			t.equals('mychannel',channel.getName(),'Channel should be named');
			t.equals(channel.getPeers().length, 0, 'Peers should be empty');
			var orderer = channel.getOrderers()[0];
			if(orderer instanceof Orderer) t.pass('Successfully got an orderer');
			else t.fail('Failed to get an orderer');
		},
		null,
		'Should be able to instantiate a new instance of "Channel" with a peer in the org that does not exist in the network configuration'
	);

	network_config.peers = {
		'peer1' : {
			url : 'grpcs://localhost:7051',
			'tlsCACerts' : {
				pem : '-----BEGIN CERTIFICATE-----MIIB8TCC5l-----END CERTIFICATE-----'
			}
		},
		'peer2' : {
			url : 'grpcs://localhost:7052',
			'tlsCACerts' : {
				path : 'test/fixtures/channel/crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/tlscacerts/example.com-cert.pem'
			}
		},
		'peer3' : {
			url : 'grpcs://localhost:7053',
			'tlsCACerts' : {
				path : 'test/fixtures/channel/crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/tlscacerts/example.com-cert.pem'
			}
		},
		'peer4' : {
			url : 'grpcs://localhost:7054',
			'tlsCACerts' : {
				path : 'test/fixtures/channel/crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/tlscacerts/example.com-cert.pem'
			}
		},
	};

	t.doesNotThrow(
		() => {
			var client = new Client();
			client._network_config = new NetworkConfig(network_config, client);
			var channel = client.getChannel('mychannel');
			t.equals('mychannel',channel.getName(),'Channel should be named');
			t.equals(channel.getPeers().length, 4, 'Peers should be four');
			var peer =  channel.getPeers()[0];
			if(peer instanceof Peer) t.pass('Successfully got a peer');
			else t.fail('Failed to get a peer');
		},
		null,
		'Should be able to instantiate a new instance of "Channel" with orderer, org and peer defined in the network configuration'
	);

	var peer1 = new Peer('grpcs://localhost:9999', {pem : '-----BEGIN CERTIFICATE-----MIIB8TCC5l-----END CERTIFICATE-----'});

	t.doesNotThrow(
		() => {
			var client = new Client();
			client._network_config = new NetworkConfig(network_config, client);

			var targets = client_utils.getTargets('peer1', client);
			if(Array.isArray(targets)) t.pass('targets is an array');
			else t.fail('targets is not an array');
			if(targets[0] instanceof Peer) t.pass('targets has a peer ');
			else t.fail('targets does not have a peer');

			var targets = client_utils.getTargets(['peer1'], client);
			if(Array.isArray(targets)) t.pass('targets is an array');
			else t.fail('targets is not an array');
			if(targets[0] instanceof Peer) t.pass('targets has a peer ');
			else t.fail('targets does not have a peer');

			var targets = client_utils.getTargets(peer1, client);
			if(Array.isArray(targets)) t.pass('targets is an array');
			else t.fail('targets is not an array');
			if(targets[0] instanceof Peer) t.pass('targets has a peer ');
			else t.fail('targets does not have a peer');

			var targets = client_utils.getTargets([peer1], client);
			if(Array.isArray(targets)) t.pass('targets is an array');
			else t.fail('targets is not an array');
			if(targets[0] instanceof Peer) t.pass('targets has a peer ');
			else t.fail('targets does not have a peer');

		},
		null,
		'Should be able to get targets'
	);

	t.doesNotThrow(
		() => {
			var client = new Client();
			client._network_config = new NetworkConfig({}, client);
			var targets = client_utils.getTargets(null, client);
			t.equals(null, targets, 'targets should be null when request targets is null');
		},
		null,
		'Should return null targets when checking a null request target'
	);

	t.throws(
		() => {
			var client = new Client();
			client._network_config = new NetworkConfig({}, client);
			var targets = client_utils.getTargets({}, client);
		},
		/Target peer is not a valid peer object instance/,
		'Should not be able to get targets when targets is not a peer object'
	);

	t.throws(
		() => {
			var client = new Client();
			client._network_config = new NetworkConfig({}, client);
			var targets = client_utils.getTargets('somepeer', client);
		},
		/Target peer name was not found/,
		'Should not be able to get targets when targets is not a peer object'
	);

	t.doesNotThrow(
		() => {
			var client = new Client();
			client._network_config = new NetworkConfig({}, client);
			var targets = client_utils.getTargets([], client);
			t.equals(null, targets, 'targets should be null when list is empty');
		},
		null,
		'Should get a null when the target list is empty'
	);

	t.doesNotThrow(
		() => {
			var client = new Client();
			client._network_config = new NetworkConfig(network_config, client);
			var organizations = client._network_config.getOrganizations();
			if(Array.isArray(organizations)) t.pass('organizations is an array');
			else t.fail('organizations is not an array');
			if(organizations[0] instanceof Organization) t.pass('organizations has a organization ');
			else t.fail('organizations does not have a organization');

		},
		null,
		'Should be able to get organizations'
	);

	t.doesNotThrow(
		() => {
			var client = new Client();
			client._network_config = new NetworkConfig(network_config, client);
			var channel = client.getChannel('mychannel');
			var targets = channel._getTargetsFromConfig(); //all roles
			if(Array.isArray(targets)) t.pass('targets is an array');
			else t.fail('targets is not an array');
			if(targets[0] instanceof Peer) t.pass('targets has a peer ');
			else t.fail('targets does not have a peer');
			t.equals(2,targets.length,'Should have two targets in the list');

		},
		null,
		'Should be able to get targets'
	);

	t.throws(
		() => {
			var client = new Client();
			var channel = client.newChannel('test');
			var targets = channel._getTargetsFromConfig('bad');
		},
		/Target role is unknown/,
		'Should get an error when the role is bad'
	);

	network_config.channels = {
		'mychannel' : {
			peers : {
				peer1: {endorsingPeer:false, chaincodeQuery:false, ledgerQuery:false},
				peer2 : {endorsingPeer:false, chaincodeQuery:false, ledgerQuery:false},
				peer3 : {ledgerQuery:true},
				peer4 : {ledgerQuery:false}
			},
			orderers : ['orderer0']
		}
	};

	t.doesNotThrow(
		() => {
			var client = new Client();
			var config = new NetworkConfig(network_config, client);
			client._network_config = config;
			var channel = client.getChannel('mychannel');
			var targets = channel._getTargetsFromConfig('chaincodeQuery');
			t.equals(1,targets.length,'Should have one target in the list');

			checkTarget(channel._getTargetForQuery(), '7053', 'finding a default ledger query', t);
			checkTarget(channel._getTargets(null, 'ledgerQuery'), '7053', 'finding a default ledger query', t);
			checkTarget(channel._getTargetForQuery('peer1'), '7051', 'finding a string target for ledger query', t);
			checkTarget(channel._getTargets('peer1'), '7051', 'finding a string target', t);
			checkTarget(channel._getTargetForQuery(['peer1']), 'array', 'should get an error back when passing an array', t);
			checkTarget(channel._getTargetForQuery(['peer1']), 'array', 'should get an error back when passing an array', t);
			checkTarget(channel._getTargets('bad'), 'found', 'should get an error back when passing a bad name', t);
			checkTarget(channel._getTargetForQuery(peer1), '9999', 'should get back the same target if a good peer', t);
			checkTarget(channel._getTargets(peer1), '9999', 'should get back the same target if a good peer', t);
			client._network_config = null;
			checkTarget(channel._getTargetForQuery(), '7051', 'finding a default ledger query without networkconfig', t);
			checkTarget(channel._getTargets(), '7051', 'finding a default targets without networkconfig', t);
		},
		null,
		'Should be able to run channel target methods'
	);


	t.throws(
		() => {
			var client = new Client();
			client._network_config = new NetworkConfig({}, client);
			var targets = client_utils.getOrderer('someorderer', 'somechannel', client);
		},
		/Orderer name was not found in the network configuration/,
		'Should get an error when the request orderer name is not found'
	);

	t.throws(
		() => {
			var client = new Client();
			client._network_config = new NetworkConfig({}, client);
			var targets = client_utils.getOrderer({}, 'somechannel', client);
		},
		/request parameter is not valid/,
		'Should get an error when the request orderer is not a valid object'
	);

	t.throws(
		() => {
			var client = new Client();
			client._network_config = new NetworkConfig({}, client);
			var targets = client_utils.getOrderer(null, 'somechannel', client);
		},
		/Channel name was not found in the network configuration/,
		'Should get an error when the request orderer is not defined and the channel was not found'
	);

	t.throws(
		() => {
			var client = new Client();
			client._network_config = new NetworkConfig({ channels : {somechannel : {}}}, client);
			var targets = client_utils.getOrderer(null, 'somechannel', client);
		},
		/"orderer" request parameter is missing and there is no orderer defined on this channel in the network configuration/,
		'Should get an error when the request orderer is not defined and the channel does not have any orderers'
	);

	t.throws(
		() => {
			var client = new Client();
			var targets = client_utils.getOrderer(null, 'somechannel', client);
		},
		/Missing "orderer" request parameter/,
		'Should get an error when the request orderer is not defined and there is no network configuration'
	);

	t.doesNotThrow(
		() => {
			var client = new Client();
			client._network_config = new NetworkConfig(network_config, client);

			var orderer = client_utils.getOrderer('orderer0', null, client);
			if(orderer instanceof Orderer) t.pass('orderer has a orderer ');
			else t.fail('orderer does not have a orderer');

			var orderer1 = new Orderer('grpcs://localhost:9999', {pem : '-----BEGIN CERTIFICATE-----MIIB8TCC5l-----END CERTIFICATE-----'});

			orderer = client_utils.getOrderer(orderer1, null, client);
			if(orderer instanceof Orderer) t.pass('orderer has a orderer ');
			else t.fail('orderer does not have a orderer');

			orderer = client_utils.getOrderer(null, 'mychannel', client);
			if(orderer instanceof Orderer) t.pass('orderer has a orderer ');
			else t.fail('orderer does not have a orderer');
		},
		null,
		'Should be able to get orderer'
	);

	t.end();
});

function checkTarget(target, check, msg, t) {
	if(Array.isArray(target)) {
		target = target[0];
	}
	if(target.toString().indexOf(check) > -1) {
		t.pass('Successfully got the correct target result for '+ msg);
	} else {
		t.equals(check, target.toString(), 'Failed to get correct target result for '+ msg);
	}
}
