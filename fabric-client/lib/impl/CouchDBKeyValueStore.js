/*
 Copyright 2016, 2018 IBM All Rights Reserved.

 SPDX-License-Identifier: Apache-2.0

*/

'use strict';

const api = require('../api.js');
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

		// url is the database instance url
		this._url = options.url;
		// Name of the database, optional
		if (!options.name) {
			this._name = 'member_db';
		} else {
			this._name = options.name;
		}
	}

	async _dbGetAsync(db, name) {
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

	async _dbCreateAsync(db, name) {
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
			await this._dbGetAsync(dbClient.db, this._name);
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
			await this._dbCreateAsync(dbClient.db, this._name);
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

	async setValue(key, value) {
		logger.debug('setValue', {key});
		if (!this._database) {
			await this.init();
		}

		let revision;
		try {
			const body = await this._dbQuery(key);
			// Entry already exists and must be updated
			// Update the database entry using the latest rev number
			logger.debug(`setValue: ${key}, Retrieved entry from ${this._name}. Latest rev number: ${body._rev}`);
			revision = body._rev;

		} catch (err) {
			// Check for error on retrieving from database
			if (err.error !== 'not_found') {
				logger.error(`setValue: ${key}, ERROR: [${this._name}.get] - ${err.error}`);
				throw err;
			}
		}

		await this._dbInsert({key, revision, value});
	}

	async _dbInsert({key: _id, revision: _rev, value: member}) {
		const data = _rev ? {_id, _rev, member} : {_id, member};//TODO is it redundant?
		logger.debug('_dbInsert', data);
		return new Promise((resolve, reject) => {
			this._database.insert(data, (err) => {
				if (err) {
					logger.error(`_dbInsert, ERROR: insert ${data} - ${err.error}`);
					reject(err);
				} else {
					logger.debug(`_dbInsert, Inserted ${data}.`);
					resolve();
				}
			});
		});
	}

	async _dbQuery(key) {
		return new Promise((resolve, reject) => {
			this._database.get(key, (err, body) => {
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
