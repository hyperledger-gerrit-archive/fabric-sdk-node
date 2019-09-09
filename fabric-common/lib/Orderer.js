/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

const TYPE = 'Orderer';

const {checkParameter, getLogger} = require('./Utils.js');
const ServiceEndpoint = require('./ServiceEndpoint');

const fabprotos = require('fabric-protos');
const logger = getLogger(TYPE);

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
 * @extends ServiceEndpoint
 */
class Orderer extends ServiceEndpoint {

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
		logger.debug(`${TYPE}.constructor[${name}] - start `);
		super(name, client);
		this.mspid = mspid;
		this.type = TYPE;

		this.serviceClass = fabprotos.orderer.AtomicBroadcast;
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
	sendBroadcast(envelope, timeout) {
		const method = 'sendBroadcast';
		logger.debug(`${method} - start`);

		// Send the envelope to the orderer via grpc
		return new Promise((resolve, reject) => {
			if (!envelope) {
				checkParameter('envelope');
			}
			if (this.connected === false) {
				throw Error(`Broadcast Client ${this.name} ${this.endpoint.url} is not connected`);
			}
			let rto = this.options['request-timeout'];
			if (typeof timeout === 'number') {
				rto = timeout;
			}

			const broadcast = this.service.broadcast();
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
						logger.error(`${method} - ${this.name} SERVICE_UNAVAILABLE on error code: ${err.code}`);
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
}

module.exports = Orderer;
