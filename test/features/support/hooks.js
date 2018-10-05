/**
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const {After} = require('cucumber');
const utils = require('../lib/utils');
const network_utils = require('../lib/network');

After({tags: '@clean-images'}, async () => {
	// Instantiation will result in docker images being generated, clean them up with this After hook by using the referenced tag
	console.log('Removing dev images ...');
	await utils.runShellCommand(undefined, 'docker rmi $(docker images dev-* -q)');
});

After({tags: '@clean-gateway'}, async () => {
	// If a test fails without disconnecting gateways, then the tests will hang
	console.log('Disconnecting from all gateways ...');
	await network_utils.disconnectAllGateways();
});
