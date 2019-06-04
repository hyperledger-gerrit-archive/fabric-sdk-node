/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';
const TYPE = 'ServiceAction';

const {Utils: utils} = require('fabric-common');
const logger = utils.getLogger(TYPE);

const {checkParameter} = require('./Utils.js');
const IdentityContext = require('./IdentityContext.js');

/**
 * @classdesc
 * This is an abstract class that represents an action on a fabric service.
 *
 * @class
 */
const ServiceAction = class {

	/**
	 * Construct a ServiceAction abstract object.
	 *
	 * @returns {ServiceAction} The ServiceAction instance.
	 */
	constructor() {
		logger.debug(`${TYPE}.constructor - start `);
	}

	_reset() {
		this._action = {};
		this._payload = null;
		this._signature = null;
	}

	/**
	 * Use this method must be implemented to build an action that will
	 * require a signature and then be sent to the service.
	 */
	build() {
		throw Error('build() method must be implemented');
	}


	/**
	 * Use this method with an IdentityContext that contains a User that has
	 * a Signing Identity.
	 * OR
	 * Use this method with a byte[] to set the signature
	 * when the application has done the signed externally.
	 * Use the results of the build as the bytes that will be signed.
	 * @param {IdentityContext | byte[]} param - When 'param' is a
	 * {@link IdentityContext} the signing identity of the user
	 *  will sign the current build bytes.
	 *  When the 'param' is a byte[], the bytes will be used as the final
	 *  commit signature.
	 */
	sign(param = checkParameter('param')) {
		const method = `sign[${this.chaincodeName}][${this.type}]`;
		logger.debug('%s - start', method);
		if (!this._payload) {
			throw Error('The send payload has not been built');
		}
		if (param.type === IdentityContext.TYPE) {
			this._signature = Buffer.from(param.sign(this._payload));
		} else if (param instanceof Buffer) {
			this._signature = param;
		} else {
			throw Error('param is an unknown signer or signature type');
		}

		return this;
	}

	/**
	 * implementing class must implement
	 */
	send() {
		throw Error('Implement the send()');
	}

	/**
	 * return a signed envelope from the signature and the payload as bytes
	 *
	 * This method is not intended for use by an application. It will be used
	 * by the send method of the super class.
	 * @returns {object} An object with the signature and the payload bytes
	 */
	getSignedEnvelope() {
		const method = `getSignedEnvelope[${this.chaincodeName}]`;
		logger.debug('%s - start', method);
		if (!this._payload) {
			throw Error('The send payload has not been built');
		}
		if (!this._signature) {
			throw Error('The send payload has not been signed');
		}

		const signed_envelope = {signature: this._signature, payload: this._payload.toBuffer()};

		return signed_envelope;
	}


	/**
	 * implementing class must implement
	 */
	toString() {
		throw Error('Implement the toString()');
	}
};

module.exports = ServiceAction;
