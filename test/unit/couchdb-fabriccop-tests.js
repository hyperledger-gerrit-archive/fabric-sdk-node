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

var tape = require('tape');
var _test = require('tape-promise');
var test = _test(tape);

var hfc = require('hfc');
var Client = hfc;
var User = require('hfc/lib/User.js');
var FabricCOPServices = require('hfc-cop/lib/FabricCOPImpl');

var utils = require('hfc/lib/utils.js');
var couchdbUtil = require('./couchdb-util.js');

// Set the KeyValueStore implementation to database
process.env.KVS_IMPL = 'db';
console.log('Key Value Store Implementation = ' + process.env.KVS_IMPL);

// Add the CouchDB specific config file
hfc.addConfigFile('test/fixtures/couchdb.json');

// Record the CouchDB KeyValueStore location set by couchdb.json
var keyValueStore = hfc.getConfigSetting('key-value-store');
console.log('Key Value Store = ' + keyValueStore);

var couchdbIPAddr = hfc.getConfigSetting('couchdb-ip-addr', 'notfound');
var couchdbPort = hfc.getConfigSetting('couchdb-port', 'notfound');

// Record the CouchDB KeyValueStorePath set by couchdb.json
var keyValStorePath = couchdbIPAddr + ':' + couchdbPort;
console.log('Key Value Store Path = ' + keyValStorePath);

// This test first checks to see if a user has already been enrolled. If so,
// the test terminates. If the user is not yet enrolled, the test uses the
// FabricCOPImpl to enroll a user, and saves the enrollment materials into the
// CouchDB KeyValueStore. Then the test uses the Chain class to load the member
// from the key value store.
test('Use FabricCOPServices wih a CouchDB KeyValueStore', function(t) {

	//var user = new User();
	var client = new Client();
	
	// Set the relevant configuration values
	utils.setConfigSetting('crypto-keysize', 256);

	// Clean up the couchdb test database
	var dbname = 'member_db';
	couchdbUtil.destroy(dbname, keyValStorePath)
	.then( function(status) {
		t.comment('Cleanup of existing ' + dbname + ' returned '+status);
		t.comment('Initilize the CouchDB KeyValueStore');
		utils.newKeyValueStore({name: dbname, path: keyValStorePath})
		.then(
			function(kvs) {
				t.comment('Setting client keyValueStore to: ' + JSON.stringify(kvs));
				client.setStateStore(kvs);
				if (client.getStateStore() === kvs) {
					t.pass('Successfully set CouchDB KeyValueStore for client');
				} else {
					t.pass('CouchDB KeyValStore is not set successfully on this client!');
					t.end();
					process.exit(1);
				}
				t.comment('Initialize the COP server connection and KeyValueStore');
				return new FabricCOPServices('http://localhost:8888', kvs);				
			},
			function(err) {
				console.log(err);
				t.fail('Error initializing CouchDB KeyValueStore. Exiting.');
				t.end();
				process.exit(1);
		})
		.then(
			function(copService) {
				console.log("ADD: copService - " + copService);
				t.pass("Successfully initialized the Fabric COP service.");

				client.setCryptoSuite(copService.getCrypto());
				t.comment("Set cryptoSuite on client")
				t.comment("Begin copService.enroll")
				return copService.enroll({
						enrollmentID: 'admin',
						enrollmentSecret: 'adminpw'
				});
			},
			function(err) {
					t.fail("Failed to initilize the Fabric COP service: " + err);
					t.end();
			}
		)
		.then(
			function(admin) {
				t.pass('Successfully enrolled admin with COP server');

				// Persist the user state
				var member = new User('admin', client);
				member.setEnrollment(admin.key, admin.certificate);
				if (member.isEnrolled()) {
					t.pass('Member isEnrolled successfully.');
				} else {
					t.fail('Member isEnrolled failed.')
				}
				return client.setUserContext(member);
			},
			function(err) {
				t.fail('Failed to enroll admin with COP server. Error: ' + err);
				t.end();
			})
		.then(
			function(user) {
				return client.loadUserFromStateStore('admin');			
			}
		).then(
			function(user) {
				if (user && user.getName() === 'admin') {
					t.pass('Successfully loaded the user from key value store');
					t.end();
				} else {
					t.fail('Failed to load the user from key value store');
					t.end();				
				}
			},
			function(err) {
				t.fail('Failed to load the user admin from key value store. Error: ' + err);
				t.end();
			}
		).catch(
			function(err) {
				t.fail('Failed couchdb-fabriccop-test with error:' + err.stack ? err.stack : err);
				t.end();
			}
		);
	});
});
