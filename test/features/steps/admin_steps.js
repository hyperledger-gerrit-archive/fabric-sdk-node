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

const channel_util = require('../lib/channel');
const chaincode_util = require('../lib/chaincode');
const CCP = require('../lib/common_connection');

const path = require('path');

module.exports = function () {

	this.Then(/^I can create a channels from the (.+?) common connection profile$/, {timeout: 60 * 1000}, async (tlsType) => {
		if (tlsType.localeCompare('non-tls') == 0) {
			const profile =  new CCP(path.join(__dirname, '../config/ccp.json'), true);
			return channel_util.create_channels(path.join(__dirname, '../config'), profile, false);
		} else {
			const profile =  new CCP(path.join(__dirname, '../config/ccp-tls.json'), true);
			return channel_util.create_channels(path.join(__dirname, '../config'), profile, true);
		}
	});

	this.Then(/^I can join organization (.+?) to the (.+?) enabled channel named (.+?)$/, {timeout: 60 * 1000}, async (orgName, tlsType, channelName) => {
		if (tlsType.localeCompare('non-tls') == 0) {
			const profile =  new CCP(path.join(__dirname, '../config/ccp.json'), true);
			return channel_util.join_channel(profile, false, channelName, orgName);
		} else {
			const profile =  new CCP(path.join(__dirname, '../config/ccp-tls.json'), true);
			return channel_util.join_channel(profile, true, channelName, orgName);
		}
	});

	this.Then(/^I can create and join all channels from the (.+?) common connection profile$/, {timeout: 60 * 1000}, async (tlsType) => {
		let tls;
		let profile;

		if (tlsType.localeCompare('non-tls') == 0) {
			tls = false;
			profile = new CCP(path.join(__dirname, '../config/ccp.json'), true);
		} else {
			tls = true;
			profile = new CCP(path.join(__dirname, '../config/ccp-tls.json'), true);
		}

		await channel_util.create_channels(path.join(__dirname, '../config'), profile, tls);

		const channels = profile.getChannels();
		try {
			for (const channelName in channels){
				const channel = profile.getChannel(channelName);
				const orgs = profile.getOrganizations();
				for (const orgName in orgs){
					const org = profile.getOrganization(orgName);
					const orgPeers = org.peers;
					if (Object.keys(channel.peers).some((peerName)=> orgPeers.includes(peerName))) {
						await channel_util.join_channel(profile, tls, channelName, orgName);
					}
				}
			}
			return Promise.resolve();
		} catch (err) {
			return Promise.reject(err);
		}
	});

	this.Then(/^I can install (.+?) chaincode at version (.+?) named (.+?) to the (.+?) Fabric network as organization (.+?) on channel (.+?)$/, {timeout: 60 * 1000}, async (ccType, version, ccName, tlsType, orgName, channelName) => {
		let profile;
		let tls;
		if (tlsType.localeCompare('non-tls') == 0) {
			tls = false;
			profile = new CCP(path.join(__dirname, '../config/ccp.json'), true);
		} else {
			tls = true;
			profile =  new CCP(path.join(__dirname, '../config/ccp-tls.json'), true);
		}
		return chaincode_util.installChaincode(ccName, ccType, version, tls, profile, orgName, channelName);
	});

	this.Then(/^I can install (.+?) chaincode named (.+?) to the (.+?) Fabric network$/, {timeout: 60 * 1000}, async (ccType, ccName, tlsType) => {
		let profile;
		let tls;
		if (tlsType.localeCompare('non-tls') == 0) {
			tls = false;
			profile = new CCP(path.join(__dirname, '../config/ccp.json'), true);
		} else {
			tls = true;
			profile = new CCP(path.join(__dirname, '../config/ccp-tls.json'), true);
		}

		// use first org in ccp
		const orgName = profile.getOrganizations()[0];

		// use first channel in ccp
		const channelName = profile.getChannels()[0];

		// fixed version
		const version = '1.0.0';

		return chaincode_util.installChaincode(ccName, ccType, version, tls, profile, orgName, channelName);
	});

	this.Then(/^I can instantiate the (.+?) installed (.+?) chaincode at version (.+?) named (.+?) on the (.+?) Fabric network as organization (.+?) on channel (.+?) with endorsement policy (.+?) and args (.+?)$/, {timeout: 60 * 1000}, async (exisiting, ccType, version, ccName, tlsType, orgName, channelName, policyType, args) => {
		let profile;
		let tls;
		let upgrade;
		if (tlsType.localeCompare('non-tls') == 0) {
			tls = false;
			profile = new CCP(path.join(__dirname, '../config/ccp.json'), true);
		} else {
			tls = true;
			profile = new CCP(path.join(__dirname, '../config/ccp-tls.json'), true);
		}

		if (exisiting.localeCompare('newly') == 0) {
			upgrade = false;
		} else {
			upgrade = true;
		}

		const policy = require(path.join(__dirname, '../config/policies.json'))[policyType];
		return chaincode_util.instantiateChaincode(ccName, ccType, args, version, upgrade, tls, profile, orgName, channelName, policy);
	});

	this.Then(/^I can install\/instantiate (.+?) chaincode at version (.+?) named (.+?) to the (.+?) Fabric network for all organizations on channel (.+?) with endorsement policy (.+?) and args (.+?)$/, {timeout: 60 * 1000}, async (ccType, version, ccName, tlsType, channelName, policyType, args) => {
		let profile;
		let tls;
		if (tlsType.localeCompare('non-tls') == 0) {
			tls = false;
			profile = new CCP(path.join(__dirname, '../config/ccp.json'), true);
		} else {
			tls = true;
			profile = new CCP(path.join(__dirname, '../config/ccp-tls.json'), true);
		}
		const policy = require(path.join(__dirname, '../config/policies.json'))[policyType];

		const orgs = profile.getOrganizationsForChannel(channelName);

		try {
			for (const org in orgs) {
				const orgName = orgs[org];
				await chaincode_util.installChaincode(ccName, ccType, version, tls, profile, orgName, channelName);
			}

			return chaincode_util.instantiateChaincode(ccName, ccType, args, version, false, tls, profile, orgs[0], channelName, policy);
		} catch (err) {
			console.error('Install/Instantiate failed with error: ', err);
			throw new Error(err);
		}

	});

};
