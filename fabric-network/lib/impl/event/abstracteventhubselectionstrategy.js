/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

/**
 * An abstract selection strategy that provides an interface for other selection
 * strategies
 *
 * @memberof module:fabric-network
 * @class
 */
class AbstractEventHubSelectionStrategy {
	/**
	 * Gets the next peer
	 * @returns {Peer}
	 */
	getNextPeer() {
		throw new Error('Abstract method called.');
	}

	/**
	 * Updates the availablility of the peer
	 * @param {Peer} deadPeer The peer that went down
	 */
	updateEventHubAvailability(deadPeer) {
		return;
	}
}

module.exports = AbstractEventHubSelectionStrategy;
