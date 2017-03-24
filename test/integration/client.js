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

if (global && global.hfc) global.hfc.config = undefined;
require('nconf').reset();
var utils = require('fabric-client/lib/utils.js');
utils.setConfigSetting('hfc-logging', '{"debug":"console"}');
var logger = utils.getLogger('integration.client');

var tape = require('tape');
var _test = require('tape-promise');
var test = _test(tape);
var util = require('util');
var path = require('path');
var fs = require('fs-extra');

var hfc = require('fabric-client');
var User = require('fabric-client/lib/User.js');
var Client = require('fabric-client/lib/Client.js');
var testUtil = require('../unit/util.js');
var couchdbUtil = require('./couchdb-util.js');

var tag = 'integration.client: ';
var caImportOrig = utils.getConfigSetting('ca-import', 'notfound');
logger.debug('caImportOrig = %s', JSON.stringify(caImportOrig));

test('\n\n ** getSubmitter happy path - get override settings from opts **\n\n', function (t) {
	var org = caImportOrig.userOrg, name = caImportOrig.orgs[org].username ;
	utils.setConfigSetting('ca-import', {'username': name+'x'});
	utils.setConfigSetting('ca-import', {'userOrg': org+'x'});

	var dirname = __dirname;
	var client = new Client();
	client.getSubmitter(
		{username: name,
			userOrg: org,
			mspConfigDir: dirname})
	.then((user) => {
		t.pass(tag+': got user');
		utils.setConfigSetting('ca-import', {'username': name});//restore to original
		utils.setConfigSetting('ca-import', {'userOrg': org});
		t.end();
	}).catch((err) => {
		t.fail(tag+': error, did not get submitter');
		utils.setConfigSetting('ca-import', {'username': name});//restore to original
		utils.setConfigSetting('ca-import', {'userOrg': org});
		t.comment(err.stack ? err.stack : err);
		t.end();
	});
});

test('\n\n ** getSubmitter happy path get all settings from config **\n\n', function (t) {
	utils.setConfigSetting('crypto-keysize', 256);

	var kvsPath = caImportOrig.orgs[caImportOrig.userOrg].storePath+'-'+caImportOrig.orgs[caImportOrig.userOrg].name;
	logger.info('try to cleanup kvsPath: '+kvsPath);
	// clean up
	if (testUtil.existsSync(kvsPath)) {
		fs.removeSync(kvsPath);
		logger.info('removed kvsPath: '+kvsPath);
	}
	var dirname = __dirname;
	var client = new Client();
	client.getSubmitter({mspConfigDir: dirname})
	.then((user) => {
		t.pass(tag+': got user from config');
		t.end();
	}).catch((err) => {
		t.fail(tag+': error, did not get submitter from config');
		t.comment(err.stack ? err.stack : err);
		t.end();
	});
});

test('\n\n ** getSubmitter happy path - CouchDB **\n\n', function (t) {
	// Use the CouchDB specific config file
	hfc.addConfigFile('test/fixtures/couchdb.json');
	utils.setConfigSetting('crypto-keysize', 256);
	utils.setConfigSetting('key-value-store','fabric-client/lib/impl/CouchDBKeyValueStore.js');//override
	var couchdbIPAddr = hfc.getConfigSetting('couchdb-ip-addr', 'notfound');
	var couchdbPort = hfc.getConfigSetting('couchdb-port', 'notfound');
	var keyValStorePath = couchdbIPAddr + ':' + couchdbPort;

	// Clean up the couchdb test database
	var userOrg = caImportOrig.userOrg;
	var dbname = (caImportOrig.orgs[userOrg].name+'_db').toLowerCase();
	var keyStoreOpts = {name: dbname, url: keyValStorePath};
	utils.setConfigSetting('keyStoreOpts', keyStoreOpts);
	logger.info('couch keyStoreOpts: '+ JSON.stringify(keyStoreOpts));

	var dirname = __dirname;
	var client = new Client();
	couchdbUtil.destroy(dbname, keyValStorePath)
	.then((status) => {
		t.comment(tag+'Cleanup of existing ' + dbname + ' returned '+status);
		t.comment(tag+'Initialize the CouchDB KeyValueStore');
		return status;
	})
	.then((status) => {
		client.getSubmitter({mspConfigDir: dirname})
		.then((user) => {
			t.pass(tag+'got user');
			utils.setConfigSetting('keyStoreOpts',  'notfound');
			t.end();
		}).catch((err) => {
			t.fail(tag+'error, did not get submitter');
			t.comment(err.stack ? err.stack : err);
			utils.setConfigSetting('keyStoreOpts',  'notfound');
			t.end();
		});
	});
});

test('\n\n ** getSubmitter happy path - Cloudant  **\n\n', function (t) {
	// Use the Cloudant specific config file
	hfc.addConfigFile('test/fixtures/cloudant.json');
	utils.setConfigSetting('crypto-keysize', 256);
	utils.setConfigSetting('key-value-store','fabric-client/lib/impl/CouchDBKeyValueStore.js');//override
	var cloudantUsername = hfc.getConfigSetting('cloudant-username', 'notfound');
	var cloudantPassword = hfc.getConfigSetting('cloudant-password', 'notfound');
	var cloudantBluemix = hfc.getConfigSetting('cloudant-bluemix', 'notfound');
	var cloudantUrl = 'https://' + cloudantUsername + ':' + cloudantPassword + cloudantBluemix;

	// Clean up the cloudant test database
	var userOrg = caImportOrig.userOrg;
	var dbname = (caImportOrig.orgs[userOrg].name+'_db').toLowerCase();
	var keyStoreOpts = {name: dbname, url: cloudantUrl};
	utils.setConfigSetting('keyStoreOpts', keyStoreOpts);
	logger.info('cloudant keyStoreOpts: '+ JSON.stringify(keyStoreOpts));

	var dirname = __dirname;
	var client = new Client();
	couchdbUtil.destroy(dbname, cloudantUrl)
	.then((status) => {
		t.comment(tag+'Cleanup of existing ' + dbname + ' returned '+status);
		t.comment(tag+'Initialize the CouchDB KeyValueStore');
		return status;
	})
	.then((status) => {
		client.getSubmitter({mspConfigDir: dirname })
		.then((user) => {
			t.pass(tag+'got user');
			utils.setConfigSetting('keyStoreOpts',  'notfound');
			t.end();
		}).catch((err) => {
			t.fail(tag+'error, did not get submitter');
			t.comment(err.stack ? err.stack : err);
			utils.setConfigSetting('keyStoreOpts',  'notfound');
			t.end();
		});
	});
});
