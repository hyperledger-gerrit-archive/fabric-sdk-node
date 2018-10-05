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
