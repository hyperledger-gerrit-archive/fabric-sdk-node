/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const AbstractEventHubSelectionStrategy = require('./abstracteventhubselectionstrategy');

class RoundRobinEventHubSelectionStrategy extends AbstractEventHubSelectionStrategy {
	constructor(peers = []) {
		super();
		this.peers = peers;
		this.lastPeerIdx = null;
	}

	getNextPeer() {
		if (this.lastPeerIdx === null || this.lastPeerIdx === this.peers.length - 1) {
			this.lastPeerIdx = 0;
		} else {
			this.lastPeerIdx++;
		}
		return this.peers[this.lastPeerIdx];
	}

	updateEventHubAvailability(deadPeer) {
		// Called to change the status of an event hub
	}
}

module.exports = RoundRobinEventHubSelectionStrategy;
