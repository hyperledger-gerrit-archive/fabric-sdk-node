/*
 Copyright 2016 IBM All Rights Reserved.

 Licensed under the Apache License, Version 2.0 (the 'License');
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

	  http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an 'AS IS' BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

'use strict';

var api = require('../api.js');
var fs = require('fs-extra');
var path = require('path');
var util = require('util');
var utils = require('../utils');
var nano = require('nano');

var logger = utils.getLogger('CouchDBKeyValueStore.js');

/**
 * This is a sample database implementation of the [KeyValueStore]{@link module:api.KeyValueStore} API.
 * It uses a local or remote CouchDB database instance to store the keys.
 *
 * @class
 * @extends module:api.KeyValueStore
 */
var CouchDBKeyValueStore = class extends api.KeyValueStore {
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
		logger.debug('constructor', { options: options });

		if (!options || !options.url) {
			throw new Error('Must provide the CouchDB database url to store membership data.');
		}

		// Create the keyValStore instance
		super();

		var self = this;
		// url is the database instance url
		this._url = options.url;
		// Name of the database, optional
		if (!options.name) {
			this._name = 'member_db';
		} else {
			this._name = options.name;
		}

		return new Promise(function (resolve, reject) {
			// Initialize the CouchDB database client
			var dbClient = nano(self._url);
			// Check if the database already exists. If not, create it.
			dbClient.db.get(self._name, function (err, body) {
				// Check for error
				if (err) {
					// Database doesn't exist
					if (err.error == 'not_found') {
						logger.debug('No %s found, creating...', self._name);

						dbClient.db.create(self._name, function (err, body) {
							if (err) {
								logger.error('Failed to create %s database due to', self._name, err)
								return reject(err);
							}

							logger.debug('Created %s database', self._name);
							// Specify it as the database to use
							self._database = dbClient.use(self._name);
							resolve(self);
						});
					} else {
						// Other error
						logger.error('Error creating %s database to store membership data:', self._name, err)
						return reject(err);
					}
				} else {
					// Database exists
					logger.debug(self._name, ' already exists');
					// Specify it as the database to use
					self._database = dbClient.use(self._name);
					resolve(self);
				}
			});
		});
	}

	getValue(name) {
		logger.debug('getValue', { key: name });

		var self = this;
		return new Promise(function (resolve, reject) {
			self._database.get(name, function (err, body) {
				// Check for error on retrieving from database
				if (err) {
					if (err.error !== 'not_found') {
						logger.error('getValue', { key: name }, util.format('ERROR: [%s.get]', self._name), err);
						return reject(err);
					} else {
						logger.debug('getValue', { key: name }, 'Entry does not exist');
						return resolve(null);
					}
				} else {
					logger.debug('getValue', { key: name }, util.format('Retrieved message from %s.', self._name));
					return resolve(body.member);
				}
			});
		});
	}

	setValue(name, value) {
		logger.debug('setValue', { key: name });

		var self = this;

		return new Promise(function (resolve, reject) {
			// Attempt to retrieve from the database to see if the entry exists
			self._database.get(name, function (err, body) {
				// Check for error on retrieving from database
				if (err) {
					if (err.error !== 'not_found') {
						logger.error('setValue', { key: name }, util.format('ERROR: [%s.get]', self._name), err);
						reject(err);
					} else {
						// Entry does not exist
						logger.debug('setValue', { key: name }, 'Entry does not exist, insert it.');
						self._dbInsert({ _id: name, member: value })
							.then(function (status) {
								logger.debug('setValue add ', { key: name });
								return resolve(value);
							});
					}
				} else {
					// Entry already exists and must be updated
					// Update the database entry using the latest rev number
					logger.debug('setValue', { key: name }, util.format('Retrieved entry from %s.', self._name), 'Latest rev number:', body._rev);

					self._dbInsert({ _id: name, _rev: body._rev, member: value })
						.then(function (status) {
							logger.debug('setValue update ', { key: name });
							return resolve(value);
						});
				}
			});
		});
	}

	_dbInsert(options) {
		logger.debug('setValue, _dbInsert', { options: options });
		var self = this;
		return new Promise(function (resolve, reject) {
			self._database.insert(options, function (err, body, header) {
				if (err) {
					logger.error('setValue, _dbInsert, ERROR: [%s.insert]', self._name, err);
					reject(err);
				} else {
					logger.debug('setValue, _dbInsert, Inserted member into %s.', self._name);
					resolve(true);
				}
			});
		});
	}
};


module.exports = CouchDBKeyValueStore;
