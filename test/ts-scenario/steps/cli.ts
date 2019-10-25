/**
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

import { Constants } from './constants';
import * as Channel from './lib/channel';
import * as Contract from './lib/contract';
import * as AdminUtils from './lib/utility/adminUtils';
import * as BaseUtils from './lib/utility/baseUtils';
import { CommonConnectionProfile } from './lib/utility/commonConnectionProfile';
import { StateStore } from './lib/utility/stateStore';

import { Given } from 'cucumber';
import * as path from 'path';

const stateStore = StateStore.getInstance();
const orgNames: string[] = ['Org1', 'Org2'];

const ccpNonTls = new CommonConnectionProfile(path.join(__dirname, '../config', 'ccp.json'), true);
const ccpTls = new CommonConnectionProfile(path.join(__dirname, '../config', 'ccp-tls.json'), true);

Given(/^I use the cli to create and join the channel named (.+?) on the deployed network/, { timeout: Constants.STEP_MED as number }, async (channelName) => {

	const fabricState = stateStore.get(Constants.FABRIC_STATE);
	if (!fabricState) {
		throw new Error('Unable to create/join channel: no Fabric network deployed');
	}
	const tls = (fabricState.type.localeCompare('tls') === 0);
	const ccp = tls ? ccpTls : ccpNonTls;

	try {
		// Create channel
		await Channel.cli_channel_create(channelName, fabricState.type);

		// Create and join orgs to channel
		for (const orgName of orgNames) {
			const alreadyJoint = await AdminUtils.isOrgChannelJoined(orgName, ccp, channelName);
			if (alreadyJoint) {
				BaseUtils.logMsg(`Organization ${orgName} has already joined channel ${channelName}, skipping ... `, undefined);
			} else {
				await Channel.cli_join_org_to_channel(orgName.toLowerCase(), channelName, (fabricState.type.localeCompare('tls') === 0));
			}
		}

		return Promise.resolve();
	} catch (err) {
		return Promise.reject(err);
	}
});

Given(/^I use the cli to update the channel with name (.+?) with config file (.+?) on the deployed network/, { timeout: Constants.STEP_MED as number }, async (channelName, configTxFile) => {

	const fabricState = stateStore.get(Constants.FABRIC_STATE);
	if (!fabricState) {
		throw new Error('Unable to update channel: no Fabric network deployed');
	}

	try {
		// Update channel
		await Channel.cli_channel_update(channelName, configTxFile, (fabricState.type.localeCompare('tls') === 0));
		return Promise.resolve();
	} catch (err) {
		return Promise.reject(err);
	}
});

Given(/^I use the cli to deploy a (.+?) smart contract named (.+?) at version (.+?) for all organizations on channel (.+?) with endorsement policy (.+?) and arguments (.+?)$/, { timeout: Constants.STEP_MED as number }, async (ccType, ccName, ccVersion, channelName, policy, initArgs) => {

	const fabricState = stateStore.get(Constants.FABRIC_STATE);
	if (!fabricState) {
		throw new Error('Unable to create/join channel: no Fabric network deployed');
	}
	const tls = (fabricState.type.localeCompare('tls') === 0);
	const ccp = tls ? ccpTls : ccpNonTls;

	try {
		// Install on each org
		for (const orgName of orgNames) {
			const isInstalled = await AdminUtils.isOrgChaincodeInstalled(orgName, ccp, ccName, ccVersion);
			if (isInstalled) {
				BaseUtils.logMsg(`Smart contract ${ccName} at version ${ccVersion} has already been installed on the peers for organization ${orgName}`, undefined);
			} else {
				await Contract.cli_chaincode_install_for_org(ccType, ccName, ccVersion, orgName.toLowerCase());
			}
		}

		// Instantiate
		const isInstantiated = await AdminUtils.isChaincodeInstantiatedOnChannel(Object.keys(ccp.getOrganizations())[0], ccp, channelName, ccName, ccVersion);
		if (isInstantiated) {
			BaseUtils.logMsg(`Smart contract ${ccName} at version ${ccVersion} has already been instantiated on channel ${channelName} `, undefined);
		} else {
			await Contract.cli_chaincode_instantiate(ccType, ccName, ccVersion, initArgs, channelName, policy, (fabricState.type.localeCompare('tls') === 0));
		}
	} catch (err) {
		return Promise.reject(err);
	}
});

Given(/^I use the cli to lifecycle deploy a (.+?) smart contract named (.+?) at version (.+?) as (.+?) for all organizations on channel (.+?) with default endorsement policy and arguments (.+?)$/, { timeout: Constants.STEP_MED as number }, async (ccType, ccName, ccVersion, ccReference, channelName, initArgs) => {

	const fabricState = stateStore.get(Constants.FABRIC_STATE);
	if (!fabricState) {
		throw new Error('Unable to create/join channel: no Fabric network deployed');
	}
	const tls = (fabricState.type.localeCompare('tls') === 0);
	const ccp = tls ? ccpTls : ccpNonTls;

	try {
		// Skip if already committed on channel
		const isCommitted = await AdminUtils.isOrgChaincodeLifecycleCommittedOnChannel(Object.keys(ccp.getOrganizations())[0], ccp, ccName, ccReference, channelName);
		if (isCommitted) {
			BaseUtils.logMsg(`Smart contract ${ccName} at version ${ccVersion} has already been committed on channel ${channelName} as ${ccReference} `, undefined);
		} else {
			// Package on each org
			for (const orgName of orgNames) {
				await Contract.cli_lifecycle_chaincode_package(ccType, ccName, ccVersion, orgName.toLowerCase());
			}

			// Install on each org
			for (const orgName of orgNames) {
				const isInstalled = await AdminUtils.isOrgChaincodeLifecycleInstalledOnChannel(orgName, ccp, ccName, ccReference, channelName);
				if (isInstalled) {
					BaseUtils.logMsg(`Smart contract ${ccName} at version ${ccVersion} has already been lifecycle installed on the peers for organization ${orgName}`, undefined);
				} else {
					await Contract.cli_lifecycle_chaincode_install(ccName, orgName.toLowerCase());
				}
			}

			// Approve on each org
			for (const orgName of orgNames) {
				const packageId = await Contract.retrievePackageIdForLabelOnOrg(ccName, orgName.toLowerCase()) as any;
				await Contract.cli_lifecycle_chaincode_approve(ccReference, ccVersion, orgName.toLowerCase(), channelName, packageId, '1', tls);
			}

			// Commit on single org
			await Contract.cli_lifecycle_chaincode_commit(ccReference, ccVersion, orgNames[0].toLowerCase(), channelName, ccp, '1', tls);
		}
	} catch (err) {
		return Promise.reject(err);
	}
});
