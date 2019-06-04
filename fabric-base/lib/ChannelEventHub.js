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

/**
 * Transaction processing in fabric v1.1 is a long operation spanning multiple
 * components (application, endorsing peer, orderer, committing peer) and takes
 * a relatively lengthy period of time (think seconds instead of milliseconds)
 * to complete. As a result the applications must design their handling of the
 * transaction lifecycle in an asynchronous fashion. After the transaction proposal
 * has been successfully [endorsed]{@link Channel#sendTransactionProposal}, and before
 * the transaction message has been successfully [sent]{@link Channel#sendTransaction}
 * to the orderer, the application should register a listener to be notified
 * when the transaction achieves finality, which is when the block
 * containing the transaction gets added to the peer's ledger/blockchain.
 * <br><br>
 * Fabric committing peers provide a block delivery service to publish blocks or
 * filtered blocks to connected fabric-clients. See [connect]{@link ChannelEventHub#connect}
 * on connection options and how this ChannelEventHub may connect to the fabric
 * service. For more information on the service see [deliver]{@link https://hyperledger-fabric.readthedocs.io/en/release-1.2/peer_event_services.html}.
 * A block gets published whenever the committing peer adds a validated block
 * to the ledger.
 * When a ChannelEventHub receives a block it will investigate the block and notify
 * interested listeners with the related contents of the block (e.g. transactionId, status).
 * There are three types of listeners that will get notified by
 * the ChannelEventHub after it receives a published block from the fabric deliver service.
 * <li> A "block listener" gets called for every block received. The listener
 *     will be passed a fully decoded {@link Block} object unless the connection
 *     to the fabric service is using filtered blocks.
 *     See [registerBlockEvent]{@link ChannelEventHub#registerBlockEvent}
 * <li>A "transaction listener" gets called when the specific transaction
 *     is committed (discovered inside a published block). The listener
 *     may also be registered to listen to "all" transactions.
 *     The listener will be passed the transaction id, transaction status and block number.
 *     See [registerTxEvent]{@link ChannelEventHub#registerTxEvent}
 * <li>A "chaincode event listener" gets called when a specific
 *     chaincode event is discovered within a block.
 *     The listener will be passed the block number, transaction id, and
 *     transaction status. The {@link ChaincodeEvent} will be also be passed,
 *     however the payload of the event will not be passed if
 *     the connection to the fabric service is publishing filtered blocks.
 *     See [registerChaincodeEvent]{@link ChannelEventHub#registerChaincodeEvent}
 * <br><br><br>
 * When the ChannelEventHub connects to the peer, it tells the peer which block
 * to begin delivering from. If no start block is provided, then the ChannelEventHub will
 * only receive events for the most recently committed block onwards.
 * To avoid missing events in blocks that are published while the ChannelEventHub is
 * offline, the application should record the most recently processed block,
 * and resume event delivery from this block number on startup. In this way,
 * there is no custom recovery path for missed events, and the normal processing
 * code may execute instead. You may also include an endBlock number if you
 * wish to stop listening after receiving a range of events.
 *
 * @example
 * const eh = channel.newChannelEventHub(peer);
 * await eh.connect();
 * eh.registerXXX(...);
 * const bytes = eh.buildStartRequest();
 * const sig = sign(bytes); //user code
 * 
 * eh.close();
 *
 * // register the listener before calling "connect()" so there
 * // is an error callback ready to process an error in case the
 * // connect() call fails
 * eh.registerTxEvent(
 *   'all', // this listener will be notified of all transactions
 *     (tx, status, block_num) => {
 *        record(tx, status, block_num);
 *        console.log(util.format('Transaction %s has completed', tx));
 *     },
 *     (err) => {
 *        eh.unregisterTxEvent('all');
 *        reportError(err);
 *        console.log(util.format('Error %s! Transaction listener has been ' +
 *                 'deregistered for %s', err, eh.url));
 *     }
 * );
 *
 * eh.connect();
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

	constructor(name = checkParameter('name'), channel = checkParameter('channel')) {
		logger.debug('const - start');
		super(name, channel.client);
		this.type = TYPE;


		// the last block number received
		this.last_block_number = null;
		
		this.filtered = true; // the default
		this.start_block = NEWEST;
		this.end_block = null;
		this.end_block_seen = false;

		// hashtable of clients registered for chaincode events
		this._chaincodeRegistrants = new Map();
		// set of clients registered for block events
		this._block_registrant_count = 0;
		this._blockRegistrations = {};
		// registered transactional events
		this._transactionRegistrations = {};

		// grpc event service interface
		this.eventService = null;
		// grpc chat streaming interface
		this._stream = null;
		// connect count for this instance
		this._current_stream = 0;

		// service state
		this.connected = false;
		this._connect_running = false;
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
		if (this.eventService) {
			logger.debug('%s - event service exist, will close this peer %s', method, this.name);
			this.close();
		}
		if (!this.eventService && this.options.url) {
			logger.debug('%s - event service does not exist, will create service for this peer %s', method, this.name);
			this.eventService = new fabprotos.protos.Deliver(this.endpoint.addr, this.endpoint.creds, this.options);
		}
		await this.waitForReady(this.eventService);
		return;
	}

	/**
	 * @typedef {Object} SignedStartRequest
	 * @property {Buffer} signature - the signature over this payload
	 * @property {Buffer} payload - the payload byte array to be sent to the peer
	 */

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
	 * @param {StartRequestOptions} request - The build
	 * @returns {byte[]} The start request bytes that need to be
	 *  signed.
	 */
	buildStartRequest(txContext = checkParameter('txContext'), request = {}) {
		const method = 'buildStartRequest';
		logger.debug('%s - start', method);

		const {startBlock, endBlock, filtered} = request;
		
		this._checkReplay(request);
		
		if (typeof filtered === 'boolean') {
			this.filtered = filtered;
		}

		// build a new transaction ID and nonce
		txContext.calculateTxId();

		let behavior = fabprotos.orderer.SeekInfo.SeekBehavior.BLOCK_UNTIL_READY;

		// build start
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

		// build stop
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
	signStartRequest(param = checkParameter('param')) {
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
	 * @param {byte[]} [envelope] - Optional.Byte data to be included in the
	 *  request. If not included will use the built start request and signature
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

		let rto = this.options['request-timeout'];
		if (typeof timeout === 'number') {
			rto = timeout;
		}

		this.end_block_seen = false;

		this._connect_running = true;
		this._current_stream++;
		const stream_id = this._current_stream;
		logger.debug('%s - start stream:%s', method, stream_id);
		const self = this;
		const connection_setup_timeout = setTimeout(() => {
			logger.error('%s - timed out after:%s', method, rto);
			self._connect_running = false;
			self._disconnect(new Error('TIMEOUT - Unable to receive blocks from the fabric peer event service'));
		}, rto);

	
		if (this.filtered) {
			this._stream = this.eventService.deliverFiltered();
		} else {
			this._stream = this.eventService.deliver();
		}

		this._stream.on('data', (deliverResponse) => {
			logger.debug('on.data - block stream:%s _current_stream:%s  peer:%s', stream_id, self._current_stream, self.url);
			if (stream_id !== self._current_stream) {
				logger.debug('on.data - incoming block was from a cancelled stream');
				return;
			}

			if (self._connect_running) {
				self._connect_running = false;
				clearTimeout(connection_setup_timeout);
			}

			if (self.connected === true) {
				logger.debug('on.data - new block received - check event registrations');
			} else {
				logger.debug('on.data - first block received , this ChannelEventHub now registered');
				self.connected = true;
			}

			logger.debug('on.data - grpc stream is ready :%s', isStreamReady(self));
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

					// somebody may have registered to receive this block
					self._processBlockEvents(block);
					self._processTxEvents(block);
					self._processChaincodeEvents(block);

					// check to see if we should shut things down
					self._checkReplayEnd();
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
					logger.debug('on.data - status received - %s', deliverResponse.status);
					self._disconnect(new Error(`Received status message on the block stream. status:${deliverResponse.status}`));
				}
			} else {
				logger.debug('on.data - unknown deliverResponse');
				logger.error('ChannelEventHub has received and unknown message type %s', deliverResponse.Type);
			}
		});

		this._stream.on('status', (response) => {
			logger.debug('on status - status received: %j  peer:%s', response, self.url);
		});

		this._stream.on('end', () => {
			logger.debug('on.end - event stream:%s _current_stream:%s peer:%s', stream_id, self._current_stream, self.url);
			if (stream_id !== self._current_stream) {
				logger.debug('on.end - incoming message was from a cancelled stream');
				return;
			}
			self._connect_running = false;
			clearTimeout(connection_setup_timeout);

			logger.debug('on.end - grpc stream is ready :%s', isStreamReady(self));
			self._disconnect(new Error('fabric peer service has disconnected due to an "end" event'));
		});

		this._stream.on('error', (err) => {
			logger.debug('on.error - block stream:%s _current_stream:%s  peer:%s', stream_id, self._current_stream, self.url);
			if (stream_id !== self._current_stream) {
				logger.debug('on.error - incoming message was from a cancelled stream');
				logger.debug('on.error - %s %s', new Date(), err);
				return;
			}
			self._connect_running = false;
			clearTimeout(connection_setup_timeout);

			logger.debug('on.error - grpc stream is ready :%s', isStreamReady(self));
			if (err instanceof Error) {
				self._disconnect(err);
			} else {
				self._disconnect(new Error(err));
			}
		});

		this._stream.write(envelope);

		logger.debug('_connect - end - stream_id:', stream_id);
	}

	/**
	 * Disconnects the ChannelEventHub from the fabric peer service.
	 * Will close all event listeners and send an Error object
	 * with the message "ChannelEventHub has been shutdown" to
	 * all listeners.
	 */
	close() {
		const method = 'close';
		logger.debug('%s - start - hub:%s', method, this.name);
		if (this._disconnect_running) {
			logger.debug('%s - disconnect is running', method);
		} else {
			this._disconnect_running = true;
			this._disconnect(new Error('ChannelEventHub has been shutdown'));
			this._disconnect_running = false;
		}
	}

	/*
	 * Internal method
	 * Disconnects the connection to the fabric peer service.
	 * Will close all event listeners and send an `Error` to
	 * all listeners on "callback" callback.
	 */
	_disconnect(err) {
		const method = '_disconnect';
		logger.debug('%s - start - hub:%s', method, this.name);
		logger.debug('%s - called due to:: %s, peer:%s', method, err.message, this.url);
		this._connect_running = false;
		this._closeAllCallbacks(err);
		this._shutdown();

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
			this._stream = null;
		}
		if (this.eventService) {
			this.eventService.close();
		}
		this.connected = false;
	}

	/*
	 * Internal method
	 * Will close out all callbacks
	 * Sends an error to all registered event callbacks
	 */
	_closeAllCallbacks(err) {
		const method = '_closeAllCallbacks - ' + this.url;
		logger.debug('%s - start', method);

		logger.debug('%s - blockOnErrors %s', method, Object.keys(this._blockRegistrations).length);
		for (const key in this._blockRegistrations) {
			const block_registration = this._blockRegistrations[key];
			logger.debug('%s - calling block error callback for %s', method, key);
			block_registration.onEvent(err);
		}
		this._blockRegistrations = {};

		logger.debug('%s - transactionOnErrors %s', method, Object.keys(this._transactionRegistrations).length);
		for (const key in this._transactionRegistrations) {
			const trans_reg = this._transactionRegistrations[key];
			logger.debug('%s - calling transaction error callback for %s', method, key);
			trans_reg.onEvent(err);
		}
		this._transactionRegistrations = {};

		logger.debug('%s - chaincodeRegistrants %s', method, this._chaincodeRegistrants.size);
		for (const chaincode_reg of this._chaincodeRegistrants.keys()) {
			logger.debug('%s - closing this chaincode event chaincode_id:%s event_name:%s', method, chaincode_reg.chaincode_id, chaincode_reg.event_name);
			chaincode_reg.event_reg.onEvent(err);
		}
		this._chaincodeRegistrants.clear();

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

	/*
	 * Internal method
	 * checks the startBlock/endBlock options
	 * checks that only one registration when using startBlock/endBlock
	 * checks that startBlock has been set during connect, then not allow
	 *    registration with startBlock/endBlock
	 * @returns enum of how the endBlock and startBlock have been set
	 */
	_checkReplay(options) {
		const method = '_checkReplay';
		logger.debug('%s - start', method);

		this.start_block = this._checkBlockNum(options.startBlock);
		this.end_block = this._checkBlockNum(options.endBlock);
		if (this.start_block && this.end_block && this.end_block.greaterThan && this.start_block.greaterThan) {
			if (this.start_block.greaterThan(this.end_block)) {
				throw new Error('"startBlock" must not be greater than "endBlock"');
			}
		}

		logger.debug('%s - end', method);
		return result;
	}

	/**
	 * Returns true if the stream is ready. and will attempt a restart when forced
	 *
	 * @param {boolean} force_reconnect - attempt to reconnect
	 */
	checkConnection(force_reconnect) {
		logger.debug('checkConnection - start force_reconnect:%s', force_reconnect);
		const ready = isStreamReady(this);
		logger.debug('checkConnection -  %s with stream channel ready %s', this.url, ready);

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
						this._connect_running = false;
						this._connect({force: true});
					}
				} else {
					logger.debug('checkConnection - stream was shutdown - will reconnected');
					// try to reconnect
					this._connect_running = false;
					this._connect({force: true});
				}
			} catch (error) {
				logger.error('checkConnection - error ::' + (error.stack ? error.stack : error));
				const err = new Error('Problem during reconnect and the event hub is not connected ::%s', error);
				this._disconnect(err);
			}
		}

		return isStreamReady(this);
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
	 * @returns {Object} An object that should be treated as an opaque handle used
	 *  to unregister (see [unregisterChaincodeEvent()]{@link ChannelEventHub#unregisterChaincodeEvent})
	 */
	registerChaincodeEvent(
		chaincodeId = checkParameter('chaincodeId'),
		eventName = checkParameter('eventName'),
		callback = checkParameter('callback'),
		options) {
		logger.debug('registerChaincodeEvent - start');

		const event_reg = new EventRegistration(callback, options, false, false);

		let as_array = false; // default is send one at a time
		if (options && typeof options.as_array === 'boolean') {
			as_array = options.as_array;
		}
		const chaincode_reg = new ChaincodeRegistration(chaincodeId, eventName, event_reg, as_array);

		this._chaincodeRegistrants.set(chaincode_reg, chaincode_reg);

		return chaincode_reg;
	}

	/**
	 * Unregister the chaincode event listener represented by
	 * the <code>listener_handle</code> object returned by
	 * the registerChaincodeEvent() method
	 *
	 * @param {Object} listener_handle - The handle object returned from the
	 *        call to registerChaincodeEvent.
	 */
	unregisterChaincodeEvent(listener_handle = checkParameter('listener_handle')) {
		logger.debug('unregisterChaincodeEvent - start');
		if (this._chaincodeRegistrants.has(listener_handle)) {
			this._chaincodeRegistrants.delete(listener_handle);
		}
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
	registerBlockEvent(callback = checkParameter('callback'), options) {
		logger.debug('registerBlockEvent - start');

		const block_registration_number = ++this._block_registrant_count;
		const block_registration = new EventRegistration(callback, options, false, false);
		this._blockRegistrations[block_registration_number] = block_registration;

		return block_registration_number;
	}

	/**
	 * Unregister the block event listener using the block
	 * registration number that is returned by the call to
	 * the registerBlockEvent() method.
	 *
	 * @param {int} block_registration_number - The block registration number
	 *        that was returned during registration.
	 */
	unregisterBlockEvent(block_registration_number) {
		logger.debug('unregisterBlockEvent - start  %s', block_registration_number);
		const block_reg = this._blockRegistrations[block_registration_number];
		if (block_reg) {
			delete this._blockRegistrations[block_registration_number];
		}
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
	registerTxEvent(txid = checkParameter('txid'), callback = checkParameter('callback'), options) {
		logger.debug('registerTxEvent start - txid:%s', txid);

		let default_unregister = true;
		let _txid = txid;
		if (txid.toLowerCase() === ALL) {
			_txid = txid.toLowerCase();
			default_unregister = false;
		}
		const temp = this._transactionRegistrations[_txid];
		if (temp) {
			throw new Error(`TransactionId (${txid}) has already been registered`);
		}

		const trans_registration = new EventRegistration(callback, options, default_unregister, false);
		this._transactionRegistrations[_txid] = trans_registration;

		return _txid;
	}

	/**
	 * Unregister transaction event listener for the transaction id.
	 * @param {string} txid - The transaction id
	 */
	unregisterTxEvent(txid) {
		logger.debug('unregisterTxEvent txid ' + txid);
		const tx_reg = this._transactionRegistrations[txid];
		if (tx_reg) {
			delete this._transactionRegistrations[txid];
		}
	}

	isFiltered() {
		return !!this.filtered;
	}

	/*
	 * private internal method for processing block events
	 * @param {Object} block protobuf object
	 */
	_processBlockEvents(block) {
		if (Object.keys(this._blockRegistrations).length === 0) {
			logger.debug('_processBlockEvents - no registered block event "listeners"');
			return;
		}

		// send to all registered block listeners
		Object.keys(this._blockRegistrations).forEach((key) => {
			const block_reg = this._blockRegistrations[key];
			logger.debug('_processBlockEvents - calling block listener callback');
			block_reg.onEvent(null, block);

			// check to see if we should automatically unregister or/and disconnect this hub
			if (block_reg.unregister) {
				this.unregisterBlockEvent(key);
				logger.debug('_processBlockEvents - automatically unregister block listener for %s', key);
			}
			if (block_reg.disconnect) {
				logger.debug('_processBlockEvents - automatically disconnect');
				this._disconnect(new EventHubDisconnectError('Shutdown due to disconnect on block registration'));
			}
		});
	}

	/*
	 * private internal method for processing tx events
	 * @param {Object} block protobuf object which might contain transactions
	 */
	_processTxEvents(block) {
		if (Object.keys(this._transactionRegistrations).length === 0) {
			logger.debug('_processTxEvents - no registered transaction event "listeners"');
			return;
		}

		if (block.number) {
			logger.debug(`_processTxEvents filtered block num=${block.number}`);
			if (block.filtered_transactions) {
				for (const filtered_transaction of block.filtered_transactions) {
					this._checkTransactionId(filtered_transaction.txid,
						filtered_transaction.tx_validation_code,
						block.number);
				}
			}
		} else {
			logger.debug(`_processTxEvents block num=${block.header.number}`);
			const txStatusCodes = block.metadata.metadata[fabprotos.common.BlockMetadataIndex.TRANSACTIONS_FILTER];
			for (let index = 0; index < block.data.data.length; index++) {
				const channel_header = block.data.data[index].payload.header.channel_header;
				this._checkTransactionId(channel_header.tx_id,
					txStatusCodes[index],
					block.header.number);
			}
		}
	}

	/* internal utility method */
	_checkTransactionId(tx_id, val_code, block_num) {
		const trans_reg = this._transactionRegistrations[tx_id];
		if (trans_reg) {
			this._callTransactionListener(tx_id, val_code, block_num, trans_reg);
		}
		const all_trans_reg = this._transactionRegistrations[ALL];
		if (all_trans_reg) {
			this._callTransactionListener(tx_id, val_code, block_num, all_trans_reg);
		}
		if (trans_reg || all_trans_reg) {
			logger.debug('_callTransactionListener - call backs found for this transaction %s', tx_id);
		} else {
			logger.debug('_callTransactionListener - no call backs found for this transaction %s', tx_id);
		}
	}

	/* internal utility method */
	_callTransactionListener(tx_id, val_code, block_num, trans_reg) {
		logger.debug('_callTransactionListener - about to call the transaction call back for code=%s tx=%s', val_code, tx_id);
		const status = convertValidationCode(val_code);

		trans_reg.onEvent(null, tx_id, status, block_num);

		// check to see if we should automatically unregister or/and disconnect this hub
		if (trans_reg.unregister) {
			this.unregisterTxEvent(tx_id);
			logger.debug('_callTransactionListener - automatically unregister tx listener for %s', tx_id);
		}
		if (trans_reg.disconnect) {
			logger.debug('_callTransactionListener - automatically disconnect');
			this._disconnect(new EventHubDisconnectError('Shutdown due to disconnect on transaction id registration'));
		}
	}

	/*
	 * private internal method for processing chaincode events
	 * @param {Object} block protobuf object which might contain the chaincode event from the fabric
	 */
	_processChaincodeEvents(block) {
		const method = '_processChaincodeEvents';
		if (this._chaincodeRegistrants.size === 0) {
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
					logger.error('on.data - Error unmarshalling transaction=', err);
				}
			}
		}

		// send all events for each listener
		for (const [chaincode_reg, events] of all_events.entries()) {
			if (chaincode_reg.as_array) {
				// call as an array ... all at once
				chaincode_reg.event_reg.onEvent(null, events);
			} else {
				for (const event of events) {
					// call one at a time
					chaincode_reg.event_reg.onEvent(null, event.chaincode_event, event.block_num, event.tx_id, event.tx_status);
				}
			}
			// see if we should automatically unregister this event listener or disconnect this hub
			if (chaincode_reg.event_reg.unregister) {
				this.unregisterChaincodeEvent(chaincode_reg);
				logger.debug('%s - automatically unregister chaincode event listener %s', method, chaincode_reg);
			}
			if (chaincode_reg.event_reg.disconnect) {
				logger.debug('%s - automatically disconnect event hub with chaincode event listener disconnect=true %s', method, chaincode_reg);
				this._disconnect(new EventHubDisconnectError('Shutdown due to disconnect on chaincode event registration'));
			}
		}
	}

	_queueChaincodeEvent(chaincode_event, block_num, tx_id, val_code, all_events) {
		const method = '_queueChaincodeEvent';
		logger.debug('%s - chaincode_event %s', method, chaincode_event);

		const tx_status = convertValidationCode(val_code);

		logger.debug('%s - txid=%s  val_code=%s', method, tx_id, tx_status);

		for (const chaincode_reg of this._chaincodeRegistrants.keys()) {
			// check each listener to see if this chaincode event matches
			if (chaincode_reg.chaincode_id.test(chaincode_event.chaincode_id) &&
				chaincode_reg.event_name.test(chaincode_event.event_name)) {
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
	 * utility method to mark if this ChannelEventHub has seen the last
	 * in the range when this event hub is using startBlock/endBlock
	 */
	_checkReplayEnd() {
		if (this.end_block) {
			if (this.end_block.lessThanOrEqual(this.last_block_number)) {
				this.end_block_seen = true;
				this._disconnect(new EventHubDisconnectError(`Shutdown due to end block number has been seen: ${this.last_block_number}`));
			}
		}
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
 * internal utility method to check if the stream is ready.
 * The stream must be readable, writeable and reading to be 'ready'
 */
function isStreamReady(self) {
	const method = 'isStreamReady';
	let ready = false;
	if (self._stream) {
		const stream = self._stream;
		ready = stream.readable && stream.writable && stream.reading;
		logger.debug('%s - stream.readable %s :: %s', method, stream.readable, self.url);
		logger.debug('%s - stream.writable %s :: %s', method, stream.writable, self.url);
		logger.debug('%s - stream.reading %s :: %s', method, stream.reading, self.url);
		logger.debug('%s - stream.read_status %s :: %s', method, stream.read_status, self.url);
		logger.debug('%s - stream.received_status %s :: %s', method, stream.received_status, self.url);
	}

	return ready;
}

/*
 * The ChaincodeRegistration is used internal to the ChannelEventHub to hold chaincode
 * event registration callbacks.
 */
class ChaincodeRegistration {
	/**
	 * Constructs a chaincode callback entry
	 *
	 * @param {string} chaincode_id - chaincode id
	 * @param {string|RegExp} event_name - The regex used to filter events
	 * @param {EventRegistration} event_reg - event registrations callbacks
	 * @param {as_array} as_array - should all the chaincode events found that match this
	 *  definition be sent to the callback as an array or call the callback for
	 *  each one individually.
	 */
	constructor(chaincode_id, event_name, event_reg, as_array) {
		// chaincode id (regex filter)
		this.chaincode_id = new RegExp(chaincode_id);
		// event name regex filter
		this.event_name = new RegExp(event_name);
		this.event_reg = event_reg;
		this.events = [];
		this.as_array = as_array;
	}

	toString() {
		return 'ChaincodeRegistration:' + this.chaincode_id +
			' event_name:' + this.event_name;
	}
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
	 *        setting if not option setting is set by the user
	 * @param {boolean} default_disconnect - the default value for the disconnect
	 *        setting if not option setting is set by the user
	 */
	constructor(callback, options, default_unregister, default_disconnect) {
		this._callbackFn = callback;
		this.unregister = default_unregister;
		this.disconnect = default_disconnect;

		if (options) {
			if (typeof options.unregister === 'undefined' || options.unregister === null) {
				logger.debug('const-EventRegistration - unregister was not defined, using default of %s', default_unregister);
			} else if (typeof options.unregister === 'boolean') {
				this.unregister = options.unregister;
				logger.debug('const-EventRegistration - unregister was defined, %s', this.unregister);
			} else {
				throw new Error('Event registration has invalid value for "unregister" option');
			}
			if (typeof options.disconnect === 'undefined' || options.disconnect === null) {
				logger.debug('const-EventRegistration - disconnect was not defined, using default of %s', default_disconnect);
			} else if (typeof options.disconnect === 'boolean') {
				this.disconnect = options.disconnect;
				logger.debug('const-EventRegistration - disconnect was defined, %s', this.disconnect);
			} else {
				throw new Error('Event registration has invalid value for "disconnect" option');
			}
		}
	}

	onEvent(...args) {
		try {
			this._callbackFn(...args);
		} catch (error) {
			logger.warn('Event notification callback failed', error);
		}
	}
}
