/*
 Copyright 2016, 2018 London Stock Exchange All Rights Reserved.

 SPDX-License-Identifier: Apache-2.0

*/

'use strict';
const Long = require('long');
const utils = require('./utils.js');
const clientUtils = require('./client-utils.js');
const logger = utils.getLogger('ChannelEventHub.js');

const BlockDecoder = require('./BlockDecoder.js');

const grpc = require('grpc');
const _abProto = grpc.load(__dirname + '/protos/orderer/ab.proto').orderer;
const _eventsProto = grpc.load(__dirname + '/protos/peer/events.proto').protos;
const _commonProto = grpc.load(__dirname + '/protos/common/common.proto').common;
const _transProto = grpc.load(__dirname + '/protos/peer/transaction.proto').protos;

const _validation_codes = {};
let keys = Object.keys(_transProto.TxValidationCode);
for (const key of keys) {
	const new_key = _transProto.TxValidationCode[key];
	_validation_codes[new_key] = key;
}

const _header_types = {};
keys = Object.keys(_commonProto.HeaderType);
for (const key of keys) {
	const new_key = _commonProto.HeaderType[key];
	_header_types[new_key] = key;
}

// internal use only
const NO_START_STOP = 0;
const START_ONLY = 1;
const END_ONLY = 2;
//const START_AND_END = 3;

const five_minutes_ms = 5 * 60 * 1000;

// Special transaction id to indicate that the transaction listener will be
// notified of all transactions
const ALL = 'all';

// Special value for block numbers
const NEWEST = 'newest';

/**
 * Transaction processing in fabric v1.1 is a long operation spanning multiple
 * components (application, endorsing peer, orderer, committing peer) and takes
 * a relatively lengthy period of time (think seconds instead of milliseconds)
 * to complete. As a result the applications must design their handling of the
 * transaction lifecycle in an asynchronous fashion. After the transaction proposal
 * has been successfully [endorsed]{@link Channel#sendTransactionProposal}, and before
 * the transaction message has been successfully [broadcast]{@link Channel#sendTransaction}
 * to the orderer, the application should register a listener to be notified of
 * the event when the transaction achieves finality, which is when the block
 * containing the transaction gets added to the peer's ledger/blockchain.
 * <br><br>
 * Fabric committing peers provides an event stream to publish blocks to registered
 * listeners.  A Block gets published whenever the committing peer adds a validated block
 * to the ledger. There are three ways to register a listener to get notified:
 * <li>register a "block listener" to get called for every block event. The listener
 *     will be passed a fully decoded {@link Block} object.
 *     See [registerBlockEvent]{@link ChannelEventHub#registerBlockEvent}
 * <li>register a "transaction listener" to get called when the specific transaction
 *     by id is committed (discovered inside a published block).
 *     The listener will be passed the transaction id, transaction status and block number.
 *     See [registerTxEvent]{@link ChannelEventHub#registerTxEvent}
 * <li>register a "chaincode event listener" to get called when a specific
 *     chaincode event has arrived.
 *     The listener will be passed the {@link ChaincodeEvent}, block number,
 *     transaction id, and transaction status.
 *     See [registerChaincodeEvent]{@link ChannelEventHub#registerChaincodeEvent}
 * <br><br>
 * The events are ephemeral, such that if a registered listener
 * crashed when the event is published, the listener will miss the event.
 * There are several techniques to compensate for missed events due to client crashes:
 * <li>register block event listeners and record the block numbers received, such that
 *     when the next block arrives and its number is not the next in sequence, then
 *     the application knows exactly which block events have been missed. It can then use
 *     [queryBlock]{@link Channel#queryBlock} to get those missed blocks from the target peer or
 *     register for events using the startBlock option to resume or replay the events. You may
 *     also include an endBlock number if you wish to stop listening.
 * <li>use a message queue to catch all the block events. With many robust message queue
 *     implementations available today, you will be guaranteed to not miss an event. A
 *     fabric event listener can be written in any programming language. The following
 *     implementations can be used as reference to write the necessary glue code between
 *     the fabric event stream and a message queue:
 *
 * @example
 * const eh = channel.newChannelEventHub(peer);
 *
 * // register the listeners before calling "connect()" so there
 * // is an error callback ready to process an error in case the
 * // connect() call fails
 * eh.registerTxEvent(
 *   transactionId,
 *     (tx, code) => {
 * 	   eh.unregisterTxEvent(transactionId);
 * 	   console.log(util.format('Transaction %s has completed', transactionId));
 * 	 },
 *     (err) => {
 * 	   eh.unregisterTxEvent(transactionId);
 * 	   console.log(util.format('Error %s! Transaction listener for %s has been ' +
 *                 'deregistered with %s', transactionId, err, eh.getPeerAddr()));
 * 	 }
 * );
 *
 * eh.connect();
 *
 * @class
 */
const ChannelEventHub = class {

	/**
	 * Constructs a ChannelEventHub object
	 *
	 * @param {Channel} channel - An instance of the Channel class
	 * were this event hub will receive blocks from
	 * @param {Peer} peer An instance of the Peer class this event hub connects to.
	 * @returns {ChannelEventHub} An instance of this class
	 */

	constructor(channel, peer) {
		logger.debug('const ');
		// this will hold the last block number received
		this._last_block_seen = null;

		this._setReplayDefaults();

		// hashtable of clients registered for chaincode events
		this._chaincodeRegistrants = {};
		// set of clients registered for block events
		this._block_registrant_count = 0;
		this._blockRegistrations = {};
		// registered transactional events
		this._transactionRegistrations = {};
		// grpc event client interface
		this._event_client = null;
		// grpc chat streaming interface
		this._stream = null;

		// fabric connection state of this ChannelEventHub
		this._connected = false;
		this._connect_running = false;
		this._disconnect_running = false;

		// using filtered blocks
		this._filtered_stream = true; // the default

		// connect count for this instance
		this._current_stream = 0;
		// reference to the channel instance holding critical context such as signing identity
		if (!channel)
			throw new Error('Missing required argument: channel');

		this._clientContext = channel._clientContext;
		this._channel = channel;
		// peer node to connect
		// reference to the peer instance holding end point information
		if (!peer)
			throw new Error('Missing required argument: peer');
		this._peer = peer;
	}

	/**
	 * Return the name of this channel event hub, will be the name of the
	 * peer associated with this channel event hub.
	 */
	getName() {
		return this._peer.getName();
	}

	/**
	 * Return the peer url of this event hub object
	 */
	getPeerAddr() {
		if (this._peer) {
			return this._peer._endpoint.addr;
		}

		return null;
	}

	/*
	 * The block number of the last block seen
	 *
	 * @returns {Long} The block number of the last block seen
	 */
	lastBlockNumber() {
		if (this._last_block_seen === null) {
			throw new Error('This ChannelEventHub has not had an event from the peer');
		}

		return this._last_block_seen;
	}

	/*
	 * internal method to check if this event hub is allowing new event listeners
	 * If this event hub has been configured for a startBlock/endBlock of events then
	 * only one event listener is allowed. Once the connect has been called no
	 * new event listener will be allowed.
	 */
	_checkAllowRegistrations() {
		if (!this._allowRegistration) {
			throw new Error('This ChannelEventHub is not open to event listener registrations');
		}
	}

	/**
	 * Is the event hub connected to the event source?
	 * @returns {boolean} True if connected to the event source, false otherwise
	 */
	isconnected() {
		return this._connected;
	}

	/**
	 * Establishes a connection with the peer event source.
	 *
	 * The connection will be established asynchronously. If the connection fails to
	 * get established, the application will be notified via the error callbacks
	 * from the registerXXXEvent() methods. It is recommended that an application always
	 * registers at least one event listener with an error callback, by calling any one of the
	 * [registerBlockEvent]{@link ChannelEventHub#registerBlockEvent},
	 * [registerTxEvent]{@link ChannelEventHub#registerTxEvent} or
	 * [registerChaincodeEvent]{@link ChannelEventHub#registerChaincodeEvent}
	 * methods, before calling connect().
	 *
	 * @param {boolean} full_block - to indicated that the connection with the peer
	 *        will be sending full blocks or filtered blocks to this ChannelEventHub.
	 *        The default
	 *        will be to establish a connection using filtered blocks. Filtered
	 *        blocks have the required information to provided transaction status
	 *        and chaincode events. When using the non filtered blocks the user
	 *        will be required to have access to establish the connection to
	 *        receive full blocks.
	 *        Registering a block listener on a filtered block connection may not
	 *        provide sufficient information.
	 */
	connect(full_block) {
		logger.debug('connect - start  %s', this.getPeerAddr());
		if (!this._clientContext._userContext && !this._clientContext._adminSigningIdentity) {
			throw new Error('The clientContext has not been properly initialized, missing userContext or admin identity');
		}

		if (typeof full_block === 'boolean') {
			this._filtered_stream = !full_block;
			logger.debug('connect - filtered block stream set to:%s', !full_block);
		} else if (typeof full_block === 'undefined' || full_block === null) {
			logger.debug('connect - using a filtered block stream by default');
		} else {
			throw new Error('"filtered" parameter is invalid');
		}

		this._connect();
		logger.debug('connect - end  %s', this.getPeerAddr());
	}

	/*
	 * Internal use only
	 * Establishes a connection with the peer event source
	 * @param {boolean} force - internal use only, will reestablish the
	 *                  the connection to the peer event hub
	 */
	_connect(force) {
		logger.debug('_connect - start - %s', new Date());
		if (this._connect_running) {
			logger.debug('_connect - connect is running');
			return;
		}
		if (!force && this._connected) {
			logger.debug('_connect - end - already connected');
			return;
		}
		if (!this._peer) throw Error('Must set peer address before connecting.');

		// clean up
		this._shutdown();

		this._connect_running = true;
		this._current_stream++;
		const stream_id = this._current_stream;
		logger.debug('_connect - start stream:', stream_id);
		const self = this; // for callback context

		const connecton_setup_timeout = setTimeout(() => {
			logger.error('_connect - timed out after:%s', self._peer._request_timeout);
			self._connect_running = false;
			self._disconnect(new Error('Unable to connect to the peer event hub'));
		}, self._peer._request_timeout);

		// check on the keep alive options
		// the keep alive interval
		let options = utils.checkAndAddConfigSetting('grpc.keepalive_time_ms', 360000, this._peer._options);
		// how long should we wait for the keep alive response
		const request_timeout_ms = utils.getConfigSetting('request-timeout', 3000);
		options = utils.checkAndAddConfigSetting('grpc.keepalive_timeout_ms', request_timeout_ms, options);
		options = utils.checkAndAddConfigSetting('grpc.http2.min_time_between_pings_ms', five_minutes_ms, options);

		logger.debug('_connect - options %j', options);
		this._event_client = new _eventsProto.Deliver(this._peer._endpoint.addr, this._peer._endpoint.creds, options);
		if (this._filtered_stream) {
			this._stream = this._event_client.deliverFiltered();
		} else {
			this._stream = this._event_client.deliver();
		}

		this._stream.on('data', (deliverResponse) => {
			if (self._connect_running) {
				self._connect_running = false;
				clearTimeout(connecton_setup_timeout);
			}

			logger.debug('on.data - event stream:%s _current_stream:%s  peer:%s', stream_id, self._current_stream, self.getPeerAddr());
			if (stream_id !== self._current_stream) {
				logger.debug('on.data - incoming event was from a cancelled stream');
				return;
			}

			logger.debug('on.data - grpc stream is ready :%s', isStreamReady(self));
			if (deliverResponse.Type === 'block' || deliverResponse.Type === 'filtered_block') {
				if (self._connected === true) {
					logger.debug('on.data - new block received - check event registrations');
				} else {
					logger.debug('on.data - first block received , event hub now registered');
					self._connected = true;
				}
				try {
					let block = null;
					if (deliverResponse.Type === 'block') {
						block = BlockDecoder.decodeBlock(deliverResponse.block);
						self._last_block_seen = utils.convertToLong(block.header.number);
					} else {
						block = JSON.parse(JSON.stringify(deliverResponse.filtered_block));
						self._last_block_seen = utils.convertToLong(block.number);
					}
					logger.debug('on.data - incoming block number %s', self._last_block_seen);

					// somebody may have registered to receive this block
					self._processBlockEvents(block);
					self._processTxEvents(block);
					self._processChaincodeEvents(block);

					// check to see if we should shut things down
					self._checkReplayEnd();
				} catch (error) {
					logger.error('ChannelEventHub - ::' + error.stack ? error.stack : error);
					logger.error('ChannelEventHub has detected an error ' + error.toString());
					//report error to all callbacks and shutdown this ChannelEventHub
					self._disconnect(error);
				}
			}
			else if (deliverResponse.Type === 'status') {
				if( deliverResponse.status === 'SUCCESS') {
					if (self._ending_block_seen) {
						// this is normal after the last block comes in when we set an ending block
						logger.debug('on.data - status received after last block seen: %s block_num:', deliverResponse.status, self._last_block_seen);
					} if (self._ending_block_newest) {
						// this is normal after the last block comes in when we set to newest as an ending block
						logger.debug('on.data - status received when newest block seen: %s block_num:', deliverResponse.status, self._last_block_seen);
						self._disconnect(new Error(`Newest block received:${self._last_block_seen} status:${deliverResponse.status}`));
					}
				} else {
					// tell all registered users that something is wrong and shutting down
					logger.debug('on.data - status received - %s', deliverResponse.status);
					self._disconnect(new Error(`Received status message on the event stream. status:${deliverResponse.status}`));
				}
			}
			else {
				logger.debug('on.data - unknown deliverResponse');
				logger.error('ChannelEventHub has received and unknown message type %s', deliverResponse.Type);
			}
		});

		this._stream.on('status', (response) => {
			logger.debug('on status - status received: %j  peer:%s', response, self.getPeerAddr());
		});

		this._stream.on('end', () => {
			self._connect_running = false;
			clearTimeout(connecton_setup_timeout);
			logger.debug('on.end - event stream:%s _current_stream:%s peer:%s', stream_id, self._current_stream, self.getPeerAddr());
			if (stream_id !== self._current_stream) {
				logger.debug('on.end - incoming event was from a canceled stream');
				return;
			}

			logger.debug('on.end - grpc stream is ready :%s', isStreamReady(self));
			self._disconnect(new Error('Peer event hub has disconnected due to an "end" event'));
		});

		this._stream.on('error', (err) => {
			self._connect_running = false;
			clearTimeout(connecton_setup_timeout);
			logger.debug('on.error - event stream:%s _current_stream:%s  peer:%s', stream_id, self._current_stream, self.getPeerAddr());
			if (stream_id !== self._current_stream) {
				logger.debug('on.error - incoming event was from a canceled stream');
				logger.debug('on.error - %s %s', new Date(), err);
				return;
			}

			logger.debug('on.error - grpc stream is ready :%s', isStreamReady(self));
			if (err instanceof Error) {
				self._disconnect(err);
			}
			else {
				self._disconnect(new Error(err));
			}
		});

		this._sendRegistration();
		logger.debug('_connect - end stream:', stream_id);
	}

	/**
	 * Disconnects the event hub from the peer event source.
	 * Will close all event listeners and send an Error object
	 * with the message "ChannelEventHub has been shutdown" to
	 * all listeners that provided an "onError" callback.
	 */
	disconnect() {
		if (this._disconnect_running) {
			logger.debug('disconnect - disconnect is running');
		} else {
			this._disconnect_running = true;
			this._disconnect(new Error('ChannelEventHub has been shutdown'));
			this._disconnect_running = false;
		}
	}

	/**
	 * Disconnects the event hub from the peer event source.
	 * Will close all event listeners and send an Error object
	 * with the message "ChannelEventHub has been shutdown" to
	 * all listeners that provided an "onError" callback.
	 */
	close() {
		this.disconnect();
	}

	/*
	 * Internal method
	 * Disconnects the connection to the peer event source.
	 * Will close all event listeners and send an `Error` to
	 * all listeners that provided an "onError" callback.
	 */
	_disconnect(err) {
		logger.debug('_disconnect - start -- called due to:: %s, peer:%s', err.message, this.getPeerAddr());
		this._connected = false;
		this._connect_running = false;
		this._closeAllCallbacks(err);
		this._shutdown();
		this._setReplayDefaults();
		logger.debug('_disconnect - end -- called due to:: %s, peer:%s', err.message, this.getPeerAddr());
	}

	/*
	 * Internal method
	 * Closes the grpc stream and service client
	 */
	_shutdown() {
		if (this._stream) {
			logger.debug('_shutdown - shutdown existing stream');
			this._stream.cancel();
			this._stream.end();
			this._stream = null;
		}
		if (this._event_client) {
			this._event_client.close();
		}
	}

	/*
	 * Internal method
	 * Builds a signed event registration
	 * and sends it to the peer's event hub.
	 */
	_sendRegistration() {
		// The behavior when a missing block is encountered
		let behavior = _abProto.SeekInfo.SeekBehavior.BLOCK_UNTIL_READY;
		// build start
		const seekStart = new _abProto.SeekPosition();
		if (this._starting_block_number) {
			const seekSpecifiedStart = new _abProto.SeekSpecified();
			seekSpecifiedStart.setNumber(this._starting_block_number);
			seekStart.setSpecified(seekSpecifiedStart);
		} else {
			const seekNewest = new _abProto.SeekNewest();
			seekStart.setNewest(seekNewest);
		}

		// build stop
		const seekStop = new _abProto.SeekPosition();
		if(this._ending_block_newest) {
			const seekNewest = new _abProto.SeekNewest();
			seekStop.setNewest(seekNewest);
			behavior = _abProto.SeekInfo.SeekBehavior.FAIL_IF_NOT_READY;
		} else {
			const seekSpecifiedStop = new _abProto.SeekSpecified();
			if (this._ending_block_number) {
				seekSpecifiedStop.setNumber(this._ending_block_number);
				// user should know the block does not exist
				behavior = _abProto.SeekInfo.SeekBehavior.FAIL_IF_NOT_READY;
			} else {
				seekSpecifiedStop.setNumber(Long.MAX_VALUE);
			}
			seekStop.setSpecified(seekSpecifiedStop);
		}

		// seek info with all parts
		const seekInfo = new _abProto.SeekInfo();
		seekInfo.setStart(seekStart);
		seekInfo.setStop(seekStop);
		// BLOCK_UNTIL_READY will mean hold the stream open and keep sending as
		//     the blocks come in
		// FAIL_IF_NOT_READY will mean if the block is not there throw an error
		seekInfo.setBehavior(behavior);

		// use the admin if available
		const tx_id = this._clientContext.newTransactionID(true);
		const signer = this._clientContext._getSigningIdentity(true);

		// build the header for use with the seekInfo payload
		const seekInfoHeader = clientUtils.buildChannelHeader(
			_commonProto.HeaderType.DELIVER_SEEK_INFO,
			this._channel._name,
			tx_id.getTransactionID(),
			this._initial_epoch,
			null,
			clientUtils.buildCurrentTimestamp(),
			this._clientContext.getClientCertHash()
		);

		const seekHeader = clientUtils.buildHeader(signer, seekInfoHeader, tx_id.getNonce());
		const seekPayload = new _commonProto.Payload();
		seekPayload.setHeader(seekHeader);
		seekPayload.setData(seekInfo.toBuffer());
		const seekPayloadBytes = seekPayload.toBuffer();

		const sig = signer.sign(seekPayloadBytes);
		const signature = Buffer.from(sig);

		// building manually or will get protobuf errors on send
		const envelope = {
			signature: signature,
			payload: seekPayloadBytes
		};

		this._stream.write(envelope);
	}

	/*
	 * Internal method
	 * Will close out all callbacks
	 * Sends an error to all registered event "onError" callbacks
	 */
	_closeAllCallbacks(err) {
		const method = '_closeAllCallbacks -' + this.getPeerAddr();
		logger.debug('%s - start', method);

		logger.debug('%s - blockOnErrors %s', method, Object.keys(this._blockRegistrations).length);
		for (const key in this._blockRegistrations) {
			const block_registration = this._blockRegistrations[key];
			if (block_registration.onError) {
				logger.debug('%s - calling block error callback for %s', method, key);
				block_registration.onError(err);
			} else {
				logger.debug('%s - no block error callback to call for %s', method, key);
			}
		}
		this._blockRegistrations = {};

		logger.debug('%s - transactionOnErrors %s', method, Object.keys(this._transactionRegistrations).length);
		for (const key in this._transactionRegistrations) {
			const trans_reg = this._transactionRegistrations[key];
			if (trans_reg.onError) {
				logger.debug('%s - calling transaction error callback for %s', method, key);
				trans_reg.onError(err);
			} else {
				logger.debug('%s - no transaction error callback to call for %s', method, key);
			}
		}
		this._transactionRegistrations = {};

		const cc_closer = (key) => {
			const cbtable = this._chaincodeRegistrants[key];
			cbtable.forEach((chaincode_reg) => {
				logger.debug('%s - closing this chaincode event ccid:%s eventNameFilter:%s', method, chaincode_reg.ccid, chaincode_reg.eventNameFilter);
				if (chaincode_reg.event_reg.onError) {
					chaincode_reg.event_reg.onError(err);
				}
			});
		};

		logger.debug('%s - chaincodeRegistrants %s', method, Object.keys(this._chaincodeRegistrants).length);
		Object.keys(this._chaincodeRegistrants).forEach(cc_closer);
		this._chaincodeRegistrants = {};

		logger.debug('%s - end', method);
	}

	/*
	 * Internal method
	 * checks the startBlock/endBlock options
	 * checks that only one registration when using startBlock/endBlock
	 * @returns enum of how the endBlock and startBlock have been set
	 */
	_checkReplay(options) {
		logger.debug('_checkReplay - start');

		let result = NO_START_STOP;
		let have_start_block = false;
		let have_end_block = false;
		const converted_options = {};
		if (options && typeof options.startBlock !== 'undefined') {
			try {
				converted_options.start_block = utils.convertToLong(options.startBlock);
				have_start_block = true;
			} catch (error) {
				throw new Error('Problem with the startBlock parameter ::' + error);
			}
		}
		if (options && typeof options.endBlock !== 'undefined') {
			try {
				let end_block = options.endBlock;
				if(typeof end_block === 'string') {
					if(end_block.toLowerCase() === NEWEST) {
						end_block = Long.MAX_VALUE;
						this._ending_block_newest = true;
					}
				}
				converted_options.end_block = utils.convertToLong(end_block);
				have_end_block = true;
			} catch (error) {
				throw new Error('Problem with the endBlock parameter ::' + error);
			}
		}

		if ((have_start_block || have_end_block) && this._haveRegistrations()) {
			logger.error('This ChannelEventHub is already registered with active listeners. Not able options of startBlock:%s endBlock:%s', options.startBlock, options.endBlock);
			throw new Error('Only one event registration is allowed when startBlock or endBlock are used');
		}

		if ((have_start_block || have_end_block) && (this._connected || this._connect_running)) {
			logger.error('This ChannelEventHub has already been connected to start receiving blocks. Not able to use options of startBlock:%s endBlock:%s', options.startBlock, options.endBlock);
			throw new Error('Event listeners that use startBlock or endBlock must be registered before connecting to the peer channel-based event service');
		}

		if (have_end_block) {
			if (have_start_block && converted_options.start_block.greaterThan(converted_options.end_block)) {
				throw new Error(`"startBlock" (${converted_options.start_block}) must not be larger than "endBlock" (${converted_options.end_block}})`);
			}
			this._ending_block_number = converted_options.end_block;
			this._allowRegistration = false;
			result = END_ONLY;
			logger.debug('_checkReplay - Event listening will end at block %s', converted_options.end_block);
		}
		if (have_start_block) {
			this._starting_block_number = converted_options.start_block;
			this._allowRegistration = false;
			result++; // will move result to START_ONLY or START_AND_END
			logger.debug('_checkReplay - Event listening will start at block %s', converted_options.start_block);
		}

		logger.debug('_checkReplay - end');
		return result;
	}

	_haveRegistrations() {
		let count = 0;
		count = count + Object.keys(this._chaincodeRegistrants).length;
		count = count + Object.keys(this._blockRegistrations).length;
		count = count + Object.keys(this._transactionRegistrations).length;
		return count > 0;
	}

	/*
	  * internal method to check if the connection is ready and if
	  * not in the ready state disconnect (post an error to all registered)
	  * and throw and error to enform the caller
	  */
	_checkConnection() {
		logger.debug('_checkConnection - start');
		if (this._connected || this._connect_running) {
			const ready = isStreamReady(this);
			logger.debug('_checkConnection -  %s with stream channel ready %s', this._peer.getUrl(), ready);

			if (!ready && !this._connect_running) { //Not READY, but trying
				logger.error('_checkConnection - connection is not ready');
				const error = new Error('Connection is not READY');
				this._disconnect(error);
				throw error;
			}
		} else {
			logger.debug('_checkConnection - connection has not been started');
		}

		logger.debug('_checkConnection - end');
	}

	/**
	 * Returns if the stream is ready. and will attempt a restart when forced
	 *
	 * @param {boolean} force_reconnect - attempt to reconnect if the stream
	 *        is not in the 'READY' state
	 */
	checkConnection(force_reconnect) {
		logger.debug('checkConnection - start force_reconnect:%s', force_reconnect);
		const ready = isStreamReady(this);
		logger.debug('checkConnection -  %s with stream channel ready %s', this._peer.getUrl(), ready);

		if (force_reconnect) {
			try {
				if (this._stream) {
					const is_paused = this._stream.isPaused();
					logger.debug('checkConnection - grpc isPaused :%s', is_paused);
					if (is_paused) {
						this._stream.resume();
						logger.debug('checkConnection - grpc resuming ');
					} else if (!ready) {
						// try to reconnect
						this._connect_running = false;
						this._connect(true);
					}
				}
				else {
					logger.debug('checkConnection - stream was shutdown - will reconnected');
					// try to reconnect
					this._connect_running = false;
					this._connect(true);
				}
			}
			catch (error) {
				logger.error('checkConnection - error ::' + error.stack ? error.stack : error);
				const err = new Error('Problem during reconnect and the event hub is not connected ::%s', error);
				this._disconnect(err);
			}
		}

		return isStreamReady(this);
	}

	/**
	 * @typedef {Object} ChaincodeEvent
	 * @property {string} chaincode_id
	 * @property {string} tx_id
	 * @property {string} event_name
	 * @property {byte[]} payload - Application-specific byte array that the chaincode set
	 *                              when it called <code>stub.SetEvent(event_name, payload)</code>
	 */

	/**
	 * @typedef {Object} RegistrationOpts
	 * @property {integer} startBlock - Optional - The starting block number
	 *           for event checking. When included, the peer's channel event service
	 *           will be asked to start sending blocks from this block number.
	 *           This is how to resume or replay missed blocks that were added
	 *           to the ledger.
	 *           Default is the latest block on the ledger.
	 *           Setting a startBlock may confuse other event listeners,
	 *           therefore only one listener will be allowed on a ChannelEventHub
	 *           when a startBlock is being used.
	 * @property {integer | 'newest'} endBlock - Optional - The ending block number
	 *           for event checking. The value 'newest' to indicate that endBlock
	 *           will be calculated by the peer as the newest block on the ledger.
	 *           This allows the application to replay up to the latest block on
	 *           the ledger and then the listener will stop and be notified by the
	 *           'onError' callback.
	 *           When included, the peer's channel event service
	 *           will be asked to stop sending blocks once this block is delivered.
	 *           This is how to replay missed blocks that were added
	 *           to the ledger. When a startBlock is not included, the endBlock
	 *           must be equal to or larger the current channel block height.
	 *           Setting an endBlock may confuse other event listeners,
	 *           therefore only one listener will be allowed on a ChannelEventHub
	 *           when an endBlock is being used.
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
	 * @property {boolean} disconnect - Optional - This option setting Indicates
	 *           to the ChannelEventHub instance to automatically disconnect itself
	 *           from the peer's channel event service once the event has been seen.
	 *           The default is false unless the endBlock has been set, then it
	 *           it will be true.
	 */

	/**
	 * Register a listener to receive chaincode events.
	 * <br><br>
	 * An error may occur in the connection establishment which runs
	 * asynchronously. The best practice would be to provide an
	 * "onError" callback to be notified when this ChannelEventHub has an issue.
	 *
	 * @param {string} ccid - Id of the chaincode of interest
	 * @param {string|RegExp} eventname - The exact name of the chaincode event (must match
	 *                             the name given to the target chaincode's call to
	 *                             <code>stub.SetEvent(name, payload)</code>), or a
	 *                             regular expression string to match more than one
	 *                             event by this chaincode.
	 * @param {function} onEvent - callback function for matched events. It gets passed
	 *                             four parameters, a {@link ChaincodeEvent} object,
	 *                             the block number this transaction was committed to the ledger,
	 *                             the transaction ID, and a string representing the status of
	 *                             the transaction.
	 * @param {function} onError - Optional callback function to be notified when this event hub
	 *                             is shutdown. The shutdown may be caused by a network error or by
	 *                             a call to the "disconnect()" method or a connection error.
	 *                             This callback will also be called when the event hub is shutdown
	 *                             due to the last block being received if replaying and requesting
	 *                             the endBlock to be 'newest'.
	 * @param {RegistrationOpts} options -
	 * @returns {Object} An object that should be treated as an opaque handle used
	 *                   to unregister (see {@link unregisterChaincodeEvent})
	 */
	registerChaincodeEvent(ccid, eventname, onEvent, onError, options) {
		logger.debug('registerChaincodeEvent - start');
		if (!ccid) {
			throw new Error('Missing "ccid" parameter');
		}
		if (!eventname) {
			throw new Error('Missing "eventname" parameter');
		}
		if (!onEvent) {
			throw new Error('Missing "onEvent" parameter');
		}

		this._checkAllowRegistrations();
		let default_disconnect = false;
		const startstop_mode = this._checkReplay(options);
		if (startstop_mode > START_ONLY) {
			default_disconnect = true;
		}
		const event_reg = new EventRegistration(onEvent, onError, options, false, default_disconnect);

		const chaincode_reg = new ChaincodeRegistration(ccid, eventname, event_reg);
		let cbtable = this._chaincodeRegistrants[ccid];
		if (!cbtable) {
			cbtable = new Set();
			this._chaincodeRegistrants[ccid] = cbtable;
		}
		cbtable.add(chaincode_reg);
		if (startstop_mode > NO_START_STOP) {
			this._start_stop_registration = chaincode_reg.event_reg;
			chaincode_reg.event_reg.unregister_action = () => {
				this.unregisterChaincodeEvent(chaincode_reg);
			};
		}
		this._checkConnection();

		return chaincode_reg;
	}

	/**
	 * Unregister the chaincode event listener represented by
	 * the <code>listener_handle</code> object returned by
	 * the registerChaincodeEvent() method
	 *
	 * @param {Object} listener_handle - The handle object returned from the
	 *        call to registerChaincodeEvent.
	 * @param {boolean} throwError - Optional - throw an error if the chaincode event
	 *        registration does not exist, default is to not throw an error
	 */
	unregisterChaincodeEvent(listener_handle, throwError) {
		logger.debug('unregisterChaincodeEvent - start');
		if (!listener_handle) {
			throw new Error('Missing "listener_handle" parameter');
		}
		const cbtable = this._chaincodeRegistrants[listener_handle.ccid];
		if (!cbtable && throwError) {
			throw new Error(`No event registration for chaincode id ${listener_handle.ccid}`);
		} else {
			cbtable.delete(listener_handle);
			if (cbtable.size <= 0) {
				delete this._chaincodeRegistrants[listener_handle.ccid];
			}
		}

	}

	/**
	 * Register a listener to receive all block events <b>from all the channels</b> that
	 * the target peer is part of. The listener's "onEvent" callback gets called
	 * on the arrival of every block. If the target peer is expected to participate
	 * in more than one channel, then care must be taken in the listener's implementation
	 * to differentiate blocks from different channels. See the example below on
	 * how to accomplish that.
	 * <br><br>
	 * An error may occur in the connection establishment which runs
	 * asynchronously. The best practice would be to provide an
	 * "onError" callback to be notified when this ChannelEventHub has an issue.
	 *
	 * @param {function} onEvent - Callback function that takes a single parameter
	 *                             of a {@link Block} object
	 * @param {function} onError - Optional callback function to be notified when this event hub
	 *                             is shutdown. The shutdown may be caused by a network error or by
	 *                             a call to the "disconnect()" method or a connection error.
	 *                             This callback will also be called when the event hub is shutdown
	 *                             due to the last block being received if replaying and requesting
	 *                             the endBlock to be 'newest'.
	 * @param {RegistrationOpts} options -
	 * @returns {int} This is the block registration number that must be
	 *                sed to unregister (see unregisterBlockEvent)
	 *
	 * @example <caption>Find out the channel Id of the arriving block</caption>
	 * eh.registerBlockEvent(
	 *   (block) => {
	 *     let first_tx = block.data.data[0]; // get the first transaction
	 *     let header = first_tx.payload.header; // the "header" object contains metadata of the transaction
	 *     let channel_id = header.channel_header.channel_id;
	 *     if ("mychannel" !== channel_id) return;
	 *
	 *     // do useful processing of the block
	 *   },
	 *   (err) => {
	 *     console.log('Oh snap!');
	 *   }
	 * );
	 */
	registerBlockEvent(onEvent, onError, options) {
		logger.debug('registerBlockEvent - start');
		if (!onEvent) {
			throw new Error('Missing "onEvent" parameter');
		}

		this._checkAllowRegistrations();
		let default_disconnect = false;
		const startstop_mode = this._checkReplay(options);
		if (startstop_mode > START_ONLY) {
			default_disconnect = true;
		}

		const block_registration_number = ++this._block_registrant_count;
		const block_registration = new EventRegistration(onEvent, onError, options, true, default_disconnect);
		this._blockRegistrations[block_registration_number] = block_registration;
		if (startstop_mode > NO_START_STOP) {
			this._start_stop_registration = block_registration;
			block_registration.unregister_action = () => {
				this.unregisterBlockEvent(block_registration_number);
			};
		}
		this._checkConnection();

		return block_registration_number;
	}

	/**
	 * Unregister the block event listener using the block
	 * registration number that is returned by the call to
	 * the registerBlockEvent() method.
	 *
	 * @param {int} block_registration_number - The block registration number
	 *        that was returned during registration.
	 * @param {boolean} throwError - Optional - throw an error if the block
	 *        registration does not exist, default is to not throw an error
	 */
	unregisterBlockEvent(block_registration_number, throwError) {
		logger.debug('unregisterBlockEvent - start  %s', block_registration_number);
		const block_reg = this._blockRegistrations[block_registration_number];
		if (!block_reg && throwError) {
			throw new Error(`Block listener for block registration number "${block_registration_number}" does not exist`);
		} else {
			delete this._blockRegistrations[block_registration_number];
		}
	}

	/**
	 * Register a callback function to receive a notification when the transaction
	 * by the given id has been committed into a block.
	 * <br><br>
	 * An error may occur in the connection establishment which runs
	 * asynchronously. The best practice would be to provide an
	 * "onError" callback to be notified when this ChannelEventHub has an issue.
	 *
	 * @param {string} txid - Transaction id string
	 * @param {function} onEvent - Callback function that takes a parameter of transaction ID,
	 *                             a string parameter indicating the transaction status,
	 *                             and the block number this transaction was committed to the ledger
	 * @param {function} onError - Optional callback function to be notified when this event hub
	 *                             is shutdown. The shutdown may be caused by a network error or by
	 *                             a call to the "disconnect()" method or a connection error.
	 *                             This callback will also be called when the event hub is shutdown
	 *                             due to the last block being received if replaying and requesting
	 *                             the endBlock to be 'newest'.
	 * @param {RegistrationOpts} options -
	 * @returns {string} The transaction ID that was used to register this event listener,
	 *          will the same as the txid parameter and must be used to unregister
	 *          this event listener.
	 */
	registerTxEvent(txid, onEvent, onError, options) {
		logger.debug('registerTxEvent start - txid:%s', txid);

		if (!txid) {
			throw new Error('Missing "txid" parameter');
		}
		if(typeof txid !== 'string') {
			throw new Error('"txid" parameter is not a string');
		}
		if (!onEvent) {
			throw new Error('Missing "onEvent" parameter');
		}

		this._checkAllowRegistrations();

		let default_unregister = true;
		let _txid = txid;
		if(txid.toLowerCase() === ALL) {
			_txid = txid.toLowerCase();
			default_unregister = false;
		}
		const temp = this._transactionRegistrations[_txid];
		if (temp) {
			throw new Error(`TransactionId (${txid}) has already been registered`);
		}
		let default_disconnect = false;
		const startstop_mode = this._checkReplay(options);
		if (startstop_mode > START_ONLY) {
			default_disconnect = true;
		}

		const trans_registration = new EventRegistration(onEvent, onError, options, default_unregister, default_disconnect);
		this._transactionRegistrations[_txid] = trans_registration;
		if (startstop_mode > NO_START_STOP) {
			this._start_stop_registration = trans_registration;
			trans_registration.unregister_action = () => {
				this.unregisterTxEvent(_txid);
			};
		}
		this._checkConnection();

		return _txid;
	}

	/**
	 * Unregister transaction event listener for the transaction id.
	 * @param {string} txid - The transaction id
	 * @param {boolean} throwError - Optional - throw an error if the transaction
	 *        registration does not exist, default is to not throw an error
	 */
	unregisterTxEvent(txid, throwError) {
		logger.debug('unregisterTxEvent txid ' + txid);
		const tx_reg = this._transactionRegistrations[txid];
		if (!tx_reg && throwError) {
			throw new Error(`Transaction listener for transaction id "${txid}" does not exist`);
		} else {
			delete this._transactionRegistrations[txid];
		}
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
			block_reg.onEvent(block);
		});
	}

	/*
	 * private internal method for processing tx events
	 * @param {Object} block protobuf object which might contain the tx from the fabric
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
			const txStatusCodes = block.metadata.metadata[_commonProto.BlockMetadataIndex.TRANSACTIONS_FILTER];
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
		if (trans_reg || all_trans_reg){
			logger.debug('_callTransactionListener - no call backs found for this transaction %s', tx_id);
		}
	}

	/* internal utility method */
	_callTransactionListener(tx_id, val_code, block_num, trans_reg) {
		logger.debug('_callTransactionListener - about to call the transaction call back for code=%s tx=%s', val_code, tx_id);
		const status = convertValidationCode(val_code);
		trans_reg.onEvent(tx_id, status, block_num);
		if (trans_reg.unregister) {
			this.unregisterTxEvent(tx_id);
			logger.debug('_callTransactionListener - automatically unregister tx listener for %s', tx_id);
		}
		if (trans_reg.disconnect) {
			logger.debug('_callTransactionListener - automatically disconnect');
			this._disconnect(new Error('Shutdown due to disconnect on transaction id registration'));
		}
	}

	/*
	 * private internal method for processing chaincode events
	 * @param {Object} block protobuf object which might contain the chaincode event from the fabric
	 */
	_processChaincodeEvents(block) {
		if (Object.keys(this._chaincodeRegistrants).length === 0) {
			logger.debug('_processChaincodeEvents - no registered chaincode event "listeners"');
			return;
		}

		if (block.number) {
			if (block.filtered_transactions) {
				for (const filtered_transaction of block.filtered_transactions) {
					if (filtered_transaction.transaction_actions) {
						if (filtered_transaction.transaction_actions.chaincode_actions) {
							for (const chaincode_action of filtered_transaction.transaction_actions.chaincode_actions) {

								this._callChaincodeListener(chaincode_action.chaincode_event,
									block.number,
									filtered_transaction.txid,
									filtered_transaction.tx_validation_code,
									true);
							}
						}
					}
				}
			}
		} else {
			for (let index = 0; index < block.data.data.length; index++) {
				logger.debug(`_processChaincodeEvents - trans index=${index}`);
				try {
					const env = block.data.data[index];
					const payload = env.payload;
					const channel_header = payload.header.channel_header;
					if (channel_header.type === 3) { //only ENDORSER_TRANSACTION have chaincode events
						const tx = payload.data;
						if (tx && tx.actions) {
							for (const {payload} of tx.actions) {
								const chaincode_event = payload.action.proposal_response_payload.extension.events;
								logger.debug('_processChaincodeEvents - chaincode_event %s', chaincode_event);

								const txStatusCodes = block.metadata.metadata[_commonProto.BlockMetadataIndex.TRANSACTIONS_FILTER];
								const channel_header = block.data.data[index].payload.header.channel_header;
								const val_code = txStatusCodes[index];

								this._callChaincodeListener(chaincode_event,
									block.header.number,
									channel_header.tx_id,
									val_code,
									false);
							}
						} else {
							logger.debug('_processChaincodeEvents - no transactions or transaction actions');
						}
					} else {
						logger.debug('_processChaincodeEvents - block is not endorser transaction type');
					}
				} catch (err) {
					logger.error('on.data - Error unmarshalling transaction=', err);
				}
			}
		}
	}

	_callChaincodeListener(chaincode_event, block_num, tx_id, val_code, filtered) {
		logger.debug('_callChaincodeListener - chaincode_event %s', chaincode_event);
		const cbtable = this._chaincodeRegistrants[chaincode_event.chaincode_id];
		if (!cbtable) {
			logger.debug('_callChaincodeListener - no chaincode listeners found');
			return;
		}
		const tx_status = convertValidationCode(val_code);

		logger.debug('_callChaincodeListener - txid=%s  val_code=%s', tx_id, tx_status);

		cbtable.forEach((chaincode_reg) => {
			if (chaincode_reg.eventNameFilter.test(chaincode_event.event_name)) {
				logger.debug('_callChaincodeListener - calling chaincode listener callback');
				if (filtered) {
					// need to remove the payload since with filtered blocks it
					// has an empty byte array value which is not the real value
					// we do not want the listener to think that is the value
					delete chaincode_event['payload'];
				}
				chaincode_reg.event_reg.onEvent(chaincode_event, block_num, tx_id, tx_status);
				if (chaincode_reg.event_reg.unregister) {
					cbtable.delete(chaincode_reg);
					logger.debug('_callChaincodeListener - automatically unregister tx listener for %s', tx_id);
				}
				if (chaincode_reg.event_reg.disconnect) {
					this._disconnect(new Error('Shutdown due to disconnect on transaction id registration'));
				}
			} else {
				logger.debug('_callChaincodeListener - NOT calling chaincode listener callback');
			}
		});
	}

	/*
	 * utility method to mark if this channel event hub has seen the last
	 * in the range when this event hub is using startBlock/endBlock
	 */
	_checkReplayEnd() {
		if (this._ending_block_number) {
			if (this._ending_block_number.lessThanOrEqual(this._last_block_seen)) {
				this._ending_block_seen = true;
				if (this._start_stop_registration) {
					if (this._start_stop_registration.unregister) {
						this._start_stop_registration.unregister_action();
					}
					if (this._start_stop_registration.disconnect) {
						this._disconnect(new Error('Shutdown due to end block number has been seen'));
					}
				}
			}
		}
	}

	/*
	 * utility method to reset the replay state
	 */
	_setReplayDefaults() {
		// these will hold the block numbers to be used when this
		// event hub connects to the remote peer's channel event sevice
		this._starting_block_number = null;
		this._ending_block_number = null;
		this._ending_block_seen = false;
		this._ending_block_newest = false;
		//allow this hub to to registar new listeners
		this._allowRegistration = true;
		this._start_stop_registration = null;
	}

};
module.exports = ChannelEventHub;

function convertValidationCode(code) {
	if (typeof code === 'string') {
		return code;
	}
	return _validation_codes[code];
}

/*
 * Utility method to check if the stream is ready.
 * The stream must be readable, writeable and reading to be 'ready'
 */
function isStreamReady(self) {
	const method = 'isStreamReady';
	let ready = false;
	if (self._stream) {
		const stream = self._stream;
		ready = stream.readable & stream.writable & stream.reading;
		logger.debug('%s - stream.readable %s :: %s', method, stream.readable, self.getPeerAddr());
		logger.debug('%s - stream.writable %s :: %s', method, stream.writable, self.getPeerAddr());
		logger.debug('%s - stream.reading %s :: %s', method, stream.reading, self.getPeerAddr());
		logger.debug('%s - stream.read_status %s :: %s', method, stream.read_status, self.getPeerAddr());
		logger.debug('%s - stream.received_status %s :: %s', method, stream.received_status, self.getPeerAddr());
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
	 * @param {string} ccid - chaincode id
	 * @param {string|RegExp} eventNameFilter - The regex used to filter events
	 * @param {EventRegistration} event_reg - event registrations callbacks
	 */
	constructor(ccid, eventNameFilter, event_reg) {
		// chaincode id
		this.ccid = ccid;
		// event name regex filter
		this.eventNameFilter = new RegExp(eventNameFilter);

		this.event_reg = event_reg;
	}
}

/*
 * The EventRegistration is used internally to the ChannelEventHub to hold
 * event registration callback and settings.
 */
class EventRegistration {
	/*
	 * Constructs a block callback entry
	 *
	 * @param {function} onEvent - Callback for event matches
	 * @param {function} onError - Callback for errors
	 * @param {RegistrationOpts} options - event registration options
	 * @param {boolean} default_unregister - the default value for the unregister
	 *        setting if not option setting is set by the user
	 * @param {boolean} default_disconnect - the default value for the disconnect
	 *        setting if not option setting is set by the user
	 */
	constructor(onEvent, onError, options, default_unregister, default_disconnect) {
		this.onEvent = onEvent;
		this.onError = onError;
		this.unregister = default_unregister;
		this.disconnect = default_disconnect;
		this.unregister_action = () => {}; // do nothing by default

		if (options) {
			if (typeof options.unregister === 'undefined' || options.unregister === null) {
				logger.debug('const-EventRegistration - unregister was not defined');
			} else if (typeof options.unregister === 'boolean') {
				this.unregister = options.unregister;
			} else {
				throw new Error('Event registration has invalid value for "unregister" option');
			}
			if (typeof options.disconnect === 'undefined' || options.disconnect === null) {
				logger.debug('const-EventRegistration - disconnect was not defined');
			} else if (typeof options.disconnect === 'boolean') {
				this.disconnect = options.disconnect;
			} else {
				throw new Error('Event registration has invalid value for "disconnect" option');
			}
		}
	}
}