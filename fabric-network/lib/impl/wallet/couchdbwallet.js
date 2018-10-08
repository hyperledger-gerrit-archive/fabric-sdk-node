/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
'use strict';

const Client = require('fabric-client');
const BaseWallet = require('./basewallet');
const CouchDBVStore = require('fabric-client/lib/impl/CouchDBKeyValueStore');
const logger = require('../../logger').getLogger('CouchDBWallet');
const Nano = require('nano');

const PREFIX = 'identity_';
/**
 * This class defines an implementation of an Identity wallet that persists
 * to a Couch DB database
 *
 * @class
 * @extends {BaseWallet}
 */
class CouchDBWallet extends BaseWallet {

	/**
	 * Creates an instance of the CouchDBWallet
	 * @param {Object} options contains required property <code>url</code> and other Nano options
	 * @param {WalletMixin} mixin
	 * @memberof CouchDBWallet
	 */
	constructor(options, mixin) {
		const method = 'constructor';
		super(mixin);
		logger.debug('in CouchDBWallet %s', method);
		if (!options) {
			throw new Error('No options given');
		}
		if (!options.url) {
			throw new Error('No url given');
		}
		this.options = options;
		this.couch = Nano(options.url);
		this.dbOptions = {};
		Object.assign(this.dbOptions, this.options);
	}

	_createOptions(label) {
		label = this.normalizeLabel(label);
		const dbOptions = {};
		Object.assign(dbOptions, this.options);
		dbOptions.name = PREFIX + label;
		return dbOptions;
	}

	/**
	 * @inheritdoc
	 */
	async getStateStore(label) {
		const method = 'getStateStore';
		logger.debug('in %s, label = %s', method, label);
		const store = new CouchDBVStore(this._createOptions(label));
		return store;
	}

	/**
	 * @inheritdoc
	 */
	async getCryptoSuite(label) {
		const method = 'getCryptoSuite';
		logger.debug('in %s, label = %s', method, label);
		const cryptoSuite = Client.newCryptoSuite();
		cryptoSuite.setCryptoKeyStore(Client.newCryptoKeyStore(CouchDBVStore, this._createOptions(label)));
		return cryptoSuite;
	}

	/**
	 * @inheritdoc
	 */
	async delete(label) {
		const method = 'delete';
		logger.debug('in %s, label = %s', method, label);
		label = this.normalizeLabel(label);
		label = PREFIX + label;
		return new Promise((resolve, reject) => {
			this.couch.db.destroy(label, (err) => {
				if (err) {
					if (err.error === 'not_found') {
						return resolve(false);
					}
					logger.debug('%s - error trying to delete %s', method, label);
					return reject(err);
				}
				return resolve(true);
			});
		});
	}

	/**
	 * @inheritdoc
	 */
	async exists(label) {
		const method = 'exists';
		logger.debug('in %s, label = %s', method, label);
		label = this.normalizeLabel(label);
		const name = PREFIX + label;
		return new Promise((resolve, reject) => {
			this.couch.db.get(name, (err) => {
				if (err) {
					if (err.error === 'not_found') {
						return resolve(false);
					}
					logger.debug('%s - error trying to find %s', method, label);
					return reject(err);
				}
				return resolve(true);
			});
		});
	}

	/**
	 * @inheritdoc
	 */
	async getAllLabels() {
		const method = 'getAllLabels';
		logger.debug('in %s', method);
		return new Promise((resolve, reject) => {
			this.couch.db.list((err, list) => {
				if (err) {
					if (err.error === 'not_found') {
						return resolve(false);
					}
					logger.debug('%s - error trying to list', method);
					return reject(err);
				}
				return resolve(list.map((l) => l.replace(PREFIX, '')));
			});
		});
	}
}

module.exports = CouchDBWallet;
