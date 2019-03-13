/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

class BaseCheckpointer {
	constructor(options) {
		this._options = options;
	}

	async save(transactionId, blockNumber) {
		throw new Error('Method has not been implemented');
	}

	async load() {
		throw new Error('Method has not been implemented');
	}
}

module.exports = BaseCheckpointer;
