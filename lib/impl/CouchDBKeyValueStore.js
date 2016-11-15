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
var utils = require('../utils');
var nano = require('nano');

var logger = utils.getLogger('CouchDBKeyValueStore.js');

/**
 * This is a sample database implementation of the [KeyValueStore]{@link module:api.KeyValueStore} API.
 * It uses a local CouchDB database instance to store the keys.
 *
 * @class
 */
var CouchDBKeyValueStore = class extends api.KeyValueStore {

	/**
	 * constructor
	 *
	 * @param {Object} options contains two properties: 'path', which points to the CouchDB database instance
	 * and 'name', which identifies the name of the database if different from the default of 'member_db'.
	 * The 'name' parameter is optional.
	 */
	constructor(options) {
		logger.debug('CouchDBKeyValueStore.js - constructor');

		if (!options || !options.path) {
			throw new Error('Must provide the path to the CouchDB database instance to store membership data.');
		}

		// Create the keyValStore instance
		super();

		var self = this;
		// path pointer to the database
		this._path = options.path;
		// Name of the database, optional
		if (!options.name) {
			this._name = 'member_db';
		} else {
			this._name = options.name;
		}

		logger.debug('options.path - ' + options.path);
		logger.debug('options.name - ' + options.name);

		return new Promise(function(resolve, reject) {
			// Initialize the CouchDB database client
			var dbClient = nano(options.path);

			// Check if the database already exists. If not, create it.
			dbClient.db.get(self._name, function(err, body) {
				// Check for error
				if (err) {
					// Database doesn't exist
					if (err.error == 'not_found') {
						logger.info('No member_db found, creating member_db');

						dbClient.db.create(self._name, function() {
							logger.info('Created member_db database');
							// Specify it as the database to use
							self._database = dbClient.use(self._name);
							return resolve(self);
						});
					} else {
						// Other error
						logger.error('ERROR: ' + err);
						reject(new Error('Error creating member_db database to store membership data.'));
					}
				} else {
					// Database exists
					logger.info('member_db already exists');
					// Specify it as the database to use
					self._database = dbClient.use(self._name);
					return resolve(self);
				}
			});
		});
	}

	/**
	 * Get the value associated with name.
	 * @param {string} name
	 * @returns Promise for the value
	 * @ignore
	 */
	getValue(name) {
		logger.debug('CouchDBKeyValueStore.js - getValue');

		var self = this;

		return new Promise(function(resolve, reject) {
			self._database.get(name, function(err, body) {
				// Check for error on retrieving from database
				if (err) {
					logger.error('ERROR: [member_db.get] - ', err.error);
					if (err.error !== 'not_found') {
						reject(err.error);
					} else {
						logger.info('Entry does not exist');
						return resolve(null);
					}
				} else {
					logger.debug('Retrieved message from member_db.');

					return resolve(body.member);
				}
			});
		});
	}

	/**
	 * Set the value associated with name.
	 * @param {string} name
	 * @param {string} value
	 * @returns Promise for a 'true' value on successful completion
	 * @ignore
	 */
	setValue(name, value) {
		logger.debug('CouchDBKeyValueStore - setValue');

		var self = this;

		return new Promise(function(resolve, reject) {
			// Attempt to retrieve from the database to see if the entry exists
			self._database.get(name, function(err, body) {
				// Check for error on retrieving from database
				if (err) {
					logger.error('ERROR: [member_db.get] - ', err.error);
					if (err.error !== 'not_found') {
						reject(err.error);
					} else {
						// Entry does not exist
						logger.debug('Entry does not exist, insert it.');

						self._database.insert({ _id: name, member: value }, function(err, body, header) {
							if (err) {
								logger.error('ERROR: [member_db.insert] - ', err.error);
								reject(err.error);
							} else {
								logger.debug('Inserted member into member_db.');
								return resolve(true);
							}
						});
					}
				} else {
					// Entry already exists and must be updated
					logger.debug('Retrieved entry from member_db.');

					// Update the database entry using the latest rev number
					logger.debug('Latest rev number : ' + body._rev);
					self._database.insert({ _id: name, _rev: body._rev, member: value }, function(err, body, header) {
						if (err) {
							logger.error('ERROR: [member_db.insert] - ', err.error);
							reject(err.error);
						} else {
							logger.debug('Inserted member into member_db.');
							return resolve(true);
						}
					});
				}
			});
		});
	}
};

module.exports = CouchDBKeyValueStore;
