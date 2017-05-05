/**
 * Copyright 2017 IBM All Rights Reserved.
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

'use strict';

var utils = require('fabric-client/lib/utils.js');
var logger = utils.getLogger('query');

var tape = require('tape');
var _test = require('tape-promise');
var test = _test(tape);

var path = require('path');
var util = require('util');
var fs = require('fs');
var crypto = require('crypto');

var e2eUtils = require('./e2e/e2eUtils.js');
var testUtil = require('../unit/util.js');

test('\n\n*** GRPC communication tests ***\n\n', (t) => {
	// test grpc message size limit
	var junkpath = path.join(__dirname, '../fixtures/src/github.com/example_cc/junk.go');
	// create a file of size 1M
	fs.writeFile(junkpath, crypto.randomBytes(1024 * 1024));

	testUtil.setupChaincodeDeploy();

	// limit the send message size to 1M
	utils.setConfigSetting('grpc-max-send-message-length', 1024 * 1024);
	e2eUtils.installChaincode('org1', testUtil.CHAINCODE_PATH, 'v2', t)
	.then(() => {
		t.fail('Should have failed because the file size is too big for grpc messages');
		t.end();
	}, (err) => {
		if ((err.message && err.message.indexOf('Sent message larger than max')) ||
			err.indexOf('Sent message larger than max')) {
			t.pass('Successfully received the error message due to large message size');
		} else {
			t.fail(util.format('Unexpected error: %s' + err.stack ? err.stack : err));
		}

		// now dial the send limit up
		utils.setConfigSetting('grpc-max-send-message-length', 1024 * 1024 * 2);

		return e2eUtils.installChaincode('org1', testUtil.CHAINCODE_PATH, 'v2', t)
	}).then(() => {
		t.pass('Successfully tested setting grpc send limit');
		t.end();
	}, (err) => {
		t.fail('Failed to effectively use config setting to control grpc send message limit');
		t.end();
	}).catch((err) => {
		t.fail('Test failed due to unexpected reasons. ' + err.stack ? err.stack : err);
		t.end();
	});
});