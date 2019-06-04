/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';
const TYPE = 'Orderer';

const {Utils: utils} = require('fabric-common');
const Remote = require('./Remote');

const fabprotos = require('fabric-protos');
const logger = utils.getLogger(TYPE);
const {checkParameter} = require('./Utils.js');

/**
 * @typedef {Error} SYSTEM_TIMEOUT The Error message string that indicates that
 *  the request operation has timed out due to a system issue. This will
 *  indicate that the issue is local rather than remote. If there is
 *  an issue with the remote node a 'REQUEST_TIMEOUT' error message
 *  will be returned.
 *  The operation will only use one timer for both types of timeouts.
 *  The timer will start running as the operation begins. If the timer
 *  expires before the local instance is able to make the outbound
 *  request then 'SYSTEM_TIMEOUT' error will be returned. If the local
 *  instance is able to make the outbound request and the timer expires
 *  before the remote node responds then the 'REQUEST_TIMEOUT' is
 *  returned. The timer is controlled by the 'request-timeout' setting
 *  or passed on a call that makes an outbound request
 *  @example 'client.setConfigSetting('request-timeout', 3000)'
 *  @example 'channel.sendTranaction(request, 3000)'
 */

/**
 * @typedef {Error} REQUEST_TIMEOUT The Error message string that indicates that
 *  the request operation has timed out due to a remote node issue.
 *  If there is an issue with the local system a 'SYSTEM_TIMEOUT'
 *  error message will be returned.
 *  The operation will only use one timer for both types of timeouts.
 *  The timer will start running as the operation begins. If the timer
 *  expires before the local instance is able to make the outbound
 *  request then 'SYSTEM_TIMEOUT' error will be returned. If the local
 *  instance is able to make the outbound request and the timer expires
 *  before the remote node responds then the 'REQUEST_TIMEOUT' is
 *  returned. The timer is controlled by the 'request-timeout' setting
 *  or passed on a call that makes an outbound request
 *  @example 'client.setConfigSetting('request-timeout', 3000)'
 *  @example 'channel.sendTranaction(request, 3000)'
 */

/**
 * The Orderer class encapsulates the client capabilities to interact with
 * an Orderer node in the target blockchain network. The orderer node exposes
 * two APIs: broadcast() and deliver(). Both are streaming APIs so there's
 * a persistent grpc streaming connection between the client and the orderer
 * where messages are exchanged in both directions. The broadcast() API is
 * for sending transactions to the orderer for processing. The deliver() API
 * is for asking the orderer for information such as channel configurations.
 *
 * @class
 * @extends Remote
 */
class Orderer extends Remote {

	/**
	 * Constructs an Orderer object with the given name. An orderer object
	 * encapsulates the properties of an orderer node and the interactions with it via
	 * the grpc stream API. Orderer objects are used by the {@link Client} objects to broadcast
	 * requests for creating and updating channels. They are also used by the {@link Channel}
	 * objects to broadcast requests for ordering transactions.
	 *
	 * @param {string} name - The name of this peer
	 * @param {Client} client - The client instance
	 * @param {string} mspid - The mspid (organization) of this peer
	 * @returns {Orderer} The Orderer instance.
	 */
	constructor(name = checkParameter('name'), client = checkParameter('client'), mspid) {
		const method = `constructor[${name}]`;
		logger.debug(`${method} - start `);
		super(name, client);
		this.mspid = mspid;
		this.type = TYPE;

		this.broadcastService = null;
		this._sendDeliverConnect = false;
	}

	/**
	 * Connects to an Orderer with the given options.
	 * If a connection exist it will be closed and replaced by
	 * a new connection using the options provided.
	 *
	 * @param {Endpoint} endpoint - Service connection options including the url
	 * @param {ConnectionOpts} options - Any specific options for this instance
	 *  of the connection to the orderer. These will override options from the
	 *  endpoint service connection options.
	 */
	async connect(endpoint = checkParameter('endpoint'), options) {
		const method = `connect[${this.name}]`;
		logger.debug(`${method} - start `);

		this.endpoint = endpoint;
		this.options = Object.assign({}, endpoint.options, options);

		if (this.broadcastService) {
			logger.debug(`${method} - broadcast service exist, will close this orderer ${this.name}`);
			this.close();
		}
		if (!this.broadcastService) {
			logger.debug(`${method} - broadcast service does not exist, will create service for this orderer ${this.name}`);
			this.broadcastService = new fabprotos.orderer.AtomicBroadcast(this.endpoint.addr, this.endpoint.creds, this.options);
		}
		await this.waitForReady(this.broadcastService);
	}

	/**
	 * Check the connection status
	 */
	async checkConnection() {
		const method = `checkConnection[${this.name}]`;
		logger.debug(`${method} - start `);

		if (this.connected) {
			try {
				await this.waitForReady(this.broadcastService);
			} catch (error) {
				logger.error(`Orderer ${this.endpoint.url} Connection failed :: ${error}`);
			}
		}

		return this.connected;
	}

	/**
	 * Close the service connection.
	 */
	disconnect() {
		const method = `disconnect[${this.name}]`;
		logger.debug(`${method} - start `);

		if (this.broadcastService) {
			logger.debug(`${method} - closing orderer broadcast connection ${this.endpoint.addr}`);
			this.broadcastService.close();
			this.broadcastService = null;
		}
	}

	/**
	 * @typedef {Object} BroadcastResponse
	 * @property {string} status - Value is 'SUCCESS' or a descriptive error string
	 * @property {string} info - Optional. Additional information about the status
	 */

	/**
	 * Send a Broadcast message to the orderer service.
	 *
	 * @param {byte[]} envelope - Byte data to be included in the broadcast.
	 *  This must be a protobuf encoded byte array of the
	 *  [common.Envelope]{@link https://github.com/hyperledger/fabric/blob/v1.0.0/protos/common/common.proto#L132}
	 *  that contains either a [ConfigUpdateEnvelope]{@link https://github.com/hyperledger/fabric/blob/v1.0.0/protos/common/configtx.proto#L70}
	 *  or a [Transaction]{@link https://github.com/hyperledger/fabric/blob/v1.0.0/protos/peer/transaction.proto#L70}
	 *  in the <code>payload.data</code> property of the envelope.
	 * @param {Number} timeout - A number indicating milliseconds to wait on the
	 *  response before rejecting the promise with a timeout error. This
	 *  overrides the request-timeout config connection setting of this instance.
	 * @returns {Promise} A Promise for a {@link BroadcastResponse} object
	 * @throws {SYSTEM_TIMEOUT | REQUEST_TIMEOUT}
	 */
	sendBroadcast(envelope = checkParameter('envelope'), timeout) {
		const method = 'sendBroadcast';
		logger.debug(`${method} - start`);

		let rto = this.options['request-timeout'];
		if (typeof timeout === 'number') {
			rto = timeout;
		}

		// Send the envelope to the orderer via grpc
		return new Promise((resolve, reject) => {
			const broadcast = this.broadcastService.broadcast();
			// if it timeouts before the send of the envelope completes
			// we will get a SYSTEM_TIMEOUT
			let error_msg = 'SYSTEM_TIMEOUT';

			const broadcast_timeout = setTimeout(() => {
				logger.error(`${this.name} - ${method} timed out after:${rto}`);
				broadcast.end();
				return reject(new Error(error_msg));
			}, rto);

			broadcast.on('data', (response) => {
				logger.debug(`${method} - on data response: ${response}`);
				broadcast.end();
				if (response && response.info) {
					logger.debug(`${method} - response info :: ${response.info}`);
				}
				if (response && response.status) {
					logger.debug(`${method} - response status ${response.status}`);
					return resolve(response);
				} else {
					logger.error(`${this.name} ERROR - ${method} reject with invalid response from the orderer`);
					return reject(new Error('SYSTEM_ERROR'));
				}
			});

			broadcast.on('end', () => {
				logger.debug(`${method} - on end:`);
				clearTimeout(broadcast_timeout);
				broadcast.cancel();
			});

			broadcast.on('error', (err) => {
				clearTimeout(broadcast_timeout);
				broadcast.end();
				if (err && err.code) {
					if (err.code === 14) {
						logger.error(`${method} - ${this.name} on error: ${JSON.stringify(err.stack ? err.stack : err)}`);
						return reject(new Error('SERVICE_UNAVAILABLE'));
					}
				}
				logger.error(`${method} - ${this.name} on error: ${JSON.stringify(err.stack ? err.stack : err)}`);
				return reject(err);
			});

			broadcast.write(envelope);
			// the send of envelope has completed
			// if it timeouts after this point we will get a REQUEST_TIMEOUT
			error_msg = 'REQUEST_TIMEOUT';
			logger.debug(`${method} - sent message`);
		});
	}

	/**
	 * Send a Deliver message to the orderer service.
	 *
	 * @param {byte[]} envelope - Byte data to be included in the broadcast. This must
	 *  be a protobuf encoded byte array of the
	 *  [common.Envelope]{@link https://github.com/hyperledger/fabric/blob/v1.0.0/protos/common/common.proto#L132}
	 *  that contains a [SeekInfo]{@link https://github.com/hyperledger/fabric/blob/v1.0.0/protos/orderer/ab.proto#L54}
	 *  in the <code>payload.data</code> property of the envelope.
	 *  The <code>header.channelHeader.type</code> must be set to
	 *  [common.HeaderType.DELIVER_SEEK_INFO]{@link https://github.com/hyperledger/fabric/blob/v1.0.0/protos/common/common.proto#L44}
	 * @param {Number} timeout - A number indicating milliseconds to wait on the
	 *  response before rejecting the promise with a timeout error. This
	 *  overrides the request-timeout config connection setting of this instance.
	 * @returns {Promise} A Promise for a protobuf object of type common.Block. Note that this
	 *  is <b>NOT</b> the same type of object as the {@link Block} returned by the
	 *  [BlockDecoder.decode()]{@link BlockDecode.decode} method and various
	 *  other methods. A {@link Block} is a pure javascript object, whereas
	 *  the object returned by this method is a protobuf object that contains
	 *  accessor methods, getters and setters, and toBuffer() for each property
	 *  to be used for further manipulating the object and convert to and from
	 *  byte arrays.
	 */
	sendDeliver(envelope = checkParameter('envelope'), timeout) {
		logger.debug('sendDeliver - start');

		if (!envelope) {
			logger.debug('sendDeliver ERROR - missing envelope');
			const err = new Error('Missing data - Nothing to deliver');
			return Promise.reject(err);
		}

		let rto = this.options['request-timeout'];
		if (typeof timeout === 'number') {
			rto = timeout;
		}

		return this.waitForReady(this.deliverService).then(() => {
			// Send the seek info to the orderer via grpc
			return new Promise((resolve, reject) => {
				try {
					const deliver = this.deliverService.deliver();
					let return_block = null;
					this._sendDeliverConnect = false;
					let error_msg = 'SYSTEM_TIMEOUT';

					const deliver_timeout = setTimeout(() => {
						logger.debug(`sendDeliver - timed out after:${rto}`);
						deliver.end();
						return reject(new Error(error_msg));
					}, rto);
					deliver.on('data', (response) => {
						logger.debug('sendDeliver - on data');
						// check the type of the response
						if (response.Type === 'block') {
							const blockHeader = new fabprotos.common.BlockHeader();
							blockHeader.setNumber(response.block.header.number);
							blockHeader.setPreviousHash(response.block.header.previous_hash);
							blockHeader.setDataHash(response.block.header.data_hash);
							const blockData = new fabprotos.common.BlockData();
							blockData.setData(response.block.data.data);
							const blockMetadata = new fabprotos.common.BlockMetadata();
							blockMetadata.setMetadata(response.block.metadata.metadata);

							const block = new fabprotos.common.Block();
							block.setHeader(blockHeader);
							block.setData(blockData);
							block.setMetadata(blockMetadata);
							return_block = block;

							logger.debug(`sendDeliver - wait for success, keep this block number ${return_block.header.number}`);
						} else if (response.Type === 'status') {
							clearTimeout(deliver_timeout);
							this._sendDeliverConnect = false;
							deliver.end();
							// response type should now be 'status'
							if (response.status === 'SUCCESS') {
								logger.debug(`sendDeliver - resolve - status:${response.status}`);
								return resolve(return_block);
							} else {
								logger.error(`sendDeliver - rejecting - status:${response.status}`);
								return reject(new Error(`Invalid results returned ::${response.status}`));
							}
						} else {
							logger.error('sendDeliver ERROR - reject with invalid response from the orderer');
							clearTimeout(deliver_timeout);
							deliver.end();
							this._sendDeliverConnect = false;
							return reject(new Error('SYSTEM_ERROR'));
						}
					});

					deliver.on('status', (response) => {
						logger.debug(`sendDeliver - on status:${JSON.stringify(response)}`);
					});

					deliver.on('end', () => {
						logger.debug('sendDeliver - on end');
						if (this._sendDeliverConnect) {
							clearTimeout(deliver_timeout);
							deliver.cancel();
							this._sendDeliverConnect = false;
						}

					});

					deliver.on('error', (err) => {
						logger.debug('sendDeliver - on error');
						clearTimeout(deliver_timeout);
						if (this._sendDeliverConnect) {
							deliver.end();
							this._sendDeliverConnect = false;
							if (err && err.code) {
								if (err.code === 14) {
									logger.error(`sendDeliver - on error code 14: ${JSON.stringify(err.stack ? err.stack : err)}`);
									return reject(new Error('SERVICE_UNAVAILABLE'));
								}
							}
						}
						return reject(err);
					});

					deliver.write(envelope);
					error_msg = 'REQUEST_TIMEOUT';
					this._sendDeliverConnect = true;
					logger.debug('sendDeliver - sent envelope');
				} catch (error) {
					logger.error('sendDeliver - system error ::' + (error.stack ? error.stack : error));
					if (error instanceof Error) {
						return reject(error);
					} else {
						return reject(new Error(error));
					}
				}
			});
		});
	}
}

module.exports = Orderer;
