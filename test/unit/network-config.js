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
var logger = utils.getLogger('unit.client');

var tape = require('tape');
var _test = require('tape-promise');
var test = _test(tape);
var path = require('path');
var util = require('util');

var Client = require('fabric-client');
var utils = require('fabric-client/lib/utils.js');
var User = require('fabric-client/lib/User.js');
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
			logger.info(' the network looks like ::%j',c._network);
		},
		null,
		'Should be able to instantiate a new instance of "Client" with a valid path to the configuration'
	);

	t.doesNotThrow(
		() => {
			var c = Client.loadFromConfig('test/fixtures/network.json');
			logger.info(' the network looks like ::%j',c._network);
			var channel = c.newChannel('mychannel');
		},
		null,
		'Should be able to instantiate a new instance of "Channel" without the definition in the network configuration'
	);

	t.throws(
		() => {
			var c = Client.loadFromConfig('test/fixtures/network.json');
			logger.info(' the network looks like ::%j',c._network);
			var channel = c.getChannel('dummy');
		},
		/Channel not found for name/,
		'Should not be able to instantiate a new instance of "Channel" without the definition in the network configuration'
	);

	t.doesNotThrow(
		() => {
			var c = Client.loadFromConfig('test/fixtures/network.yaml');
			logger.info(' the network looks like ::%j',c._network);
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
			var channel = client.newChannel('mychannel');
			t.equals('mychannel',channel.getName(),'Channel should be named');
			var orderer = channel.getOrderers()[0];
			logger.info(orderer.toString());
		},
		null,
		'Should be able to instantiate a new instance of "Channel" with only orderer definition in the network configuration'
	);

	network_config.channels = {
		'mychannel' : {
			peers : { peer1: 'org1'},
			orderers : ['orderer0']
		}
	};
	network_config.orgainizations = { 'org1' : {} };

	t.doesNotThrow(
		() => {
			var client = new Client();
			client._network_config = new NetworkConfig(network_config, client);
			var channel = client.newChannel('mychannel');
			t.equals('mychannel',channel.getName(),'Channel should be named');
			t.equals(channel.getPeers().length, 0, 'Peers should be empty');
			var orderer = channel.getOrderers()[0];
			logger.info(orderer.toString());
		},
		null,
		'Should be able to instantiate a new instance of "Channel" with org that does not exist in the network configuration'
	);

	network_config.organizations = {
		'org1' : {
			peers : ['peer1']
		}
	};

	t.doesNotThrow(
		() => {
			var client = new Client();
			client._network_config = new NetworkConfig(network_config, client);
			var channel = client.newChannel('mychannel');
			t.equals('mychannel',channel.getName(),'Channel should be named');
			t.equals(channel.getPeers().length, 0, 'Peers should be empty');
			var orderer = channel.getOrderers()[0];
			logger.info(orderer.toString());
		},
		null,
		'Should be able to instantiate a new instance of "Channel" with a peer in the org that does not exist in the network configuration'
	);

	network_config.peers = {
		'peer1' : {
			url : 'grpcs://localhost:7051',
			'tlsCACerts' : {
				path : 'test/fixtures/channel/crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/tlscacerts/example.com-cert.pem'
			}
		}
	};

	t.doesNotThrow(
		() => {
			var client = new Client();
			client._network_config = new NetworkConfig(network_config, client);
			var channel = client.newChannel('mychannel');
			t.equals('mychannel',channel.getName(),'Channel should be named');
			t.equals(channel.getPeers().length, 1, 'Peers should be one');
			logger.info(channel.getOrderers()[0].toString());
			logger.info(channel.getPeers()[0].toString());
		},
		null,
		'Should be able to instantiate a new instance of "Channel" with orderer, org and peer defined in the network configuration'
	);

	t.end();
});
