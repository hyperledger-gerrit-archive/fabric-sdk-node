/**
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

import { Constants } from './constants';
import * as BaseUtils from './lib/utility/baseUtils';
import { CommandRunner } from './lib/utility/commandRunner';
import { StateStore } from './lib/utility/stateStore';

import { Given } from 'cucumber';
import * as path from 'path';

const commandRunner = CommandRunner.getInstance();
const stateStore = StateStore.getInstance();

const nonTlsNetwork = '../../ts-fixtures/docker-compose/docker-compose.yaml';
const tlsNetwork = '../../ts-fixtures/docker-compose/docker-compose-tls.yaml';

Given(/^I deploy a (.+?) Fabric network/, {timeout: BaseUtils.getTimeoutDuration('STEP_LONG')}, async (type) => {

	const fabricState = stateStore.get(Constants.FABRIC_STATE);

	// If not deployed, deploy the requested type of network
	if (!fabricState) {
		if (type.localeCompare('non-tls') === 0) {
			await commandRunner.runShellCommand(true, 'docker-compose -f ' + path.join(__dirname, nonTlsNetwork) + ' -p node up -d');
		} else {
			await commandRunner.runShellCommand(true, 'docker-compose -f ' + path.join(__dirname, tlsNetwork) + ' -p node up -d');
		}
		stateStore.set(Constants.FABRIC_STATE, {deployed: true, type});
		return await BaseUtils.sleep(BaseUtils.getTimeoutDuration('INC_SHORT'));
	}

	// If deployed, but the wrong type, pull down and stand up new network
	if (fabricState && fabricState.type.localeCompare(type) !== 0) {
		await commandRunner.runShellCommand(undefined, 'rm -rf ~/.hlf-checkpoint');
		await commandRunner.runShellCommand(undefined, 'docker kill $(docker ps -aq); docker rm $(docker ps -aq)');
		if (type.localeCompare('non-tls') === 0) {
			await commandRunner.runShellCommand(true, 'docker-compose -f ' + path.join(__dirname, nonTlsNetwork) + ' -p node up -d');
		} else {
			await commandRunner.runShellCommand(true, 'docker-compose -f ' + path.join(__dirname, tlsNetwork) + ' -p node up -d');
		}
		stateStore.set(Constants.FABRIC_STATE, {deployed: true, type});
		return await BaseUtils.sleep(BaseUtils.getTimeoutDuration('INC_SHORT'));
	}

});

Given(/^I forcibly take down all docker containers/, {timeout: BaseUtils.getTimeoutDuration('STEP_LONG')}, async () => {
	await commandRunner.runShellCommand(undefined, 'rm -rf ~/.hlf-checkpoint');
	await commandRunner.runShellCommand(undefined, 'docker kill $(docker ps -aq); docker rm $(docker ps -aq)');
	stateStore.set(Constants.FABRIC_STATE, {deployed: false, type: null});
	return await BaseUtils.sleep(BaseUtils.getTimeoutDuration('INC_SHORT'));
});

Given(/^I delete all dev images/, {timeout: BaseUtils.getTimeoutDuration('STEP_LONG')}, async () => {
	await commandRunner.runShellCommand(undefined, 'docker rmi $(docker images dev-* -q)');
	return await BaseUtils.sleep(BaseUtils.getTimeoutDuration('INC_SHORT'));
});