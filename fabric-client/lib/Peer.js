/*
 Copyright 2018 MediConCen All Rights Reserved.

 SPDX-License-Identifier: Apache-2.0

*/

'use strict';

const utils = require('./utils.js');
const Remote = require('./Remote');
const ProtoLoader = require('./ProtoLoader');

const _serviceProto = ProtoLoader.load(__dirname + '/protos/peer/peer.proto').protos;
const _discoveryProto = ProtoLoader.load(__dirname + '/protos/discovery/protocol.proto').discovery;

const logger = utils.getLogger('Peer.js');

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
	 * Construct a Peer object with the given url and opts. A peer object
	 * encapsulates the properties of an endorsing peer and the interactions with it
	 * via the grpc service API. Peer objects are used by the {@link Client} objects to
	 * send channel-agnostic requests such as installing chaincode, querying peers for
	 * installed chaincodes, etc. They are also used by the {@link Channel} objects to
	 * send channel-aware requests such as instantiating chaincodes, and invoking
	 * transactions.
	 *
	 * @param {string} url - The URL with format of "grpc(s)://host:port".
	 * @param {ConnectionOpts} opts - The options for the connection to the peer.
	 * @returns {Peer} The Peer instance.
	 */
	constructor(url, opts) {
		super(url, opts);

		logger.debug('Peer.const - url: %s timeout: %s name:%s', url, this._request_timeout, this.getName());
		this._endorserClient = null;
		this._discoveryClient = null;
		this._createClients();
	}

	_createClients() {
		if (!this._endorserClient) {
			logger.debug('_createClients - create peer endorser connection ' + this._endpoint.addr);
			this._endorserClient = new _serviceProto.Endorser(this._endpoint.addr, this._endpoint.creds, this._options);
		}
		if (!this._discoveryClient) {
			logger.debug('_createClients - create peer discovery connection ' + this._endpoint.addr);
			this._discoveryClient = new _discoveryProto.Discovery(this._endpoint.addr, this._endpoint.creds, this._options);
		}
	}

	/**
	 * Close the service connections.
	 */
	close() {
		if (this._endorserClient) {
			logger.debug('close - closing peer endorser connection ' + this._endpoint.addr);
			this._endorserClient.close();
			this._endorserClient = null;
		}
		if (this._discoveryClient) {
			logger.debug('close - closing peer discovery connection ' + this._endpoint.addr);
			this._discoveryClient.close();
			this._discoveryClient = null;
		}
	}

	/**
	 * Send an endorsement proposal to an endorser. This is used to call an
	 * endorsing peer to execute a chaincode to process a transaction proposal,
	 * or runs queries.
	 *
	 * @param {Proposal} proposal - A protobuf encoded byte array of type
	 *        [Proposal]{@link https://github.com/hyperledger/fabric/blob/release-1.2/protos/peer/proposal.proto}
	 * @param {Number} timeout - A number indicating milliseconds to wait on the
	 *        response before rejecting the promise with a timeout error. This
	 *        overrides the default timeout of the Peer instance and the global
	 *        timeout in the config settings.
	 * @returns {Promise} A Promise for a {@link ProposalResponse}
	 */
	async sendProposal(proposal, timeout) {
		const method = 'sendProposal';
		logger.debug('%s - Start ----%s %s', method, this.getName(), this.getUrl());
		let rto = this._request_timeout;

		if (typeof timeout === 'number') {
			rto = timeout;
		}
		if (!proposal) {
			throw new Error('Missing proposal to send to peer');
		}

		this._createClients();

		await this.waitForReady(this._endorserClient);

		return new Promise((resolve, reject) => {
			const send_timeout = setTimeout(() => {
				clearTimeout(send_timeout);
				logger.error('%s - timed out after:%s', method, rto);
				return reject(new Error('REQUEST_TIMEOUT'));
			}, rto);

			this._endorserClient.processProposal(proposal, (err, proposalResponse) => {
				clearTimeout(send_timeout);
				if (err) {
					logger.debug('%s - Received proposal response from: %s status: %s', method, this._url, err);
					if (err instanceof Error) {
						reject(err);
					} else {
						reject(new Error(err));
					}
				} else {
					if (proposalResponse) {
						logger.debug('%s - Received proposal response from peer "%s": status - %s', method, this._url, (proposalResponse.response && proposalResponse.response.status) ? proposalResponse.response.status : 'undefined');
						// 400 is the error threshold level, anything below that the endorser will endorse it.
						if (proposalResponse.response && proposalResponse.response.status < 400) {
							proposalResponse.peer = this.getCharacteristics();
							resolve(proposalResponse);
						} else if (proposalResponse.response && proposalResponse.response.message) {
							const error = Object.assign(new Error(proposalResponse.response.message), proposalResponse.response);
							error.peer = this.getCharacteristics();
							error.isProposalResponse = true;
							reject(error);
						} else {
							const return_error = new Error(`GRPC client failed to get a proper response from the peer "${this._url}".`);
							return_error.peer = this.getCharacteristics();
							logger.error('%s - rejecting with:%s', method, return_error);
							reject(return_error);
						}
					} else {
						const return_error = new Error(`GRPC client got a null or undefined response from the peer "${this._url}".`);
						return_error.peer = this.getCharacteristics();
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
	 *        [Proposal]{@link https://github.com/hyperledger/fabric/blob/release-1.2/protos/discovery/protocol.proto}
	 * @param {Number} timeout - A number indicating milliseconds to wait on the
	 *        response before rejecting the promise with a timeout error. This
	 *        overrides the default timeout of the Peer instance and the global
	 *        timeout in the config settings.
	 * @returns {Promise} A Promise for a {@link DiscoveryResponse}
	 */
	async sendDiscovery(request, timeout) {
		const method = 'sendDiscovery';
		logger.debug('%s - Start', method);
		let rto = this._request_timeout;

		if (typeof timeout === 'number') {
			rto = timeout;
		}
		if (!request) {
			throw new Error('Missing request to send to peer discovery service');
		}

		this._createClients();
		await this.waitForReady(this._discoveryClient);
		return new Promise((resolve, reject) => {
			const send_timeout = setTimeout(() => {
				logger.error('%s - timed out after:%s', method, rto);
				return reject(new Error('REQUEST_TIMEOUT'));
			}, rto);

			this._discoveryClient.discover(request, (err, response) => {
				clearTimeout(send_timeout);
				if (err) {
					logger.debug('%s - Received discovery response from: %s status: %s', method, this._url, err);
					if (err instanceof Error) {
						err.peer = this.getCharacteristics();
						reject(err);
					} else {
						const return_error = new Error(err);
						return_error.peer = this.getCharacteristics();
						reject(return_error);
					}
				} else {
					if (response) {
						logger.debug('%s - Received discovery response from peer "%s"', method, this._url);
						response.peer = this.getCharacteristics();
						resolve(response);
					} else {
						const return_error = new Error(`GRPC client failed to get a proper response from the peer "${this._url}".`);
						return_error.peer = this.getCharacteristics();
						logger.error('%s - rejecting with:%s', method, return_error);
						reject(return_error);
					}
				}
			});
		});
	}

	/**
	 * return a printable representation of this object
	 */
	toString() {
		return `Peer:{url:${this._url}}`;
	}

	/**
	 * basic health check (by discoveryClient)
	 * @return {Promise<boolean>} false if connect trial failed
	 */
	async connect() {
		try {
			await this.waitForReady(this._discoveryClient);
			return true;
		} catch (err) {
			if (err.toString().includes('Failed to connect before the deadline')) {
				return false;
			} else {
				throw err;
			}
		}
	}

}

module.exports = Peer;
