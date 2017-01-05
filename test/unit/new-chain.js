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
process.env.HFC_LOGGING = '{"debug": "console"}';
var hfc = require('hfc');
var util = require('util');
var fs = require('fs');
var testUtil = require('./util.js');

var Orderer = require('hfc/lib/Orderer.js');
var User = require('hfc/lib/User.js');

var keyValStorePath = testUtil.KVS;

//
//Orderer via member send chain create
//
//Attempt to send a request to the orderer with the sendCreateChain method
//
test('\n\n** TEST ** orderer via chain good initializeChain', function(t) {
	//
	// Create and configure the test chain
	//
	var client = new hfc();
	client.setStateStore(hfc.newDefaultKeyValueStore({
		path: testUtil.KVS
	}));
	var chain = client.newChain('testChain2');
	chain.addOrderer(new Orderer('grpc://localhost:7050'));

	testUtil.getSubmitter(client, t)
	.then(
		function(admin) {
			t.pass('Successfully enrolled user \'admin\'');
			// send to orderer
			return chain.initializeChain();
		},
		function(err) {
			t.fail('Failed to enroll user \'admin\'. ' + err);
			t.end();
		}
	)
	.then(
		function(response) {
			if (response.status === 'SUCCESS') {
				t.pass('Successfully ordered chain create.');
			} else {
				t.fail('Failed to order the chain create. Error code: ' + response.status);
			}
			// always sleep and check with query
			console.log(' need to wait now for the committer to catch up after the **** CREATE ****');
			t.end();
			//return sleep(30000);
		},
		function(err) {
			t.fail('Failed to send transaction create due to error: ' + err.stack ? err.stack : err);
			t.end();
		}
	)
	.catch(function(err) {
		t.pass('Failed request. ' + err);
		t.end();
	});
});
