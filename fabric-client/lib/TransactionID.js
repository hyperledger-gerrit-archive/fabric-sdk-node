/*
 Copyright 2017 IBM All Rights Reserved.

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

var sdkUtils = require('./utils.js');
var logger = sdkUtils.getLogger('TransactionID.js');
var User = require('./User.js');
var hashPrimitives = require('./hash.js');


/**
 * The class representing the transaction identifier. Provides for
 * automatically creating the `nonce` value when an instance of this
 * object is created.
 *
 * @class
 */
var TransactionID = class {

	/**
	 * Builds a new tranaction Id based on a user's certificate and an automatically
	 * generates a nonce value.
	 * @param {User} signer - An instance of {@link Identity} that provides an unique
	 *                 base for this transaction id.
	 */
	constructor(signer, admin) {
		logger.debug('const - start');
		if (typeof signer === 'undefined' || signer === null) {
			throw new Error('Missing signer parameter');
		}

		this._nonce = sdkUtils.getNonce(); //nonce is in bytes
		let creator_bytes = signer.serialize();//same as signatureHeader.Creator
		let trans_bytes = Buffer.concat([this._nonce, creator_bytes]);
		let trans_hash = hashPrimitives.sha2_256(trans_bytes);
		this._transaction_id = Buffer.from(trans_hash).toString();
		logger.debug('const - transaction_id %s',this._transaction_id);

		this._admin = admin;
	}

	/**
	 * The transaction ID
	 */
	getTransactionID() {
		return this._transaction_id;
	}

	/**
	 * The nonce value
	 */
	getNonce() {
		return this._nonce;
	}

	/**
	 * indicates if this transactionID was generated for an admin
	 */
	isAdmin() {
		if(this._admin) {
			return true;
		} else {
			return false;
		}
	}
};

module.exports = TransactionID;
