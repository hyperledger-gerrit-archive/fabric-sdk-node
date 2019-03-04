/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const RoundRobinEventHubSelectionStrategy = require('fabric-network/lib/impl/event/roundrobineventhubselectionstrategy');

function getOrganizationPeers(network) {
	return network.getChannel().getPeersForOrg();
}


function MSPID_SCOPE_ROUND_ROBIN(network) {
	const orgPeers = getOrganizationPeers(network);
	return new RoundRobinEventHubSelectionStrategy(orgPeers);
}

module.exports = {
	MSPID_SCOPE_ROUND_ROBIN
};
