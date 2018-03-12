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
const { sha3_256, sha3_384, shake_256 } = jsSHA3;
const crypto = require('crypto');

class hashHex_sha2_256 extends sjcl.hash.sha256 {
	finalize() {
		return sjcl.codec.hex.fromBits(super.finalize());
	}
	static hash(data) {
		return (new hashHex_sha2_256()).update(String(data)).finalize();
	}
}
class hashHex_sha3_256 {
	constructor(clonedHash) {
		this.blockSize = 1088;
		if (clonedHash && clonedHash._hash) {
			this._hash = clonedHash._hash;
		}
		else {
			this.reset();
		}
	}
	static hash(data) {
		return sha3_256(String(data));
	}
	reset() {
		this._hash = sha3_256.create();
		return this;
	}
	update(data) {
		this._hash.update(String(data));
		return this;
	}
	finalize() {
		const hash = this._hash.hex();
		this.reset();
		return hash;
	}

}
class hashHex_sha3_384 {
	constructor(clonedHash) {
		this.blockSize = 832;
		if (clonedHash && clonedHash._hash) {
			this._hash = clonedHash._hash;
		}
		else {
			this.reset();
		}
	}
	static hash(data) {
		return sha3_384(String(data));
	}
	reset() {
		this._hash = sha3_384.create();
		return this;
	}
	update(data) {
		this._hash.update(String(data));
		return this;
	}
	finalize() {
		const hash = this._hash.hex();
		this.reset();
		return hash;
	}
}
class hashHex_sha2_384 {
	constructor(clonedHash) {
		if (clonedHash && clonedHash._hash) {
			this._hash = clonedHash._hash;
		}
		else {
			this.reset();
		}
	}
	static hash(data) {
		const sha384 = crypto.createHash('sha384');
		return sha384.update(String(data)).digest('hex');
	}
	reset() {
		this._hash = crypto.createHash('sha384');
		return this;
	}
	update(data) {
		this._hash.update(String(data));
		return this;
	}
	finalize() {
		const hash = this._hash.digest('hex');
		this.reset();
		return hash;
	}
}
exports.hash_sha3_256 = hashHex_sha3_256;
exports.sha3_256 = (data) => {
	return hashHex_sha3_256.hash(data);
};
exports.hash_sha2_256 = hashHex_sha2_256;
exports.sha2_256 = (data) => {
	return hashHex_sha2_256.hash(data);
};
exports.hash_sha3_384 = hashHex_sha3_384;
exports.sha3_384 = (data) => {
	return hashHex_sha3_384.hash(data);
};

exports.hash_sha2_384 = hashHex_sha2_384;
exports.sha2_384 = (data) => {
	return hashHex_sha2_384.hash(data);
};
exports.shake_256 = shake_256;//TODO
