/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

class BaseEventHubSelectionStratrgy {
	getNextPeer() {
		throw new Error('method not implemented');
	}

	updateEventHubAvailability(deadPeer) {
		throw new Error('method not implemented');
	}
}

module.exports = BaseEventHubSelectionStratrgy;
