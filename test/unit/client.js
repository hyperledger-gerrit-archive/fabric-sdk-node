/**
 * Copyright 2016-2017 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';
var utils = require('fabric-client/lib/utils.js');
var logger = utils.getLogger('unit.client');

var tape = require('tape');
var _test = require('tape-promise').default;
var test = _test(tape);
var path = require('path');
var util = require('util');
var sinon = require('sinon');

var Client = require('fabric-client');
var User = require('fabric-client/lib/User.js');
var Peer = require('fabric-client/lib/Peer.js');
var NetworkConfig = require('fabric-client/lib/impl/NetworkConfig_1_0.js');
var testutil = require('./util.js');

var caImport;

var grpc = require('grpc');
var _configtxProto = grpc.load(__dirname + '/../../fabric-client/lib/protos/common/configtx.proto').common;
var rewire = require('rewire');
var ClientRewired = rewire('fabric-client/lib/Client.js');

var aPem = '-----BEGIN CERTIFICATE-----' +
	'MIIBwTCCAUegAwIBAgIBATAKBggqhkjOPQQDAzApMQswCQYDVQQGEwJVUzEMMAoG' +
	'A1UEChMDSUJNMQwwCgYDVQQDEwNPQkMwHhcNMTYwMTIxMjI0OTUxWhcNMTYwNDIw' +
	'MjI0OTUxWjApMQswCQYDVQQGEwJVUzEMMAoGA1UEChMDSUJNMQwwCgYDVQQDEwNP' +
	'QkMwdjAQBgcqhkjOPQIBBgUrgQQAIgNiAAR6YAoPOwMzIVi+P83V79I6BeIyJeaM' +
	'meqWbmwQsTRlKD6g0L0YvczQO2vp+DbxRN11okGq3O/ctcPzvPXvm7Mcbb3whgXW' +
	'RjbsX6wn25tF2/hU6fQsyQLPiJuNj/yxknSjQzBBMA4GA1UdDwEB/wQEAwIChDAP' +
	'BgNVHRMBAf8EBTADAQH/MA0GA1UdDgQGBAQBAgMEMA8GA1UdIwQIMAaABAECAwQw' +
	'CgYIKoZIzj0EAwMDaAAwZQIxAITGmq+x5N7Q1jrLt3QFRtTKsuNIosnlV4LR54l3' +
	'yyDo17Ts0YLyC0pZQFd+GURSOQIwP/XAwoMcbJJtOVeW/UL2EOqmKA2ygmWX5kte' +
	'9Lngf550S6gPEWuDQOcY95B+x3eH' +
	'-----END CERTIFICATE-----';

test('\n\n ** index.js **\n\n', function (t) {
	testutil.resetDefaults();

	t.equals(typeof Client, 'function');

	t.doesNotThrow(
		function() {
			var c = new Client();
		},
		null,
		'Should be able to instantiate a new instance of "Client" require');

	t.doesNotThrow(
		function() {
			var c = new Client();
			var channel = c.newChannel('test');
		},
		null,
		'Should be able to call "newChannel" on the new instance of "Client"');

	t.end();
});

test('\n\n ** eventhub **\n\n', function (t) {
	t.doesNotThrow(
		function() {
			var c = new Client();
			c._userContext = new User('name');
			var event_hub = c.newEventHub();
		},
		null,
		'Should be able to call "newEventHub" on the new instance of "hfc"');

	t.end();
});

var client = new Client();
var channelKeyValStorePath = path.join(testutil.getTempDir(), 'channelKeyValStorePath');
var testKey = 'keyValFileStoreName';
var testValue = 'secretKeyValue';

test('\n\n ** config **\n\n', function (t) {
	t.doesNotThrow(
		function() {
			var c = new Client();
			t.equals(c.getConfigSetting('something','ABC'), 'ABC', 'Check getting default config setting value');
			c.setConfigSetting('something','DEF');
			t.equals(c.getConfigSetting('something','ABC'), 'DEF', 'Check getting a set config setting value');
			var event_hub = c.newEventHub();
		},
		null,
		'Should be able to call "newEventHub" on the new instance of "hfc"');

	t.end();
});

test('\n\n ** Client.js Tests: CryptoSuite() methods **\n\n', function (t) {
	t.equals(client.getCryptoSuite(), null, 'Should return null when CryptoSuite has not been set');

	var crypto = Client.newCryptoSuite();
	client.setCryptoSuite(crypto);
	if (crypto) {
		t.pass('Successfully called newCryptoSuite()');
	}
	else {
		t.fail('newCryptoSuite() did not return an object');
	}

	crypto = client.getCryptoSuite();
	if (crypto) {
		t.pass('Successfully called getCryptoSuite()');
	}
	else {
		t.fail('getCryptoSuite() did not return an object');
	}

	client.setCryptoSuite(null);
	t.equals(client.getCryptoSuite(), null, 'Should return null when CryptoSuite has been set to null');

	t.end();

});

test('\n\n ** Client.js Tests: getUserContext() method **\n\n', function (t) {
	t.doesNotThrow(
		() => {
			client.getUserContext();
		},
		null,
		'Should not throw an error when argument list is empty'
	);

	t.equals(client.getUserContext('invalidUser'), null, 'Should return null when requested for an invalid user');

	t.throws(
		() => {
			client.getUserContext(true);
		},
		/Illegal arguments: "checkPersistence" is truthy but "name" is undefined/,
		'Check that error condition is properly handled when only a truthy value is passed in'
	);

	t.throws(
		() => {
			client.getUserContext(null, true);
		},
		/Illegal arguments: "checkPersistence" is truthy but "name" is not a valid string value/,
		'Check that error condition is properly handled when "checkPersistence" is true but "name" is not valid string'
	);

	t.throws(
		() => {
			client.getUserContext('', true);
		},
		/Illegal arguments: "checkPersistence" is truthy but "name" is not a valid string value/,
		'Check that error condition is properly handled when "checkPersistence" is true but "name" is not valid string'
	);

	var promise = client.getUserContext('invalidUser', true);
	t.notEqual(promise, null, 'Should not return null but a promise when "checkPersistence" is true');
	promise.then((value) => {
		t.equals(value, null, 'Promise should resolve to a null when using an invalid user name');
		t.end();
	}, (err) => {
		t.fail(util.format('Failed to resolve the requested user name: %s', err));
		t.end();
	});
});

test('\n\n ** Client.js Tests: user persistence and loading **\n\n', function (t) {

	var response = client.getUserContext();
	if (response === null)
		t.pass('Client tests: getUserContext successful null user name.');
	else
		t.fail('Client tests: getUserContext failed null name check');

	client.saveUserToStateStore()
	.then(function(response){
		t.fail('Client tests: got response, but should throw "Cannot save user to state store when userContext is null."');
		t.end();
	}, function(error){
		if (error.message === 'Cannot save user to state store when userContext is null.')
			t.pass('Client tests: Should throw "Cannot save user to state store when userContext is null."');
		else t.fail('Client tests: Unexpected error message thrown, should throw "Cannot save user to state store when userContext is null." ' + error.stack ? error.stack : error);

		return client.setUserContext(null);
	}).then(function(response){
		t.fail('Client tests: got response, but should throw "Cannot save null userContext."');
		t.end();
	}, function(error){
		if (error.message === 'Cannot save null userContext.')
			t.pass('Client tests: Should throw "Cannot save null userContext."');
		else t.fail('Client tests: Unexpected error message thrown, should throw "Cannot save null userContext." ' + error.stack ? error.stack : error);

		response = client.getUserContext('someUser');
		if (response == null)
			t.pass('Client tests: getUserContext with no context in memory or persisted returns null');
		else
			t.fail('Client tests: getUserContext with no context in memory or persisted did not return null');

		return client.setUserContext(new User('someUser'), true);
	}).then(function(response){
		if (response && response.getName() === 'someUser')
			t.pass('Client tests: successfully setUserContext with skipPersistence.');
		else
			t.fail('Client tests: failed name check after setUserContext with skipPersistence.');

		response = client.getUserContext('someUser');
		if (response && response.getName() === 'someUser')
			t.pass('Client tests: getUserContext not persisted/skipPersistence was successful.');
		else
			t.fail('Client tests: getUserContext not persisted/skipPersistence was not successful.');

		return client.setUserContext(new User('someUser'));
	}, function(error){
		t.fail('Client tests: Unexpected error, failed setUserContext with skipPersistence. ' + error.stack ? error.stack : error);
		t.end();
	}).then(function(result){
		t.fail('Client tests: setUserContext without skipPersistence and no stateStore should not return result.');
		t.end();
	}, function(error){
		if (error.message === 'Cannot save user to state store when stateStore is null.')
			t.pass('Client tests: Should throw "Cannot save user to state store when stateStore is null"');
		else
			t.fail('Client tests: Unexpected error message thrown, should throw "Cannot save user to state store when stateStore is null." ' + error.stack ? error.stack : error);

		var channel = client.newChannel('somechannel');
		t.equals(channel.getName(), 'somechannel', 'Checking channel names match');
		t.throws(
			function () {
				client.newChannel('somechannel');
			},
			/^Error: Channel somechannel already exist/,
			'Client tests: checking that channel already exists.');

		t.doesNotThrow(
			function() {
				client.getChannel('somechannel');
			},
			null,
			'Client tests: getChannel()');

		t.throws(
				function () {
					client.getChannel('someOtherChannel');
				},
				/^Error: Channel not found for name someOtherChannel./,
				'Client tests: Should throw Error: Channel not found for name someOtherChannel.');

		t.throws(
			function() {
				client.setStateStore({});
			},
			/The "keyValueStore" parameter must be an object that implements the following methods, which are missing:/,
			'Client tests: checking state store parameter implementing required functions');

		testutil.cleanupDir(channelKeyValStorePath);

		return Client.newDefaultKeyValueStore({ path: channelKeyValStorePath });
	}).then (
		function (kvs) {
			client.setStateStore(kvs);

			var exists = testutil.existsSync(channelKeyValStorePath);
			if (exists)
				t.pass('Client setKeyValueStore test:  Successfully created new directory');
			else
				t.fail('Client setKeyValueStore test:  Failed to create new directory: ' + channelKeyValStorePath);

			var store = client.getStateStore();
			return store.setValue('testKey', 'testValue');
		}).then(
			function (result) {
				t.pass('Client getStateStore test:  Successfully set value, result: ' + result);

				var exists = testutil.existsSync(channelKeyValStorePath, testKey);
				if (exists)
					t.pass('Client getStateStore test:  Verified the file for key ' + testKey + ' does exist');
				else
					t.fail('Client getStateStore test:  Failed to create file for key ' + testKey);

				t.end();
			}
		).catch(
			function (reason) {
				t.fail('Client getStateStore test:  Failed to set value, reason: ' + reason);
				t.end();
			}
		);
});

test('\n\n ** testing devmode set and get calls on client **\n\n', function (t) {
	t.equals(typeof Client, 'function');
	var client = new Client();
	t.doesNotThrow(
		function () {
			client.setDevMode(true);
		},
		null,
		'checking the set of DevMode'
	);
	t.equal(client.isDevMode(), true, 'checking DevMode');
	t.end();
});

test('\n\n ** testing query calls fail without correct parameters on client **\n\n', (t) => {
	t.equals(typeof Client, 'function');
	const client = new Client();

	const p1 = client.queryInstalledChaincodes().then(() => {
		t.fail('Should not have been able to resolve the promise because of missing request parameter');
	}).catch((err) => {
		if (err.message.includes('Peer is required')) {
			t.pass('p1 - Successfully caught missing request error');
		} else {
			t.fail('p1 - Failed to catch the missing request error. Error: ' + err.stack ? err.stack : err);
		}
	});

	const p1a = client.queryInstalledChaincodes('somename').then(() => {
		t.fail('Should not have been able to resolve the promise because of No network configuraton loaded');
	}).catch((err) => {
		if (err.message.includes('not found')) {
			t.pass('Successfully caught No network configuraton loaded error');
		} else {
			t.fail('Failed to catch the No network configuraton loaded error. Error: ' + err.stack ? err.stack : err);
		}
	});

	const p2 = client.queryChannels().then(() => {
		t.fail('Should not have been able to resolve the promise because of missing request parameter');
	}).catch((err) => {
		if (err.message.includes('Peer is required')) {
			t.pass('p2 - Successfully caught missing request error');
		} else {
			t.fail('p2 - Failed to catch the missing request error. Error: ' + err.stack ? err.stack : err);
		}
	});

	const p3 = client.queryChannels('somename').then(() => {
		t.fail('Should not have been able to resolve the promise because of no network loaded');
	}).catch((err) => {
		if (err.message.includes('not found')) {
			t.pass('Successfully caught no network loaded error');
		} else {
			t.fail('Failed to catch the no network loaded error. Error: ' + err.stack ? err.stack : err);
		}
	});

	client._network_config = new NetworkConfig({}, client);
	const p4 = client.queryChannels('somename').then(() => {
		t.fail('Should not have been able to resolve the promise because of wrong request parameter');
	}).catch((err) => {
		if (err.message.includes('not found')) {
			t.pass('Successfully caught wrong request error');
		} else {
			t.fail('Failed to catch the wrong request error. Error: ' + err.stack ? err.stack : err);
		}
	});

	const p4a = client.queryInstalledChaincodes('somename').then(() => {
		t.fail('Should not have been able to resolve the promise because of wrong request parameter');
	}).catch((err) => {
		if (err.message.includes('not found')) {
			t.pass('Successfully caught wrong request error');
		} else {
			t.fail('Failed to catch the wrong request error. Error: ' + err.stack ? err.stack : err);
		}
	});

	const p5 = client.queryChannels({}).then(() => {
		t.fail('Should not have been able to resolve the promise because of wrong object request parameter');
	}).catch((err) => {
		if (err.message.includes('Target peer is not a valid peer object instance')) {
			t.pass('Successfully caught wrong object request error');
		} else {
			t.fail('Failed to catch the wrong object request error. Error: ' + err.stack ? err.stack : err);
		}
	});
	Promise.all([p1, p1a, p2, p3, p4, p4a, p5]).then(() => {
		t.end();
	}).catch((err) => {
		t.fail(`Channel query calls, Promise.all: ${err}`);
		t.end();
	});
});

test('\n\n ** testing get and new peer calls on client **\n\n', function (t) {
	t.equals(typeof Client, 'function');
	var client = new Client();

	t.doesNotThrow(
		function() {
			var peer = client.newPeer('grpc://somehost:9090');
		},
		null,
		'Should be able to call "newPeer" with a valid URL');

	t.end();
});

test('\n\n ** testing get and new orderer calls on client **\n\n', function (t) {
	t.equals(typeof Client, 'function');
	var client = new Client();

	t.doesNotThrow(
		function() {
			var orderer = client.newOrderer('grpc://somehost:9090');
		},
		null,
		'Should be able to call "newOrderer" with a valid URL');

	t.end();
});

test('\n\n ** testing get transaction ID call on client **\n\n', function (t) {
	t.equals(typeof Client, 'function');
	var client = new Client();

	t.throws(function() {
		client.newTransactionID();
	},
	/No identity has been assigned to this client/,
	'Test - No identity has been assigned to this client');

	t.end();
});

/*
 * This test assumes that there is a ./config directory from the running location
 * and that there is file called 'config.json'.
 */
test('\n\n ** Config **\n\n', function (t) {
	// setup the environment
	process.argv.push('--test-4=argv');
	process.argv.push('--test-5=argv');
	process.env.TEST_3 = 'env';
	process.env.test_6 = 'mapped';
	// internal call. clearing the cached config.
	if (global && global.hfc) global.hfc.config = undefined;
	require('nconf').reset();

	t.equals(Client.getConfigSetting('request-timeout', 'notfound'), 45000, 'checking that able to get "request-timeout" value from an additional configuration file');
	//try adding another config file
	Client.addConfigFile(path.join(__dirname, '../fixtures/local.json'));
	t.equals(Client.getConfigSetting('test-2', 'notfound'), 'local', 'checking that able to test-2 value from an additional configuration file');
	t.equals(Client.getConfigSetting('test-3', 'notfound'), 'env', 'checking that test-3 environment values are used');
	t.equals(Client.getConfigSetting('test-4', 'notfound'), 'argv', 'checking that test-4 argument values are used');
	Client.setConfigSetting('test-5', 'program');
	t.equals(Client.getConfigSetting('test-5', 'notfound'), 'program', 'checking that test-5 program values are used');
	t.equals(Client.getConfigSetting('test-6', 'notfound'), 'mapped', 'checking that test-6 is enviroment mapped value');
	t.end();
});

test('\n\n ** client installChaincode() tests **\n\n', function (t) {
	var peer = client.newPeer('grpc://localhost:7051');

	var p1 = client.installChaincode({
		targets: [peer],
		chaincodeId: 'blah',
		chaincodeVersion: 'blah',
	}).then(function () {
		t.fail('Should not have been able to resolve the promise because of missing "chaincodePath" parameter');
	}).catch(function (err) {
		if (err.message.indexOf('Missing chaincodePath parameter') >= 0) {
			t.pass('P1 - Successfully caught missing chaincodePath error');
		} else {
			t.fail('Failed to catch the missing chaincodePath error. Error: ');
			console.log(err.stack ? err.stack : err);
		}
	});

	var p2 = client.installChaincode({
		targets: [peer],
		chaincodeId: 'blahp1a',
		chaincodePath: 'blah',
	}).then(function () {
		t.fail('Should not have been able to resolve the promise because of missing "chaincodeVersion" parameter');
	}).catch(function (err) {
		if (err.message.indexOf('Missing "chaincodeVersion" parameter in the proposal request') >= 0) {
			t.pass('P2 - Successfully caught missing chaincodeVersion error');
		} else {
			t.fail('Failed to catch the missing chaincodeVersion error. Error: ');
			console.log(err.stack ? err.stack : err);
		}
	});

	var p3 = client.installChaincode({
		targets: [peer],
		chaincodePath: 'blahp3',
		chaincodeVersion: 'blah'
	}).then(function () {
		t.fail('Should not have been able to resolve the promise because of missing "chaincodeId" parameter');
	}).catch(function (err) {
		if (err.message.indexOf('Missing "chaincodeId" parameter in the proposal request') >= 0) {
			t.pass('P3 - Successfully caught missing chaincodeId error');
		} else {
			t.fail('Failed to catch the missing chaincodeId error. Error: ' + err.stack ? err.stack : err);
		}
	});

	var p4 = client.installChaincode({
		chaincodePath: 'blahp4',
		chaincodeId: 'blah',
		chaincodeVersion: 'blah'
	}).then(function () {
		t.fail('Should not have been able to resolve the promise because of missing "peer" objects on request');
	}).catch(function (err) {
		var msg = 'Missing peer objects in install chaincode request';
		if (err.message.indexOf(msg) >= 0) {
			t.pass('P4 - Successfully caught error: '+msg);
		} else {
			t.fail('Failed to catch error: '+msg+'. Error: ' + err.stack ? err.stack : err);
		}
	});

	var p5 = client.installChaincode().then(function () {
		t.fail('Should not have been able to resolve the promise because of missing request parameter');
	}).catch(function (err) {
		if (err.message.indexOf('Missing input request object on install chaincode request') >= 0) {
			t.pass('P5 - Successfully caught missing request error');
		} else {
			t.fail('Failed to catch the missing request error. Error: ' + err.stack ? err.stack : err);
		}
	});

	var p6 = client.installChaincode({
		targets : ['somename'],
		chaincodePath: 'blahp4',
		chaincodeId: 'blah',
		chaincodeVersion: 'blah'}).then(function () {
			t.fail('p6 - Should not have been able to resolve the promise because of bad request parameter');
		}).catch(function (err) {
			if (err.message.indexOf('not found') >= 0) {
				t.pass('p6 - Successfully caught bad request error');
			} else {
				t.fail('p6 - Failed to catch the bad request error. Error: ' + err.stack ? err.stack : err);
			}
		});

	var p7 = client.installChaincode({
		targets : [{}],
		chaincodePath: 'blahp4',
		chaincodeId: 'blah',
		chaincodeVersion: 'blah'}).then(function () {
			t.fail('p7 - Should not have been able to resolve the promise because of bad request parameter');
		}).catch(function (err) {
			if (err.message.indexOf('Target peer is not a valid peer object') >= 0) {
				t.pass('p7 - Successfully caught bad request error');
			} else {
				t.fail('p7 - Failed to catch the bad request error. Error: ' + err.stack ? err.stack : err);
			}
		});

	Promise.all([p1, p2, p3, p4, p5, p6]).then(() => {
		t.end();
	}).catch((err) => {
		t.fail(`Channel installChaincode() tests, Promise.all: ${err}`);
		t.end();
	});
});

test('\n\n ** Client createChannel(), updateChannel() tests **\n\n', async (t) => {
	const client = new Client();
	const orderer = client.newOrderer('grpc://localhost:7050');

	t.throws(() => {
		client.signChannelConfig();
	}, /^Error: Channel configuration update parameter is required./,
	'Client tests: Channel configuration update parameter is required.');

	for (const action of ['createChannel', 'updateChannel']) {
		try {
			await client[action]();
			t.fail('Should not have been able to resolve the promise because of missing request parameter');
		} catch (err) {
			if (err.message.includes('Missing all')) {
				t.pass('Successfully caught missing request error');
			} else {
				t.fail(`Failed to catch the missing request error. Error: ${err}`);
			}
		}

		try {
			await client[action]({envelope: {}, name: 'name', txId: '77'});
			t.fail('Should not have been able to resolve the promise because of orderer missing');
		} catch (err) {
			if (err.message.includes('Missing "orderer" request parameter')) {
				t.pass('Successfully caught missing orderer error');
			} else {
				t.fail(`Failed to catch the missing orderer error. : ${err}`);
			}
		}
		try {
			await client[action]({config: 'a', signatures: [], txId: 'a', name: 'a', orderer: {}});
			t.fail('Should not have been able to resolve the promise');
		} catch (err) {
			const msg = '"orderer" request parameter is not valid';
			if (err.message.includes(msg)) {
				t.pass('Successfully caught invalid "orderer" parameter');
			} else {
				t.fail(`Failed to catch invalid "orderer" parameter: ${err}`);
			}
		}


		try {
			await client[action]({orderer: orderer, name: 'name', txId: '777', signatures: []});
			t.fail('Should not have been able to resolve the promise because of envelope request parameter');
		} catch (err) {
			if (err.message.includes('Missing config')) {
				t.pass('Successfully caught missing config request error');
			} else {
				t.fail(`Failed to catch the missing config request error. Error: ${err}`);
			}
		}

		try {
			await client[action]({envelope: {}, orderer, config: 'a', signatures: [], txId: 'a'});
			t.fail('Should not have been able to resolve the promise because of name request parameter');
		} catch (err) {
			if (err.message.includes('Missing name request parameter')) {
				t.pass('Successfully caught missing name request error');
			} else {
				t.fail(`Failed to catch the missing name request error. Error: ${err}`);
			}
		}

		try {
			await client[action]({config: {}, orderer: orderer, name: 'name', txId: 'fff'});
			t.fail('Should not have been able to resolve the promise because of missing signatures request parameter');
		} catch (err) {
			if (err.message.includes('Missing signatures request parameter for the new channel')) {
				t.pass('Successfully caught missing signatures request error');
			} else {
				t.fail(`Failed to catch the missing signatures request error. Error: ${err}`);
			}
		}

		try {
			await client[action]({
				config: {},
				orderer: orderer,
				name: 'name',
				signatures: {},
				txId: 'fff'
			});
			t.fail('Should not have been able to resolve the promise because of missing signatures request parameter');
		} catch (err) {
			if (err.message.includes('Signatures request parameter must be an array of signatures')) {
				t.pass('Successfully caught Signatures must be an array error');
			} else {
				t.fail(`Failed to catch Signatures must be an array. Error: ${err}`);
			}
		}

		try {
			await client[action]({config: {}, orderer: orderer, name: 'name', signatures: []});
			t.fail('Should not have been able to resolve the promise because of missing txId request parameter');
		} catch (err) {
			if (err.message.includes('Missing txId request parameter')) {
				t.pass('Successfully caught request parameter must have txId error');
			} else {
				t.fail(`Failed to catch request parameter must have txId error. Error: ${err}`);
			}
		}
	}


	t.end();
});

test('\n\n ** createUser error path - missing required opt parameter **\n\n', function (t) {
	Client.addConfigFile(path.join(__dirname, '../fixtures/caimport.json'));
	caImport = utils.getConfigSetting('ca-import', 'notfound');
	logger.debug('caImport = %s', JSON.stringify(caImport));

	var msg = 'Client.createUser missing required \'opts\' parameter.';

	var client = new Client();
	return client.createUser()
	.then((user) => {
		t.fail('Should not have gotten user.');
		t.end();
	}).catch((err) => {
		if (err.message.indexOf(msg) > -1) {
			t.pass('Should throw '+msg);
			t.end;
		} else {
			t.fail('Expected error message: '+msg+'\n but got '+err.message);
			t.end;
		}
	});
});

test('\n\n ** createUser error path - missing required username **\n\n', function (t) {
	var msg = 'Client.createUser parameter \'opts username\' is required.';

	var userOrg = 'org1';
	var keyStoreOpts = {path: path.join(testutil.getTempDir(), caImport.orgs[userOrg].storePath)};

	var client = new Client();

	return utils.newKeyValueStore(keyStoreOpts)
	.then((store) => {
		logger.info('store: %s',store);
		client.setStateStore(store);
		return '';
	}).then(() => {
		return client.createUser({username: ''});
	}, (err) => {
		logger.error(err.stack ? err.stack : err);
		throw new Error('Failed createUser.');
	}).then((user) => {
		t.fail('Should not have gotten user.');
		t.end();
	}).catch((err) => {
		if (err.message.indexOf(msg) > -1) {
			t.pass('Should throw '+msg);
			t.end;
		} else {
			t.fail('Expected error message: '+msg+'\n but got '+err.message);
			t.end;
		}
	});
});

test('\n\n ** createUser error path - missing required mspid **\n\n', function (t) {
	var msg = 'Client.createUser parameter \'opts mspid\' is required.';

	var userOrg = 'org1';
	var keyStoreOpts = {path: path.join(testutil.getTempDir(), caImport.orgs[userOrg].storePath)};

	var client = new Client();

	return utils.newKeyValueStore(keyStoreOpts)
	.then((store) => {
		logger.info('store: %s',store);
		client.setStateStore(store);
		return '';
	}).then(() => {
		return client.createUser({username: 'anyone'});
	}, (err) => {
		logger.error(err.stack ? err.stack : err);
		throw new Error('Failed createUser.');
	}).then((user) => {
		t.fail('Should not have gotten user.');
		t.end();
	}).catch((err) => {
		if (err.message.indexOf(msg) > -1) {
			t.pass('Should throw '+msg);
			t.end;
		} else {
			t.fail('Expected error message: '+msg+'\n but got '+err.message);
			t.end;
		}
	});
});

test('\n\n ** createUser error path - missing required cryptoContent **\n\n', function (t) {
	var msg = 'Client.createUser parameter \'opts cryptoContent\' is required.';

	var userOrg = 'org1';
	var keyStoreOpts = {path: path.join(testutil.getTempDir(), caImport.orgs[userOrg].storePath)};

	var client = new Client();

	return utils.newKeyValueStore(keyStoreOpts)
	.then((store) => {
		logger.info('store: %s',store);
		client.setStateStore(store);
		return '';
	}).then(() => {
		return client.createUser({username: 'anyone', mspid: 'one'});
	}, (err) => {
		logger.error(err.stack ? err.stack : err);
		throw new Error('Failed createUser.');
	}).then((user) => {
		t.fail('Should not have gotten user.');
		t.end();
	}).catch((err) => {
		if (err.message.indexOf(msg) > -1) {
			t.pass('Should throw '+msg);
			t.end;
		} else {
			t.fail('Expected error message: '+msg+'\n but got '+err.message);
			t.end;
		}
	});
});

test('\n\n ** createUser error path - missing required cryptoContent signedCert or signedCertPEM **\n\n', function (t) {
	var msg = 'Client.createUser either \'opts cryptoContent signedCert or signedCertPEM\' is required.';

	var userOrg = 'org1';
	var keyStoreOpts = {path: path.join(testutil.getTempDir(), caImport.orgs[userOrg].storePath)};

	var client = new Client();

	return utils.newKeyValueStore(keyStoreOpts)
	.then((store) => {
		logger.info('store: %s',store);
		client.setStateStore(store);
		return '';
	}).then(() => {
		return client.createUser({cryptoContent: {privateKeyPEM: 'abcd'}, username: 'anyone', mspid: 'one'});
	}, (err) => {
		logger.error(err.stack ? err.stack : err);
		throw new Error('Failed createUser.');
	}).then((user) => {
		t.fail('Should not have gotten user.');
		t.end();
	}).catch((err) => {
		if (err.message.indexOf(msg) > -1) {
			t.pass('Should throw '+msg);
			t.end;
		} else {
			t.fail('Expected error message: '+msg+'\n but got '+err.message);
			t.end;
		}
	});
});

test('\n\n ** createUser error path - missing required cryptoContent privateKey or privateKeyPEM **\n\n', function (t) {
	var msg = 'Client.createUser one of \'opts cryptoContent privateKey, privateKeyPEM or privateKeyObj\' is required.';

	var userOrg = 'org1';
	var keyStoreOpts = {path: path.join(testutil.getTempDir(), caImport.orgs[userOrg].storePath)};

	var client = new Client();

	return utils.newKeyValueStore(keyStoreOpts)
	.then((store) => {
		logger.info('store: %s',store);
		client.setStateStore(store);
		return '';
	}).then(() => {
		return client.createUser({cryptoContent: {signedCertPEM: 'abcd'}, username: 'anyone', mspid: 'one'});
	}, (err) => {
		logger.error(err.stack ? err.stack : err);
		throw new Error('Failed createUser.');
	}).then((user) => {
		t.fail('Should not have gotten user.');
		t.end();
	}).catch((err) => {
		if (err.message.indexOf(msg) > -1) {
			t.pass('Should throw '+msg);
			t.end;
		} else {
			t.fail('Expected error message: '+msg+'\n but got '+err.message);
			t.end;
		}
	});
});

test('\n\n ** createUser error path - no keyValueStore **\n\n', async (t) => {
	const msg = 'Cannot save user to state store when stateStore is null.';
	const userOrg = 'org2';
	utils.setConfigSetting('crypto-keysize', 256);

	const client = new Client();

	try {
		await client.createUser(
			{
				username: caImport.orgs[userOrg].username,
				mspid: caImport.orgs[userOrg].mspid,
				cryptoContent: caImport.orgs[userOrg].cryptoContent
			});
		t.fail('createUser, did not expect successful create');
		t.end();
	} catch (err) {
		if (err.message.includes(msg)) {
			t.pass('createUser, error expected: ' + msg);
			t.end();
		} else {
			t.fail('createUser, unexpected error: ' + err.message);
			t.comment(err.stack ? err.stack : err);
			t.end();
		}
	}
});

test('\n\n ** createUser success path - no cryptoKeyStore **\n\n', function (t) {
	var userOrg = 'org2';
	utils.setConfigSetting('crypto-keysize', 256);

	var keyStoreOpts = {path: path.join(testutil.getTempDir(), caImport.orgs[userOrg].storePath)};

	var client = new Client();

	return utils.newKeyValueStore(keyStoreOpts)
	.then((store) => {
		logger.info('store: %s',store);
		client.setStateStore(store);
		return '';
	}).then(() => {
		return client.createUser(
			{username: caImport.orgs[userOrg].username,
				mspid: caImport.orgs[userOrg].mspid,
				cryptoContent: caImport.orgs[userOrg].cryptoContent
			});
	}).then((user) => {
		if (user) {
			t.pass('createUser, got user');
			t.end();
		} else {
			t.fail('createUser, returned null');
			t.end();
		}
	}).catch((err) => {
		t.fail('createUser, error, did not get user');
		t.comment(err.stack ? err.stack : err);
		t.end();
	});
});


test('\n\n ** test internal method to rebuild ConfigSignatures **\n\n', function (t) {
	var some_proto_signatures = [];
	var proto_config_signature = new _configtxProto.ConfigSignature();
	proto_config_signature.setSignatureHeader(Buffer.from('signature_header_bytes'));
	proto_config_signature.setSignature(Buffer.from('signature_bytes'));
	some_proto_signatures.push(proto_config_signature);
	var string_config_signature = proto_config_signature.toBuffer().toString('hex');
	some_proto_signatures.push(string_config_signature);

	var _stringToSignature = ClientRewired.__get__('_stringToSignature');
	var all_proto_signatures = _stringToSignature(some_proto_signatures);
	for(let i in all_proto_signatures) {
		var start_header = proto_config_signature.getSignatureHeader().toBuffer().toString();
		var start_sig = proto_config_signature.getSignature().toBuffer().toString();
		var decode_header = all_proto_signatures[i].getSignatureHeader().toBuffer().toString();
		var decode_sig = all_proto_signatures[i].getSignature().toBuffer().toString();
		logger.info(' headers  are ==> %s :: %s', start_header, decode_header);
		logger.info(' signatures are ==> %s :: %s', start_sig, decode_sig);

		t.equals(start_header, decode_header, 'check signature headers are the same');
		t.equals(start_sig, decode_sig, 'check signatures are the same');
	}
	t.end();
});

test('\n\n ** Test per-call timeout support [client] **\n', function (t) {
	const sandbox = sinon.sandbox.create();
	let stub = sandbox.stub(Peer.prototype, 'sendProposal');

	// stub out the calls that requires getting MSPs from the orderer, or
	// a valid user context
	let clientUtils = ClientRewired.__get__('clientUtils');
	sandbox.stub(clientUtils, 'buildHeader').returns(Buffer.from('dummyHeader'));
	sandbox.stub(clientUtils, 'buildProposal').returns(Buffer.from('dummyProposal'));
	sandbox.stub(clientUtils, 'signProposal').returns(Buffer.from('dummyProposal'));
	let _getChaincodePackageData = ClientRewired.__set__(
		'_getChaincodePackageData',
		function() {
			return Promise.resolve(Buffer.from('dummyChaincodePackage'));
		});

	let client = new ClientRewired();
	client._userContext = new User('somebody');
	client._userContext.getIdentity = function() {
		return {
			serialize: function() { return Buffer.from(''); }
		};
	};
	client._userContext.getSigningIdentity = function() {
		return {
			serialize: function() { return Buffer.from(''); }
		};
	};

	let p = client.installChaincode({
		targets: [new Peer('grpc://localhost:7051'), new Peer('grpc://localhost:7052')],
		chaincodePath: 'blah',
		chaincodeId: 'blah',
		chaincodeVersion: 'v0'
	}, 12345).then(function () {
		t.equal(stub.calledTwice, true, 'Peer.sendProposal() is called exactly twice');
		t.equal(stub.firstCall.args.length, 2, 'Peer.sendProposal() is called first time with exactly 2 arguments');
		t.equal(stub.firstCall.args[1], 12345, 'Peer.sendProposal() is called first time with a overriding timeout of 12345 (milliseconds)');
		t.equal(stub.secondCall.args.length, 2, 'Peer.sendProposal() is called 2nd time with exactly 2 arguments');
		t.equal(stub.secondCall.args[1], 12345, 'Peer.sendProposal() is called 2nd time with a overriding timeout of 12345 (milliseconds)');
		sandbox.restore();
		t.end();
	}).catch(function (err) {
		t.fail('Failed to catch the missing chaincodeVersion error. Error: ' + err.stack ? err.stack : err);
		sandbox.restore();
		t.end();
	});
});

test('\n\n*** Test error condition on network config ***\n', function(t) {
	let client = new Client();
	t.throws(
		() => {

			client.getCertificateAuthority();
		},
		/No network configuration has been loaded/,
		'Check that No network configuration has been loaded'
	);

	t.end();
});

test('\n\n*** Test normalizeX509 ***\n', function(t) {
	t.throws(
		() => {

			Client.normalizeX509('cause error');
		},
		/Failed to find start line or end line of the certificate./,
		'Check that a bad stream will throw error'
	);

	var TEST_CERT_PEM = '-----BEGIN CERTIFICATE-----' +
	'MIICEDCCAbagAwIBAgIUXoY6X7jIpHAAgL267xHEpVr6NSgwCgYIKoZIzj0EAwIw' +
	'-----END CERTIFICATE-----';

	var normalized = Client.normalizeX509(TEST_CERT_PEM);
	var matches = normalized.match(/\-\-\-\-\-\s*BEGIN ?[^-]+?\-\-\-\-\-\n/);
	t.equals(matches.length, 1, 'Check that the normalized CERT has the standalone start line');
	matches = normalized.match(/\n\-\-\-\-\-\s*END ?[^-]+?\-\-\-\-\-\n/);
	t.equals(matches.length, 1, 'Check that the normalized CERT has the standalone end line');

	t.end();
});

test('\n\n*** Test Add TLS ClientCert ***\n', function (t) {
	var testClient = new Client();
	t.doesNotThrow(
		() => {
			testClient.addTlsClientCertAndKey({});
		},
		/A crypto suite has not been assigned to this client/,
		'Check that error is not thrown when crypto suite is not set'
	);
	testClient.setCryptoSuite(Client.newCryptoSuite());
	t.doesNotThrow(
		() => {
			testClient.addTlsClientCertAndKey({});
		},
		/A user context has not been assigned to this client/,
		'Check that error is not thrown when user context is not set'
	);
	testClient.setUserContext(new User('testUser'), true);
	try {
		t.notOk(testClient._tls_mutual.clientKey, 'Check that client key is not there');
		t.notOk(testClient._tls_mutual.clientCert, 'Check that client certain is not there');
		t.notOk(testClient._tls_mutual.clientCertHash, 'Check that cert hash was not cached');

		t.ok(testClient.getClientCertHash(true), 'Check forcing the hash to be based off the user');
		t.ok(testClient._tls_mutual.clientCertHash, 'Check that cert hash was cached');

		const tls_cert_key = {};
		testClient.addTlsClientCertAndKey(tls_cert_key);
		t.ok(tls_cert_key.clientCert, 'Check that clientCert exists');
		t.ok(tls_cert_key.clientKey, 'Check that clientKey exists');
		t.ok(testClient._tls_mutual.clientKey, 'Check that client key is there');
		t.ok(testClient._tls_mutual.clientCert, 'Check that client cert is there');
	} catch (err) {
		t.fail('addTlsClientCertandKey failed: ' + err);
	}

	t.end();
});

test('\n\n*** Test Set and Add TLS ClientCert ***\n', function(t) {
	let client = new Client();
	t.notOk(client.getClientCertHash(), 'Check getting null hash when no client cert assigned');
	client.setTlsClientCertAndKey(aPem, aPem);
	t.pass('Able to set the client cert and client key');
	const tls_cert_key = {};
	client.addTlsClientCertAndKey(tls_cert_key);
	t.equals(tls_cert_key.clientCert, aPem, 'Checking being able to update an options object with the client cert');
	t.equals(tls_cert_key.clientKey, aPem, 'Checking being able to update an options object with the client key');

	t.equals(client.getClientCertHash().toString('hex'), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'checking the client certificate hash');

	t.end();
});

test('\n\n*** Test channel selection if no channel name provided ***\n', (t) => {
	let config = {
		'name': 'test',
		'version': '1.0.0',
		'channels': {
			'testchannel': {
				'orderers': [
					'orderer.example.com'
				],
				'peers': {
					'peer0.org1.example.com': {}
				}
			},
			'anotherchannel': {
				'orderers': [
					'orderer.example.com'
				],
				'peers': {
					'peer0.org1.example.com': {}
				}
			}
		},
		'organizations': {
			'Org1': {
				'mspid': 'Org1MSP',
				'peers': [
					'peer0.org1.example.com'
				]
			}
		},
		'orderers': {
			'orderer.example.com': {
				'url': 'grpc://localhost:7050'
			}
		},
		'peers': {
			'peer0.org1.example.com': {
				'url': 'grpc://localhost:7051',
				'eventUrl': 'grpc://localhost:7053'
			}
		}
	};

	let client = Client.loadFromConfig(config);
	t.doesNotThrow(() => {
		// TODO: really ? have to set this even if it's not used
		client.setTlsClientCertAndKey(aPem, aPem);
		let channel = client.getChannel();
		t.equals(channel.getName(), 'testchannel', 'correct channel is returned from network config');
	});

	client = new Client();
	client._channels.set('aChannel', 'SomeChannelObject');
	t.doesNotThrow(() => {
		client.setTlsClientCertAndKey(aPem, aPem);
		let channel = client.getChannel();
		t.equals(channel, 'SomeChannelObject', 'correct channel is returned from channel map');
	});


	t.pass('Should get default channel if no channel name provided defined');
	t.end();
});
