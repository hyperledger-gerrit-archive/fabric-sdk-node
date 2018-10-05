/**
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const testUtil = require('../lib/utils');
const path = require('path');

module.exports = function () {

	this.Given(/^I have deployed a (.+?) Fabric network/, {timeout: testUtil.TIMEOUTS.LONG}, async (type) => {
		await testUtil.runShellCommand(undefined, 'docker kill $(docker ps -aq); docker rm $(docker ps -aq)');
		if (type.localeCompare('non-tls') === 0) {
			await testUtil.runShellCommand(true, 'docker-compose -f ' + path.join(__dirname, '../docker-compose/docker-compose.yaml') + ' up -d');
			return await testUtil.sleep(3000);
		} else {
			await testUtil.runShellCommand(true, 'docker-compose -f ' + path.join(__dirname, '../docker-compose/docker-compose-tls.yaml') + ' up -d');
			return await testUtil.sleep(3000);
		}
	});

	this.Given(/^I have forcibly taken down all docker containers/, {timeout: testUtil.TIMEOUTS.LONG}, async () => {
		await testUtil.runShellCommand(undefined, 'docker kill $(docker ps -aq); docker rm $(docker ps -aq)');
		return await testUtil.sleep(3000);
	});


	this.Given(/^I have deleted all dev images/, {timeout: testUtil.TIMEOUTS.LONG}, async () => {
		await testUtil.runShellCommand(undefined, 'docker rmi $(docker images dev-* -q)');
		return await testUtil.sleep(3000);
	});

};
