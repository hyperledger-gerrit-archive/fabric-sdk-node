/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';
const TYPE = 'ChannelEventHub';

const Long = require('long');
const {BlockDecoder, Utils: utils} = require('fabric-common');
const {buildHeader, checkParameter: cp, convertToLong} = require('./Utils.js');
const Channel = require('./Channel.js');
const Remote = require('./Remote.js');
const TransactionContext = require('./TransactionContext.js');

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

	constructor(name = cp('name'), channel = cp('channel')) {
		logger.debug('const - start');
		super(name, channel.client);
		this.type = TYPE;


		// the last block number received
		this.last_block_number = null;
		
		this.filtered = true; // the default
		this.start_block = NEWEST;
		this.end_block = null;
		this.end_block_seen = false;

		this._eventRegistrations = new Map();
		this._reg_counter = 0;
		this._haveBlockListeners = false;
		this._haveTxListeners = false;
		this._haveChaincodeListeners = false;

		// grpc event service
		this._event_service = null;
		// grpc chat streaming on the service
		this._stream = null;
		// the streams can live on, so lets be sure we are working with
		// the right one if we get reconnected / restarted
		this._current_stream = 0;

		// service state
		this.connected = false;
		this._stream_starting = false;
		this._disconnect_running = false;

		this.channel = channel;
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
	 * @param {ConnectionOpts} options - The options for the connection
	 *  to the peer. Must include the "url" of the peer.
	 */
	async connect(options = {}) {
		const method = 'connect';
		this.connected = false;
		this.setup(options);
		if (this._event_service) {
			logger.debug('%s - event service exist, will shutdown the service ::%s', method, this.name);
			this._shutdown();
		}
		if (!this._event_service && this.options.url) {
			logger.debug('%s - event service does not exist, will create service for this peer %s', method, this.name);
			this._event_service = new fabprotos.protos.Deliver(this.endpoint.addr, this.endpoint.creds, this.options);
		}
		await this.waitForReady(this._event_service);
		// if the waitForReady completes without error then we are connected
		this.connected = true;

		return;
	}

	/**
	 * Disconnects the ChannelEventHub from the fabric peer service and
	 * closes all services.
	 * Will close all event listeners and send an Error to all active listeners.
	 */
	close() {
		const method = 'close';
		logger.debug('%s - start - hub:%s', method, this.name);
		this._disconnect(new Error('ChannelEventHub has been shutdown by "close()" call'));
	}

	/*
	 * Internal method
	 * Disconnects the connection to the fabric peer service.
	 * Will close all event listeners and send the provided `Error` to
	 * all listeners on the event callback.
	 */
	_disconnect(err) {
		const method = '_disconnect';
		logger.debug('%s - start - hub:%s', method, this.name);
		logger.debug('%s - called due to:: %s, peer:%s', method, err.message, this.url);
		if (this._disconnect_running) {
			logger.debug('%s - disconnect is running - exiting', method);
			return;
		}
		this._disconnect_running = true;
		this._closeAllCallbacks(err);
		this._shutdown();
		this._disconnect_running = false;

		logger.debug('%s - end -- called due to:: %s, peer:%s', method, err.message, this.url);
	}

	/*
	 * Internal method
	 * Closes the grpc stream and service
	 */
	_shutdown() {
		if (this._stream) {
			logger.debug('_shutdown - shutdown existing stream');
			this._stream.cancel();
			this._stream.end();
			this._stream_starting = false;
			this._stream = null;
		}
		if (this._event_service) {
			this._event_service.close();
			this._event_service = null;
		}
		this.connected = false;
	}

	/**
	 * @typedef {Object} StartRequestOptions
	 * @property {boolean} [filtered] - Optional. To indicate that the event service
	 *  on the peer will be sending full blocks or filtered blocks to this
	 *  ChannelEventHub.
	 *  The default will be true, filtered blocks will be sent.
	 *  Filtered blocks have the required information to provided transaction
	 *  status and chaincode event names, however no chaincode event payload.
	 *  When using the non filtered blocks (full blocks) the user
	 *  will be required to have access to receive full blocks.
	 *  Registering a block listener with filtered=true may not
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
	 * @param {TransactionContext} txContext - The transaction context to use for
	 *  Identity, transaction ID, and nonce values
	 * @param {StartRequestOptions} options - The build
	 * @returns {byte[]} The start request bytes that need to be
	 *  signed.
	 */
	buildStartRequest(txContext = cp('txContext'), options = {}) {
		const method = 'buildStartRequest';
		logger.debug('%s - start', method);

		const {startBlock, endBlock, filtered} = options;
		this.start_block = this._checkBlockNum(startBlock);
		this.end_block = this._checkBlockNum(endBlock);
		if (this.start_block && this.end_block && this.end_block.greaterThan && this.start_block.greaterThan) {
			if (this.start_block.greaterThan(this.end_block)) {
				throw new Error('"startBlock" must not be greater than "endBlock"');
			}
		}
		
		if (typeof filtered === 'boolean') {
			this.filtered = filtered;
		}

		// build a new transaction ID and nonce
		txContext.calculateTxId();

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
			txContext.txId
		);

		const seekHeader = buildHeader(txContext.user.getIdentity(), channelHeader, txContext.nonce);
		const seekPayload = new fabprotos.common.Payload();
		seekPayload.setHeader(seekHeader);
		seekPayload.setData(seekInfo.toBuffer());
		this.seekPayloadBytes = seekPayload.toBuffer();

		return this.seekPayloadBytes;
	}

	/**
	 * Use this method with a TransactionContext that contains a User that has
	 * a Signing Identity.
	 * OR
	 * Use this method with a byte[] to set the signature
	 * when the application has done the signing outside of
	 * this object.
	 * Use the results of the {@link Proposal#buildStartRequest}
	 * as the bytes that will be signed.
	 * @param {TransactionContext | byte[]} param - When 'param' is a
	 * {@link TransactionContext} the signing identity of the user
	 *  will sign the current commit bytes as generated by {@link Proposal#buildStartRequest}.
	 *  When the 'param' is a byte[], the bytes will be used as the final
	 *  start request signature.
	 */
	signStartRequest(param = cp('param')) {
		if (param.type === TransactionContext.TYPE) {
			const txContext = param;
			const signer = txContext.user.getSigningIdentity();
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
	getSignedStartRequestEnvelope() {
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
	 * Send a Deliver request to the peer event service.
	 *
	 * @param {byte[]} [envelope] - Optional. Byte data to be included in the
	 *  request. If not included will use the start request and signature
	 *  within this instance. This must be a protobuf encoded byte array of the
	 *  [common.Envelope]{@link https://github.com/hyperledger/fabric/blob/v1.0.0/protos/common/common.proto#L132}
	 *  that contains a [SeekInfo]{@link https://github.com/hyperledger/fabric/blob/v1.0.0/protos/orderer/ab.proto#L54}
	 *  in the <code>payload.data</code> property of the envelope.
	 *  The <code>header.channelHeader.type</code> must be set to
	 *  [common.HeaderType.DELIVER_SEEK_INFO]{@link https://github.com/hyperledger/fabric/blob/v1.0.0/protos/common/common.proto#L44}
	 * @param {Number} timeout - A number indicating milliseconds to wait on the
	 *  response before rejecting the promise with a timeout error. This
	 *  overrides the request-timeout config connection setting of this instance.
	 */
	startReceiving(envelope = this.getSignedStartRequestEnvelope(), timeout) {
		const method = 'startReceiving';
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

		if (this.filtered) {
			this._stream = this._event_service.deliverFiltered();
		} else {
			this._stream = this._event_service.deliver();
		}

		this._stream.on('data', (deliverResponse) => {
			logger.debug('on.data - block stream:%s _current_stream:%s  peer:%s', stream_id, self._current_stream, self.url);
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

			if (deliverResponse.Type === 'block' || deliverResponse.Type === 'filtered_block') {
				try {
					let block = null;
					if (deliverResponse.Type === 'block') {
						block = BlockDecoder.decodeBlock(deliverResponse.block);
						self.last_block_number = convertToLong(block.header.number);
					} else {
						block = JSON.parse(JSON.stringify(deliverResponse.filtered_block));
						self.last_block_number = convertToLong(block.number);
					}
					logger.debug('on.data - incoming block number %s', self.last_block_number);

					self._processBlockEvents(block);
					self._processTxEvents(block);
					self._processChaincodeEvents(block);

					// check to see if we should shut things down
					if (self.end_block) {
						if (self.end_block.lessThanOrEqual(self.last_block_number)) {
							self.end_block_seen = true;
							self._disconnect(new EventHubDisconnectError(`Shutdown due to end block number has been seen: ${this.last_block_number}`));
						}
					}
				} catch (error) {
					logger.error('ChannelEventHub - ::' + (error.stack ? error.stack : error));
					logger.error('ChannelEventHub has detected an error ' + error.toString());
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

		this._stream.on('status', (response) => {
			logger.debug('on status - status received: %j  peer:%s', response, self.url);
			if (self._stream_starting) {
				logger.debug('on.status - stream %s not started', stream_id);
			}
		});

		this._stream.on('end', () => {
			logger.debug('on.end - event stream:%s _current_stream:%s peer:%s', stream_id, self._current_stream, self.url);
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

		this._stream.on('error', (err) => {
			logger.debug('on.error - block stream:%s _current_stream:%s  peer:%s', stream_id, self._current_stream, self.url);
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

		this._stream.write(envelope);

		logger.debug('%s - end - stream_id:', method, stream_id);
	}

	/*
	 * Internal method
	 * Will close out all callbacks
	 * Sends an error to all registered event callbacks
	 */
	_closeAllCallbacks(err) {
		const method = '_closeAllCallbacks - ' + this.name;
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
	 * Returns true if the stream is ready. and will attempt a restart when forced
	 *
	 * @param {boolean} force_reconnect - attempt to reconnect
	 */
	checkConnection() {
		const method = 'checkConnection';
		logger.debug('%s - start force_reconnect:%s', method, force_reconnect);

		if (force_reconnect) {
			try {
				if (this._stream) {
					const is_paused = this._stream.isPaused();
					logger.debug('checkConnection - grpc isPaused :%s', is_paused);
					if (is_paused) {
						this._stream.resume();
						logger.debug('checkConnection - grpc resuming');
					} else if (!ready) {
						// try to reconnect
						this.connect();
					}
				} else {
					logger.debug('checkConnection - stream was shutdown - will reconnected');
					// try to reconnect
					this.connect();
				}
			} catch (error) {
				logger.error('checkConnection - error ::' + (error.stack ? error.stack : error));
				const err = new Error('Problem during reconnect and the channel event hub is not connected ::%s', error);
				this._disconnect(err);
			}
		}

		return this.isStreamReady();
	}

	/**
	 * @typedef {Object} ChaincodeEvent
	 * @property {string} chaincode_id - The name of chaincode that sourced this
	 *           event.
	 * @property {string} tx_id - The transaction ID of this event.
	 * @property {string} event_name - The string that is the event_name of this
	 *           event as set by the chaincode during endorsement.
	 *           <code>stub.SetEvent(event_name, payload)</code>
	 * @property {byte[]} payload - Application-specific byte array that the chaincode
	 *           set when it called <code>stub.SetEvent(event_name, payload)</code>
	 */

	/**
	 * @typedef {Object} RegistrationOpts
	 * @property {boolean} unregister - Optional - This options setting indicates
	 *           the registration should be removed (unregister) when the event
	 *           is seen. When the application is using a timeout to only wait a
	 *           specified amount of time for the transaction to be seen, the timeout
	 *           processing should included the manual 'unregister' of the transaction
	 *           event listener to avoid the event callbacks being called unexpectedly.
	 *           The default for this setting is different for the different type of
	 *           event listeners. For block listeners the default is true, however
	 *           the event listener is assumed to have seen the final event only if
	 *           the end_block was set as a option and that end_block was seen by the
	 *           the listener. For transaction listeners the default is true and the
	 *           listener will be unregistered when a transaction with the id is
	 *           seen by this listener. For chaincode listeners the default will be
	 *           false as the match filter might be intended for many transactions
	 *           rather than a specific transaction or block as in the other listeners.
	 *           If not set and the endBlock has been set, the listener will be
	 *           automatically unregistered.
	 * @property {boolean} disconnect - Optional - This option setting Indicates
	 *           to the ChannelEventHub instance to automatically disconnect itself
	 *           from the peer's fabric service once the event has been seen.
	 *           The default is false. If not set and the endBlock has been set, the
	 *           the ChannelEventHub instance will automatically disconnect itself.
	 */

	/**
	 * Unregister the event listener represented by
	 * the <code>registrationId</code> number returned by
	 * the each of the register listener method
	 *
	 * @param {number} registrationId - The id of the registered listener.
	 */
	unregisterEventListener(registrationId = 'all') {
		logger.debug('unregisterEventListener - start - %s', registrationId);
		if (this._eventRegistrations.has(registrationId)) {
			this._eventRegistrations.delete(registrationId);
		}

		let found_block = false;
		let found_tx = false;
		let found_chaincode = false;
		for (const event_reg of this._eventRegistrations.values()) {
			if (event_reg.type === BLOCK) {
				found_block = true;
			} else if (event_reg.type = TX) {
				found_tx = true;
			} else if (event_reg.type = CHAINCODE) {
				found_chaincode = true;
			}
		}
		this._haveBlockListeners = found_block;
		this._haveTxListeners = found_tx;
		this._haveChaincodeListeners = found_chaincode;
	}

	/**
	 * Register a listener to receive chaincode events.
	 * <br><br>
	 * An error may occur in the connection establishment which runs
	 * asynchronously. The best practice would be to provide a
	 * "callback" callback to be notified when this ChannelEventHub has an issue.
	 *
	 * @param {string} chaincodeId - Id of the chaincode of interest
	 * @param {string|RegExp} event_name - The exact name of the chaincode event or
	 *  regular expression that will be matched against the name given to
	 *  the target chaincode's call
	 *  <code>stub.SetEvent(name, payload)</code>)
	 * @param {function} callback - callback function for matched events. It will
	 *  be called with five parameters when not using "as_array".
	 *  <ul>
	 *  <li> {Error} - will be null or will be an Error when 
	 *  this ChannelEventHub is shutdown. The shutdown may be caused by a network
	 *  or connection error, by a call to the "disconnect()" method or when
	 *  the fabric service ends the connection to this ChannelEventHub.
	 *  This callback will also be called with an Error when the ChannelEventHub is
	 *  shutdown due to the last block being received if replaying and requesting
	 *  the endBlock to be 'newest' or specific value.
	 *  <li>{@link ChaincodeEvent} - The chaincode event as produced by the chaincode,
	 *  <li>{Long} - the block number that contains this chaincode event
	 *  <li>{string} - the transaction ID that contains this chaincode event
	 *  <li>{string} - the transaction status of the transaction that contains this chaincode event
	 *  </ul>
	 *  When using "as_array: true" option, there will be two
	 *  parameters of an Error and an array of an event objects with the above values which may be used
	 *  as in the example below.
	 * @example <caption>Chaincode callback to process events when as_array:true </caption>
	 *        function myCallback(...events) {
	 *           for ({error, chaincode_event, block_num, tx_id, tx_status} of events) {
	 *                 if (error) {
	 *                     // handle the error
	 *                 } else {
	 *                     // process the chaincode event
	 *                 }
	 *           }
	 *        }
	 * @param {RegistrationOpts} options - Options on the registrations to allow
	 *  for start and end block numbers, automatically unregister and
	 *  automatically disconnect.
	 * 	Chaincode event listeners may also use the "as_array" option to
	 *  indicate that all the chaincode events found that match this
	 *  definition be sent to the callback as an array or call the callback for
	 *   each one individually.
	 * @returns {number} A numeric registration identifier to be used to
	 *  remove this registration using {@link ChannelEventHub#unregisterEvent})
	 */
	registerChaincodeEvent(eventName = cp('eventName'), callback = cp('callback'),	options) {
		logger.debug('registerChaincodeEvent - start');
		const event_name = new RegExp(eventName);
		const event_reg = new EventRegistration('chaincode', ++this._reg_counter, callback, options, false, event_name);
		this._eventRegistrations.set(event_reg.id, event_reg);
		this._haveChaincodeListeners = true;

		return event_reg.id;
	}


	/**
	 * Register a listener to receive all block committed to this channel.
	 * The listener's "callback" callback gets called on the arrival of every block.
	 * <br><br>
	 * An error may occur in the connection establishment which runs
	 * asynchronously. The best practice would be to provide an
	 * "callback" callback to be notified when this ChannelEventHub has an issue.
	 *
	 * @param {function} callback - Callback function that takes a two parameters
	 *  of a {Error} and {@link Block} object.
	 *  The Error will be null or will be an Error when 
	 *  this ChannelEventHub is shutdown. The shutdown may be caused by a network
	 *  or connection error, by a call to the "disconnect()" method or when
	 *  the fabric service ends the connection to this ChannelEventHub.
	 *  This callback will also be called with an Error when the ChannelEventHub is
	 *  shutdown due to the last block being received if replaying and requesting
	 *  the endBlock to be 'newest' or specific value.
	 * @param {RegistrationOpts} options - Options on the registrations to allow
	 *  for start and end block numbers, automatically unregister and
	 *  automatically disconnect.
	 * @returns {int} This is the block registration number that must be
	 *  used to unregister this block listener. see [unregisterBlockEvent()]{@link ChannelEventHub#unregisterBlockEvent}
	 */
	registerBlockEvent(callback = cp('callback'), options) {
		logger.debug('registerBlockEvent - start');

		const event_reg = new EventRegistration(BLOCK, ++this._reg_counter, callback, options, false, null);
		this._eventRegistrations.set(event_reg.id, event_reg);
		this._haveBlockListeners = true;

		return event_reg.id;
	}

	/**
	 * Register a callback function to receive a notification when the transaction
	 * by the given id has been committed into a block. Using the special string
	 * 'all' will indicate that this listener will notify (call) the callback
	 * for every transaction received from the fabric service.
	 * <br><br>
	 * An error may occur in the connection establishment which runs
	 * asynchronously. The best practice would be to provide a
	 * "callback" callback to be notified when this ChannelEventHub has an issue.
	 *
	 * @param {string} txid - Transaction id string or 'all'
	 * @param {function} callback - Callback function that takes a parameter of
	 *  Error, 
	 *  transaction ID, 
	 *  status,
	 *  and the block number of this transaction committed to the ledger
	 *  The Error will be null or will be an Error when 
	 *  this ChannelEventHub is shutdown. The shutdown may be caused by a network
	 *  or connection error, by a call to the "disconnect()" method or when
	 *  the fabric service ends the connection to this ChannelEventHub.
	 *  This callback will also be called with an Error when the ChannelEventHub is
	 *  shutdown due to the last block being received if replaying and requesting
	 *  the endBlock to be 'newest' or specific value.
	 * @param {RegistrationOpts} options - Options on the registrations to allow
	 *  for start and end block numbers, automatically unregister and
	 *  automatically disconnect.
	 * @returns {string} The transaction ID that was used to register this event listener.
	 *  May be used to unregister this event listener.
	 */
	registerTxEvent(txid = cp('txid'), callback = cp('callback'), options) {
		logger.debug('registerTxEvent start - txid:%s', txid);

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
	 * private internal method for processing block events
	 * @param {Object} block protobuf object
	 */
	_processBlockEvents(block) {
		const method = '_processBlockEvents';
		if (!this._haveBlockListeners) {
			logger.debug('%s - no block listeners', method);
			return;
		}
		for (const event_reg of this._eventRegistrations.values()) {
			if (event_reg.type === BLOCK) {
				logger.debug('%s - calling block listener callback', method);
				block_reg.onEvent(null, block);

				// check to see if we should automatically unregister or/and disconnect this hub
				if (block_reg.unregister) {
					this.unregisterEvent(block_reg.id);
					logger.debug('%s - automatically unregister block listener for %s', method, block.id);
				}
				if (block_reg.disconnect) {
					logger.debug('%s - automatically disconnect for block listener', method);
					this._disconnect(new EventHubDisconnectError('Shutdown due to disconnect on block registration'));
				}
			}
		}
	}

	/*
	 * private internal method for processing tx events
	 * @param {Object} block protobuf object which might contain transactions
	 */
	_processTxEvents(block) {
		const method = '_processTxEvents';
		if (block.number) {
			logger.debug('%s filtered block number=%s', method, block.number);
			if (block.filtered_transactions) {
				for (const filtered_transaction of block.filtered_transactions) {
					this._callTransactionListener(filtered_transaction.txid,
						filtered_transaction.tx_validation_code,
						block.number);
				}
			}
		} else {
			logger.debug('%s full block number=%s', method, block.header.number);
			const txStatusCodes = block.metadata.metadata[fabprotos.common.BlockMetadataIndex.TRANSACTIONS_FILTER];
			for (let index = 0; index < block.data.data.length; index++) {
				const channel_header = block.data.data[index].payload.header.channel_header;
				this._callTransactionListener(channel_header.tx_id,
					txStatusCodes[index],
					block.header.number);
			}
		}
	}

	/* internal utility method */
	_callTransactionListener(tx_id, val_code, block_num) {
		const method = '_callTransactionListener';
		
		for (const trans_reg of this._eventRegistrations.values()) {
			// check each listener to see if this transaction ID matches
			if (trans_reg.type === TX && (trans_reg.event === tx_id || trans_reg.event === ALL)) {
				logger.debug('%s - about to call the transaction call back for code=%s tx=%s', method, val_code, tx_id);
				const status = convertValidationCode(val_code);
				trans_reg.onEvent(null, tx_id, status, block_num);

				// check to see if we should automatically unregister and/or disconnect this event hub
				if (trans_reg.unregister) {
					this.unregisterEvent(trans_reg.id);
					logger.debug('%s - automatically unregister tx listener for %s', method, tx_id);
				}
				if (trans_reg.disconnect) {
					logger.debug('%s - automatically disconnect with tx listener setting', method);
					this._disconnect(new EventHubDisconnectError('Shutdown due to disconnect on transaction id registration'));
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
				logger.debug(`%s - trans index=${index}`, method);
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
			if (chaincode_reg.as_array) {
				// call as an array ... all at once
				chaincode_reg.onEvent(null, events);
			} else {
				for (const event of events) {
					// call one at a time
					chaincode_reg.onEvent(null, event.chaincode_event, event.block_num, event.tx_id, event.tx_status);
				}
			}
			// see if we should automatically unregister this event listener or disconnect this event hub
			if (chaincode_reg.unregister) {
				this.unregisterEventListener(chaincode_reg.id);
				logger.debug('%s - automatically unregister chaincode event listener setting', method);
			}
			if (chaincode_reg.disconnect) {
				logger.debug('%s - automatically disconnect event hub with chaincode event listener setting', method);
				this._disconnect(new EventHubDisconnectError('Shutdown due to disconnect on chaincode event registration'));
			}
		}
	}

	_queueChaincodeEvent(chaincode_event, block_num, tx_id, val_code, all_events) {
		const method = '_queueChaincodeEvent';
		logger.debug('%s - chaincode_event %s', method, chaincode_event);

		const tx_status = convertValidationCode(val_code);

		logger.debug('%s - txid=%s  val_code=%s', method, tx_id, tx_status);

		for (const chaincode_reg of this._eventRegistrations.values()) {
			// check each listener to see if this chaincode event matches
			if (chaincode_reg.type === CHAINCODE && chaincode_reg.event.test(chaincode_event.event)) {
				// we have a match - save it to be sent later
				logger.debug('%s - queuing chaincode event: %s', method, chaincode_event.event_name);
				let events = all_events.get(chaincode_reg);
				if (!events) {
					events = [];
					all_events.set(chaincode_reg, events);
				}
				events.push({chaincode_event, block_num, tx_id, tx_status});
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
		const method = 'isStreamReasy';
		let ready = false;
		if (this._stream) {
			if (this._stream.isPaused()) {
				logger.debug('%s - grpc isPaused :%s', method, is_paused);
			} else {
				ready = stream.readable && stream.writable && stream.reading;
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
	 * @param {function} callback - Callback for event matches
	 * @param {RegistrationOpts} options - event registration options
	 * @param {boolean} default_unregister - the default value for the unregister
	 *  setting if not option setting is set by the user
	 * @param {boolean} default_disconnect - the default value for the disconnect
	 *  setting if not option setting is set by the user
	 * @param {string} type - a string to indicate the type of event registration
	 *  "block", "tx", or "chaincode".
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
	constructor(type = cp('type'), id, callback, options = {}, default_unregister, event) {
		this.type = type;
		this.id = id;
		this.callbackFn = callback;
		this.unregister = typeof options.unregister === 'boolean' ? options.unregister : default_unregister;
		this.disconnect = typeof options.disconnect === 'boolean' ? options.disconnect : false;
		this.as_array = typeof options.as_array === 'boolean' ? options.as_array : true;
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
