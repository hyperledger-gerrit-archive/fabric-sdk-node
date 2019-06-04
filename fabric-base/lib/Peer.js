/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';
const TYPE = 'Peer';

const {Utils: utils} = require('fabric-common');
const Remote = require('./Remote');
const fabprotos = require('fabric-protos');
const util = require('util');

const logger = utils.getLogger(TYPE);
const checkParameter = require('./Utils.js').checkParameter;

/**
 * The Peer class represents a peer in the target blockchain network.
 * The application can send endorsement proposals, and query requests through this
 * class.
 *
 * @class
 * @extends Remote
 */
class Peer extends Remote {

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
	 * @param {string} mspid - The mspid (organization) of this peer
	 * @returns {Peer} The Peer instance.
	 */
	constructor(name = checkParameter('name'), client = checkParameter('client'), mspid) {
		const method = `constructor[${name}]`;
		logger.debug('%s - start ', method);
		super(name, client);
		this.mspid = mspid;
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
		logger.debug('%s - start ', method);

		if (this.endorserService) {
			logger.error('%s - endorser service exist for this peer %s', method, this.name);
			throw Error(`This peer ${this.name} is connected`);
		}

		this.endpoint = endpoint;
		this.options = endpoint.options;
		Object.assign(this.options, options); // merge options

		if (!this.endorserService) {
			logger.debug('%s - endorser service does not exist, will create service for this peer %s', method, this.name);
			this.endorserService = new fabprotos.protos.Endorser(this.endpoint.addr, this.endpoint.creds, this.options);
		}
		await this.waitForReady(this.endorserService);
		logger.debug('%s - completed the waitForReady for this peer %s', method, this.name);
	}

	/**
	 * Check the connection status
	 */
	async checkConnection() {
		const method = `checkConnection[${this.name}]`;
		logger.debug('%s - start ', method);

		if (this.connected) {
			try {
				await this.waitForReady(this.endorserService);
				return true;
			} catch (error) {
				logger.error('Peer %s Connection failed :: %s', this.endpoint.url, error);
			}
		}

		return false;
	}

	/**
	 * disconnect the service connection.
	 */
	disconnect() {
		const method = `disconnect[${this.name}]`;
		logger.debug('%s - start ', method);

		if (this.endorserService) {
			logger.debug('%s - closing peer endorser connection %s', method, this.endpoint.addr);
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
		logger.debug('%s - Start ----%s %s', method, this.name, this.endpoint.url);
		const self = this;

		if (this.connected === false) {
			throw Error(`Endorser Client ${this.name} ${this.endpoint.url} is not connected`);
		}

		let rto = self.options['request-timeout'];
		if (typeof timeout === 'number') {
			rto = timeout;
		}

		return new Promise((resolve, reject) => {
			const send_timeout = setTimeout(() => {
				clearTimeout(send_timeout);
				logger.error('%s - %s timed out after:%s', method, self.name, rto);
				return reject(new Error('REQUEST_TIMEOUT'));
			}, rto);

			self.endorserService.processProposal(signedEnvelope, (err, proposalResponse) => {
				clearTimeout(send_timeout);
				if (err) {
					logger.debug('%s - Received proposal response from: %s status: %s', method, self._url, err);
					if (err instanceof Error) {
						reject(err);
					} else {
						reject(new Error(err));
					}
				} else {
					if (proposalResponse) {
						logger.debug('%s - Received proposal response from peer "%s": status - %s', method, self._url, (proposalResponse.response && proposalResponse.response.status) ? proposalResponse.response.status : 'undefined');
						// 400 is the error threshold level, anything below that the endorser will endorse it.
						if (proposalResponse.response && proposalResponse.response.status < 400) {
							proposalResponse.connection = self.getCharacteristics();
							resolve(proposalResponse);
						} else if (proposalResponse.response && proposalResponse.response.message) {
							const error = Object.assign(new Error(proposalResponse.response.message), proposalResponse.response);
							error.connection = self.getCharacteristics();
							error.isProposalResponse = true;
							reject(error);
						} else {
							const return_error = new Error(util.format('GRPC service failed to get a proper response from the peer "%s".', self._url));
							return_error.connection = self.getCharacteristics();
							logger.error('%s - rejecting with:%s', method, return_error);
							reject(return_error);
						}
					} else {
						const return_error = new Error(util.format('GRPC service got a null or undefined response from the peer "%s".', self._url));
						return_error.connection = self.getCharacteristics();
						logger.error('%s - rejecting with:%s', method, return_error);
						reject(return_error);
					}
				}
			});
		});
	}
}

module.exports = Peer;
