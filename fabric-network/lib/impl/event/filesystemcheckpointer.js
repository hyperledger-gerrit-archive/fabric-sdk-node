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
	}

	_initialize() {
		const checkpointPath = this._getCheckpointFileName();
		fs.ensureDirSync(path.join(this._basePath, this._channelName));
		fs.createFileSync(checkpointPath);
	}

	save(transactionId, blockNumber) {
		const checkpointPath = this._getCheckpointFileName();
		if (!fs.existsSync(checkpointPath)) {
			this._initialize();
		}
		const checkpoint = this.load();
		if (Number(checkpoint.blockNumber) === Number(blockNumber)) {
			const transactionIds = checkpoint.transactionIds;
			if (transactionId) {
				transactionIds.push(transactionId);
			}
			checkpoint.transactionIds = transactionIds;
		} else {
			if (transactionId) {
				checkpoint.transactionIds = [transactionId];
			} else {
				checkpoint.transactionIds = [];
			}
			checkpoint.blockNumber = blockNumber;
		}
		fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint));
	}

	load() {
		const checkpointPath = this._getCheckpointFileName();
		if (!fs.existsSync(checkpointPath)) {
			this._initialize();
		}
		let checkpoint = fs.readFileSync(checkpointPath).toString('utf8');
		if (!checkpoint) {
			checkpoint = {};
		} else {
			checkpoint = JSON.parse(checkpoint);
		}
		return checkpoint;
	}

	_getCheckpointFileName() {
		return path.join(this._basePath, this._channelName, this._listenerName);
	}
}

module.exports = FileSystemCheckpointer;
