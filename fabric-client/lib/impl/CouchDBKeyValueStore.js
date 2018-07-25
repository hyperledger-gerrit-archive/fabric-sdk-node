/*
 Copyright 2016, 2018 IBM All Rights Reserved.

 SPDX-License-Identifier: Apache-2.0

*/

'use strict';

const api = require('../api.js');
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
const CouchDBKeyValueStore = class extends api.KeyValueStore {
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
	constructor(options = {}) {
		logger.debug('constructor', {options: options});

		if (!options.url) {
			throw new Error('Must provide the CouchDB database url to store membership data.');
		}

		// Create the keyValStore instance
		super();

		const self = this;
		// url is the database instance url
		this._url = options.url;
		// Name of the database, optional
		if (!options.name) {
			this._name = 'member_db';
		} else {
			this._name = options.name;
		}
	}

	static async dbGetAsync(db, name) {
		return new Promise((resolve, reject) => {
			db.get(name, (err) => {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		});
	}

	static async dbCreateAsync(db, name) {
		return new Promise((resolve, reject) => {
			db.create(name, (err) => {
				if (err) {
					reject(err);
				} else {
					logger.debug(`Created ${name} database`,);
					resolve();
				}
			});
		});
	}

	async init() {
		// Initialize the CouchDB database client
		const dbClient = nano(this._url);
		// Check if the database already exists. If not, create it.
		try {
			await CouchDBKeyValueStore.dbGetAsync(dbClient.db, this._name);
			// Database exists
			logger.debug(`${this._name} already exists`);
			// Specify it as the database to use
			this._database = dbClient.use(this._name);
			return;
		} catch (err) {
			// Check for error
			if (err.error !== 'not_found') {
				throw new Error(`Error creating ${this._name} database to store membership data: ${err.stack ? err.stack : err}`);
			}
		}
		// Database doesn't exist
		logger.debug(`No ${this._name} found, creating ${this._name}`);
		try {
			await CouchDBKeyValueStore.dbCreateAsync(dbClient.db, this._name);
		} catch (err) {
			throw new Error(`Failed to create ${this._name} database due to error: ${err.stack ? err.stack : err}`);
		}
		this._database = dbClient.use(this._name);

	}

	async getValue(name) {
		logger.debug('getValue', {key: name});
		if (!this._database) {
			await this.init();
		}
		try {
			const body = await this._dbQuery(name);
			logger.debug(`getValue: ${name}, Retrieved message from ${this._name}.`);
			return body.member;
		} catch (err) {
			if (err.error !== 'not_found') {
				logger.error(`getValue: ${name}, ERROR: [${this._name}.get] - ${err.error}`);
				throw err;
			}
			logger.debug(`getValue: ${name}, Entry does not exist`);
		}
	}

	async setValue(name, value) {
		logger.debug('setValue', {key: name});

		if (!this._database) {
			await this.init();
		}
		const self = this;

		return new Promise(((resolve, reject) => {
			// Attempt to retrieve from the database to see if the entry exists
			self._database.get(name, (err, body) => {
				// Check for error on retrieving from database
				if (err) {
					if (err.error !== 'not_found') {
						logger.error('setValue: %s, ERROR: [%s.get] - ', name, self._name, err.error);
						reject(err.error);
					} else {
						// Entry does not exist
						logger.debug('setValue: %s, Entry does not exist, insert it.', name);
						self._dbInsert({_id: name, member: value})
							.then((status) => {
								logger.debug('setValue add: ' + name + ', status: ' + status);
								if (status == true) resolve(value);
								else reject(new Error('Couch database insert add failed.'));
							});
					}
				} else {
					// Entry already exists and must be updated
					// Update the database entry using the latest rev number
					logger.debug('setValue: %s, Retrieved entry from %s. Latest rev number: %s', name, self._name, body._rev);

					self._dbInsert({_id: name, _rev: body._rev, member: value})
						.then((status) => {
							logger.debug('setValue update: ' + name + ', status: ' + status);
							if (status == true) resolve(value);
							else reject(new Error('Couch database insert update failed.'));
						});
				}
			});
		}));
	}

	async _dbInsert(data) {
		logger.debug('setValue, _dbInsert', data);
		return new Promise((resolve, reject) => {
			this._database.insert(data, (err) => {
				if (err) {
					logger.error(`setValue, _dbInsert, ERROR: [${this._name}.insert] - ${err.error}`);
					reject(err);
				} else {
					logger.debug(`setValue, _dbInsert, Inserted member into ${this._name}.`);
					resolve();
				}
			});
		});
	}

	async _dbQuery(name) {
		return new Promise((resolve, reject) => {
			this._database.get(name, (err, body) => {
				if (err) {
					reject(err);
				} else {
					resolve(body);
				}
			});
		});
	}
};


module.exports = CouchDBKeyValueStore;
