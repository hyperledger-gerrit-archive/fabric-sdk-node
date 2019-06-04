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
		this.name = user.getName();
		this.transactionId = null;
		this.nonce = null;
	}

	/**
	 * create a new transaction ID value
	 */
	calculateTransactionId() {
		const method = 'calculateTransactionId';
		logger.debug('%s - start', method);
		this.nonce = Utils.getNonce();
		const creator_bytes = this.serializeIdentity();// same as signatureHeader.Creator
		const trans_bytes = Buffer.concat([this.nonce, creator_bytes]);
		const trans_hash = HashPrimitives.SHA2_256(trans_bytes);
		this.transactionId = Buffer.from(trans_hash).toString();
		logger.debug('%s - %s', method, this.transactionId);

		return this;
	}

	/**
	 * Get the client certificate hash
	 * @returns {byte[]} The hash of the client certificate
	 */
	getClientCertHash() {
		const method = 'getClientCertHash';
		logger.debug('%s - start', method);
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
		const method = 'serializeIdentity';
		logger.debug('%s - start', method);

		return this.user.getIdentity().serialize();
	}

	/**
	 * Sign the bytes provided
	 * @param {byte[]} payload - The payload bytes that require a signature
	 * @return  {byte[]} - The signature in bytes
	 */
	sign(payload = checkParameter('payload')) {
		const method = 'sign';
		logger.debug('%s - start', method);
		const signer = this.user.getSigningIdentity();
		const signature = Buffer.from(signer.sign(payload));

		return signature;
	}

	/**
	 * return a printable representation of this object
	 */
	toString() {
		return `IdentityContext: { user: ${this.user.getName()}, transactionId: ${this.transactionId}, nonce:${this.nonce}}`;
	}

};

module.exports = IdentityContext;
module.exports.TYPE = TYPE;
