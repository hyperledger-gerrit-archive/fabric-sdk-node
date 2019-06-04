/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';
const TYPE = 'Discoverer';

const {Utils: utils} = require('fabric-common');
const ServiceEndpoint = require('./ServiceEndpoint');
const fabprotos = require('fabric-protos');

const logger = utils.getLogger(TYPE);
const {checkParameter} = require('./Utils.js');

/**
 * The Discoverer class represents a peer's discovery service in the blockchain network
 *
 * @class
 * @extends ServiceEndpoint
 */
class Discoverer extends ServiceEndpoint {

	/**
	 * Construct a Discoverer object with the name.
	 *
	 * @param {string} name - The name of this peer
	 * @param {Client} client - The client instance
	 * @param {string} [mspid] - The mspid (organization) of this peer
	 * @returns {Discoverer} The Discoverer instance.
	 */
	constructor(name = checkParameter('name'), client = checkParameter('client'), mspid) {
		logger.debug(`${TYPE}.constructor[${name}] - start `);
		super(name, client, mspid);

		this.type = TYPE;
		this.discoveryService = null;
	}

	/**
	 * Connects to a Peer with the given url and opts.
	 * If a connection exist it will be closed and replaced by
	 * a new connection using the options provided.
	 *
	 * @param {Endpoint} endpoint - Service connection options including the url.
	 * @param {ConnectionOpts} options - Any specific options for this instance
	 *  of the connection to the peer. These will override options from the
	 *  endpoint service connection options.
	 */
	async connect(endpoint = checkParameter('endpoint'), options = {}) {
		const method = `connect[${this.name}]`;
		logger.debug(`${method} - start`);

		if (this.discoveryService) {
			logger.error('%s - discovery service exist for this peer %s', method, this.name);
			throw Error(`This Discoverer ${this.name} is connected`);
		}

		this.endpoint = endpoint;
		this.options = endpoint.options;
		Object.assign(this.options, options); // merge options

		logger.debug(`${method} - create discovery service for ${this.name}`);
		this.discoveryService = new fabprotos.discovery.Discovery(this.endpoint.addr, this.endpoint.creds, this.options);

		await this.waitForReady(this.discoveryService);
	}

	/**
	 * Check the connection status
	 */
	async checkConnection() {
		logger.debug(`checkConnection[${this.name}] - start `);

		if (this.connected) {
			try {
				await this.waitForReady(this.discoveryService);
			} catch (error) {
				logger.error(`Discoverer ${this.endpoint.url} Connection failed :: ${error}`);
			}
		}

		return this.connected;
	}
	

	/**
	 * disconnect the service connection.
	 */
	disconnect() {
		const method = `disconnect[${this.name}]`;
		logger.debug(`${method} - start `);

		if (this.endorserService) {
			logger.debug(`${method} - closing peer endorser connection ${this.endpoint.addr}`);
			this.endorserService.close();
			this.endorserService = null;
		}
	}

	/**
	 * Send an discovery request to this peer.
	 *
	 *  [Proposal]{@link https://github.com/hyperledger/fabric/blob/release-1.2/protos/discovery/protocol.proto}
	 * @param signedEnvelope
	 * @param {Number} timeout - A number indicating milliseconds to wait on the
	 *  response before rejecting the promise with a timeout error. This
	 *  overrides the default timeout of the Peer instance and the global
	 *  timeout in the config settings.
	 * @returns {Promise} A Promise for a {@link DiscoveryResponse}
	 */
	sendDiscovery(signedEnvelope = checkParameter('signedEnvelope'), timeout) {
		const method = `sendDiscovery[${this.name}]`;
		logger.debug(`${method} - start ----${this.name} ${this.endpoint.url}`);

		if (this.connected === false) {
			throw Error(`Discovery Client ${this.name} ${this.endpoint.url} is not connected`);
		}

		let rto = this.options['request-timeout'];
		if (typeof timeout === 'number') {
			rto = timeout;
		}

		return new Promise((resolve, reject) => {
			const send_timeout = setTimeout(() => {
				clearTimeout(send_timeout);
				logger.error(`${method} - timed out after:${rto}`);
				return reject(new Error('REQUEST_TIMEOUT'));
			}, rto);

			this.discoveryService.discover(signedEnvelope, (err, response) => {
				clearTimeout(send_timeout);
				if (err) {
					logger.debug(`${method} - Received discovery response from: ${this.endpoint.url} status: ${err}`);
					if (err instanceof Error) {
						err.peer = this.getCharacteristics();
						reject(err);
					} else {
						const return_error = new Error(err);
						return_error.connection = this.getCharacteristics();
						reject(return_error);
					}
				} else {
					if (response) {
						logger.debug(`${method} - Received discovery response from peer "${this.endpoint.url}"`);
						response.connection = this.getCharacteristics();
						resolve(response);
					} else {
						const return_error = new Error(`GRPC service failed to get a proper response from the peer ${this.endpoint.url}.`);
						return_error.connection = this.getCharacteristics();
						logger.error(`${method} - rejecting with:${return_error}`);
						reject(return_error);
					}
				}
			});
		});
	}

}

module.exports = Discoverer;
