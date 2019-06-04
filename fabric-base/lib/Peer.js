/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const {Utils: utils} = require('fabric-common');
const Remote = require('./Remote');
const fabprotos = require('fabric-protos');
const util = require('util');

const logger = utils.getLogger('Peer.js');
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
	 * @returns {Peer} The Peer instance.
	 */
	constructor(name = checkParameter('name'), client = checkParameter('client')) {
		logger.debug('const');
		super(name, client);
		this.endorserService = null;
		//this._discoveryClient = null;
	}

	/**
	 * Connects to a Peer with the given url and opts.
	 * If a connection exist it will be closed and replaced by
	 * a new connection using the options provided.
	 *
	 * @param {string} url - The URL with format of "grpc(s)://host:port".
	 * @param {ConnectionOpts} options - The options for the connection to the peer.
	 *  Includes the "url" of the peer.
	 */
	async connect(options) {
		const method = 'connect';
		this.connected = false;
		this.setup(options);
		if (this.endorserService) {
			logger.debug('%s - endorser service exist, will close this peer %s', method, this.name);
			this.close();
		}
		if (!this.endorserService) {
			logger.debug('%s - endorser service does not exist, will create service for this peer %s', method, this.name);
			this.endorserService = new fabprotos.protos.Endorser(this.endpoint.addr, this.endpoint.creds, this.options);
		}
		await this.waitForReady(this.endorserService)
	}

	// move this the discover class
	// _createDiscoveryClient() {
	// 	if (!this._discoveryClient) {
	// 		logger.debug('_createClients - create peer discovery connection ' + this.endpoint.addr);
	// 		this._discoveryClient = new fabprotos.discovery.Discovery(this.endpoint.addr, this.endpoint.creds, this.options);
	// 	}
	// }

	/**
	 * Close the service connection.
	 */
	close() {
		if (this.endorserService) {
			logger.debug('close - closing peer endorser connection ' + this.endpoint.addr);
			this.endorserService.close();
			this.endorserService = null;
		}
		// TODO move this to the discovery class
		// if (this._discoveryClient) {
		// 	logger.debug('close - closing peer discovery connection ' + this.endpoint.addr);
		// 	this._discoveryClient.close();
		// 	this._discoveryClient = null;
		// }
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
	 *  overrides the request_timeout option of this instance.
	 * @returns {Promise} A Promise for a {@link ProposalResponse}
	 */
	async sendProposal(signedEnvelope = checkParameter('signedEnvelope'), timeout) {
		const method = 'sendProposal';
		logger.debug('%s - Start ----%s %s', method, this.name, this.url);
		const self = this;

		if (this.connected === false) {
			throw Error(`Endorser Client ${this.name} ${this.url} is not connected`);
		}

		let rto = self.options.request_timeout;
		if (typeof timeout === 'number') {
			rto = timeout;
		}

		return new Promise((resolve, reject) => {
			const send_timeout = setTimeout(() => {
				clearTimeout(send_timeout);
				logger.error('%s - timed out after:%s', method, rto);
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
							proposalResponse.peer = self.getCharacteristics();
							resolve(proposalResponse);
						} else if (proposalResponse.response && proposalResponse.response.message) {
							const error = Object.assign(new Error(proposalResponse.response.message), proposalResponse.response);
							error.peer = self.getCharacteristics();
							error.isProposalResponse = true;
							reject(error);
						} else {
							const return_error = new Error(util.format('GRPC service failed to get a proper response from the peer "%s".', self._url));
							return_error.peer = self.getCharacteristics();
							logger.error('%s - rejecting with:%s', method, return_error);
							reject(return_error);
						}
					} else {
						const return_error = new Error(util.format('GRPC service got a null or undefined response from the peer "%s".', self._url));
						return_error.peer = self.getCharacteristics();
						logger.error('%s - rejecting with:%s', method, return_error);
						reject(return_error);
					}
				}
			});
		});
	}



	/**
	 * Send an discovery request to this peer.
	 *
	 * @param {SignedRequest} request - A protobuf encoded byte array of type
	 *  [Proposal]{@link https://github.com/hyperledger/fabric/blob/release-1.2/protos/discovery/protocol.proto}
	 * @param {Number} timeout - A number indicating milliseconds to wait on the
	 *  response before rejecting the promise with a timeout error. This
	 *  overrides the default timeout of the Peer instance and the global
	 *  timeout in the config settings.
	 * @returns {Promise} A Promise for a {@link DiscoveryResponse}
	 */
	// sendDiscovery(request, timeout) {
	// 	const method = 'sendDiscovery';
	// 	logger.debug('%s - Start', method);
	// 	const self = this;
	// 	let rto = self._request_timeout;

	// 	if (typeof timeout === 'number') {
	// 		rto = timeout;
	// 	}
	// 	if (!request) {
	// 		return Promise.reject(new Error('Missing request to send to peer discovery service'));
	// 	}

	// 	this._createClients();

	// 	return this.waitForReady(this._discoveryClient).then(() => {
	// 		return new Promise((resolve, reject) => {
	// 			const send_timeout = setTimeout(() => {
	// 				logger.error('%s - timed out after:%s', method, rto);
	// 				return reject(new Error('REQUEST_TIMEOUT'));
	// 			}, rto);

	// 			self._discoveryClient.discover(request, (err, response) => {
	// 				clearTimeout(send_timeout);
	// 				if (err) {
	// 					logger.debug('%s - Received discovery response from: %s status: %s', method, self._url, err);
	// 					if (err instanceof Error) {
	// 						err.peer = self.getCharacteristics();
	// 						reject(err);
	// 					} else {
	// 						const return_error = new Error(err);
	// 						return_error.peer = self.getCharacteristics();
	// 						reject(return_error);
	// 					}
	// 				} else {
	// 					if (response) {
	// 						logger.debug('%s - Received discovery response from peer "%s"', method, self._url);
	// 						response.peer = self.getCharacteristics();
	// 						resolve(response);
	// 					} else {
	// 						const return_error = new Error(util.format('GRPC service failed to get a proper response from the peer "%s".', self._url));
	// 						return_error.peer = self.getCharacteristics();
	// 						logger.error('%s - rejecting with:%s', method, return_error);
	// 						reject(return_error);
	// 					}
	// 				}
	// 			});
	// 		});
	// 	});
	// }

	/**
	 * return a printable representation of this object
	 */
	toString() {
		return 'Peer:{' +
		'name:' + this.name +
		'url:' + this.url +
		'}';
	}

}

module.exports = Peer;
