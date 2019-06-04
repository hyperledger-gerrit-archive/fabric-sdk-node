/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';
const TYPE = 'Eventer';

const {Utils: utils} = require('fabric-common');
const {checkParameter} = require('./Utils.js');
const logger = utils.getLogger(TYPE);
const ServiceEndpoint = require('./ServiceEndpoint.js');

const fabprotos = require('fabric-protos');

const _validation_codes = {};
let keys = Object.keys(fabprotos.protos.TxValidationCode);
for (const key of keys) {
	const new_key = fabprotos.protos.TxValidationCode[key];
	_validation_codes[new_key] = key;
}

const _header_types = {};
keys = Object.keys(fabprotos.common.HeaderType);
for (const key of keys) {
	const new_key = fabprotos.common.HeaderType[key];
	_header_types[new_key] = key;
}

const FILTERED_BLOCK = 'filtered';
const FULL_BLOCK = 'full';
const PRIVATE_BLOCK = 'private';

/**
 * Eventer is used to monitor for new blocks on a peer's ledger.
 * The class supports the connection to the service to the Peer's event service.
 * @class
 * @extends ServiceEndpoint
 */

class Eventer extends ServiceEndpoint {

	/**
	 * Constructs a Eventer object
	 *
	 * @param {string} name
	 * @param {Client} client - An instance of the Client class
	 * @param mspid
	 * @returns {Eventer} An instance of this class
	 */

	constructor(name = checkParameter('name'), client = checkParameter('client'), mspid) {
		logger.debug(`${TYPE}.constructor[${name}] - start `);
		super(name, client);
		this.type = TYPE;

		// grpc event service
		this.eventService = null;
		// grpc chat streaming on the service
		this.stream = null;
		// the streams can live on, so lets be sure we are working with
		// the right one if we get reconnected / restarted
		this._current_stream = 0;

		// service state
		this.connected = false;
		this._stream_starting = false;
		this._disconnect_running = false;

		this.mspid = mspid;
	}

	/**
	 * Connects to a Peer's event service with given options.
	 * Options not provided will be provided from the {@link Peer}
	 * instance assigned to this instance when the channel created
	 * If a connection exist it will be closed and replaced by
	 * a new connection using the options provided.
	 *
	 * @param {Endpoint} endpoint - Service connection options including the url
	 * @param {ConnectionOpts} options - Any specific options for this instance
	 *  of the connection to the peer. These will override options from the
	 *  endpoint service connection options.
	 */
	async connect(endpoint, options) {
		const method = `connect[${this.name}]`;
		if (!endpoint) {
			logger.debug(`${method} - start checking existing connection`);
		} else {
			logger.debug(`${method} - start new connection`);
			this.endpoint = endpoint;
			this.options = endpoint.options;
			Object.assign(this.options, options); // merge options

			if (this.eventService) {
				logger.debug(`${method} - event service exist, will shutdown the service`);
				this._shutdown();
			}
			if (!this.eventService && this.options.url) {
				logger.debug(`${method} - event service does not exist, will create service for this peer`);
				this.eventService = new fabprotos.protos.Deliver(this.endpoint.addr, this.endpoint.creds, this.options);
			}
		}

		await this.waitForReady(this.eventService);
	}

	/**
	 * Check the connection status
	 */
	async checkConnection() {
		logger.debug(`checkConnection[${this.name}] - start `);

		if (this.connected) {
			try {
				await this.waitForReady(this.eventService);
			} catch (error) {
				logger.error(`Eventer ${this.endpoint.url} Connection failed :: ${error}`);
			}
		}

		return this.connected;
	}

	/**
	 * Disconnects the ChannelEventHub from the fabric peer service and
	 * closes all services.
	 * Will close all event listeners and send an Error to all active listeners.
	 */
	disconnect() {
		const method = `disconnect[${this.name}]`;
		logger.debug(`${method} - start - hub`);
		if (this.stream) {
			logger.debug(`${method} - shutdown existing stream`);
			this.stream.cancel();
			this.stream.end();
			this._stream_starting = false;
			this.stream = null;
		}
		if (this.eventService) {
			this.eventService.close();
			this.eventService = null;
		}
		this.connected = false;

		logger.debug(`${method} - end`);
	}

	/*
	 * internal utility method to check if the stream is ready.
	 * The stream must be readable, writeable and reading to be 'ready'
	 * and not paused.
	 */
	isStreamReady() {
		const method = 'isStreamReady';
		logger.debug(`${method} - start`);

		let ready = false;
		if (this.stream) {
			if (this.stream.isPaused()) {
				logger.debug(`${method} - grpc isPaused`);
			} else {
				ready = this.stream.readable && this.stream.writable && this.stream.reading;
			}
		}

		logger.debug(`${method} - stream ready ${ready}`);
		return ready;
	}

	/*
	 * internal method to get a new stream based on block type
	 */
	setStreamByType(blockType) {
		if (blockType === FILTERED_BLOCK) {
			this.stream = this.eventService.deliverFiltered();
		} else if (blockType === FULL_BLOCK) {
			this.stream = this.eventService.deliver();
		} else if (this.blockType === PRIVATE_BLOCK) {
			this.stream = this.eventService.deliver(); // for now until we get the new protos
		} else {
			throw Error('Unknown block type');
		}

		return this;
	}
}

module.exports = Eventer;