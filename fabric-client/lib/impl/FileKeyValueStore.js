/*
 Copyright 2016, 2018 IBM All Rights Reserved.

 SPDX-License-Identifier: Apache-2.0

*/

'use strict';

const {KeyValueStore} = require('fabric-common');
const fs = require('fs-extra');
const path = require('path');
const utils = require('../utils');

const logger = utils.getLogger('FileKeyValueStore.js');

/**
 * This is a default implementation of the [KeyValueStore]{@link module:api.KeyValueStore} API.
 * It uses files to store the key values.
 *
 * @class
 * @extends module:api.KeyValueStore
 */
const FileKeyValueStore = class extends KeyValueStore {

	/**
	 * constructor
	 *
	 * @param {Object} options contains a single property <code>path</code> which points to the top-level directory
	 * for the store
	 */
	constructor(options) {
		logger.debug('constructor', {options: options});

		if (!options || !options.path) {
			throw new Error('Must provide the path to the directory to hold files for the store.');
		}

		// Create the keyValStore instance
		super();

		this._dir = options.path;
	}

	async init() {
		// Build directories from set path in constructor
		try {
			await fs.mkdirs(this._dir);
		} catch (err) {
			// Don't throw if it already exists
			if (err.code !== 'EEXIST') {
				logger.error('constructor, error creating directory, code: %s', err.code);
				throw err;
			}
		}
	}

	async getValue(name) {
		logger.debug('getValue', {key: name});

		try {
			const p = path.join(this._dir, name);
			return await fs.readFile(p, 'utf8');
		} catch (err) {
			if (err.code !== 'ENOENT') {
				// reject
				return Promise.reject(err);
			} else {
				// resolve null
				return Promise.resolve(null);
			}
		}
	}

	async setValue(name, value) {
		logger.debug('setValue', {key: name});

		try {
			const p = path.join(this._dir, name);
			return await fs.writeFile(p, value);
		} catch (err) {
			// reject
			return Promise.reject(err);
		}
	}
};

module.exports = FileKeyValueStore;
