/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */


'use strict';
const TYPE = 'Remote';

const {Utils: utils} = require('fabric-common');
const checkParameter = require('./Utils.js').checkParameter;
const logger = utils.getLogger(TYPE);

/**
 * The Remote class represents a the base class for all remote nodes (Peer, Orderer).
 *
 * @class
 */
class Remote {

	constructor(name, client) {
		this.name = name;
		this.client = client;
		this.connected = false;
		this.endpoint = null;
	}

	waitForReady(client = checkParameter('client')) {
		const method = 'waitForReady';
		logger.debug(`${method} - start ${this.name} - ${this.endpoint.url}`);

		return new Promise((resolve, reject) => {
			logger.debug(`${method} - promise running ${this.name} - ${this.endpoint.url}`);
			this.connected = false;
			const timeout = new Date().getTime() + this.options['grpc-wait-for-ready-timeout'];

			client.waitForReady(timeout, (err) => {
				if (err) {
					if (err.message) {
						err.message = err.message + ' on ' + this.toString();
					}
					err.connectFailed = true;
					logger.error(err);
					logger.error(`${method} - Failed to connect to remote gRPC server ${this.name} url:${this.endpoint.url}`);
					reject(err);
				} else {
					this.connected = true;
					logger.debug(`${method} - Successfully connected to remote gRPC server ${this.name} url:${this.endpoint.url}`);
					resolve();
				}
			});
		});
	}

	/*
	 * Get this remote endpoints characteristics
	 *   It's name, url, and connection options are
	 *   the items that make this instance unique.
	 *   These items may be useful when debugging issues
	 *   or validating responses.
	 */
	getCharacteristics() {
		const characteristics = {};
		characteristics.url = this.endpoint.url;
		characteristics.name = this.name;
		characteristics.options = this.options;
		// remove a private key
		if (characteristics.options.clientKey) {
			delete characteristics.options.clientKey;
		}

		return characteristics;
	}

	/**
	 * Determine whether or not this remote endpoint uses TLS.
	 * @returns {boolean} True if this endpoint uses TLS, false otherwise.
	 */
	isTLS() {
		return this.endpoint.isTLS();
	}

	/**
	 * return a printable representation of this object
	 */
	toString() {
		return `${this.type}:{name: ${this.name}, url:${this.endpoint.url}}`;
	}

}

module.exports = Remote;