/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
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
