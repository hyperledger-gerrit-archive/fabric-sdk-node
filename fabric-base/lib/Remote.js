/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */


'use strict';
const TYPE = 'Remote';

const {Utils: utils} = require('fabric-common');
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

	waitForReady(client) {
		const self = this;
		self.connected = false;

		if (!client) {
			throw new Error('Missing required gRPC client');
		}
		const timeout = new Date().getTime() + this.options['grpc-wait-for-ready-timeout'];

		return new Promise((resolve, reject) => {
			client.waitForReady(timeout, (err) => {
				if (err) {
					if (err.message) {
						err.message = err.message + ' name:' + self.name + ' url:' + self.endpoint.url;
					}
					err.connectFailed = true;
					logger.error(err);

					return reject(err);
				}

				self.connected = true;
				logger.debug('Successfully connected to remote gRPC server');
				resolve();
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

}

module.exports = Remote;