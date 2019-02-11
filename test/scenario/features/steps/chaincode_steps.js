/**
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const testUtil = require('../lib/utils');
const path = require('path');
const Client = require('fabric-client');

module.exports = function () {

	this.Then(/^I can package (.+?) chaincode at version (.+?) named (.+?) as organization (.+?) located at (.+?) and metadata located at (.+?)$/,
		{timeout: testUtil.TIMEOUTS.SHORT_STEP},
		async (chaincode_type, chaincode_version, chaincode_name, org_name, _chaincode_path, metadata_path) => {

			// backup the gopath
			const gopath_backup = process.env.GOPATH;

			metadata_path = path.join(__dirname, metadata_path);
			let chaincode_path = _chaincode_path;
			// golang packaging uses the environment gopath to build up the file paths
			// to include in the tar
			if (chaincode_type === 'golang') {
				process.env.GOPATH = path.join(__dirname, '../../../../test/fixtures');
			} else {
				chaincode_path = path.join(__dirname, _chaincode_path);
			}

			const client = Client.getConfigSetting('client_' + org_name).value;
			const chaincode = client.newChaincode(chaincode_name, chaincode_version);

			const request = {
				chaincodePath: chaincode_path,
				metadataPath: metadata_path,
				chaincodeType: chaincode_type
			};

			// ------------- test the package API
			// const package_bytes = await chaincode.package(request);
			await chaincode.package(request);

			// save it for later use
			Client.setConfigSetting('chaincode-' + org_name + '-name-' +
				chaincode_name + '-ver-' + chaincode_version + '-type-' + chaincode_type,
				{value: chaincode});

			// restore the path
			process.env.GOPATH = gopath_backup;
		});

	this.Then(/^I can install (.+?) chaincode at version (.+?) named (.+?) as organization (.+?)$/,
		{timeout: testUtil.TIMEOUTS.SHORT_STEP},
		async (chaincode_type, chaincode_version, chaincode_name, org_name) => {

			const peer = Client.getConfigSetting('peer_' + org_name).value;

			const chaincode = Client.getConfigSetting('chaincode-' + org_name + '-name-' +
				chaincode_name + '-ver-' + chaincode_version + '-type-' + chaincode_type).value;

			const request = {
				targets: [peer],
				request_timeout: 10000
			};

			// ------------- test the install API
			try {
				const hash = await chaincode.install(request);
				console.log(' installed the code with hash of ' + hash);
			} catch (error) {
				console.log('Found and error :: ' + error);
			}
		});
};
