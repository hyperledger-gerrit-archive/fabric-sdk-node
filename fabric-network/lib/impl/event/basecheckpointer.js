/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

/**
 * Base checkpointer providing an interface for checkpointers
 * @class
 */
class BaseCheckpointer {
	constructor(options) {
		this._options = options;
	}

	/**
	 * Updates the storage mechanism
	 * @param {String} transactionId the transaction ID
	 * @param {*} blockNumber the block number
	 * @async
	 */
	async save(transactionId, blockNumber) {
		throw new Error('Method has not been implemented');
	}

	/**
	 * Loads the latest checkpoint
	 * @async
	 */
	async load() {
		throw new Error('Method has not been implemented');
	}
}

module.exports = BaseCheckpointer;
