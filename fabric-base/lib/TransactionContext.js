/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';
const TYPE = 'TransactionContext';

const {HashPrimitives, Utils, User} = require('fabric-common');


const logger = Utils.getLogger(TYPE);
const checkParameter = require('./Utils.js').checkParameter;


/**
 * @classdesc
 * This class represents a TransactionContext, the user identity.
 * This object will be used to provide the identity on outbound
 * requests to the fabric network.
 * <br><br>
 * see the tutorial {@tutorial proposal}
 * <br><br>
 *
 * @class
 */
const TransactionContext = class {

	/**
	 * Construct a ClientContext object.
	 *
	 * @param {User} user - The user identity instance
	 * @returns {ClientContext} The ClientContext instance.
	 */
	constructor(user) {
		this.type = TYPE;

		if (!user) {
			throw Error('Missing user parameter');
		} else if ((User.isInstance(user))) {
			logger.debug('const user:%s', user.getName());
		} else {
			throw Error('Invalid user instance');
		}
		this.user = user;
		this.options = {};
	}

	/**
	 * Add options to be used when using this transaction context on a request
	 * @param {string} name - The name of the attribute to add to the options list
	 * @param {any} value - The value of the attribute
	 */
	addOption(name = checkParameter('name'), value = checkParameter('value')) {
		this.options[name] = value;
	}

	/**
	 * Resets the transaction ID and nonce values
	 */
	calculateTxId() {
		let signer = this.user.getSigningIdentity();
		this.nonce = Utils.getNonce(); // nonce is in bytes
		const creator_bytes = signer.serialize();// same as signatureHeader.Creator
		const trans_bytes = Buffer.concat([this.nonce, creator_bytes]);
		const trans_hash = HashPrimitives.SHA2_256(trans_bytes);
		this.txId = Buffer.from(trans_hash).toString();
		logger.debug('calculateTxId - txId:%s', this.txId);
	}

	/**
	 * return a printable representation of this object
	 */
	toString() {
		return 'TransactionContext: {' +
			'user: ' + this.user.getName() +
			'txId:' + this.txId +
			'nonce:' + this.nonce +
		'}';
	}

};

module.exports = TransactionContext;
module.exports.TYPE = TYPE;
