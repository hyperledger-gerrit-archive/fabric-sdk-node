/*
 Copyright 2016, 2018 IBM All Rights Reserved.

 SPDX-License-Identifier: Apache-2.0

*/

'use strict';
const {KeyValueStore} = require('../api');
const jsrsasign = require('jsrsasign');
const KEYUTIL = jsrsasign.KEYUTIL;

const utils = require('../utils.js');
const ECDSAKey = require('./ecdsa/key.js');

const logger = utils.getLogger('CryptoKeyStore.js');

/**
 * A CryptoKeyStore uses an underlying instance of {@link module:api.KeyValueStore} implementation
 * to persist crypto keys.
 *
 * This also enforces the special indexing mechanism with private and public
 * keys on top of a standard implementation of the KeyValueStore interface
 * with the getKey() and putKey() methods.
 *
 * @class
 * @extends module:api.KeyValueStore
 */
const CryptoKeyStore = class extends KeyValueStore {

	/**
	 * @constructor
	 * @param {KeyValueStore} KVSInstance The key store instance saves private keys.
	 *    The key store must be a instance implementing the KeyValueStore interface {@link KeyValueStore}
	 */
	constructor(KVSImplClass, opts) {
		logger.debug('constructor', {KVSImplClass: KVSImplClass}, {opts: opts});

		// Create KeyValueStore instance
		super();

		if (!KVSImplClass || !(KVSImplClass.prototype instanceof KeyValueStore)) {
			if (KVSImplClass) {
				opts = KVSImplClass;
			}
			KVSImplClass = require(utils.getConfigSetting('key-value-store'));
		}
		if (!opts) {
			opts = {path: utils.getDefaultKeyStorePath()};
		}

		return (async () => {
			try {
				this._kvsInstance = await new KVSImplClass(opts);
			} catch (err) {
				throw err;
			}
			return this;
		})();
	}

	async getValue(name) {
		return await this._kvsInstance.getValue(name);
	}

	async setValue(name, value) {
		return await this._kvsInstance.setValue(name, value);
	}

	async getKey(ski) {
		// first try the private key entry, since it encapsulates both
		// the private key and public key
		const raw = await this.getValue(_getKeyIndex(ski, true));
		if (raw !== null) {
			const privKey = KEYUTIL.getKeyFromPlainPrivatePKCS8PEM(raw);
			// TODO: for now assuming ECDSA keys only, need to add support for RSA keys
			return new ECDSAKey(privKey);
		}

		// didn't find the private key entry matching the SKI
		// next try the public key entry
		const key = await this.getValue(_getKeyIndex(ski, false));
		if (key instanceof ECDSAKey) {
			return key;
		}

		if (key !== null) {
			const pubKey = KEYUTIL.getKey(key);
			return new ECDSAKey(pubKey);
		}
	}

	async putKey(key) {
		const idx = _getKeyIndex(key.getSKI(), key.isPrivate());
		const pem = key.toBytes();
		await this.setValue(idx, pem);
		return key;
	}
};

function _getKeyIndex(ski, isPrivateKey) {
	if (isPrivateKey) {
		return ski + '-priv';
	} else {
		return ski + '-pub';
	}
}

module.exports = CryptoKeyStore;
