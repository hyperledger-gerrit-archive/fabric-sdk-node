/*
 Copyright 2017, 2018 IBM All Rights Reserved.

 SPDX-License-Identifier: Apache-2.0

*/

'use strict';

/**
 * Error thrown when an event hub disconnects
 */
class EventHubDisconnectError extends Error {
	constructor(message) {
		super(message);
	}
}

module.exports = EventHubDisconnectError;
