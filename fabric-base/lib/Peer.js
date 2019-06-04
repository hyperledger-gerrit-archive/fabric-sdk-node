/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';
const TYPE = 'Peer';

const {Utils: utils} = require('fabric-common');
const ServiceEndpoint = require('./ServiceEndpoint');
const fabprotos = require('fabric-protos');

const logger = utils.getLogger(TYPE);
const {checkParameter} = require('./Utils.js');

/**
 * The Peer class represents a peer in the target blockchain network.
 * The application can send endorsement proposals, and query requests through this
 * class.
 *
 * @class
 * @extends ServiceEndpoint
 */
class Peer extends ServiceEndpoint {

	/**
	 * Construct a Peer object with the name. A peer object encapsulates the
	 * properties of an endorsing peer and the interactions with it
	 * via the grpc service API. Peer objects are used by the {@link Client} objects to
	 * send channel-agnostic requests such as installing chaincode, querying peers for
	 * installed chaincodes, etc. They are also used by the {@link Channel} objects to
	 * send channel-aware requests such as instantiating chaincodes, and invoking
	 * transactions.
	 * Use the connect method with options to establish a
	 * connection with the fabric network endpoint.
	 *
	 * @param {string} name - The name of this peer
	 * @param {Client} client - The client instance
	 * @param {string} [mspid] - The mspid (organization) of this peer
	 * @returns {Peer} The Peer instance.
	 */
	constructor(name = checkParameter('name'), client = checkParameter('client'), mspid) {
		logger.debug(`${TYPE}.constructor[${name}] - start `);
		super(name, client, mspid);

		this.type = TYPE;
		this.endorserService = null;
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
		logger.debug(`${method} - start `);

		if (this.endorserService) {
			logger.error(`${method} - endorser service exist for this peer ${this.name}`);
			throw Error(`This peer ${this.name} is connected`);
		}

		this.endpoint = endpoint;
		this.options = Object.assign({}, endpoint.options, options);

		logger.debug(`${method} - endorser service does not exist, will create service for this peer ${this.name}`);
		this.endorserService = new fabprotos.protos.Endorser(this.endpoint.addr, this.endpoint.creds, this.options);
		await this.waitForReady(this.endorserService);
		logger.debug(`${method} - completed the waitForReady for this peer ${this.name}`);
	}

	/**
	 * Check the connection status
	 */
	async checkConnection() {
		logger.debug(`checkConnection[${this.name}] - start `);

		if (this.connected) {
			try {
				await this.waitForReady(this.endorserService);
			} catch (error) {
				logger.error(`Peer ${this.endpoint.url} Connection failed :: ${error}`);
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
	 * Send an endorsement proposal to an endorser. This is used to call an
	 * endorsing peer to execute a chaincode to process a transaction proposal,
	 * or runs queries.
	 *
	 * @param {Envelope} signedEnvelope - A signed proposal envelope that
	 *  has been signed
	 * @param {Number} timeout - A number indicating milliseconds to wait on the
	 *  response before rejecting the promise with a timeout error. This
	 *  overrides the request-timeout config connection setting of this instance.
	 * @returns {Promise} A Promise for a {@link ProposalResponse}
	 */
	sendProposal(signedEnvelope = checkParameter('signedEnvelope'), timeout) {
		const method = `sendProposal[${this.name}]`;
		logger.debug(`${method} - Start ----${this.name} ${this.endpoint.url}`);

		if (this.connected === false) {
			throw Error(`Endorser Client ${this.name} ${this.endpoint.url} is not connected`);
		}

		let rto = this.options['request-timeout'];
		if (typeof timeout === 'number') {
			rto = timeout;
		}

		return new Promise((resolve, reject) => {
			const send_timeout = setTimeout(() => {
				clearTimeout(send_timeout);
				logger.error(`${method} - ${this.name} timed out after:${rto}`);
				return reject(new Error('REQUEST_TIMEOUT'));
			}, rto);

			this.endorserService.processProposal(signedEnvelope, (err, proposalResponse) => {
				clearTimeout(send_timeout);
				if (err) {
					logger.debug(`${method} - Received proposal response from: ${this._url} status: ${err}`);
					if (err instanceof Error) {
						reject(err);
					} else {
						reject(new Error(err));
					}
				} else {
					if (proposalResponse) {
						logger.debug(`${method} - Received proposal response from peer "${this._url}": status - ${proposalResponse.response && proposalResponse.response.status}`);
						// 400 is the error threshold level, anything below that the endorser will endorse it.
						if (proposalResponse.response && proposalResponse.response.status < 400) {
							proposalResponse.connection = this.getCharacteristics();
							resolve(proposalResponse);
						} else if (proposalResponse.response && proposalResponse.response.message) {
							const error = Object.assign(new Error(proposalResponse.response.message), proposalResponse.response);
							error.connection = this.getCharacteristics();
							error.isProposalResponse = true;
							reject(error);
						} else {
							const return_error = new Error(`GRPC service failed to get a proper response from the peer "${this._url}".`);
							return_error.connection = this.getCharacteristics();
							logger.error(`${method} - rejecting with:${return_error}`);
							reject(return_error);
						}
					} else {
						const return_error = new Error(`GRPC service got a null or undefined response from the peer "${this._url}".`);
						return_error.connection = this.getCharacteristics();
						logger.error(`${method} - rejecting with:${return_error}`);
						reject(return_error);
					}
				}
			});
		});
	}
}

module.exports = Peer;
