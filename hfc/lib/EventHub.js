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
 * event source(peer)
 * @class
 */
var EventHub = class extends Remote {

	/**
	 * Constructs an unconnected EventHub for a Peer
	 *
	 * @param {Peer}  The Peer Object
	 */
	constructor(url, opts) {
		super(url, opts);
		logger.info('const - url: %s options ',this._url, this._options);
		// peer
		this._peer = null;
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
	 * Set peer for event source<p>
	 * Note: Only use this if creating your own EventHub.
	 * @param {Peer} peer
	 */

	setPeer(peer) {
		this._peer = peer;
	}

	/**
	 * Get connected state of eventhub
	 * @returns true if connected to event source, false otherwise
	 */
	isconnected() {
		return this.connected;
	}

	/**
	 * Establishes connection with peer event source<p>
	 * Note: Only use this if creating your own EventHub. The chain
	 * class creates a default eventHub that most Node clients can use.
	 */
	connect() {
		logger.debug(' EVENT :: connect start');
		if (this.connected) {
			logger.debug(' EVENT :: connect end - already connected');
			return;
		}

		this._client = new _eventsProto.Events(this._endpoint.addr, this._endpoint.creds, this._options);
		this.call = this._client.chat();

		var eh = this; // for callback context
		this.call.on('data', function(event) {
			logger.debug(' EVENT :: got data event - check for listeners');
			if (event.Event == 'block') {
				eh.blockRegistrants.forEach(function(cb) {
					logger.debug(' EVENT :: sending this block to a callback');
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
			else if (event.Event == 'register') {
				this._block_event_registered = true;
				logger.debug(' EVENT :: got register event - stream now ready');
			}
			else if (event.Event == 'unregister') {
				//TODO when we support more event types this will have to be revisited
				this._block_event_registered = false;
				logger.debug(' EVENT :: got unregister event - will now shutdown stream');
				logger.debug(' EVENT :: disconnect - end (step2of3)');
				eh.call.end();
			}
			else {
				logger.error(' EVENT :: Received unknown event type : %s',event.Event);
			}
		});
		this.call.on('end', function() {
			// TODO tell user this ended
			// track if we called for this stream to end .. maybe we should clean up and post to user
			logger.debug(' EVENT :: got end hit - stream now shutdown');
			logger.debug(' EVENT :: disconnect - end (step3of3)');
			this.connected = false;
		});
		this.call.on('error', function(err){
			logger.error(' EVENT :: got error hit : %j',err);
			// TODO tell user
		});
		this.call.on('status', function(status) {
			logger.debug(' EVENT :: got status hit : %j',status);
		});

		this.connected = true;
		// tell the eventsource to start sending block events
		this.registerBlockEvent();

		logger.debug(' EVENT :: connect end');
	}

	/**
	 * Disconnects peer event source<p>
	 * Note: Only use this if creating your own EventHub. The chain
	 * class creates a default eventHub that most Node clients can use.
	 */
	disconnect() {
		logger.debug(' EVENT :: disconnect blockRegistrants size='+this.blockRegistrants.size);
		if (!this.connected) return;
		var eh = this;
		if(this.blockRegistered) {
			// do a graceful shutdown
			this.blockRegistrants.forEach(function(cb) {
				logger.debug('    :: unregister block event');
				eh.unregisterBlockEvent(cb);
			});
			logger.debug(' EVENT :: disconnect - end (step1of3)');
		}
		else {
			// nothing going skip to right to end
			logger.debug(' EVENT :: disconnect - quick end (step1of2)');
		}

		//TODO shutdown the chaincode events
	}

	/**
	 * Register a single creator to receive events for transactions
	 * that this creator owns
	 * @param {bytes} creator bytes that were used in the transaction
	 * @param {function} callback function to called when a transaction
	 *        event is found for this creator
	 */
	registerCreator(creator, callback) {
		logger.debug(' EVENT :: registerCreator :: ' + creator);
		this._creator = creator;
		this._callback = callback;
		this._saveCreatorCallback = this.creatorCallback.bind(this);
		this.registerBlockEvent(this._saveCreatorCallback);
	}

	/**
	 * Unregister the single creator
	 */
	unRegisterCreator() {
		logger.debug(' EVENT :: unRegisterCreator ');
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
		logger.debug('registerBlockEvent - start');
		// maybe this was called by the connect, so callback is null
		if(callback) this.blockRegistrants.add(callback);

		// do not always want to send the event source the register
		// if already done or if nobody wants the events
		if (this.connected && !this.blockRegistered) {
			logger.debug('registerBlockEvent - will send register for BLOCK');
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
		logger.debug('registerBlockEvent - end');
	}

	/**
	 * Unregister block event registration
	 * @param {function} callback Function to unregister
	 */
	unregisterBlockEvent(callback) {
		logger.debug('unregisterBlockEvent - start');
		this.blockRegistrants.delete(callback);

		// should we tell the event source that we no longer need
		// block events
		if (this.connected && this.blockRegistrants.size == 0) {
			logger.debug('registerBlockEvent - will send unregister for BLOCK');
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
		logger.debug('unregisterBlockEvent - end');
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
		logger.debug('registerTxEvent - txid ' + txid);
		this.txRegistrants.put(txid, callback);
		if(this.txRegistrants.size() == 1) {
			logger.debug('registerTxEvent - need to register for block events');
			this.registerBlockEvent(this.txCallback.bind(this));
		} else {
			logger.debug('registerTxEvent - no need to register for block events size=' + this.txRegistrants.size());
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
		logger.debug(' CALLBACK :: txCallback running on block numberr=%j', block.Header.Number);
		var eh = this;
		block.Data.Data.forEach(function(transaction) {
			try {
				var env = _commonProto.Envelope.decode(transaction);
				var payload = _commonProto.Payload.decode(env.payload);
			} catch (err) {
				logger.error('Error unmarshalling transaction from block=', err);
			}
			logger.debug(' CALLBACK :: txCallback looking at a transaction '+ payload.header.chainHeader.txID);
			var cb = eh.txRegistrants.get(payload.header.chainHeader.txID);
			if (cb)
				cb(transaction.txid);
		});
	};

	/**
	 * private internal callback for processing tx events
	 * this filtering will be by creator
	 * @param {object} block json object representing block of tx
	 *        from the fabric
	 */
	creatorCallback(block) {
		logger.debug(' CALLBACK :: creatorCallback running on block number=%j', block.Header.Number);
		var eh = this;
		block.Data.Data.forEach(function(transaction) {
			try {
				var env = _commonProto.Envelope.decode(transaction);
				var payload = _commonProto.Payload.decode(env.payload);
			} catch (err) {
				logger.error('Error unmarshalling transaction from block=', err);
				return;
			}
			logger.debug(' CALLBACK :: creatorCallback looking at a transaction '+ payload.header.chainHeader.txID);

			eh._creator._msp.deserializeIdentity(payload.header.signatureHeader.creator)
				.then((event_identity) => {
					var hubKey = eh._creator._publicKey.getSKI();
					var eventKey = event_identity._publicKey.getSKI();
					logger.debug(' CALLBACK :: the incoming transaction event creator publicKey is %j',eventKey);
					logger.debug(' CALLBACK :: this event hub\' creator publickey is %j',hubKey);
					if(eventKey == hubKey) {
						if (eh._callback) {
							eh._callback({
								txID : payload.header.chainHeader.txID,
								peerURL : eh._peer._url,
								transaction : transaction
							});
						}
					}
				});
		});
	};
};

module.exports = EventHub;
