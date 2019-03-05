/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const BaseCheckpointer = require('./basecheckpointer');
const mmap = require('mmap-object');
const logger = require('fabric-network/lib/logger').getLogger('FileSystemCheckpointer');


class FileSystemCheckpointer extends BaseCheckpointer {
	constructor(channelName, listenerName, options = {}) {
		super(options);
		if (!options.basePath) {
			options.basePath = path.join(os.homedir(), '/.hlf-checkpoint');
		}
		this._basePath = path.resolve(options.basePath); // Ensure that this path is correct
		this._channelName = channelName;
		this._listenerName = listenerName;
		this._checkpointFileName = this._getCheckpointFileName();

		this.mmapObject = null;
	}

	_initialize() {
		const fileName = this._getCheckpointFileName();
		fs.ensureDirSync(path.join(this._basePath, this._channelName));
		this.mmapObject = new mmap.Create(fileName);
	}

	save(transactionId, blockNumber) {
		if (!this.mmapObject) {
			this._initialize();
		}
		if (Number(blockNumber) === Number(this.mmapObject.blockNumber)) {
			const transactionIds = JSON.parse(this.mmapObject.transactionIds);
			if (transactionId) {
				transactionIds.push(transactionId);
			}
			this.mmapObject.transactionIds = JSON.stringify(transactionIds);
		} else {
			if (transactionId) {
				this.mmapObject.transactionIds = JSON.stringify([transactionId]);
			} else {
				this.mmapObject.transactionIds = JSON.stringify([]);
			}
			this.mmapObject.blockNumber = blockNumber;
		}
	}

	load() {
		if (!this.mmapObject) {
			this._initialize();
		}
		try {
			return {transactionIds: JSON.parse(this.mmapObject.transactionIds), blockNumber: Number(this.mmapObject.blockNumber)};
		} catch (err) {
			// Log info
			logger.info('Could not load checkpoint data');
			return {};
		}
	}

	_getCheckpointFileName() {
		return path.join(this._basePath, this._channelName, this._listenerName);
	}
}

module.exports = FileSystemCheckpointer;
