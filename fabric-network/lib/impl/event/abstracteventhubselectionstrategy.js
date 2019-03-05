/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

class AbstractEventHubSelectionStrategy {
	getNextPeer() {
		throw new Error('Abstract method called.');
	}

	updateEventHubAvailability(deadPeer) {
		throw new Error('Abstract method called.');
	}
}

module.exports = AbstractEventHubSelectionStrategy;
