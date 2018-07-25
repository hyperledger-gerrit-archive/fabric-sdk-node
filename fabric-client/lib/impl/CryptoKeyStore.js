/*
 Copyright 2016, 2018 IBM All Rights Reserved.

 SPDX-License-Identifier: Apache-2.0

*/

'use strict';

const jsrsasign = require('jsrsasign');
const KEYUTIL = jsrsasign.KEYUTIL;

const {KeyValueStore} = require('../api');
const ECDSAKey = require('./ecdsa/key.js');

/**
 * A CryptoKeyStore uses an underlying instance of {@link module:api.KeyValueStore} implementation
 * to persist crypto keys.
 *
 * @param {function} KVSImplClass Optional. The built-in key store saves private keys.
 *    The key store may be backed by different {@link KeyValueStore} implementations.
 *    If specified, the value of the argument must point to a module implementing the
 *    KeyValueStore interface.
 * @param {Object} opts Implementation-specific option object used in the constructor
 *
 * @class
 */
class CryptoKeyStore extends KeyValueStore {
	constructor(KVSInstance) {
		if (!(KVSInstance instanceof KeyValueStore)) {
			throw Error(`invalid wrapped instance, should be instance of 'KeyValueStore', but got ${typeof KVSInstance}`);
		}
		super();
		this._store = KVSInstance;
	}

	async init(){
		return this._store.init();
	}
	async getValue(name) {
		return this._store.getValue(name);
	}

	async setValue(name, value) {
		return this._store.setValue(name, value);
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
}

const _getKeyIndex = (ski, isPrivateKey) => {
	if (isPrivateKey)
		return ski + '-priv';
	else
		return ski + '-pub';
};

module.exports = CryptoKeyStore;
