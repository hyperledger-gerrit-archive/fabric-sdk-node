/*
 Copyright 2016, 2017 London Stock Exchange All Rights Reserved.

 Licensed under the Apache License, Version 2.0 (the 'License');
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

                http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an 'AS IS' BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

'use strict';

var Remote = require('./Remote');
var utils = require('./utils.js');
var grpc = require('grpc');
var HashTable = require('hashtable');
var _eventsProto = grpc.load(__dirname + '/protos/peer/events.proto').protos;
var _commonProto = grpc.load(__dirname + '/protos/common/common.proto').common;
var _ccTransProto = grpc.load(__dirname + '/protos/peer/transaction.proto').protos;
var _transProto = grpc.load(__dirname + '/protos/peer/transaction.proto').protos;
var _responseProto = grpc.load(__dirname + '/protos/peer/proposal_response.proto').protos;
var _ccProposalProto = grpc.load(__dirname + '/protos/peer/proposal.proto').protos;
var _ccEventProto = grpc.load(__dirname + '/protos/peer/chaincodeevent.proto').protos;
var _identityProto = grpc.load(__dirname + '/protos/identity.proto').msp;

var logger = utils.getLogger('EventHub.js');

/**
 * The ChainCodeCBE is used internal to the EventHub to hold chaincode
 * event registration callbacks.
 * @class
 */
var ChainCodeCBE = class {
	/**
	 * Constructs a chaincode callback entry
	 *
	 * @param {string} ccid chaincode id
	 * @param {string} eventNameFilter The regex used to filter events
	 * @param {function} cb Callback for filter matches
	 */
	constructor(ccid, eventNameFilter, cb) {
		// chaincode id
		this.ccid = ccid;
		// event name regex filter
		this.eventNameFilter = new RegExp(eventNameFilter);
		// callback function to invoke on successful filter match
		this.cb = cb;
	}
};

/**
 * The EventHub class is used to distribute events from an
 * event source
 * @class
 */
var EventHub = class extends Remote {

	/**
	 * Constructs an unconnected EventHub for a Peer
	 *
	 * @param {string} url The URL with format of "grpcs://host:port".
	 * @param {Object} opts The options for the connection to the event source.
	 */
	constructor(url, opts) {
		super(url, opts);
		logger.info('const - url: %s options ', this._url, this._options);
		// hashtable of clients registered for chaincode events
		this.chaincodeRegistrants = new HashTable();
		// set of clients registered for block events
		this.blockRegistrants = new Set();
		// hashtable of clients registered for transactional events
		this.txRegistrants = new HashTable();
		// grpc event client interface
		this._client = null;
		// grpc chat streaming interface
		this.call - null;
		// fabric connection state of this eventhub
		this.connected = false;
		this.blockRegistered = false;
		// for the single creator filtered call back
		this._creator = null;
		this._callback = null;
	}

	/**
	 * Get connected state of eventhub
	 * @returns true if connected to event source, false otherwise
	 */
	isConnected() {
		return this.connected;
	}

	/**
	 * Establishes connection with the event source<p>
	 * Note: Only use this if creating your own EventHub. The chain
	 * class creates a default eventHub that most Node clients can use.
	 */
	connect() {
		logger.debug('%s :: connect start', this._url);
		if (this.connected) {
			logger.debug('%s :: connect end - already connected', this._url);
			return;
		}

		this._client = new _eventsProto.Events(this._endpoint.addr, this._endpoint.creds, this._options);
		this.call = this._client.chat();

		var eh = this; // for callback context
		this.call.on('data', function(event) {
			logger.debug('%s :: got data call', eh._url);
			if (event.Event == 'block') {
				eh.blockRegistrants.forEach(function(cb) {
					logger.debug('%s :: sending this block to a callback', eh._url);
					cb(event.block);
				});
				if(eh.chaincodeRegistrants.size > 0) {
					event.block.Data.Data.forEach(function(transaction) {
						try {
							var env = _common.Envelope.decode(transaction);
							var payload = _common.Payload.decode(env.payload);
							if (payload.header.chainHeader.type == _common.HeaderType.ENDORSER_TRANSACTION) {
								var tx = _transProto.Transaction.decode(payload.data);
								var chaincodeActionPayload = _ccTransProto.ChaincodeActionPayload.decode(tx.actions[0].payload);
								var propRespPayload = _responseProto.ProposalResponsePayload
									.decode(chaincodeActionPayload.action.proposalResponsePayload);
								var caPayload = _ccProposalProto.ChaincodeAction.decode(propRespPayload.extension);
								var ccEvent = _ccEventProto.ChaincodeEvent.decode(caPayload.events);
								var cbtable = eh.chaincodeRegistrants.get(ccEvent.chaincodeID);
								if (!cbtable) {
									return;
								}
								cbtable.forEach(function(cbe) {
									if (cbe.eventNameFilter.test(ccEvent.eventName)) {
										cbe.cb(ccEvent);
									}
								});

							}
						} catch (err) {
							logger.error('Error unmarshalling transaction=', err);
						}
					});
				}
			}
			// leave these for now so that we fully understand all the events that will come back
			// maybe we could use them to better manage the lifecycle of the callbacks.
			else if (event.Event == 'register') {
				logger.debug('%s :: got register call - stream now ready %j', eh._url, event);
			}
			else if (event.Event == 'unregister') {
				logger.debug('%s :: got unregister call - will wait for end to come in %j', eh._url, event);
			}
			else {
				logger.debug('%s :: Received unknown event type : %s', eh._url, event.Event);
			}
		});
		this.call.on('end', function() {
			if(!this.connected) {
				logger.debug('%s :: got end call , already shutdown', eh._url);
				return;
			}
			logger.error('%s :: got end call - shutdown down stream', eh._url);
			eh.disconnect();
		});
		this.call.on('error', function(err){
			if(!this.connected) {
				logger.debug('%s :: got error call , already shutdown: %j', eh._url, err);
				return;
			}
			logger.error('%s :: got error call , will shutdown: %j', eh._url, err);
			eh.disconnect();
		});
		this.call.on('status', function(status) {
			logger.debug('%s :: got status call : %j', eh._url, status);
		});

		this.connected = true;
		// tell the eventsource to start sending block events
		this.registerBlockEvent();

		logger.debug('%s :: connect end', this._url);
	}

	/**
	 * Disconnects this event hub from the event source.
	 * Clears all block, transaction, and creator callbacks.
	 */
	disconnect() {
		logger.debug('%s :: disconnect blockRegistrants size=%d', this._url, this.blockRegistrants.size);
		if (!this.connected) {
			return;
		}
		var eh = this;
		logger.debug('%s :: disconnect about to call call.end', eh._url);
		this.connected = false;
		eh.call.end();
		this.blockRegistrants.forEach(function(cb) {
			logger.debug('%s :: unregister block event', eh._url);
			eh.unregisterBlockEvent(cb);
		});

		this.unregisterTxCallbacks();
		
		if(this._creator) {
			var cancel_notice = {
				creator : this._creator,
				cancel  : true,
				eventSource : this._url
			}
			this._callback(cancel_notice);
			this._creator = null;
			this._callback = null;
		}
		logger.debug('%s :: disconnect - end', eh._url);
	}

	/**
	 * Register a single creator to receive events for transactions
	 * that this creator owns
	 * @param {bytes} creator bytes that were used in the transaction
	 * @param {function} callback function to called when a transaction
	 *        event is found for this creator
	 */
	registerCreator(creator, callback) {
		logger.debug('%s :: registerCreator %s', this._url, creator);
		this._creator = creator;
		this._callback = callback;
		this._saveCreatorCallback = this.creatorCallback.bind(this);
		this.registerBlockEvent(this._saveCreatorCallback);
	}

	/**
	 * Unregister the single creator
	 */
	unRegisterCreator() {
		logger.debug('%s :: unRegisterCreator ', this._url);
		this.unregisterBlockEvent(this._saveCreatorCallback);
		this._creator = null;
		this._callback = null;
	}

	/**
	 * Register a callback function to receive chaincode events.
	 * @param {string} ccid string chaincode id
	 * @param {string} eventname string The regex string used to filter events
	 * @param {function} callback Function Callback function for filter matches
	 *        that takes a single parameter which is a json object representation
	 *        of type "message ChaincodeEvent" from lib/proto/chaincodeevent.proto
	 * @returns {object} ChainCodeCBE object that should be treated as an opaque
	 *        handle used to unregister (see unregisterChaincodeEvent)
	 */
	registerChaincodeEvent(ccid, eventname, callback) {
		if (!this.connected) return;
		var cb = new ChainCodeCBE(ccid, eventname, callback);
		var cbtable = this.chaincodeRegistrants.get(ccid);
		if (!cbtable) {
			cbtable = new Set();
			this.chaincodeRegistrants.put(ccid, cbtable);
			cbtable.add(cb);
		} else {
			cbtable.add(cb);
		}
		return cb;
	}

	/**
	 * Unregister chaincode event registration
	 * @param {object} ChainCodeCBE handle returned from call to
	 *        registerChaincodeEvent.
	 */
	unregisterChaincodeEvent(cbe) {
		if (!this.connected) return;
		var cbtable = this.chaincodeRegistrants.get(cbe.ccid);
		if (!cbtable) {
			logger.debug('No event registration for ccid %s ', cbe.ccid);
			return;
		}
		cbtable.delete(cbe);
		if (cbtable.size <= 0) {
			this.chaincodeRegistrants.remove(cbe.ccid);
		}
	}

	/**
	 * Register a callback function to receive block events.
	 * @param {function} callback Function that takes a single parameter
	 *        which is a json object representation of type "message Block"
	 *        from lib/proto/fabric.proto
	 */
	registerBlockEvent(callback) {
		logger.debug('%s :: registerBlockEvent - start', this._url);
		// maybe this was called by the connect, so callback is null
		if(callback) {
			this.blockRegistrants.add(callback);
			logger.debug('%s :: registerBlockEvent - block callback added to list', this._url);
		}

		// do not always want to send the event source the register
		// if already done or if nobody wants the events
		if (this.connected && !this.blockRegistered && this.blockRegistrants.size > 0) {
			logger.debug('%s :: registerBlockEvent - will send register to eventsource for BLOCK events', this._url);
			var register = {
				register: {
					events: [{
						eventType: 'BLOCK'
					}]
				}
			};
			this.call.write(register);
			this.blockRegistered = true; //TODO could we use the stream on.register to track
		}
		logger.debug('%s :: registerBlockEvent - end', this._url);
	}

	/**
	 * Unregister block event registration
	 * @param {function} callback Function to unregister
	 */
	unregisterBlockEvent(callback) {
		logger.debug('%s :: unregisterBlockEvent - start', this._url);
		this.blockRegistrants.delete(callback);

		// should we tell the event source that we no longer need
		// block events
		if (this.connected && this.blockRegistrants.size == 0) {
			logger.debug('%s :: unregisterBlockEvent - will send unregister for BLOCK', this._url);
			var unregister = {
				unregister: {
					events: [{
						eventType: 'BLOCK'
					}]
				}
			};
			this.call.write(unregister);
			this.blockRegistered = false;
		}
		logger.debug('%s :: unregisterBlockEvent - end', this._url);
	}

	/**
	 * Register a callback function to receive transactional events.<p>
	 * Note: transactional event registration is primarily used by
	 * the sdk to track deploy and invoke completion events. Nodejs
	 * clients generally should not need to call directly.
	 * @param {string} txid string transaction id
	 * @param {function} callback Function that takes a single parameter which
	 * is a json object representation of type "message Transaction"
	 * from lib/proto/fabric.proto
	 */
	registerTxEvent(txid, callback) {
		logger.debug('%s :: registerTxEvent - txid %s', this._url, txid);
		this.txRegistrants.put(txid, callback);
		if(this.txRegistrants.size() == 1) {
			logger.debug('%s :: registerTxEvent - need to register for block events', this._url);
			this.registerBlockEvent(this.txCallback.bind(this));
		} else {
			logger.debug('%s :: registerTxEvent - no need to register for block events size=%d', this._url, this.txRegistrants.size());
		}
	}

	/**
	 * Unregister transactional event registration.
	 * @param txid string transaction id
	 */
	unregisterTxEvent(txid) {
		this.txRegistrants.remove(txid);
	}

	/**
	 * private internal callback for processing tx events
	 * @param {object} block json object representing block of tx
	 *        from the fabric
	 */
	txCallback(block) {
		logger.debug('CALLBACK %s :: txCallback running on block number=%j', this._url, block.Header.Number);
		var eh = this;
		block.Data.Data.forEach(function(transaction) {
			try {
				var env = _commonProto.Envelope.decode(transaction);
				var payload = _commonProto.Payload.decode(env.payload);
			} catch (err) {
				logger.error('Error unmarshalling transaction from block=', err);
			}
			logger.debug('CALLBACK %s :: txCallback looking at a transaction %s',eh._url, payload.header.chainHeader.txID);
			var cb = eh.txRegistrants.get(payload.header.chainHeader.txID);
			if (cb) {
				logger.debug('CALLBACK %s :: txCallback going to call registered transaction callback',eh._url);
				cb(payload.header.chainHeader.txID);
			}
		});
	};

	/**
	 * utility method to cancel all registered transaction listeners and tell the owner
	 */
	unregisterTxCallbacks() {
		logger.debug('CALLBACK %s :: unregisterTxCallback start', this._url);
		var eh = this;

		eh.txRegistrants.forEach(function(txID, cb) {
			logger.debug('CALLBACK %s :: unregisterTxCallback looking at a transaction registration %s',eh._url, txID);
			var cancel_notice = {
				unregisterTxCallback : true,
				eventSource : eh._url,
				txID : txID.toString()
			};
			if (cb) {
				logger.debug('CALLBACK %s :: unregisterTxCallback going to call registered transaction callback with cancel notice',eh._url);
				cb(cancel_notice);
			}
			eh.unregisterTxEvent(txID);
			logger.debug('CALLBACK %s :: unregisterTxCallback done with a transaction registration %s',eh._url, txID);
		});
	};

	/*
	 * private internal callback for processing tx events
	 * this filtering will be by creator
	 * @param {object} block json object representing block of tx
	 *        from the fabric
	 */
	creatorCallback(block) {
		logger.debug('CALLBACK %s :: creatorCallback running on block number=%j', this._url, block.Header.Number);
		var eh = this;
		block.Data.Data.forEach(function(transaction) {
			try {
				var env = _commonProto.Envelope.decode(transaction);
				var payload = _commonProto.Payload.decode(env.payload);
			} catch (err) {
				logger.error('Error unmarshalling transaction from block=', err);
				return;
			}
			logger.debug('CALLBACK %s :: creatorCallback looking at a transaction %s', eh._url, payload.header.chainHeader.txID);

			eh._creator._msp.deserializeIdentity(payload.header.signatureHeader.creator)
				.then((event_identity) => {
					var hubKey = eh._creator._publicKey.getSKI();
					var eventKey = event_identity._publicKey.getSKI();
					logger.debug('CALLBACK %s :: the incoming transaction event creator publicKey is %j', eh._url, eventKey);
					logger.debug('CALLBACK %s :: this event hub\' creator publickey is %j', eh._url, hubKey);
					if(eventKey == hubKey) {
						if (eh._callback) {
							eh._callback({
								txID : payload.header.chainHeader.txID,
								eventSourceURL : eh._url,
								transaction : transaction
							});
						}
					}
				});
		});
	};

	/*
	 * utility method to indicate how busy this event hub is
	 */
	getNumberOfRegistrations() {
		var count = 0;
		count = count + (this._creator ? 1 : 0);
		count = count + this.txRegistrants.size();
		return count;
	}

	/**
	* return a printable representation of this object
	*/
	toString() {
		return ' EventHub : {' +
			'url:' + this._url +
		'}';
	}};

module.exports = EventHub;
