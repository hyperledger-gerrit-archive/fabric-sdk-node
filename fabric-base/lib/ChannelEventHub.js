/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';
const TYPE = 'ChannelEventHub';

const Long = require('long');
const {BlockDecoder, Utils: utils} = require('fabric-common');
const {buildHeader, checkParameter, convertToLong} = require('./Utils.js');
const Remote = require('./Remote.js');
const IdentityContext = require('./IdentityContext.js');

const logger = utils.getLogger(TYPE);

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

// Special transaction id to indicate that the transaction listener will be
// notified of all transactions
const ALL = 'all';

// Special value for block numbers
const NEWEST = 'newest'; // what fabric peer sees as newest on the ledger at time of connect
const OLDEST = 'oldest'; // what fabric peer sees as oldest on the ledger at time of connect
const LAST_SEEN = 'last_seen'; // what this event hub sees as the last block received

const BLOCK = 'block'; // for block type event listeners
const TX = 'tx'; // for transaction type event listeners
const CHAINCODE = 'chaincode'; // for chaincode event type event listeners

const FILTERED_BLOCK = 'filtered';
const FULL_BLOCK = 'full';
const PRIVATE_BLOCK = 'private';

/**
 * ChannelEventHub is used to monitor for new blocks on a peer's ledger.
 * The class allows the user to register to be notified when a new block is
 * added, when a new block is added that has a specific transaction ID, or
 * to be notified when a transaction contains a chaincode event name of interest.
 * The class also allows the monitoring to start and end at any specific location.
 *
 * @class
 */

class ChannelEventHub  extends Remote {

	/**
	 * Constructs a ChannelEventHub object
	 *
	 * @param {Channel} channel - An instance of the Channel class
	 * were this ChannelEventHub will receive blocks
	 * @param {Peer} peer Optional. An instance of the Peer class this ChannelEventHub connects.
	 * @returns {ChannelEventHub} An instance of this class
	 */

	constructor(name = checkParameter('name'), channel = checkParameter('channel'), mspid) {
		logger.debug(`${TYPE}.constructor[${name}] - start `);
		super(name, channel.client);
		this.type = TYPE;


		// the last block number received
		this.last_block_number = null;

		this.start_block = NEWEST;
		this.end_block = null;
		this.end_block_seen = false;

		this._eventRegistrations = new Map();
		this._reg_counter = 0;
		this._haveBlockListeners = false;
		this._haveTxListeners = false;
		this._haveChaincodeListeners = false;

		// grpc event service
		this.event_service = null;
		// grpc chat streaming on the service
		this.stream = null;
		// the streams can live on, so lets be sure we are working with
		// the right one if we get reconnected / restarted
		this._current_stream = 0;

		// service state
		this.connected = false;
		this._stream_starting = false;
		this._disconnect_running = false;

		this.channel = channel;
		this.mspid = mspid;
	}

	/*
	 * The block number of the last block seen
	 *
	 * @returns {Long} The block number of the last block seen
	 */
	getLastBlockNumber() {
		return this.last_block_number;
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
			logger.debug('%s - start checking existing connection', method);
		} else {
			logger.debug('%s - start new connection', method);
			this.endpoint = endpoint;
			this.options = endpoint.options;
			Object.assign(this.options, options); // merge options

			if (this.event_service) {
				logger.debug('%s - event service exist, will shutdown the service', method);
				this._shutdown();
			}
			if (!this.event_service && this.options.url) {
				logger.debug('%s - event service does not exist, will create service for this peer', method);
				this.event_service = new fabprotos.protos.Deliver(this.endpoint.addr, this.endpoint.creds, this.options);
			}
		}

		await this.waitForReady(this.event_service);
	}

	/**
	 * Disconnects the ChannelEventHub from the fabric peer service and
	 * closes all services.
	 * Will close all event listeners and send an Error to all active listeners.
	 */
	disconnect() {
		const method = `disconnect[${this.name}]`;
		logger.debug('%s - start - hub', method);
		this._disconnect(new Error('ChannelEventHub has been shutdown by "disconnect()" call'));
	}

	/*
	 * Internal method
	 * Disconnects the connection to the fabric peer service.
	 * Will close all event listeners and send the provided `Error` to
	 * all listeners on the event callback.
	 */
	_disconnect(err) {
		const method = `_disconnect[${this.name}]`;
		logger.debug('%s - start', method);
		logger.debug('%s - called due to:: %s, peer:%s', method, err.message, this.endpoint.url);

		if (this._disconnect_running) {
			logger.debug('%s - disconnect is running - exiting', method);
			return;
		}
		this._disconnect_running = true;
		this._closeAllCallbacks(err);
		this._shutdown();
		this._disconnect_running = false;

		logger.debug('%s - end', method);
	}

	/*
	 * Internal method
	 * Closes the grpc stream and service
	 */
	_shutdown() {
		const method = `_shutdown[${this.name}]`;
		logger.debug('%s - start ', method);
		if (this.stream) {
			logger.debug('%s - shutdown existing stream', method);
			this.stream.cancel();
			this.stream.end();
			this._stream_starting = false;
			this.stream = null;
		}
		if (this.event_service) {
			this.event_service.close();
			this.event_service = null;
		}
		this.connected = false;
	}

	/**
	 * @typedef {Object} StartRequestOptions
	 * @property {string} [blockType] - Optional. To indicate that the event service
	 *  on the peer will be sending full blocks, filtered blocks or private data
	 *  blocks to this ChannelEventHub.
	 *  The default will be 'filtered' with 'full' for full blocks and 'private'
	 *  for blocks with private data.
	 *  Filtered blocks have the required information to provided transaction
	 *  status and chaincode event names, however no chaincode event payload.
	 *  When using the non filtered blocks (full blocks or private data) the user
	 *  will be required to have access to receive full blocks and the private data.
	 *  Registering a block listener when listening for filtered blocks may not
	 *  provide sufficient information in the blocks received.
	 * @property {Number | string} [startBlock] - Optional. This will have the service
	 *  setup to start sending blocks back to the event hub at the block
	 *  with this number.
	 *  If the service should start with the last block this instance
	 *  has seen use the string 'last_seen'.
	 *  If the service should start with the oldest block on the
	 *  ledger use the string 'oldest'.
	 *  If the service should start with the latest block on the ledger,
	 *  use the string 'latest' or do not include a 'startBlock'.
	 *  Default is to start with the latest block on the ledger.
	 * @property {Number | string} [endBlock] - Optional. This will have the service
	 *  setup to end sending blocks back to the event hub at the block
	 *  with this number.
	 *  If the service should end with the last block it has seen
	 *  use the string 'last_seen'.
	 *  If the service should end with the current block on the
	 *  ledger use the string 'newest'.
	 *  Default is to continue to send.
	 */

	/**
	 * This method is used to build the protobuf objects of the start request.
	 * The start request must next be signed before being sent to the peer's event service.
	 * The {@link Proposal#buildAndSignStartRequest} method should be used if the
	 * signing will be done by the application.
	 *
	 * @param {IdentityContext} idContext - The transaction context to use for
	 *  Identity, transaction ID, and nonce values
	 * @param {StartRequestOptions} options - The build
	 * @returns {byte[]} The start request bytes that need to be
	 *  signed.
	 */
	buildRequest(idContext = checkParameter('idContext'), options = {}) {
		const method = `buildRequest[${this.name}]`;
		logger.debug('%s - start', method);

		const {startBlock, endBlock, blockType = FILTERED_BLOCK} = options;
		this.start_block = this._checkBlockNum(startBlock);
		this.end_block = this._checkBlockNum(endBlock);
		if (this.start_block && this.end_block && this.end_block.greaterThan && this.start_block.greaterThan) {
			if (this.start_block.greaterThan(this.end_block)) {
				throw new Error('"startBlock" must not be greater than "endBlock"');
			}
		}

		if (typeof blockType === 'string') {
			this.blockType = blockType;
		}

		// build a new transaction ID and nonce
		idContext.calculateTxId();

		let behavior = fabprotos.orderer.SeekInfo.SeekBehavior.BLOCK_UNTIL_READY;

		// build start proto
		const seekStart = new fabprotos.orderer.SeekPosition();
		if (!this.start_block || this.start_block === NEWEST) {
			const seekNewest = new fabprotos.orderer.SeekNewest();
			seekStart.setNewest(seekNewest);
		} else if (this.start_block === OLDEST) {
			const seekOldest = new fabprotos.orderer.SeekOldest();
			seekStart.setOldest(seekOldest);
		} else if (this.start_block) {
			const seekSpecifiedStart = new fabprotos.orderer.SeekSpecified();
			seekSpecifiedStart.setNumber(this.start_block);
			seekStart.setSpecified(seekSpecifiedStart);
		}

		// build stop proto
		const seekStop = new fabprotos.orderer.SeekPosition();
		if (this.end_block === NEWEST) {
			const seekNewest = new fabprotos.orderer.SeekNewest();
			seekStop.setNewest(seekNewest);
			behavior = fabprotos.orderer.SeekInfo.SeekBehavior.FAIL_IF_NOT_READY;
		} else if (this.end_block === OLDEST) {
			const seekOldest = new fabprotos.orderer.SeekOldest();
			seekStop.setOldest(seekOldest);
			behavior = fabprotos.orderer.SeekInfo.SeekBehavior.FAIL_IF_NOT_READY;
		} else {
			const seekSpecifiedStop = new fabprotos.orderer.SeekSpecified();
			if (this.end_block) {
				seekSpecifiedStop.setNumber(this.end_block);
				// user should be told that the block does not exist
				behavior = fabprotos.orderer.SeekInfo.SeekBehavior.FAIL_IF_NOT_READY;
			} else {
				seekSpecifiedStop.setNumber(Long.MAX_VALUE);
			}
			seekStop.setSpecified(seekSpecifiedStop);
		}

		// seek info with all parts
		const seekInfo = new fabprotos.orderer.SeekInfo();
		seekInfo.setStart(seekStart);
		seekInfo.setStop(seekStop);
		// BLOCK_UNTIL_READY will mean hold the stream open and keep sending as
		//     the blocks come in
		// FAIL_IF_NOT_READY will mean if the block is not there throw an error
		seekInfo.setBehavior(behavior);

		// build the header for use with the seekInfo payload
		const channelHeader = this.channel.buildChannelHeader(
			fabprotos.common.HeaderType.DELIVER_SEEK_INFO,
			'',
			idContext.transactionId
		);

		const seekHeader = buildHeader(idContext, channelHeader);
		const seekPayload = new fabprotos.common.Payload();
		seekPayload.setHeader(seekHeader);
		seekPayload.setData(seekInfo.toBuffer());
		this.seekPayloadBytes = seekPayload.toBuffer();

		return this.seekPayloadBytes;
	}

	/**
	 * Use this method with a IdentityContext that contains a User that has
	 * a Signing Identity.
	 * OR
	 * Use this method with a byte[] to set the signature
	 * when the application has done the signing outside of
	 * this object.
	 * Use the results of the {@link Proposal#buildStartRequest}
	 * as the bytes that will be signed.
	 * @param {IdentityContext | byte[]} param - When 'param' is a
	 * {@link IdentityContext} the signing identity of the user
	 *  will sign the current commit bytes as generated by {@link Proposal#buildStartRequest}.
	 *  When the 'param' is a byte[], the bytes will be used as the final
	 *  start request signature.
	 */
	signRequest(param = checkParameter('param')) {
		const method = `signRequest[${this.name}]`;
		logger.debug('%s - start', method);

		if (param.type === IdentityContext.TYPE) {
			const idContext = param;
			const signer = idContext.user.getSigningIdentity();
			this.signature = Buffer.from(signer.sign(this.seekPayloadBytes));
		} else if (param instanceof Buffer) {
			this.signature = param;
		} else {
			throw Error('Parameter is an unknown start request signature type');
		}

		return this;
	}

	/*
	 * utility method to build an envelope from the current payload and signature
	 */
	getSignedRequestEnvelope() {
		const method = `getSignedRequestEnvelope[${this.name}]`;
		logger.debug('%s - start', method);

		if (!this.seekPayloadBytes) {
			throw Error('Missing payload - build the start request');
		}
		if (!this.signature) {
			throw Error('Missing signature - sign the start request');
		}
		const envelope = {
			signature: this.signature,
			payload: this.seekPayloadBytes
		};

		return envelope;
	}

	/**
	 * This method will have this hub start listening for blocks from the
	 * Peer's event service. It will send a Deliver request to the peer
	 * event service and start the grpc streams. The received blocks will
	 * be checked to see if there is a match to any of the registered
	 * listeners.
	 *
	 * @param {Number} timeout - A number indicating milliseconds to wait on the
	 *  response before rejecting the promise with a timeout error. This
	 *  overrides the request-timeout config connection setting of this instance.
	 */
	listen(timeout) {
		const method = `listen[${this.name}]`;
		logger.debug('%s - start', method);

		if (!this.connect) {
			throw Error('Event service is not connected');
		}
		if (this._stream_starting) {
			throw Error('Event service is currently starting the stream');
		}

		let rto = this.options['request-timeout'];
		if (typeof timeout === 'number') {
			rto = timeout;
		}
		const envelope = this.getSignedRequestEnvelope();
		this.end_block_seen = false;
		this._stream_starting = true;
		const stream_id = ++this._current_stream;
		logger.debug('%s - start stream:%s', method, stream_id);
		const self = this;

		const connection_setup_timeout = setTimeout(() => {
			logger.error('%s - timed out after:%s', method, rto);
			// the disconnect will reset the connect status and the stream_starting status
			self._disconnect(new Error('TIMEOUT - Unable to receive blocks from the fabric peer event service'));
		}, rto);

		if (this.blockType === FILTERED_BLOCK) {
			this.stream = this.event_service.deliverFiltered();
		} else if (this.blockType === FULL_BLOCK) {
			this.stream = this.event_service.deliver();
		} else if (this.blockType === PRIVATE_BLOCK) {
			this.stream = this.event_service.deliver(); // for now until we get the new protos
		} else {
			throw Error('Unknown block type');
		}

		this.stream.on('data', (deliverResponse) => {
			logger.debug('on.data - block stream:%s _current_stream:%s peer:%s', stream_id, self._current_stream, self.endpoint.url);
			if (stream_id !== self._current_stream) {
				logger.debug('on.data - incoming block was from a cancelled stream');
				return;
			}

			// receiving any data for the current stream means the stream has started
			if (self._stream_starting) {
				logger.debug('on.data - stream %s now started, block number %s', stream_id, self.last_block_number);
				self._stream_starting = false;
				clearTimeout(connection_setup_timeout);
			}

			if (deliverResponse.Type === 'block' || deliverResponse.Type === 'filtered_block' || deliverResponse.Type === 'private_data') {
				try {
					let block = null;
					let full_block = null;
					let filtered_block = null;
					let private_data = null;
					let block_num = null;
					if (deliverResponse.Type === 'block') {
						full_block = BlockDecoder.decodeBlock(deliverResponse.block);
						block = full_block;
						block_num = convertToLong(block.header.number);
					} else if (deliverResponse.Type === 'filtered_block') {
						block = JSON.parse(JSON.stringify(deliverResponse.filtered_block));
						filtered_block = block;
						block_num = convertToLong(block.number);
					} else if (deliverResponse.Type === 'private_data') {
						// TODO - add in the private data special handling here
					} else {
						throw Error(`Unknown block type "${deliverResponse.Type}`);
					}

					self.last_block_number = block_num;
					logger.debug('on.data - incoming block number %s', self.last_block_number);

					self._processBlockEvents(full_block, filtered_block, private_data, block_num);
					self._processTxEvents(full_block, filtered_block, block_num);
					self._processChaincodeEvents(full_block, filtered_block, block_num);
					self._processEndBlock(block_num);
					// check to see if we should shut things down
					if (self.end_block) {
						if (self.end_block.lessThanOrEqual(self.last_block_number)) {
							self.end_block_seen = true;
							self._disconnect(new Error(`Shutdown due to end block number has been seen: ${this.last_block_number}`));
						}
					}
				} catch (error) {
					logger.error('%s ChannelEventHub - ::', method, (error.stack ? error.stack : error));
					logger.error('%s ChannelEventHub has detected an error ', method, error.toString());
					// report error to all callbacks and shutdown this ChannelEventHub
					self._disconnect(error);
				}
			} else if (deliverResponse.Type === 'status') {
				if (deliverResponse.status === 'SUCCESS') {
					if (self.end_block_seen) {
						// this is normal after the last block comes in when we set an ending block
						logger.debug('on.data - status received after last block seen: %s block_num:', deliverResponse.status, self.last_block_number);
					}
					if (self.ending_block === NEWEST) {
						// this is normal after the last block comes in when we set to newest as an ending block
						logger.debug('on.data - status received when newest block seen: %s block_num:', deliverResponse.status, self.last_block_number);
						self._disconnect(new Error(`Newest block received:${self.last_block_number} status:${deliverResponse.status}`));
					}
				} else {
					// tell all registered users that something is wrong and shutting down
					logger.error('on.data - unexpected deliverResponse status received - %s', deliverResponse.status);
					self._disconnect(new Error(`Event stream has received an unexpected status message. status:${deliverResponse.status}`));
				}
			} else {
				logger.error('on.data - unknown deliverResponse type %s', deliverResponse.Type);
				self._disconnect(new Error(`Event stream has received an unknown response type ${deliverResponse.Type}`));
			}
		});

		this.stream.on('status', (response) => {
			logger.debug('on status - status received: %j  peer:%s', response, self.endpoint.url);
			if (self._stream_starting) {
				logger.debug('on.status - stream %s not started', stream_id);
			}
		});

		this.stream.on('end', () => {
			logger.debug('on.end - event stream:%s _current_stream:%s peer:%s', stream_id, self._current_stream, self.endpoint.url);
			if (stream_id !== self._current_stream) {
				logger.debug('on.end - incoming message was from a cancelled stream');
				return;
			}
			if (self._stream_starting) {
				logger.debug('on.status - stream %s not started', stream_id);
				self._stream_starting = false;
				clearTimeout(connection_setup_timeout);
			}
			// tell all registered users that something is wrong and shutting down
			logger.debug('on.end - grpc stream is ready :%s', this.isStreamReady());
			self._disconnect(new Error('fabric peer service has disconnected due to an "end" event'));
		});

		this.stream.on('error', (err) => {
			logger.debug('on.error - block stream:%s _current_stream:%s  peer:%s', stream_id, self._current_stream, self.endpoint.url);
			if (stream_id !== self._current_stream) {
				logger.debug('on.error - incoming message was from a cancelled stream');
				logger.debug('on.error - %s %s', new Date(), err);
				return;
			}
			if (self._stream_starting) {
				logger.debug('on.status - stream %s not started', stream_id);
				self._stream_starting = false;
				clearTimeout(connection_setup_timeout);
			}
			// tell all registered users that something is wrong and shutting down
			logger.debug('on.error - grpc stream ready state :%s', this.isStreamReady());
			if (err instanceof Error) {
				self._disconnect(err);
			} else {
				self._disconnect(new Error(err));
			}
		});

		this.stream.write(envelope);

		logger.debug('%s - end - stream_id:', method, stream_id);
	}

	/*
	 * Internal method
	 * Will close out all callbacks
	 * Sends an error to all registered event callbacks
	 */
	_closeAllCallbacks(err) {
		const method = `_closeAllCallbacks[${this.name}]`;
		logger.debug('%s - start', method);

		logger.debug('%s - event registrations %s', method, this._eventRegistrations.size);
		for (const event_reg of this._eventRegistrations.values()) {
			logger.debug('%s - closing event registration:%s type:%s', method, event_reg.id, event_reg.type);
			event_reg.onEvent(err);
		}
		this._eventRegistrations.clear();

		// all done
		logger.debug('%s - end', method);
	}

	_checkBlockNum(block_num) {
		let _block_num = null;
		if (typeof block_num === 'string') {
			if (block_num.toLowerCase() === LAST_SEEN) {
				// set to last seen even if last seen is null
				_block_num = this.last_block_number;
			} else if (block_num.toLowerCase() === OLDEST) {
				_block_num = OLDEST;
			} else if (block_num.toLowerCase() === NEWEST) {
				_block_num = NEWEST;
			} else {
				// maybe it is a string number
				_block_num = convertToLong(block_num);
			}
		} else {
			if (typeof block_num !== 'undefined' && block_num !== null) {
				_block_num = convertToLong(block_num);
			}
		}

		return _block_num;
	}

	/**
	 * Check the connection status
	 */
	async checkConnection() {
		const method = `checkConnection[${this.name}]`;
		logger.debug('%s - start', method);

		let result = false;
		if (this.event_service) {
			try {
				await this.waitForReady(this.event_service);
				result = true;
			} catch (error) {
				logger.error('%s Event Service %s Connection check failed :: %s', method, this.endpoint.url, error);
			}
		}
		if (this.stream) {
			try {
				const is_paused = this.stream.isPaused();
				logger.debug('%s - stream isPaused :%s', method, is_paused);
				if (is_paused) {
					this.stream.resume();
					logger.debug('%s - stream resumed', method);
				}
				result = this.isStreamReady();
			} catch (error) {
				logger.error('%s Event Service %s Stream check failed :: %s', method, this.endpoint.url, error);
				result = false;
			}
		}

		return result;
	}

	/**
	 * @typedef {Object} RegistrationOpts
	 * @property {boolean} unregister - Optional - This options setting indicates
	 *  the registration should be removed (unregister) when the event
	 *  is seen or the endBlock seen. When the application is using a timeout
	 *  to only wait a
	 *  specified amount of time for the transaction to be seen, the timeout
	 *  processing should included the manual 'unregister' of the transaction
	 *  event listener to avoid the event callbacks being called unexpectedly.
	 *  The default for this setting is different for the different types of
	 *  event listeners. For block listeners the default is false.
	 *  For transaction listeners the default is true and the
	 *  listener will be unregistered when a transaction with the id is
	 *  seen by this listener or the endBlock is seen. For chaincode listeners
	 *  the default will be false as the match filter might be intended for
	 *  many transactions rather than a specific transaction.
	 * @property {Number | string} [startBlock] - Optional. This will have this
	 *  registered listener look for this event within the block.
	 *  Blocks that have block numbers less than the startBlock will be
	 *  ignored by this listener.
	 *  Note: This ChannelEventHub must be setup to listen for blocks in this
	 *  range.
	 * @property {Number | string} [endBlock] - Optional. This will have the
	 *  registered listener stop looking at blocks when the block number is
	 *  equal to or greater than the endBlock of this listener. The registered
	 * listener will be unregistered if the unregister option is set to true.
	 *  Note: This ChannelEventHub must be setup to listen for blocks in this
	 *  range.
	 */

	/**
	 * Unregister the event listener represented by
	 * the <code>registrationId</code> number returned by
	 * the each of the register listener method
	 *
	 * @param {number} registrationId - The id of the registered listener.
	 */
	unregisterEventListener(registrationId = 'all') {
		const method = `checkConnection[${this.name}]`;
		logger.debug('%s - start - %s', method, registrationId);
		if (this._eventRegistrations.has(registrationId)) {
			this._eventRegistrations.delete(registrationId);
		}

		let found_block = false;
		let found_tx = false;
		let found_chaincode = false;
		for (const event_reg of this._eventRegistrations.values()) {
			if (event_reg.type === BLOCK) {
				found_block = true;
			} else if (event_reg.type === TX) {
				found_tx = true;
			} else if (event_reg.type === CHAINCODE) {
				found_chaincode = true;
			}
		}
		this._haveBlockListeners = found_block;
		this._haveTxListeners = found_tx;
		this._haveChaincodeListeners = found_chaincode;
	}

	/**
	 * Register a listener to receive chaincode events.
	 * @param {string|RegExp} eventName - The exact name of the chaincode event or
	 *  regular expression that will be matched against the name given to
	 *  the target chaincode's call
	 *  <code>stub.SetEvent(name, payload)</code>)
	 * @param {function} callback - Callback function that takes two parameters:
	 *  <ul>
	 *  <li>{Error} error
	 *  <li>{BlockEvent} event
	 *  </ul>
	 *  The "error" will be null unless this ChannelEventHub has been shutdown.
	 *  The shutdown may be caused by a network, connection error,
	 *  by a call to the "disconnect()" method or when
	 *  the fabric event service ends the connection to this ChannelEventHub.
	 *  This callback will also be called with an Error when the ChannelEventHub is
	 *  shutdown due to the last block being received if the service has been
	 *  setup with an endBlock to be 'newest' or a specific block number that
	 *  has been seen.
	 * <br> The "event" will be the {@link BlockEvent} object.
	 * @param {RegistrationOpts} options - Options on the registrations to allow
	 *  for start and end block numbers, automatically unregister.
	 * @returns {number} A numeric registration identifier to be used to
	 *  remove this registration using {@link ChannelEventHub#unregisterEvent})
	 */
	registerChaincodeEvent(eventName = checkParameter('eventName'), callback = checkParameter('callback'),	options) {
		const method = `registerChaincodeEvent[${this.name}]`;
		logger.debug('%s - start', method);

		const event_name = new RegExp(eventName);
		const event_reg = new EventRegistration('chaincode', ++this._reg_counter, callback, options, false, event_name);
		this._eventRegistrations.set(event_reg.id, event_reg);
		this._haveChaincodeListeners = true;

		return event_reg.id;
	}


	/**
	 * Register a listener to receive all blocks committed to this channel.
	 * The listener's "callback" function gets called on the arrival of every
	 * block.
	 *
	 * @param {function} callback - Callback function that takes two parameters:
	 *  <ul>
	 *  <li>{Error} error
	 *  <li>{Event} Event object
	 *  </ul>
	 *  The Error will be null unless this ChannelEventHub has been shutdown.
	 *  The shutdown may be caused by a network, connection error,
	 *  by a call to the "disconnect()" method or when
	 *  the fabric event service ends the connection to this ChannelEventHub.
	 *  This callback will also be called with an Error when the ChannelEventHub is
	 *  shutdown due to the last block being received if the service has been
	 *  setup with an endBlock to be 'newest' or a specific block number that
	 *  has been seen.
	 * <br> The Event will be the {@link Event} object.
	 * @param {RegistrationOpts} options - Options on the registrations to allow
	 *  for start and end block numbers, automatically unregister and
	 *  automatically disconnect.
	 * @returns {int} This is the block registration number that must be
	 *  used to unregister this block listener. see [unregisterBlockEvent()]{@link ChannelEventHub#unregisterBlockEvent}
	 */
	registerBlockEvent(callback = checkParameter('callback'), options) {
		const method = `registerBlockEvent[${this.name}]`;
		logger.debug('%s - start', method);

		const event_reg = new EventRegistration(BLOCK, ++this._reg_counter, callback, options, false, null);
		this._eventRegistrations.set(event_reg.id, event_reg);
		this._haveBlockListeners = true;

		return event_reg.id;
	}

	/**
	 * Register a callback function to receive a notification when the transaction
	 * by the given id has been committed into a block. Using the special string
	 * 'all' will indicate that this listener will notify (call) the callback
	 * for every transaction written to the ledger.
	 *
	 * @param {string} txid - Transaction id string or 'all'
	 * @param {function} callback - Callback function that takes the parameters:
	 *  <ul>
	 *  <li>{Error} error
	 *  <li>{string} transaction ID
	 *  <li>{string} status
	 *  <li>{long} block number
	 *  </ul>
	 *  The Error will be null unless this ChannelEventHub is shutdown.
	 *  The shutdown may be caused by a network or connection error,
	 *  by a call to the "disconnect()" method or when
	 *  the fabric service ends the connection to this ChannelEventHub.
	 *  This callback will also be called with an Error when the ChannelEventHub is
	 *  shutdown due to the last block being received if replaying and requesting
	 *  the endBlock to be 'newest' or a specific value.
	 * @param {RegistrationOpts} options - Options on the registrations to allow
	 *  for start and end block numbers, automatically unregister.
	 * @returns {string} The transaction ID that was used to register this event listener.
	 *  May be used to unregister this event listener.
	 */
	registerTxEvent(txid = checkParameter('txid'), callback = checkParameter('callback'), options) {
		const method = `registerTxEvent[${this.name}]`;
		logger.debug('%s start - txid:%s', method, txid);

		let default_unregister = true;
		let _txid = txid;
		if (txid.toLowerCase() === ALL) {
			_txid = txid.toLowerCase();
			default_unregister = false;
		}

		const event_reg = new EventRegistration(TX, ++this._reg_counter, callback, options, default_unregister, _txid);
		this._eventRegistrations.set(event_reg.id, event_reg);
		this._haveTxListeners = true;

		return event_reg.id;
	}

	/*
	 * private internal method to check each registered listener
	 * to see if it has requested to stop listening on a specific
	 * blocknum
	 */
	_processEndBlock(block_num) {
		const method = '_processEndBlock';
		logger.debug('%s - start', method);

		for (const any_reg of this._eventRegistrations.values()) {
			if (any_reg.end_block >= block_num) {
				const event = new BlockEvent(this);
				event.endBlockReceived = true;
				any_reg.onEvent(null, event);
				this.unregisterEventListener(any_reg.id);
				logger.debug('%s - automatically unregister listener %s received defined end block %s', method, block.id, block_num);
			}
		}
	}
	/*
	 * private internal method for processing block events
	 * @param {Object} block protobuf object
	 */
	_processBlockEvents(full, filtered, private_data, block_num) {
		const method = '_processBlockEvents';
		logger.debug('%s - start', method);

		if (!this._haveBlockListeners) {
			logger.debug('%s - no block listeners', method);
			return;
		}
		for (const block_reg of this._eventRegistrations.values()) {
			if (block_reg.type === BLOCK) {
				logger.debug('%s - calling block listener callback', method);
				const event = new Event(this);
				event.block = full;
				event.filteredBlock = filtered;
				event.privateData = private_data;
				event.block_num = block_num;
				if (block_reg.end_block === block_num) {
					event.endBlockReceived = true;
				}
				block_reg.onEvent(null, event);

				// check to see if we should automatically unregister this hub
				if (block_reg.unregister && event.endBlockReceived) {
					this.unregisterEventListener(block_reg.id);
					logger.debug('%s - automatically unregister block listener for %s', method, block.id);
				}
			}
		}
	}

	/*
	 * private internal method for processing tx events
	 * @param {Object} block protobuf object which might contain transactions
	 */
	_processTxEvents(full_block, filtered_block) {
		const method = '_processTxEvents';
		logger.debug('%s - start', method);

		if (filtered_block) {
			logger.debug('%s filtered block number=%s', method, filtered_block.number);
			if (filtered_block.filtered_transactions) {
				for (const filtered_transaction of filtered_block.filtered_transactions) {
					this._callTransactionListener(filtered_transaction.txid,
						filtered_transaction.tx_validation_code,
						filtered_block.number);
				}
			}
		} else {
			logger.debug('%s full block number=%s', method, full_block.header.number);
			const txStatusCodes = full_block.metadata.metadata[fabprotos.common.BlockMetadataIndex.TRANSACTIONS_FILTER];
			for (let index = 0; index < full_block.data.data.length; index++) {
				const channel_header = full_block.data.data[index].payload.header.channel_header;
				this._callTransactionListener(channel_header.tx_id,
					txStatusCodes[index],
					full_block.header.number);
			}
		}
	}

	/* internal utility method */
	_callTransactionListener(tx_id, val_code, block_num) {
		const method = '_callTransactionListener';

		for (const trans_reg of this._eventRegistrations.values()) {
			// check each listener to see if this transaction ID matches
			if (trans_reg.type === TX) {
				let check_unreg = false;
				if (trans_reg.event === tx_id || trans_reg.event === ALL) {
					logger.debug('%s - about to call the transaction call back for code=%s tx=%s', method, val_code, tx_id);
					const status = convertValidationCode(val_code);
					const event = new Event(this);
					event.blockNumber = block_num;
					event.transactionId = tx_id;
					event.status = status;
					if (trans_reg.endBlock ===  block_num) {
						event.endBlockReceived = true;
					}
					trans_reg.onEvent(null, event);
					check_unreg = true;
				} else {
					if (trans_reg.endBlock ===  block_num) {
						const event = new Event(this);
						event.blockNumber = block_num;
						event.endBlockReceived = true;
						trans_reg.onEvent(null, event);
						check_unreg = true;
					}
				}

				if (check_unreg) {
					// check to see if we should automatically unregister
					if (trans_reg.unregister) {
						this.unregisterEventListener(trans_reg.id);
						logger.debug('%s - automatically unregister tx listener for %s', method, tx_id);
					}
				}
			}
		}
	}

	/*
	 * private internal method for processing chaincode events
	 * @param {Object} block protobuf object which might contain the chaincode event from the fabric
	 */
	_processChaincodeEvents(block) {
		const method = '_processChaincodeEvents';
		logger.debug('%s - start', method);

		if (!this._haveChaincodeListeners) {
			logger.debug('%s - no registered chaincode event "listeners"', method);
			return;
		}
		const all_events = new Map();
		if (block.number) {
			if (block.filtered_transactions) {
				for (const filtered_transaction of block.filtered_transactions) {
					if (filtered_transaction.transaction_actions) {
						if (filtered_transaction.transaction_actions.chaincode_actions) {
							for (const chaincode_action of filtered_transaction.transaction_actions.chaincode_actions) {
								// need to remove the payload since with filtered blocks it
								// has an empty byte array value which is not the real value
								// we do not want the listener to think that is the value
								delete chaincode_action.chaincode_event.payload;
								this._queueChaincodeEvent(chaincode_action.chaincode_event,
									block.number,
									filtered_transaction.txid,
									filtered_transaction.tx_validation_code,
									all_events);
							}
						}
					}
				}
			}
		} else {
			for (let index = 0; index < block.data.data.length; index++) {
				logger.debug(`${method} - trans index=${index}`);
				try {
					const env = block.data.data[index];
					const channel_header = env.payload.header.channel_header;
					if (channel_header.type === 3) { // only ENDORSER_TRANSACTION have chaincode events
						const tx = env.payload.data;
						if (tx && tx.actions) {
							for (const {payload} of tx.actions) {
								const chaincode_event = payload.action.proposal_response_payload.extension.events;
								logger.debug('%s - chaincode_event %s', method, chaincode_event);

								const txStatusCodes = block.metadata.metadata[fabprotos.common.BlockMetadataIndex.TRANSACTIONS_FILTER];
								const channelHeader = block.data.data[index].payload.header.channel_header;
								const val_code = txStatusCodes[index];

								this._queueChaincodeEvent(chaincode_event,
									block.header.number,
									channelHeader.tx_id,
									val_code,
									all_events);
							}
						} else {
							logger.debug('%s - no transactions or transaction actions', method);
						}
					} else {
						logger.debug('%s - block is not endorser transaction type', method);
					}
				} catch (err) {
					logger.error('%s - Error unmarshalling :: %s', method, err);
				}
			}
		}

		// send all events for each listener
		for (const [chaincode_reg, events] of all_events.entries()) {
			const event = new Event(this);
			if (chaincode_reg.endBlock = block_num) {
				event.endBlockReceived = true;
			}
			chaincode_reg.onEvent(null, events);

			// see if we should automatically unregister this event listener
			if (chaincode_reg.unregister) {
				this.unregisterEventListener(chaincode_reg.id);
				logger.debug('%s - automatically unregister chaincode event listener setting', method);
			}
		}
	}

	_queueChaincodeEvent(chaincode_event, block_num, tx_id, val_code, all_events) {
		const method = '_queueChaincodeEvent';
		logger.debug('%s - start - chaincode_event %s', method, chaincode_event);

		const tx_status = convertValidationCode(val_code);

		logger.debug('%s - txid=%s  val_code=%s', method, tx_id, tx_status);

		for (const chaincode_reg of this._eventRegistrations.values()) {
			// check each listener to see if this chaincode event matches
			if (chaincode_reg.type === CHAINCODE && chaincode_reg.event.test(chaincode_event.event)) {
				// we have a match - save it to be sent later
				logger.debug('%s - queuing chaincode event: %s', method, chaincode_event.event_name);
				let event = all_events.get(chaincode_reg);
				if (!event) {
					const event = new BlockEvent(this);
					event.blockNumber = block_num;
					event.chaincodeEvents = [];
					all_events.set(chaincode_reg, event);
				}
				const chaincode_event = new ChaincodeEvent(tx_id, tx_status, chaincode_event.event_name, )
				event.chaincodeEvents.push({chaincode_event, tx_id, tx_status});
			} else {
				logger.debug('%s - NOT queuing chaincode event: %s', method, chaincode_event.event_name);
			}
		}
	}

	/*
	 * internal utility method to check if the stream is ready.
	 * The stream must be readable, writeable and reading to be 'ready'
	 * and not paused.
	 */
	isStreamReady() {
		const method = 'isStreamReady';
		logger.debug('%s - start', method);

		let ready = false;
		if (this.stream) {
			if (this.stream.isPaused()) {
				logger.debug('%s - grpc isPaused', method);
			} else {
				ready = this.stream.readable && this.stream.writable && this.stream.reading;
			}
		}

		logger.debug('%s - stream ready %s', method, ready);
		return ready;
	}
}

module.exports = ChannelEventHub;

function convertValidationCode(code) {
	if (typeof code === 'string') {
		return code;
	}
	return _validation_codes[code];
}

/*
 * The EventRegistration is used internally to the ChannelEventHub to hold
 * an event registration callback and settings.
 */
class EventRegistration {
	/*
	 * Constructs a block callback entry
	 *
	 * @param {string} type - a string to indicate the type of event registration
	 *  "block", "tx", or "chaincode".
	 * @param {number} id - The id number for this registration
	 * @param {function} callback - Callback for event matches
	 * @param {RegistrationOpts} options - event registration options
	 * @param {boolean} default_unregister - the default value for the unregister
	 *  setting if not option setting is set by the user
	 * @param {any} event
	 *  - When this listener is of type "chaincode" then this
	 *  field will be the chaincode event name, used as a regular
	 *  expression match on the chaincode event names within the transaction.
	 *  - When this listener is of type "tx" then this field will be the
	 *  transaction id string.
	 *  In both cases this field will be compared with data in the transaction
	 *  and when there is a match
	 *  the event will have taken place and the listener's callback will be
	 *  called, notified.
	 */
	constructor(type = checkParameter('type'), id, callback, options = {}, default_unregister, event) {
		this.type = type;
		this.id = id;
		this.callbackFn = callback;
		this.unregister = typeof options.unregister === 'boolean' ? options.unregister : default_unregister;
		this.endBlock = options.endBlock;
		this.startBlock = options.startBlock;
		this.event = event;
	}

	onEvent(...args) {
		try {
			this.callbackFn(...args);
		} catch (error) {
			logger.warn('Event notification callback failed', error);
		}
	}
}

/**
 * @typedef {Object} BlockEvent
 * @property {ChannelEventHub} channelEventHub - this ChannelEventHub.
 * @property {Long} - blockNumber - The block number of that contains
 *  this event.
 * @property {string} - [transactionId] - The transaction ID of this event
 * @property {string} - [transactionStatus] - The transaction status of this
 *  event.
 * @property {boolean} - endBlockReceived - Indicates if this endBlock as
 *  defined by the listener has been seen.
 * @property {ChaincodeEvent[]} [chaincodeEvents] - An array of
 *  {@link ChaincodeEvent}.
 * @property {object} [block] - The decode of the full block received
 * @property {object} [filteredBlock] - The decode of the filtered block received
 * @property {object} [privateData] - The private data
 */

/**
 * @typedef {Object} ChaincodeEvent
 * @property {string} chaincode_id - The name of chaincode that sourced this
 *  event.
 * @property {string} tx_id - The transaction ID of this event.
 * @property {string} status - The transaction status of the transaction.
 * @property {string} event_name - The string that is the event_name of this
 *  event as set by the chaincode during endorsement.
 *  <code>stub.SetEvent(event_name, payload)</code>
 * @property {byte[]} payload - Application-specific byte array that the chaincode
 *  set when it called <code>stub.SetEvent(event_name, payload)</code>
 */

 class ChaincodeEvent {
	 	/**
	 * Constructs an object that contains all information about an Event.
	 */
	constructor(tx_id, status, event_name, payload) {
		this.tx_id = tx_id;
		this.status = status;
		this.event_name = event_name;
		this.payload = payload;
	}
 }

class BlockEvent {
	/**
	 * Constructs an object that contains all information about an Event.
	 */
	constructor(channelEventHub) {
		this.channelEventHub = channelEventHub;
		this.blockNumber;
		this.transactionId;
		this.transactionStatus
		this.endBlockReceived = false;
		this.chaincodeEvents = [];
		this.block;
		this.filteredBlock;
		this.privateData;
	}

	isLastBlock() {
		return this.endBlockReceived;
	}
}
