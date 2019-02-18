/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// This is an end-to-end test for the fabric token feature.
// It sends issue/transfer/redeem commands and then lists tokens to verify the results.
'use strict';

const jsutil = require('util');
const utils = require('fabric-client/lib/utils.js');
const logger = utils.getLogger('E2E token');

const tape = require('tape');
const _test = require('tape-promise').default;
const test = _test(tape);

const e2eUtils = require('./e2eUtils.js');
const fabprotos = require('fabric-protos');

test('\n\n***** End-to-end flow: token *****\n\n', async (t) => {
	// const proverPeer = ['localhost:8051', 'localhost:7051'];
	const proverPeer = undefined;

	try {
		// In all calls below, 'org1' or 'org2' is used to enroll/create admin user from the corresponding org

		// create TokenClient for user1 (admin user in org1)
		const user1Client = await e2eUtils.createTokenClient('org1', proverPeer, t);
		const user1TokenClient = user1Client.tokenClient;
		const user1 = user1Client.user;

		// create TokenClient for user2 (admin user in org2)
		const user2Client = await e2eUtils.createTokenClient('org2', proverPeer, t);
		const user2TokenClient = user2Client.tokenClient;
		const user2 = user2Client.user;

		// build request for user2 to issue command, recipient is user1
		let param = {
			recipient: {type: fabprotos.token.TokenOwner_MSP_IDENTIFIER, raw: user1.getIdentity().serialize()},
			type: 'abc123',
			quantity: 210
		};
		const param2 = {
			recipient: {type: fabprotos.token.TokenOwner_MSP_IDENTIFIER, raw: user1.getIdentity().serialize()},
			type: 'horizon',
			quantity: 300,
		};
		let request = {
			params: [param, param2],
			txId: user2Client.client.newTransactionID(),
		};

		// user2 issues tokens
		let result = await user2TokenClient.issue(request);
		logger.debug('issue returns: %s', jsutil.inspect(result, {depth: null}));
		t.equals(result.status, 'SUCCESS', 'Checking result status from issue');
		// sleep so that the transaction can be committed
		await e2eUtils.sleep(3000);

		// user1 lists tokens as the recipient
		result = await user1TokenClient.list();
		logger.debug('(org1)list tokens after issue tokens %s', jsutil.inspect(result, false, null));
		validateTokens(result, [param, param2], 'for recipient (user1) after issue', t);

		const transferToken = result[0];
		const redeemToken = result[1];

		// build request for user1 to transfer transfer tokens to user2
		param = {
			recipient: {type: fabprotos.token.TokenOwner_MSP_IDENTIFIER, raw: user2.getIdentity().serialize()},
			quantity: transferToken.quantity
		};
		request = {
			tokenIds: [transferToken.id],
			params: [param],
			txId: user1Client.client.newTransactionID(),
		};

		// user1 transfers tokens to user2
		result = await user1TokenClient.transfer(request);
		logger.debug('transfer returns: %s', jsutil.inspect(result, {depth: null}));
		t.equals(result.status, 'SUCCESS', 'Checking result status from transfer');
		await e2eUtils.sleep(3000);

		// verify owner's (user1) unspent tokens after transfer
		result = await user1TokenClient.list();
		logger.debug('(org1)list tokens after transfer tokens %s', jsutil.inspect(result, false, null));
		t.equals(result.length, 1, 'Checking number of tokens for owner after transfer');
		t.equals(result[0].type, redeemToken.type, 'Checking token type for owner after transfer');
		t.equals(result[0].quantity.low, redeemToken.quantity.low, 'Checking token quantity for owner after transfer');

		// verify recipient's (user2) unspent tokens after transfer
		result = await user2TokenClient.list();
		t.equals(result.length, 1, 'Checking number of tokens for recipient after transfer');
		t.equals(result[0].type, transferToken.type, 'Checking token type for recipient after transfer');
		t.equals(result[0].quantity.low, transferToken.quantity.low, 'Checking token quantity for recipient after transfer');

		// build requst for redeem token command
		param = {
			quantity: 50,
		};
		request = {
			tokenIds: [redeemToken.id],
			params: param,
			txId: user1Client.client.newTransactionID(),
		};

		// user1 redeems his token
		result = await user1TokenClient.redeem(request);
		logger.debug('redeem returns: %s', jsutil.inspect(result, {depth: null}));
		t.equals(result.status, 'SUCCESS', 'Checking result status from redeem');
		await e2eUtils.sleep(3000);

		// verify owner's (user1) unspent tokens after redeem - pass optional request
		request = {txId: user1Client.client.newTransactionID()};
		result = await user1TokenClient.list(request);
		const remainingQuantity = redeemToken.quantity - param.quantity;
		logger.debug('(org1)list tokens after transfer tokens %s', jsutil.inspect(result, false, null));
		t.equals(result.length, 1, 'Checking tokens for owner after redeem');
		t.equals(result[0].type, redeemToken.type, 'Checking token type for owner after redeem');
		t.equals(result[0].quantity.low, remainingQuantity, 'Checking token quantity for owner after redeem');

		t.end();
	} catch (err) {
		logger.error(err);
		t.fail('Failed to test token commands due to error: ' + err.stack ? err.stack : err);
		t.end();
	}
});

function validateTokens(actual, expected, message, t) {
	t.equals(actual.length, expected.length, 'Checking number of tokens ' + message);
	if (actual.length === 1) {
		t.equals(actual[0].type, expected[0].type, 'Checking number of tokens ' + message);
		t.equals(actual[0].quantity.low, expected[0].quantity.low, 'Checking number of tokens ' + message);
	} else {
		for (const actualToken of actual) {
			let found = false;
			for (const expectedToken of expected) {
				if (actualToken.type === expectedToken.type) {
					found = true;
					t.equals(actualToken.type, expectedToken.type, 'Checking token type ' + message);
					t.equals(actualToken.quantity.low, expectedToken.quantity, 'Checking token quantity ' + message);
					break;
				}
			}
			if (!found) {
				t.fail('failed to validate token type (%s) %s', actualToken.type, message);
			}
		}
	}
}
