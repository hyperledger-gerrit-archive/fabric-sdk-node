/*
 Copyright 2016, 2018 IBM All Rights Reserved.

 SPDX-License-Identifier: Apache-2.0

*/

'use strict';
const {KeyValueStore, Utils: utils} = require('../../');
const jsrsasign = require('jsrsasign');
const KEYUTIL = jsrsasign.KEYUTIL;

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
	 * @param {function} KVSImplClass Optional. The built-in key store saves private keys.
	 *    The key store may be backed by different {@link KeyValueStore} implementations.
	 *    If specified, the value of the argument must point to a module implementing the
	 *    KeyValueStore interface.
	 * @param {Object} opts Implementation-specific option object used in the constructor
 	 */
	constructor(KVSImplClass, opts) {
		logger.debug('constructor', {KVSImplClass: KVSImplClass}, {opts: opts});

		if (arguments.length >= 3) {
			throw new Error('Illegal argument counts, should be included with only KVSImplClass and opts parameters.');
		}

		// Create KeyValueStore instance
		super();

		// Handle the received arguments by length
		switch (arguments.length) {
			case 1:
				if (KVSImplClass instanceof Function) {
					this._superClass = KVSImplClass;
					this._opts = {path: utils.getDefaultKeyStorePath()};
				} else {
					this._superClass = require(utils.getConfigSetting('key-value-store'));
					this._opts = KVSImplClass;
				}
				break;
			case 2:
				this._superClass = KVSImplClass;
				this._opts = opts;
				break;
			default:
				this._superClass = require(utils.getConfigSetting('key-value-store'));
				this._opts = {path: utils.getDefaultKeyStorePath()};
				break;
		}
	}

	async initialize() {
		const superClass = new this._superClass(this._opts);
		await superClass.initialize();
	}

	async getValue(name) {
		const superClass = new this._superClass(this._opts);
		return await superClass.getValue(name);
	}

	async setValue(name, value) {
		const superClass = new this._superClass(this._opts);
		return await superClass.setValue(name, value);
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
