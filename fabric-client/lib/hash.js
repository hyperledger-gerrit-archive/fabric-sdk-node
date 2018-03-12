/**
 * Copyright 2016 IBM All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/**
 * Implement hash primitives.
 */
const sjcl = require('sjcl');

const jsSHA3 = require('js-sha3');
const sha3_256 = jsSHA3.sha3_256;
const sha3_384 = jsSHA3.sha3_384;
const shake_256 = jsSHA3.shake_256;
const crypto = require('crypto');
const utils = require('./utils');

const { bitsToBytes } = utils;
class hash_sha2_256 {
	constructor(hash) {
		this.blockSize = 512;
		if (hash) {
			this._hash = hash._hash;
		}
		else {
			this.reset();
		}
	}
	hash(data) {
		return (new sjcl.hash.sha256()).update(data).finalize();
	}
	reset() {
		this._hash = new sjcl.hash.sha256();
		this._hash.reset();
	}
	update(data) {
		this._hash.update(data);
		return this;
	}
	finalize() {
		const hash = this._hash.finalize();
		this.reset();
		return hash;
	}
}



class hash_sha3_256 {
	constructor(hash) {
		this.blockSize = 1088;
		if (hash) {
			this._hash = hash._hash;
		}
		else {
			this.reset();
		}
	}
	hash(data) {
		const hashBits = sjcl.codec.hex.toBits(sha3_256(bitsToBytes(data)));
		return hashBits;
	}
	reset() {
		this._hash = sha3_256.create();
	}
	update(data) {
		this._hash.update(bitsToBytes(data));
		return this;
	}
	finalize() {
		const hash = this._hash.hex();
		const hashBits = sjcl.codec.hex.toBits(hash);
		this.reset();
		return hashBits;
	}

}


class hash_sha3_384 {
	constructor(hash) {
		this.blockSize = 832;
		if (hash) {
			this._hash = hash._hash;
		}
		else {
			this.reset();
		}
	}
	hash(data) {
		return sjcl.codec.hex.toBits(sha3_384(bitsToBytes(data)));
	}
	reset() {
		this._hash = sha3_384.create();
	}
	update(data) {
		this._hash.update(bitsToBytes(data));
		return this;
	}
	finalize() {
		const hash = this._hash.hex();
		const hashBits = sjcl.codec.hex.toBits(hash);
		this.reset();
		return hashBits;
	}
}

exports.hash_sha3_256 = hash_sha3_256;
exports.hash_sha3_384 = hash_sha3_384;
exports.hash_sha2_256 = hash_sha2_256;
exports.sha2_256 = function (data) {
	const sha256 = crypto.createHash('sha256');
	return sha256.update(data).digest('hex');
};
exports.sha3_256 = sha3_256;
exports.sha2_384 = function (data) {
	const sha384 = crypto.createHash('sha384');
	return sha384.update(data).digest('hex');
};
exports.sha3_384 = sha3_384;
exports.shake_256 = shake_256;
