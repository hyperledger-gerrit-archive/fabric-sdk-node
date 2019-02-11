/**
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const {format} = require('util');
const testUtil = require('../lib/utils');
const path = require('path');
const Client = require('fabric-client');

module.exports = function () {

	this.Then(/^I can package (.+?) chaincode at version (.+?) named (.+?) as organization (.+?) located at (.+?) and metadata located at (.+?)$/,
		{timeout: testUtil.TIMEOUTS.SHORT_STEP},
		async (chaincode_type, chaincode_version, chaincode_name, org_name, _chaincode_path, metadata_path) => {
			const cc_save_name = format('chaincode-%s-%s', org_name, chaincode_name);

			// backup the gopath
			const gopath_backup = process.env.GOPATH;

			metadata_path = path.join(__dirname, metadata_path);
			let chaincode_path = _chaincode_path;
			// golang packaging uses the environment gopath to build up the file paths
			// to include in the tar
			if (chaincode_type === 'golang') {
				process.env.GOPATH = path.join(__dirname, '../../../../test/fixtures/chaincode/golang');
			} else {
				chaincode_path = path.join(__dirname, _chaincode_path);
			}

			const client = Client.getConfigSetting('client-' + org_name).value;
			const chaincode = client.newChaincode(chaincode_name, chaincode_version);

			const ENDORSEMENT_POLICY = {
				identities: [
					{role: {name: 'member', mspId: 'org1'}},
					{role: {name: 'member', mspId: 'org2'}}
				],
				policy: {
					'1-of': [{'signed-by': 0}, {'signed-by': 1}]
				}
			};

			chaincode.setEndorsementPolicyDefinition(ENDORSEMENT_POLICY);

			const request = {
				chaincodePath: chaincode_path,
				metadataPath: metadata_path,
				chaincodeType: chaincode_type
			};

			// ------------- test the package API
			// const package_bytes = await chaincode.package(request);
			await chaincode.package(request);

			// save it for later use
			Client.setConfigSetting(cc_save_name, {value: chaincode});

			// restore the path
			process.env.GOPATH = gopath_backup;
		});

	this.Then(/^I can install (.+?) chaincode at version (.+?) named (.+?) as organization (.+?)$/,
		{timeout: testUtil.TIMEOUTS.SHORT_STEP},
		async (chaincode_type, chaincode_version, chaincode_name, org_name) => {
			const cc_save_name = format('chaincode-%s-%s', org_name, chaincode_name);

			const peer = Client.getConfigSetting('peer-' + org_name).value;

			const chaincode = Client.getConfigSetting(cc_save_name).value;

			const request = {
				target: peer,
				request_timeout: 10000
			};

			// ------------- test the install API
			try {
				const hash = await chaincode.install(request);
				testUtil.logMsg(' installed the code with hash of ' + hash.toString());
			} catch (error) {
				testUtil.logError('Install Error :: ' + error);
			}
		});

	this.Then(/^I can approve (.+?) chaincode at version (.+?) named (.+?) as organization (.+?) on channel (.+?)$/,
		{timeout: testUtil.TIMEOUTS.SHORT_STEP},
		async (chaincode_type, chaincode_version, chaincode_name, org_name, channel_name) => {
			const step = 'Chaincode approval';
			testUtil.logMsg(format('%s - starting for %s, %s, %s, %s, %s', step, chaincode_type, chaincode_version, chaincode_name, org_name, channel_name));

			const cc_save_name = format('chaincode-%s-%s', org_name, chaincode_name);

			const client = Client.getConfigSetting('client-' + org_name).value;
			const peer = Client.getConfigSetting('peer-' + org_name).value;

			const chaincode = Client.getConfigSetting(cc_save_name).value;

			const channel =	Client.getConfigSetting('channel-' + org_name + '-' + channel_name).value;
			const txId = client.newTransactionID(true);

			const request = {
				chaincode: chaincode,
				targets: [peer],
				txId: txId,
				request_timeout: 3000
			};

			try {
				testUtil.logMsg(format('%s - build request', step));
				// A P P R O V E  for  O R G
				const {proposalResponses, proposal} = await channel.approveChaincodeForOrg(request);
				if (proposalResponses) {
					for (const response of proposalResponses) {
						testUtil.logMsg(format('%s - approve endorsement response from peer %s', step, request.target));
						if (response instanceof Error) {
							testUtil.logAndThrow(response);
						} else if (response.response && response.response.status) {
							if (response.response.status === 200) {
								testUtil.logMsg(format('%s - Good peer response %s', step, response.response.status));
							} else {
								testUtil.logAndThrow(format('Problem with the chaincode approval ::%s %s', response.status, response.message));
							}
						} else {
							testUtil.logAndThrow('Problem with the chaincode approval no response returned');
						}
					}

					// commit this endorsement like any other
					return testUtil.commitProposal(txId, proposalResponses, proposal, channel, peer);
				} else {
					testUtil.logAndThrow('No chaincode approval proposalResponses was returned');
				}
			} catch (error) {
				testUtil.logAndThrow(error);
			}
		});

	this.Then(/^I can commit (.+?) chaincode at version (.+?) named (.+?) as organization (.+?) on channel (.+?)$/,
		{timeout: testUtil.TIMEOUTS.SHORT_STEP},
		async (chaincode_type, chaincode_version, chaincode_name, org_name, channel_name) => {
			const step = 'Chaincode commit';
			testUtil.logMsg(format('%s - starting for %s, %s, %s, %s, %s', step, chaincode_type, chaincode_version, chaincode_name, org_name, channel_name));

			const cc_save_name = format('chaincode-%s-%s', org_name, chaincode_name);

			const client = Client.getConfigSetting('client-' + org_name).value;
			const peer1 = Client.getConfigSetting('peer-org1').value;
			const peer2 = Client.getConfigSetting('peer-org2').value;

			const chaincode = Client.getConfigSetting(cc_save_name).value;

			const channel =	Client.getConfigSetting('channel-' + org_name + '-' + channel_name).value;
			const txId = client.newTransactionID(true);

			const request = {
				chaincode: chaincode,
				targets: [peer1, peer2],
				txId: txId,
				request_timeout: 3000
			};

			try {
				testUtil.logMsg(format('%s - build request', step));
				// C O M M I T   for   C H A N N E L
				const {proposalResponses, proposal} = await channel.commitChaincode(request);
				if (proposalResponses) {
					for (const response of proposalResponses) {
						testUtil.logMsg(format('%s - commit endorsement response from peer %s', step, request.target));
						if (response instanceof Error) {
							testUtil.logAndThrow(response);
						} else if (response.response && response.response.status) {
							if (response.response.status === 200) {
								testUtil.logMsg(format('%s - Good peer response %s', step, response.response.status));
							} else {
								testUtil.logAndThrow(format('Problem with the chaincode commit ::%s %s', response.status, response.message));
							}
						} else {
							testUtil.logAndThrow('Problem with the chaincode commit no response returned');
						}
					}
				} else {
					testUtil.logAndThrow('No chaincode commit proposalResponses was returned');
				}

				// if we get this far, commit this endorsement to the ledger like any other
				return testUtil.commitProposal(txId, proposalResponses, proposal, channel, peer1);
			} catch (error) {
				testUtil.logAndThrow(error);
			}
		});

	this.Then(/^I can call (.+?) on chaincode named (.+?) as organization (.+?) on channel (.+?) with args (.+?)$/,
		{timeout: testUtil.TIMEOUTS.SHORT_STEP},
		async (cc_fcn, chaincode_name, org_name, channel_name, args) => {
			const step = 'Chaincode invoke';
			testUtil.logMsg(format('%s - starting for %s, %s, %s', step, chaincode_name, org_name, channel_name));

			const client = Client.getConfigSetting('client-' + org_name).value;

			// get all the peers since only one peer per org in this network
			const peer1 = Client.getConfigSetting('peer-org1').value;
			const peer2 = Client.getConfigSetting('peer-org2').value;

			const channel =	Client.getConfigSetting('channel-' + org_name + '-' + channel_name).value;
			const txId = client.newTransactionID(true);

			const request = {
				targets : [peer1, peer2],
				chaincodeId: chaincode_name,
				fcn: cc_fcn,
				args: eval(args),
				txId: txId
			};

			let endorsement_error = null;

			try {
				const results = await channel.sendTransactionProposal(request, 120000);
				if (results && results[0]) {
					const proposalResponses = results[0];
					for (const i in proposalResponses) {
						const response = proposalResponses[i];
						const peer = request.targets[i];
						testUtil.logMsg(format('%s - response from peer %s', step, peer));
						if (response instanceof Error) {
							testUtil.logAndThrow(response);
						} else if (response.response && response.response.status) {
							if (response.response.status === 200) {
								testUtil.logMsg(format('%s - Good peer response %s', step, response.response.status));
							} else {
								testUtil.logAndThrow(format('Problem with the chaincode invoke ::%s %s', response.status, response.message));
							}
						} else {
							testUtil.logAndThrow('Problem with the chaincode invoke no response returned');
						}
					}

					// if we get this far then all responses are good (status = 200), go ahead and commit
					return testUtil.commitProposal(txId, proposalResponses, proposal, channel, peer1);
				} else {
					testUtil.logAndThrow('No chaincode invoke proposalResponses was returned');
				}
			} catch (error) {
				testUtil.logAndThrow(error);
			}
		});

	this.Then(/^I can query install chaincodes as organization (.+?) on peer (.+?)$/,
		{timeout: testUtil.TIMEOUTS.SHORT_STEP},
		async (org_name, peer_name) => {
			const step = 'Chaincode query installed';
			testUtil.logMsg(format('%s - starting for %s, %s', step, chaincode_name, peer_name));

			const client = Client.getConfigSetting('client-' + org_name).value;

			// get all the peers since only one peer per org in this network
			const peer = Client.getConfigSetting(peer_name).value;

			const txId = client.newTransactionID(true);

			const request = {
				target : peer,
				txId: txId
			};

			let endorsement_error = null;

			try {
				const results = await chaincode.queryInstallChaincodes(request);
				if (results && results[0]) {
					const proposalResponses = results[0];
					for (const i in proposalResponses) {
						const response = proposalResponses[i];
						const peer = request.targets[i];
						testUtil.logMsg(format('%s - response from peer %s', step, peer));
						if (response instanceof Error) {
							testUtil.logAndThrow(response);
						} else if (response.response && response.response.status) {
							if (response.response.status === 200) {
								testUtil.logMsg(format('%s - Good peer response %s', step, response.response.status));
							} else {
								testUtil.logAndThrow(format('Problem with the chaincode invoke ::%s %s', response.status, response.message));
							}
						} else {
							testUtil.logAndThrow('Problem with the chaincode invoke no response returned');
						}
					}

					// if we get this far then all responses are good (status = 200), go ahead and commit
					return testUtil.commitProposal(txId, proposalResponses, proposal, channel, peer1);
				} else {
					testUtil.logAndThrow('No chaincode invoke proposalResponses was returned');
				}
			} catch (error) {
				testUtil.logAndThrow(error);
			}
		});
};
