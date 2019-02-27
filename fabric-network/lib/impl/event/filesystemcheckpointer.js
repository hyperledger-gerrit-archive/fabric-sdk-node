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
	constructor(options = {}) {
		super(options);
		this.fileExists = false;
		if (!options.basePath) {
			options.basePath = path.join(os.homedir(), '/.hlf-checkpoint');
		}
		this._basePath = path.resolve(options.basePath); // Ensure that this path is correct

		this.mmapObjects = new Map();
	}

	_initialize(channelName, listenerName) {
		const fileName = this._getCheckpointFileName(channelName, listenerName);
		fs.ensureDirSync(path.join(this._basePath, channelName));
		let mmapObject;
		try {
			mmapObject = new mmap.Create(fileName);
		} catch (err) {
			mmapObject = new mmap.Create(fileName);
		}
		this.mmapObjects.set(`${channelName}${listenerName}`, mmapObject);
	}

	save(channelName, listenerName, transactionId, blockNumber) {
		if (!this.mmapObjects.has(`${channelName}${listenerName}`)) {
			this._initialize(channelName, listenerName);
		}
		const mmapObject = this.mmapObjects.get(`${channelName}${listenerName}`);
		if (Number(blockNumber) === Number(mmapObject.blockNumber)) {
			const transactionIds = JSON.parse(mmapObject.transactionIds);
			if (transactionId) {
				transactionIds.push(transactionId);
			}
			mmapObject.transactionIds = JSON.stringify(transactionIds);
		} else {
			if (transactionId) {
				mmapObject.transactionIds = JSON.stringify([transactionId]);
			}
			mmapObject.blockNumber = blockNumber;
		}
	}

	load(channelName, listenerName) {
		if (!this.mmapObjects.has(`${channelName}${listenerName}`)) {
			this._initialize(channelName, listenerName);
		}
		const mmapObject = this.mmapObjects.get(`${channelName}${listenerName}`);
		try {
			return {transactionIds: JSON.parse(mmapObject.transactionIds), blockNumber: Number(mmapObject.blockNumber)};
		} catch (err) {
			// Log info
			logger.info('Could not load checkpoint data');
			return {};
		}
	}

	_getCheckpointFileName(channelName, listenerName) {
		return path.join(this._basePath, channelName, listenerName);
	}
}

module.exports = FileSystemCheckpointer;
