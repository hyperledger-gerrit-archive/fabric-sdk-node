/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const AllForTxStrategy = require('fabric-network/lib/impl/event/allfortxstrategy');
const AnyForTxStrategy = require('fabric-network/lib/impl/event/anyfortxstrategy');
const TransactionEventHandler = require('fabric-network/lib/impl/event/transactioneventhandler');

function getOrganizationEventHubs(network) {
	const peers = network.getChannel().getPeersForOrg();
	return network.getEventHubFactory().getEventHubs(peers);
}

function getNetworkEventHubs(network) {
	const peers = network.getChannel().getPeers();
	return network.getEventHubFactory().getEventHubs(peers);
}

/**
 * Default event handler strategy.<br>
 * Listen to all event hubs for the connected organisation.
 * The [submitTransaction]{@link Contract#submitTransaction} method will wait
 * until <b>all</b> of the events to be received from
 * all of the event hubs that are still connected (minimum 1).
 */
function MSPID_SCOPE_ALLFORTX(transactionId, network, options) {
	const eventStrategy = new AllForTxStrategy(getOrganizationEventHubs(network));
	return new TransactionEventHandler(transactionId, eventStrategy, options);
}

/**
 * Event handler strategy.<br>
 * Listen to all event hubs for the connected organisation.
 * The [submitTransaction]{@link Contract#submitTransaction} method will wait
 * until the first event from <b>any</b> of the event hubs that are still connected.
 */
function MSPID_SCOPE_ANYFORTX(transactionId, network, options) {
	const eventStrategy = new AnyForTxStrategy(getOrganizationEventHubs(network));
	return new TransactionEventHandler(transactionId, eventStrategy, options);
}

/**
 * Event handler strategy.<br>
 * Listen to all event hubs for all peers in the current network.
 * The [submitTransaction]{@link Contract#submitTransaction} method will wait
 * until <b>all</b> of the events to be received from
 * all of the event hubs that are still connected (minimum 1).
 */
//eslint-disable-next-line no-unused-vars
function NETWORK_SCOPE_ALLFORTX(transactionId, network, options) {
	const eventStrategy = new AllForTxStrategy(getNetworkEventHubs(network));
	return new TransactionEventHandler(transactionId, eventStrategy, options);
}

/**
 * Event handler strategy.<br>
 * Listen to all event hubs for all peers in the current network.
 * The [submitTransaction]{@link Contract#submitTransaction} method will wait
 * until the first event from <b>any</b> of the event hubs that are still connected.
 */
//eslint-disable-next-line no-unused-vars
function NETWORK_SCOPE_ANYFORTX(transactionId, network, options) {
	const eventStrategy = new AnyForTxStrategy(getNetworkEventHubs(network));
	return new TransactionEventHandler(transactionId, eventStrategy, options);
}

module.exports = {
	MSPID_SCOPE_ALLFORTX,
	MSPID_SCOPE_ANYFORTX,
	NETWORK_SCOPE_ALLFORTX,
	NETWORK_SCOPE_ANYFORTX
};
