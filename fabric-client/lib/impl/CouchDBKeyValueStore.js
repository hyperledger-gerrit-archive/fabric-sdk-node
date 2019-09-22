/*
 Copyright 2016, 2018 IBM All Rights Reserved.

 SPDX-License-Identifier: Apache-2.0

*/

'use strict';

const {KeyValueStore} = require('../api.js');
const util = require('util');
const utils = require('../utils');
const nano = require('nano');

const logger = utils.getLogger('CouchDBKeyValueStore.js');

/**
 * This is a sample database implementation of the [KeyValueStore]{@link module:api.KeyValueStore} API.
 * It uses a local or remote CouchDB database instance to store the keys.
 *
 * @class
 * @extends module:api.KeyValueStore
 */
const CouchDBKeyValueStore = class extends KeyValueStore {
	/**
	 * @typedef {Object} CouchDBOpts
	 * @property {string} url The CouchDB instance url, in the form of http(s)://<user>:<password>@host:port
	 * @property {string} name Optional. Identifies the name of the database to use. Default: <code>member_db</code>.
	 */

	/**
	 * constructor
	 *
	 * @param {CouchDBOpts} options Settings used to connect to a CouchDB instance
	 */
	constructor(options) {
		logger.debug('constructor', {options: options});

		if (!options || !options.url) {
			throw new Error('Must provide the CouchDB database url to store membership data.');
		}

		// Create the keyValStore instance
		super();

		// url is the database instance url
		this._url = options.url;
		// Name of the database, optional
		if (!options.name) {
			this._name = 'member_db';
		} else {
			this._name = options.name;
		}
		// Initialize the CouchDB database client
		const dbClient = nano(this._url);
		// Specify it as the database to use
		this._database = dbClient.use(this._name);

		return (async () => {
			try {
				// Check if the database already exists. If not, create it.
				await dbClient.db.get(this._name);
				// Database exists
				logger.debug('%s already exists', this._name);
			} catch (err) {
				// Database doesn't exist
				if (err.error === 'not_found') {
					logger.debug('No %s found, creating %s', this._name);
					try {
						await dbClient.db.create(this._name);
						logger.debug('Created %s database', this._name);
					} catch (error) {
						throw new Error(util.format('Failed to create %s database due to error: %s', this._name, error.stack ? error.stack : error));
					}
				} else {
					// Other error
					throw new Error(util.format('Error creating %s database to store membership data: %s', this._name, err.stack ? err.stack : err));
				}
			}
			return this;
		})();
	}

	async getValue(name) {
		logger.debug('getValue', {key: name});

		try {
			const body = await this._database.get(name);
			logger.debug('getValue: %s, Retrieved message from %s.', name, this._name);
			return body.member;
		} catch (err) {
			if (err.error !== 'not_found') {
				logger.error('getValue: %s, ERROR: [%s.get] - ', name, this._name, err.error);
				throw err;
			} else {
				logger.debug('getValue: %s, Entry does not exist', name);
				return null;
			}
		}
	}

	async setValue(name, value) {
		logger.debug('setValue', {key: name});

		let isNew;
		let body;
		try {
			// Attempt to retrieve from the database to see if the entry exists
			body = await this._database.get(name);

			// Didn't error, so it exists
			isNew = false;
		} catch (err) {
			// Check for error on retrieving from database
			if (err.error !== 'not_found') {
				logger.error('setValue: %s, ERROR: [%s.get] - ', name, this._name, err.error);
				throw err.error;
			} else {
				// Does not exist
				isNew = true;
			}
		}
		// conditionally perform the set/update
		const opts = isNew ? {_id: name, member: value} : {_id: name, _rev: body._rev, member: value};
		try {
			await this._database.insert(opts);
			logger.debug('setValue [add]: ' + name + ', status: SUCCESS');
			return value;
		} catch (err) {
			logger.error('Couch database insert: ' + name + ', status: FAILED');
			throw err;
		}
	}
};


module.exports = CouchDBKeyValueStore;
