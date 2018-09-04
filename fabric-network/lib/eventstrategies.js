/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const AllForTxStrategy = require('fabric-network/lib/impl/event/allfortxstrategy');
const AnyForTxStrategy = require('fabric-network/lib/impl/event/anyfortxstrategy');

function MSPID_SCOPE_ALLFORTX(eventHubFactory, network, mspId) {
	const peers = network.getPeerMap().get(mspId);
	return new AllForTxStrategy(eventHubFactory, peers);
}

function MSPID_SCOPE_ANYFORTX(eventHubFactory, network, mspId) {
	const peers = network.getPeerMap().get(mspId);
	return new AnyForTxStrategy(eventHubFactory, peers);
}

function network_SCOPE_ALLFORTX(eventHubFactory, network, mspId) {
	const peers = network.getnetwork().getPeers();
	return new AllForTxStrategy(eventHubFactory, peers);
}

function network_SCOPE_ANYFORTX(eventHubFactory, network, mspId) {
	const peers = network.getnetwork().getPeers();
	return new AnyForTxStrategy(eventHubFactory, peers);
}

module.exports = {
	MSPID_SCOPE_ALLFORTX,
	MSPID_SCOPE_ANYFORTX,
	network_SCOPE_ALLFORTX,
	network_SCOPE_ANYFORTX
};
