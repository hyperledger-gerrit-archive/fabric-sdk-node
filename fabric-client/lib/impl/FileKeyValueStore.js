/*
 Copyright 2016, 2018 IBM All Rights Reserved.

 SPDX-License-Identifier: Apache-2.0

*/

'use strict';

const api = require('../api.js');
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
const FileKeyValueStore = class extends api.KeyValueStore {

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

		return (async () => {
			this._dir = options.path;
			try {
				await fs.mkdirs(this._dir);
			} catch (err) {
				if (err.code !== 'EEXIST') {
					logger.error('constructor, error creating directory, code: %s', err.code);
					throw err;
				}
			}
			return this;
		})();
	}

	async getValue(name) {
		logger.debug('getValue', {key: name});

		try {
			const p = path.join(this._dir, name);
			return await fs.readFile(p, 'utf8');
		} catch (err) {
			if (err.code !== 'ENOENT') {
				throw err;
			} else {
				return null;
			}
		}
	}

	async setValue(name, value) {
		logger.debug('setValue', {key: name});

		try {
			const p = path.join(this._dir, name);
			await fs.writeFile(p, value);
			return value;
		} catch (err) {
			throw err;
		}
	}
};

module.exports = FileKeyValueStore;
