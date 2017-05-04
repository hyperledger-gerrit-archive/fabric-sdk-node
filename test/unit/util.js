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

var path = require('path');
var fs = require('fs-extra');
var os = require('os');
var util = require('util');

var jsrsa = require('jsrsasign');
var KEYUTIL = jsrsa.KEYUTIL;

var utils = require('fabric-client/lib/utils.js');
var logger = utils.getLogger('TEST UTIL');

var hfc = require('fabric-client');
var copService = require('fabric-ca-client/lib/FabricCAClientImpl.js');
var User = require('fabric-client/lib/User.js');
var CryptoSuite = require('fabric-client/lib/impl/CryptoSuite_ECDSA_AES.js');
var KeyStore = require('fabric-client/lib/impl/CryptoKeyStore.js');
var ecdsaKey = require('fabric-client/lib/impl/ecdsa/key.js');

module.exports.CHAINCODE_PATH = 'github.com/example_cc';
module.exports.CHAINCODE_UPGRADE_PATH = 'github.com/example_cc1';
module.exports.CHAINCODE_MARBLES_PATH = 'github.com/marbles_cc';
module.exports.END2END = {
	sdk: 'mychannelSDK',
	configtx : 'mychannel',
	envelope : 'mychannelE',
	chaincodeId: 'end2end',
	chaincodeVersion: 'v0'
};

// directory for file based KeyValueStore
module.exports.KVS = '/tmp/hfc-test-kvs';
module.exports.storePathForOrg = function(org) {
	return module.exports.KVS + '_' + org;
};

// temporarily set $GOPATH to the test fixture folder
module.exports.setupChaincodeDeploy = function() {
	process.env.GOPATH = path.join(__dirname, '../fixtures');
};

// specifically set the values to defaults because they may have been overridden when
// running in the overall test bucket ('gulp test')
module.exports.resetDefaults = function() {
	global.hfc.config = undefined;
	require('nconf').reset();
};

module.exports.cleanupDir = function(keyValStorePath) {
	var absPath = path.join(process.cwd(), keyValStorePath);
	var exists = module.exports.existsSync(absPath);
	if (exists) {
		fs.removeSync(absPath);
	}
};

module.exports.getUniqueVersion = function(prefix) {
	if (!prefix) prefix = 'v';
	return prefix + Date.now();
};

// utility function to check if directory or file exists
// uses entire / absolute path from root
module.exports.existsSync = function(absolutePath /*string*/) {
	try  {
		var stat = fs.statSync(absolutePath);
		if (stat.isDirectory() || stat.isFile()) {
			return true;
		} else
			return false;
	}
	catch (e) {
		return false;
	}
};

module.exports.readFile = readFile;

hfc.addConfigFile(path.join(__dirname, '../integration/e2e/config.json'));
var ORGS = hfc.getConfigSetting('test-network');

var	tlsOptions = {
	trustedRoots: [],
	verify: false
};

function getMember(username, password, client, t, userOrg) {
	var caUrl = ORGS[userOrg].ca.url;

	return client.getUserContext(username, true)
	.then((user) => {
		return new Promise((resolve, reject) => {
			if (user && user.isEnrolled()) {
				t.pass('Successfully loaded member from persistence');
				return resolve(user);
			}

			// need to enroll it with CA server
			var cop = new copService(caUrl, tlsOptions, ORGS[userOrg].ca.name);

			var member;
			return cop.enroll({
				enrollmentID: username,
				enrollmentSecret: password
			}).then((enrollment) => {
				t.pass('Successfully enrolled user \'' + username + '\'');

				member = new User(username);
				return member.setEnrollment(enrollment.key, enrollment.certificate, ORGS[userOrg].mspid);
			}).then(() => {
				return client.setUserContext(member);
			}).then(() => {
				return resolve(member);
			}).catch((err) => {
				t.fail('Failed to enroll and persist user. Error: ' + err.stack ? err.stack : err);
				t.end();
			});
		});
	});
}

function getAdmin(client, t, userOrg) {
	var keyPath = path.join(__dirname, util.format('../fixtures/channel/crypto-config/peerOrganizations/%s.example.com/users/Admin@%s.example.com/keystore', userOrg, userOrg));
	var keyPEM = Buffer.from(readAllFiles(keyPath)[0]).toString();
	var certPath = path.join(__dirname, util.format('../fixtures/channel/crypto-config/peerOrganizations/%s.example.com/users/Admin@%s.example.com/signcerts', userOrg, userOrg));
	var certPEM = readAllFiles(certPath)[0];

	return Promise.resolve(client.createUser({
		username: 'peer'+userOrg+'Admin',
		mspid: ORGS[userOrg].mspid,
		cryptoContent: {
			privateKeyPEM: keyPEM.toString(),
			signedCertPEM: certPEM.toString()
		}
	}));
}

function getOrdererAdmin(client, t) {
	var keyPath = path.join(__dirname, '../fixtures/channel/crypto-config/ordererOrganizations/example.com/users/Admin@example.com/keystore');
	var keyPEM = Buffer.from(readAllFiles(keyPath)[0]).toString();
	var certPath = path.join(__dirname, '../fixtures/channel/crypto-config/ordererOrganizations/example.com/users/Admin@example.com/signcerts');
	var certPEM = readAllFiles(certPath)[0];

	return Promise.resolve(client.createUser({
		username: 'ordererAdmin',
		mspid: 'OrdererMSP',
		cryptoContent: {
			privateKeyPEM: keyPEM.toString(),
			signedCertPEM: certPEM.toString()
		}
	}));
}

function readFile(path) {
	return new Promise((resolve, reject) => {
		fs.readFile(path, (err, data) => {
			if (!!err)
				reject(new Error('Failed to read file ' + path + ' due to error: ' + err));
			else
				resolve(data);
		});
	});
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

module.exports.getOrderAdminSubmitter = function(client, test) {
	return getOrdererAdmin(client, test);
};

module.exports.getSubmitter = function(client, test, peerOrgAdmin, org) {
	if (arguments.length < 2) throw new Error('"client" and "test" are both required parameters');

	var peerAdmin, userOrg;
	if (typeof peerOrgAdmin === 'boolean') {
		peerAdmin = peerOrgAdmin;
	} else {
		peerAdmin = false;
	}

	// if the 3rd argument was skipped
	if (typeof peerOrgAdmin === 'string') {
		userOrg = peerOrgAdmin;
	} else {
		if (typeof org === 'string') {
			userOrg = org;
		} else {
			userOrg = 'org1';
		}
	}

	if (peerAdmin) {
		console.log(' >>>> getting the org admin');
		return getAdmin(client, test, userOrg);
	} else {
		return getMember('admin', 'adminpw', client, test, userOrg);
	}
};

module.exports.determineChannelName = function(saveit) {
	var channel_name = 'notfound';
	// test may have been called with the channel=<name> parameter, if so always use it
	for(var i=2;i<process.argv.length;i++) {
		if (process.argv[i].indexOf('channel=') === 0) {
			channel_name = process.argv[i].split('=')[1];
			logger.info('determineChannelName - using the argument value of :: %s', channel_name);
		}
	}
	// channel name will then be based off what the source is
	if (channel_name === 'notfound') {
		var source = module.exports.determineConfigSource();
		switch ( source) {
		case 'sdk':
			channel_name = module.exports.END2END.sdk;
			break;
		case 'configtx':
			channel_name = module.exports.END2END.configtx;
			break;
		case 'envelope':
			channel_name = module.exports.END2END.envelope;
			break;
		default:
			channel_name = module.exports.END2END.sdk;
		}
		logger.info('determineChannelName not found "E2E_CHANNEL_NAME", using :: %s :: %s', channel_name, source);
	}
	else {
		logger.info('determineChannelName found "E2E_CHANNEL_NAME", using :: %s', channel_name);
	}

	return channel_name;
};

module.exports.determineConfigSource = function (next) {
	logger.info('determineConfigSource - start next:%s',next);
	var source = utils.getConfigSetting('E2E_CONFIG_SOURCE', 'notfound');
	if(source === 'notfound') {
		for(var i=2;i<process.argv.length;i++) {
			if (process.argv[i].indexOf('config_source=') === 0) {
				let temp = process.argv[i].split('=')[1];
				source = temp.toLowerCase();
				next = false; // so if we find it then always use this one
			}
		}
	}
	logger.info('determineConfigSource - source:%s',source);

	if(next) {
		switch ( source) {
		case 'notfound':
			source = 'sdk';
			break;
		case 'sdk':
			source = 'configtx';
			break;
		case 'configtx':
			source = 'envelope';
			break;
		case 'envelope':
			source = 'sdk'; //start over
			break;
		default:
			source = 'sdk';
		}
	}
	utils.setConfigSetting('E2E_CONFIG_SOURCE', source);
	logger.info('determineConfigSource - out source:%s',source);

	return source;
};
