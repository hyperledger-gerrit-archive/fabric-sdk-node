/**
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const network_util = require('../lib/network');
const CCP = require('../lib/common_connection');
const testUtil = require('../lib/utils');

const path = require('path');

module.exports = function () {
	this.Then(/^I can create a gateway named (.+?) as user (.+?) within (.+?) using the (.+?) common connection profile$/, {timeout: testUtil.TIMEOUTS.SHORT}, async (gatewayName, userName, orgName, tlsType) => {
		let profile;
		let tls;
		if (tlsType.localeCompare('non-tls') == 0) {
			tls = false;
			profile = new CCP(path.join(__dirname, '../config/ccp.json'), true);
		} else {
			tls = true;
			profile = new CCP(path.join(__dirname, '../config/ccp-tls.json'), true);
		}
		return network_util.connectGateway(profile, tls, userName, orgName, gatewayName);
	});

	this.Then(/^I use the gateway named (.+?) to submit a transaction with args (.+?) for chaincode (.+?) instantiated on channel (.+?)$/, {timeout: testUtil.TIMEOUTS.SHORT}, async (gatewayName, args, ccName, channelName) => {
		return network_util.performGatewayTransaction(gatewayName, ccName, channelName, args, true);
	});

	this.Then(/^I use the gateway named (.+?) to execute transaction with args (.+?) for chaincode (.+?) instantiated on channel (.+?) with the response matching (.+?)$/, {timeout: testUtil.TIMEOUTS.SHORT}, async (gatewayName, args, ccName, channelName, expected) => {

		const result = await network_util.performGatewayTransaction(gatewayName, ccName, channelName, args, false);

		if (result === expected) {
			return Promise.resolve();
		} else {
			throw new Error('Expected and actual results from executeTransaction() did not match');
		}

	});

	this.Then(/^I can disconnect from the gateway named (.+?)$/, {timeout:testUtil.TIMEOUTS.SHORT}, async (gatewayName) => {
		return await network_util.disconnectGateway(gatewayName);
	});

	this.Then(/^I have disconnected from all gateways$/, {timeout: testUtil.TIMEOUTS.SHORT}, async () => {
		return await network_util.disconnectAllGateways();
	});
};
