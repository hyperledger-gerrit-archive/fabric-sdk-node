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

var tape = require('tape');
var _test = require('tape-promise');
var test = _test(tape);

var hfc = require('../..');
var util = require('util');
var fs = require('fs');
var testUtil = require('./util.js');
var nano = require('nano');

// Variable that will store the KeyValueStore url, used for both file and database
var keyValStorePath;

//
// Registration and enrollment test
//
function testRegisterAndEnroll(chainName, cb) {
	//
	// Create and configure the test chain
	//
	var chain = hfc.newChain(chainName);
	var expect = '';
	var found = '';
	var webUser;

	chain.setMemberServicesUrl('grpc://localhost:7054');

	hfc.newKeyValueStore({name: 'member_db', path: keyValStorePath})
	.then(
		function(keyValStore) {
			chain.setKeyValueStore(keyValStore);
			console.log('chain keyValStore - ' + JSON.stringify(chain.getKeyValueStore()));

			return chain.enroll('admin', 'Xurw3yU9zI0l');
		},
		function(err) {
			return cb('Error initializing keyValStoreDB. Exiting.');
		}
	).then(
		function(admin) {
			console.log('Successfully enrolled user \'admin\'.');

			chain.setRegistrar(admin);

			// Register and enroll webAdmin
			return registerAndEnroll('webAdmin', 'client', { roles: ['client'] }, chain);
		},
		function(err) {
			return cb('Failed to enroll user \'admin\'. ' + err);
		}
	).then(
		function(webAdmin) {
			console.log('Successfully registered and enrolled \'webAdmin\'');

			chain.setRegistrar(webAdmin);

			return registerAndEnroll('webUser', 'client', null, chain);
		},
		function(err) {
			return cb('Failed to enroll user \'webAdmin\'. ' + err);
		}
	).then(
		function(_webUser) {
			console.log('Successfully registered and enrolled \'webUser\'');

			webUser = _webUser;

			return registerAndEnroll('auditor', 'auditor', null, chain);
		},
		function(err) {
			return cb('Failed to enroll user \'webUser\'. ' + err);
		}
	).then(
		function(auditor) {
			return cb('webAdmin is not expected to be able to register members of type \'auditor\'');
		},
		function(err) {
			expect = 'webAdmin may not register member of type auditor';
			found = (err.toString()).match(expect);

			if (!(found == expect)) {
				return cb('Error message does not match expected message when registration failed');
			}

			console.log('Successfully tested failed registration of auditors');

			return registerAndEnroll('validator', 'validator', null, chain);
		}
	).then(
		function(validator) {
			return cb('webAmin is not expected to be able to register members of type \'validator\'');
		},
		function(err) {
			expect = 'webAdmin may not register member of type validator';
			found = (err.toString()).match(expect);

			if (!(found == expect)) {
				return cb('Error message does not match expected message when registration failed');
			}

			console.log('Successfully tested failed registration of validators');

			chain.setRegistrar(webUser);

			return registerAndEnroll('webUser2', 'client', null, chain);
		}
	).then(
		function(webUser) {
			return cb('webUser is not expected to be able to register members of type \'client\'');
		},
		function(err) {
			expect = 'webUser may not register member of type client';
			found = (err.toString()).match(expect);
			if (!(found == expect)) {
				return cb('Error message does not match expected message when registration failed');
			}

			console.log('Successfully tested failed registration of clients');
			return cb();
		}
	);
}

//
// Registration and enrollment methods test
//
function testRegistrationAndEnrolllmentMethods(chainName, cb) {
	//
	// Create and configure the test chain
	//
	var chain = hfc.newChain(chainName);
	var expect = '';
	var found = '';
	var webUser;

	chain.setMemberServicesUrl('grpc://localhost:7054');

	hfc.newKeyValueStore({name: 'member_db', path: keyValStorePath})
	.then(
		function(keyValStore) {
			chain.setKeyValueStore(keyValStore);
			console.log('chain keyValStore - ' + JSON.stringify(chain.getKeyValueStore()));

			return chain.enroll('admin', 'Xurw3yU9zI0l');
		},
		function(err) {
			return cb('ERROR: initializing keyValStoreDB. Exiting.');
		}
	).then(
		function(admin) {
			console.log('Successfully enrolled user \'admin\'.');

			chain.setRegistrar(admin);

			// Register and enroll newUser1
			return chain.register({
				enrollmentID: 'newUser1',
				roles: 'client',
				affiliation: 'bank_a',
				registrar: { roles: ['client'] }
			});
		},
		function(err) {
			return cb('Failed to enroll user \'admin\'. ' + err);
		}
	).then(
		function(userPwd) {
			console.log('Successfully registered \'newUser1\'');

			return chain.enroll('newUser1', userPwd);
		},
		function(err) {
			return cb('Failed to register user \'newUser1\'. ' + err);
		}
	).then(
		function(_webAdmin) {
			console.log('Successfully enrolled \'newUser1\'');
			return cb();
		},
		function(err) {
			return cb('Failed to enroll user \'newUser1\'. ' + err);
		}
	).catch(function(err) {
		return cb('Failed due to unexpected error: ' + err.stack ? err.stack : err);
	});
}

//
// Repeated enrollment test
//
function testEnrollAgain(chainName, cb) {
	//
	// In the case of a file-based KeyValStore, rename the KeyValueStore
	// directory. Create and configure another chain instance so there is no
	// shared state with the first chain created in the prior test. This is
	// necessary to start without a local cache.
	//
	if (process.env.KVS_IMPL == 'file') {
		fs.renameSync(keyValStorePath, keyValStorePath + '2');
	}

	var chain = hfc.newChain(chainName);

	chain.setMemberServicesUrl('grpc://localhost:7054');

	hfc.newKeyValueStore({name: 'member_db2', path: keyValStorePath})
	.then(
		function(keyValStore) {
			chain.setKeyValueStore(keyValStore);
			console.log('chain keyValStore - ' + JSON.stringify(chain.getKeyValueStore()));

			return chain.enroll('admin', 'Xurw3yU9zI0l');
		},
		function(err) {
			return cb('ERROR: initializing keyValStore. Exiting.');
		}
	).then(
		function(admin) {
			// Remove test file or database
			if (process.env.KVS_IMPL == 'file') {
				rmdir(keyValStorePath);
				fs.renameSync(keyValStorePath + '2', keyValStorePath);
			} else if (process.env.KVS_IMPL == 'db') {
				var dbClient = nano(keyValStorePath);
				dbClient.db.destroy('member_db2', function() {
					console.log('Test database deleted successfully.');
				});
			}
			return cb(new Error('admin should not be allowed to re-enroll'));
		},
		function(err) {
			// Remove test file or database
			if (process.env.KVS_IMPL == 'file') {
				rmdir(keyValStorePath);
				fs.renameSync(keyValStorePath + '2', keyValStorePath);
			} else if (process.env.KVS_IMPL == 'db') {
				var dbClient = nano(keyValStorePath);
				dbClient.db.destroy('member_db2', function() {
					console.log('Test database deleted successfully.');
				});
			}
			console.log('Successfully tested failed re-enrollment on admin');
			return cb();
		}
	);
}

// Register and enroll user 'name' with role 'r' with registrar info 'registrar' for chain 'chain'
function registerAndEnroll(name, r, registrar, chain) {
	// User is not enrolled yet, so perform both registration and enrollment
	var registrationRequest = {
		roles: [r],
		enrollmentID: name,
		affiliation: 'bank_a',
		registrar: registrar
	};
	return chain.registerAndEnroll(registrationRequest);
}

function rmdir(path) {
	if (fs.existsSync(path)) {
		fs.readdirSync(path).forEach(function(file, index) {
			var curPath = path + '/' + file;
			if (fs.lstatSync(curPath).isDirectory()) { // recurse
				rmdir(curPath);
			} else { // delete file
				fs.unlinkSync(curPath);
			}
		});
		fs.rmdirSync(path);
	}
}

//
// Run all the registration and enrollment test
//
function runAllTests(chainName, cb) {
	testRegisterAndEnroll(chainName + '_testChain1', function(err) {
		if (err) {
			return cb('ERROR: ' + err);
		} else {
			console.log('testRegisterAndEnroll successful.');

			testRegistrationAndEnrolllmentMethods(chainName + '_testChain2', function(err) {
				if (err) {
					return cb('ERROR: ' + err);
				} else {
					console.log('testRegistrationAndEnrolllmentMethods successful.');

					testEnrollAgain(chainName + '_testChain3', function(err) {
						if (err) {
							cb('ERROR: ' + err);
						} else {
							console.log('testEnrollAgain successful.');
							cb();
						}
					});
				}
			});
		}
	});
}

//
// Populate the database instance with membership information stored in the
// file-based KeyValueStore.
//
function populateDB(path, database, cb) {
	console.log('Populating database instance');

	// Read the fileKeyValStorePath directory
	fs.readdir(path, function(err, fileList) {
		// Read in all the files and populate the database
		var filesProcessed = 0;
		fileList.forEach(function(fileName) {
			fs.readFile(path + '/' + fileName, 'utf8', function(err, data) {
				var jsonData = JSON.parse(data);

				// Insert the member data into the database
				var memberName = 'member.' + jsonData.name;
				database.insert({ _id: memberName, member: JSON.stringify(jsonData) }, function(err, body, header) {
					if (err) {
						return cb('ERROR: [member_db.insert] - ', err.error);
					} else {
						console.log('Inserted member ' + memberName + ' into member_db');
						filesProcessed++;

						if(filesProcessed === fileList.length) {
							return cb();
						}
					}
				}); // end database.insert
			}); // end readFile
		}); // end forEach
	}); // end readdir
}

//
// Main test routine that runs through all of the tests in this file
//
test('Run all registration and enrollment tests', function (t) {
	//
	// Run all the tests against a file-based KeyValueStore
	//

	// Set the KeyValueStore implementation variable to file. This environment
	// variable is specific to this unit test case and is needed to determine
	// whether the test needs to rename a file or a database in the final test.
	process.env.KVS_IMPL = 'file';
	console.log('Key Value Store Implementation = ' + process.env.KVS_IMPL);

	// Set the path for a file-based KeyValueStore
	keyValStorePath = testUtil.KVS;
	console.log('Key Value Store Path = ' + keyValStorePath);

	// Run all tests
	runAllTests('fileChain', function(err) {
		if (err) {
			t.fail('ERROR: ' + err);
			t.end();
		} else {
			t.pass('All file-based KeyValueStore tests passed successfully!');

			//
			// Re-run all of the tests against the Couch DB database
			//

			// Set the KeyValueStore implementation to database
			process.env.KVS_IMPL = 'db';
			console.log('Key Value Store Implementation = ' + process.env.KVS_IMPL);

			// Load the relevant configuration values
			hfc.addConfigFile('test/fixtures/couchdb.json');
			var couchdbIPAddr = hfc.getConfigSetting('couchdb-ip-addr', 'notfound');
			var couchdbPort = hfc.getConfigSetting('couchdb-port', 'notfound');

			// Record the file-based KeyValueStore location
			var fileKeyValStorePath = keyValStorePath;
			keyValStorePath = couchdbIPAddr + ':' + couchdbPort;
			console.log('Key Value Store Path = ' + keyValStorePath);

			// Create and populate the database with values from file KeyValueStore
			var dbClient = nano(keyValStorePath);
			dbClient.db.create('member_db', function() {
				console.log('Created member_db database');
				// Specify it as the database to use
				var memberDB = dbClient.use('member_db');

				// Populate the database with existing membership info
				populateDB(fileKeyValStorePath, memberDB, function(err) {
					if (err) {
						t.fail('ERROR: ' + err);
						t.end();
					} else {
						t.pass('populateDB finished!');

						// Re-run all of the tets against the database KeyValueStore
						runAllTests('dbChain', function(err) {
							if (err) {
								t.fail('ERROR: ' + err);
								t.end();
							} else {
								t.pass('All database-based KeyValueStore tests passed successfully!');

								// Delete the testing database
								dbClient.db.destroy('member_db', function() {
									t.pass('Test database deleted successfully.');
									t.end();
								});
							}
						}); // end runAllTests for db
					} // end else case
				}); // end populateDB
			}); // end dbClient.db.create
		} // end else case
	});// end runAllTests for file
}); // end main tape test
