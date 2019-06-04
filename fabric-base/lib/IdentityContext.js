/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';
const TYPE = 'IdentityContext';

const {HashPrimitives, Utils} = require('fabric-common');

const logger = Utils.getLogger(TYPE);
const {checkParameter} = require('./Utils.js');


/**
 * @classdesc
 * This class represents a IdentityContext, the user identity.
 * This object will be used to provide the identity on outbound
 * requests to the fabric network.
 * This object will be the source of transaction ids that must
 * be based on an identity. The nonce values will be also
 * be calculated and kept here for convenience.
 * <br><br>
 * see the tutorial {@tutorial proposal}
 * <br><br>
 *
 * @class
 */
const IdentityContext = class {

	/**
	 * Construct a IdentityContext object.
	 *
	 * @param {User} user - The user identity instance
	 * @param {Client} client
	 * @returns {IdentityContext} The IdentityContext instance.
	 */
	constructor(user = checkParameter('user'), client = checkParameter('client')) {
		this.type = TYPE;
		this.client = client;
		this.user = user;
		this.options = {};
		this.nonce = null;
		this.transactionId = null;
	}

	/**
	 * Resets the transaction ID and nonce values
	 */
	calculateTxId() {
		this.nonce = Utils.getNonce(); // nonce is in bytes
		const creator_bytes = this.serializeIdentity();// same as signatureHeader.Creator
		const trans_bytes = Buffer.concat([this.nonce, creator_bytes]);
		const trans_hash = HashPrimitives.SHA2_256(trans_bytes);
		this.transactionId = Buffer.from(trans_hash).toString();
		logger.debug(`calculateTxId - txId:${this.transactionId}`);

		return this;
	}

	/**
	 * Get the client certificate hash
	 * @returns {byte[]} The hash of the client certificate
	 */
	getClientCertHash() {
		let hash = this.client.getClientCertHash();
		if (!hash) {
			hash = this.client.getClientCertHash(this.user);
		}

		return hash;
	}

	/**
	 * Get the protobuf serialized identity of this user
	 * @returns {byte[]} serialized identity in bytes
	 */
	serializeIdentity() {
		// This could a place where we will handle the different
		// user types
		return this.user.getIdentity().serialize();
	}

	/**
	 * return a printable representation of this object
	 */
	toString() {
		return `IdentityContext: 
			{ user: ${this.user.getName()}, transactionId: ${this.transactionId}, nonce:${this.nonce}}`;
	}

};

module.exports = IdentityContext;
module.exports.TYPE = TYPE;
