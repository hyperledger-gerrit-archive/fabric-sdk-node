/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
'use strict';

const utils = require('../lib/utils');
const path = require('path');

module.exports = function () {

	this.Given(/^I have deployed a (.+?) Fabric network/, {timeout: 240 * 1000}, async (type) => {
		await utils.runShellCommand(undefined, 'docker kill $(docker ps -aq); docker rm $(docker ps -aq)');
		if (type.localeCompare('non-tls') === 0) {
			return await utils.runShellCommand(true, 'docker-compose -f ' + path.join(__dirname, '../docker-compose/docker-compose.yaml') + ' up -d');
		} else {
			return await utils.runShellCommand(true, 'docker-compose -f ' + path.join(__dirname, '../docker-compose/docker-compose-tls.yaml') + ' up -d');
		}
	});

	this.Given(/^I have forcibly taken down all docker containers/, {timeout: 240 * 1000}, async () => {
		return await utils.runShellCommand(undefined, 'docker kill $(docker ps -aq); docker rm $(docker ps -aq)');
	});


	this.Given(/^I have deleted all dev images/, {timeout: 240 * 1000}, async () => {
		return await utils.runShellCommand(undefined, 'docker rmi $(docker images dev-* -q)');
	});

};
