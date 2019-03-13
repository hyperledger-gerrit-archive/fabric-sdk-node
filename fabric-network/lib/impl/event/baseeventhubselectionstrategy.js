/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

/**
 * Base Event Hub Selection strategy that can be extended
 * @interface
 * @memberof module:fabric-network
 * @private
 * @class
 */
class BaseEventHubSelectionStratrgy {
	/**
	 * Returns the next peer in the list per the strategy implementation
	 */
	getNextPeer() {
		throw new Error('method not implemented');
	}

	/**
	 * Updates the status of a peers event hub
	 * @param {ChannelPeer} deadPeer The peer that needs its status updating
	 */
	updateEventHubAvailability(deadPeer) {
		throw new Error('method not implemented');
	}
}

module.exports = BaseEventHubSelectionStratrgy;
