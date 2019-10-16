/**
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

import { Constants } from './constants';
import { CommonConnectionProfile } from './lib/commonConnectionProfile';
import * as Gateway from './lib/gateway';
import * as Listeners from './lib/listeners';
import * as Transactions from './lib/transactions';
import * as BaseUtils from './lib/utility/baseUtils';
import { StateStore } from './lib/utility/stateStore';

import { Given, Then, When } from 'cucumber';
import * as path from 'path';

const stateStore = StateStore.getInstance();

Given(/^I have a gateway named (.+?) with discovery set to (.+?) for user (.+?) using the connection profile named (.+?)$/, { timeout: Constants.STEP_MED as number }, async (gatewayName, useDiscovery, userName, ccpName) => {

	const gateways = stateStore.get(Constants.GATEWAYS);
	const fabricState = stateStore.get(Constants.FABRIC_STATE);
	const tls = (fabricState.type.localeCompare('tls') === 0);

	if (gateways && Object.keys(gateways).includes(gatewayName)) {
		BaseUtils.logMsg(`Gateway named ${gatewayName} already exists`, undefined);
		return;
	} else {
		try {
			// Create and persist the new gateway
			const profilePath = path.join(__dirname, '../config', ccpName);
			const ccp = new CommonConnectionProfile(profilePath, true);
			return await Gateway.createGateway(ccp, tls, userName, Constants.DEFAULT_ORG, gatewayName, JSON.parse(useDiscovery));
		} catch (err) {
			BaseUtils.logError(`Failed to create gateway named ${gatewayName}`, err);
			return Promise.reject(err);
		}
	}
});

When(/^I use the gateway named (.+?) to (.+?) a transaction with args (.+?) for contract (.+?) instantiated on channel (.+?)$/, { timeout: Constants.STEP_MED as number }, async (gatewayName, txnType, txnArgs, ccName, channelName) => {
	return await Gateway.performGatewayTransaction(gatewayName, ccName, channelName, txnArgs, txnType);
});

When(/^I use the gateway named (.+?) to (.+?) a total of (.+?) transactions with args (.+?) for contract (.+?) instantiated on channel (.+?)$/, {timeout: Constants.STEP_MED as number }, async (gatewayName, txnType, numTransactions, txnArgs, ccName, channelName) => {
	for (let i = 0; i < numTransactions; i++) {
		await Gateway.performGatewayTransaction(gatewayName, ccName, channelName, txnArgs, txnType);
	}
});

Then(/^The gateway named (.+?) has a (.+?) type response$/, { timeout: Constants.STEP_LONG as number }, async (gatewayName, type) => {
	if (Gateway.lastTransactionTypeCompare(gatewayName, type)) {
		return Promise.resolve();
	} else {
		throw new Error('Expected and actual result type from previous transaction did not match. Expected [' + type + '] but had [' + Gateway.getLastTransactionResult(gatewayName).type + ']');
	}
});

Then(/^The gateway named (.+?) has a (.+?) type response matching (.+?)$/, { timeout: Constants.STEP_LONG as number }, async (gatewayName, type, expected) => {
	const sameType = Gateway.lastTransactionTypeCompare(gatewayName, type);
	const sameResponse = Gateway.lastTransactionResponseCompare(gatewayName, expected);
	if (sameType && sameResponse) {
		return Promise.resolve();
	} else {
		throw new Error('Expected and actual results from previous transaction did not match. Expected [' + expected + '] but had [' + Gateway.getLastTransactionResult(gatewayName).response + ']');
	}
});

Then(/^I use the gateway named (.+?) to listen for (filtered|unfiltered) contract events of type (.+?) with a listener named (.+?) for the smart contract named (.+?) on channel (.+?)$/, {timeout: Constants.STEP_SHORT as number}, async (gatewayName, isFiltered, eventName, listenerName, ccName, channelName) => {
	const replay = true;
	return await Listeners.createContractListener(gatewayName, channelName, ccName, eventName, listenerName, isFiltered === 'unfiltered', replay);
});

Then(/^I receive ([0-9]+) events from the listener named (.+?)$/, {timeout: Constants.STEP_SHORT as number }, async (calls, listenerName) => {
	await Listeners.checkListenerCallNumber(listenerName, calls, Constants.EXACT);
	Listeners.resetListenerCalls(listenerName);
});

Then(/^I receive a minimum ([0-9]+) events from the listener (.+?)$/, {timeout: Constants.STEP_SHORT as number }, async (calls, listenerName) => {
	await Listeners.checkListenerCallNumber(listenerName, calls, Constants.GREATER_THAN);
	Listeners.resetListenerCalls(listenerName);
});

Then(/^I receive a maximum ([0-9]+) events from the listener (.+?)$/, {timeout: Constants.STEP_SHORT as number }, async (calls, listenerName) => {
	await Listeners.checkListenerCallNumber(listenerName, calls, Constants.LESS_THAN);
	Listeners.resetListenerCalls(listenerName);
});

Given(/^I am listening for (filtered|unfiltered) contract events of type (.+?) with a listener named (.+?)$/, {timeout: Constants.STEP_SHORT as number }, async (isFiltered, eventName, listenerName) => {
	const isActive = true;
	await Listeners.checkContractListenerDetails(listenerName, Constants.CONTRACT, isFiltered === 'unfiltered', eventName, isActive);
});

Given(/^I am listening for (filtered|unfiltered) block events with a listener named (.+?)$/, {timeout: Constants.STEP_SHORT as number }, async (isFiltered, listenerName) => {
	const isActive = true;
	await Listeners.checkBlockListenerDetails(listenerName, Constants.BLOCK, isFiltered === 'unfiltered', isActive);
});

Given(/^I am listening for transaction events with a listener named (.+?)$/, {timeout: Constants.STEP_SHORT as number }, async (listenerName) => {
	const isActive = true;
	await Listeners.checkTransactionListenerDetails(listenerName, Constants.TRANSACTION, isActive);
});

When(/^I unregister the listener named (.+?)$/, {timeout: Constants.STEP_SHORT as number }, (listenerName) => {
	Listeners.unregisterListener(listenerName);
});

Then(/^I use the gateway named (.+?) to listen for (filtered|unfiltered) block events with a listener named (.+?) on channel (.+?)$/, {timeout: Constants.STEP_SHORT as number}, async (gatewayName, isFiltered, listenerName, channelName) => {
	const replay = true;
	return await Listeners.createBlockListener(gatewayName, channelName, listenerName, isFiltered === 'unfiltered', replay, undefined, undefined);
});

Then(/^I use the gateway named (.+?) to listen for (filtered|unfiltered) block events between ([0-9]+) and ([0-9]+) with a listener named (.+?) on channel (.+?)$/, {timeout: Constants.STEP_SHORT as number}, async (gatewayName, isFiltered, startBlock, endBlock, listenerName, channelName) => {
	const replay = true;
	return await Listeners.createBlockListener(gatewayName, channelName, listenerName, isFiltered === 'unfiltered', replay, startBlock, endBlock);
});

When(/^I use the gateway named (.+?) to create a transaction named (.+?) that calls (.+?) using contract (.+?) instantiated on channel (.+?)$/, async (gatewayName, transactionName, fcnName, ccName, channelName) => {
	return Transactions.createTransaction(gatewayName, transactionName, fcnName, ccName, channelName);
});

When(/^I use the transaction named (.+?) to create a commit listener called (.+?)$/, (transactionName, listenerName) => {
	return Transactions.createCommitListener(transactionName, listenerName);
});

Then(/^I use the transaction named (.+?) to submit a transaction with args (.+?)$/, {timeout: Constants.STEP_LONG as number }, async (transactionName, args) => {
	return Transactions.submitExistingTransaction(transactionName, args);
});
