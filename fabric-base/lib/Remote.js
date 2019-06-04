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

	waitForReady(client = checkparameter('client')) {
		const method = 'waitForReady';
		logger.debug('%s - start %s - %s', method, this.name, this.endpoint.url);
		const self = this;

		return new Promise((resolve, reject) => {
			logger.debug('%s - promise running %s - %s', method, self.name, self.endpoint.url);
			self.connected = false;
			const timeout = new Date().getTime() + self.options['grpc-wait-for-ready-timeout'];

			client.waitForReady(timeout, (err) => {
				if (err) {
					if (err.message) {
						err.message = err.message + ' on ' + self.toString();
					}
					err.connectFailed = true;
					logger.error(err);
					logger.debug('%s - Failed to connect to remote gRPC server %s url:%s', method, self.name, self.endpoint.url);
					reject(err);
				} else {
					self.connected = true;
					logger.debug('%s - Successfully connected to remote gRPC server %s url:%s', method, self.name, self.endpoint.url);
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

}

module.exports = Remote;