/**
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

import { Constants } from './constants';
import * as AdminUtils from './lib/utility/adminUtils';
import * as BaseUtils from './lib/utility/baseUtils';
import { CommonConnectionProfileHelper } from './lib/utility/commonConnectionProfileHelper';
import { StateStore } from './lib/utility/stateStore';

import { When } from 'cucumber';
import * as path from 'path';

const stateStore: StateStore = StateStore.getInstance();
const ccpNonTls: CommonConnectionProfileHelper = new CommonConnectionProfileHelper(path.join(__dirname, '../config', 'ccp.json'), true);
const ccpTls: CommonConnectionProfileHelper = new CommonConnectionProfileHelper(path.join(__dirname, '../config', 'ccp-tls.json'), true);

When(/^I perform a (.+?) operation on channel (.+?) with (.+?) the response (includes|matches|mirrors) fields (.+?)$/, { timeout: Constants.HUGE_TIME as number }, async (queryOperation: string, channelName: string, orgName: string, compareType: string, expectedResponse: string) => {

	const fabricState: any = stateStore.get(Constants.FABRIC_STATE);
	if (!fabricState) {
		throw new Error('Unable to create/join channel: no Fabric network deployed');
	}
	const tls: boolean = (fabricState.type.localeCompare('tls') === 0);
	const ccp: CommonConnectionProfileHelper = tls ? ccpTls : ccpNonTls;

	// Perform query
	const response: any = await AdminUtils.performChannelQueryOperation(queryOperation, channelName, orgName, ccp, undefined);

	// check response
	validateResponse(compareType, response, JSON.parse(expectedResponse), queryOperation);

});

When(/^I perform a (.+?) operation with arguments (.+?) on channel (.+?) with (.+?) the response (includes|matches|mirrors) fields (.+?)$/, { timeout: Constants.HUGE_TIME as number }, async (queryOperation: string, args: string, channelName: string, orgName: string, compareType: string, expectedResponse: string) => {

	const fabricState: any = stateStore.get(Constants.FABRIC_STATE);
	if (!fabricState) {
		throw new Error('Unable to create/join channel: no Fabric network deployed');
	}
	const tls: boolean = (fabricState.type.localeCompare('tls') === 0);
	const ccp: CommonConnectionProfileHelper = tls ? ccpTls : ccpNonTls;

	const response: any = await AdminUtils.performChannelQueryOperation(queryOperation, channelName, orgName, ccp, JSON.parse(args));

	validateResponse(compareType, response, JSON.parse(expectedResponse), queryOperation);

	BaseUtils.logMsg('', undefined);

});

function validateResponse(compareType: string, response: any, expected: any, queryOperation: string): void {
	// check response
	// includes: just check for existence of field names
	// matches: check field name value
	if (compareType === 'includes') {
		for (const key of expected) {
			if (!response.hasOwnProperty(key)) {
				BaseUtils.logAndThrow(`Key ${key} is missing in response from ${queryOperation}`);
			} else {
				BaseUtils.logMsg(`Confirmed existence of key ${key} in response from ${queryOperation}`, undefined);
			}
		}
	} else {
		// This is an object match or mirror, so ... recursive is our friend
		BaseUtils.logMsg(`Recursively checking response object from ${queryOperation}`, undefined);
		validateObjectKeyMatch(expected, response, compareType === 'matches');
	}
}

function validateObjectKeyMatch(expected: any, actual: any, isMatch: boolean): any {
	// walk down the expected and keep in line with the response
	if (expected instanceof Object) {
		for (const key of Object.keys(expected)) {
			if (actual.hasOwnProperty(key)) {
				// recursive call to scan property
				BaseUtils.logMsg(`->Recursively checking response key ${key}`, undefined);
				validateObjectKeyMatch(expected[key], actual[key], isMatch);
			} else {
				BaseUtils.logAndThrow(`-->Missing key in response expected field ${key} to be present in ${{actual}}`);
			}
		}
	} else {
		// not an Object so "expected" is a value that should (conditionally) match
		if (isMatch) {
			if (expected !== actual) {
				BaseUtils.logAndThrow(`-->Mismatched items expected ${expected} but found ${actual}`);
			} else {
				BaseUtils.logMsg(`-->Confirmed match of expected key value ${actual}`, undefined);
			}
		} else {
			BaseUtils.logMsg(`-->Confirmed existence of required key name and presence of a value`, undefined);
		}
	}
}
