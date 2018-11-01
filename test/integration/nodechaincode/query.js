/**
 * Copyright 2017 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// This is an end-to-end test that focuses on exercising all parts of the fabric APIs
// in a happy-path scenario
'use strict';

const tape = require('tape');
const _test = require('tape-promise').default;
const test = _test(tape);
const e2eUtils = require('../e2e/e2eUtils.js');
const testUtils = require('../../unit/util');
const chaincodeId = testUtils.NODE_END2END.chaincodeId;

test('\n\n***** Node-Chaincode End-to-end flow: query chaincode *****\n\n', async (t) => {
	const fcn = 'query';
	const args = ['b'];
	let expectedResult = '300';
	const targets = [];  // empty array, meaning client will get the peers from the channel
	try {
		const result = await e2eUtils.queryChaincode('org2', 'v0', targets, fcn, args, expectedResult, chaincodeId, t);
		if (result) {
			t.pass('Successfully query chaincode on the channel');
		} else {
			t.fail('Failed to query chaincode ');
		}
	} catch (err) {
		t.fail('Failed to query chaincode on the channel. ' + err.stack ? err.stack : err);
	}

	try {
		expectedResult = new Error('throwError: an error occurred');
		const result = await e2eUtils.queryChaincode('org2', 'v0', targets, 'throwError', args, expectedResult, chaincodeId, t);
		if (result) {
			t.pass('Sucessfully handled error from a query');
		} else {
			t.fail('Failed to query chaincode ');
		}
	} catch (err) {
		t.fail('Failed to query chaincode on the channel. ' + err.stack ? err.stack : err);
	}
	t.end();
});
