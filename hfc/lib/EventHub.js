'use strict';

var utils = require('./utils.js');
var grpc = require('grpc');
var HashTable = require('hashtable');
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
var EventHub = class {

	/**
	 * Constructs an unconnected EventHub
	 */

	constructor() {
		// hashtable of clients registered for chaincode events
		this.chaincodeRegistrants = new HashTable();
		// set of clients registered for block events
		this.blockRegistrants = new Set();
		// hashtable of clients registered for transactional events
		this.txRegistrants = new HashTable();
		// peer addr to connect to
		this.ep = null;
		// grpc options
		this.opts = null;
		// grpc events pb interface
		this.events = null;
		// grpc common pb interface
		this._common = null;
		// grpc chaincode transaction pb interface
		this._ccTransProto = null;
		// grpc transaction pb interface
		this._transProto = null;
		// grpc response pb interface
		this._responseProto = null;
		// grpc chaincode proposal pb interface
		this._ccProposalProto = null;
		// grpc chaincode event pb interface
		this._ccEventProto = null;
		// grpc event client interface
		this._client = null;
		// grpc chat streaming interface
		this.call - null;
		// fabric connection state of this eventhub
		this.connected = false;
	}

	/**
	 * Set peer url for event source<p>
	 * Note: Only use this if creating your own EventHub. The chain
	 * class creates a default eventHub that most Node clients can
	 * use (see eventHubConnect, eventHubDisconnect and getEventHub).
	 * @param {string} peeraddr peer url
	 * @param {object} opts grpc options for peer
	 */

	setPeerAddr(peerUrl) {
		this.ep = new utils.Endpoint(peerUrl, null);
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
	 * class creates a default eventHub that most Node clients can
	 * use (see eventHubConnect, eventHubDisconnect and getEventHub).
	 */
	connect() {
		if (this.connected) return;
		if (!this.ep) throw Error('Must set peer address before connecting.');
		this.events = grpc.load(__dirname + '/protos/peer/events.proto').protos;
		this._common = grpc.load(__dirname + '/protos/common/common.proto').common;
		this._ccTransProto = grpc.load(__dirname + '/protos/peer/chaincode_transaction.proto').protos;
		this._transProto = grpc.load(__dirname + '/protos/peer/fabric_transaction.proto').protos;
		this._responseProto = grpc.load(__dirname + '/protos/peer/fabric_proposal_response.proto').protos;
		this._ccProposalProto = grpc.load(__dirname + '/protos/peer/chaincode_proposal.proto').protos;
		this._ccEventProto = grpc.load(__dirname + '/protos/peer/chaincodeevent.proto').protos;
		this._client = new this.events.Events(this.ep.addr, this.ep.creds, this.opts);
		this.call = this._client.chat();
		this.connected = true;
		// register txCallback to process txid callbacks
		this.registerBlockEvent(this.txCallback.bind(this));

		var eh = this; // for callback context
		this.call.on('data', function(event) {
			if (event.Event == 'block') {
				eh.blockRegistrants.forEach(function(cb) {
					cb(event.block);
				});
				event.block.Data.Data.forEach(function(transaction) {
					try {
						var env = eh._common.Envelope.decode(transaction);
						var payload = eh._common.Payload.decode(env.payload);
						if (payload.header.chainHeader.type == eh._common.HeaderType.ENDORSER_TRANSACTION) {
							var tx = eh._transProto.Transaction.decode(payload.data);
							var chaincodeActionPayload = eh._ccTransProto.ChaincodeActionPayload.decode(tx.actions[0].payload);
							var propRespPayload = eh._responseProto.ProposalResponsePayload
							.decode(chaincodeActionPayload.action.proposalResponsePayload);
							var caPayload = eh._ccProposalProto.ChaincodeAction.decode(propRespPayload.extension);
							var ccEvent = eh._ccEventProto.ChaincodeEvent.decode(caPayload.events);
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
		});
		this.call.on('end', function() {
			eh.call.end();
			// clean up Registrants - should app get notified?
			eh.chaincodeRegistrants.clear();
			eh.blockRegistrants.clear();
		});
	}

	/**
	 * Disconnects peer event source<p>
	 * Note: Only use this if creating your own EventHub. The chain
	 * class creates a default eventHub that most Node clients can
	 * use (see eventHubConnect, eventHubDisconnect and getEventHub).
	 */
	disconnect() {
		if (!this.connected) return;
		this.unregisterBlockEvent(this.txCallback);
		this.call.end();
		this.connected = false;
	}

	/**
	 * Register a callback function to receive chaincode events.
	 * @param {string} ccid string chaincode id
	 * @param {string} eventname string The regex string used to filter events
	 * @param {function} callback Function Callback function for filter matches
	 * that takes a single parameter which is a json object representation
	 * of type "message ChaincodeEvent" from lib/proto/chaincodeevent.proto
	 * @returns {object} ChainCodeCBE object that should be treated as an opaque
	 * handle used to unregister (see unregisterChaincodeEvent)
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
	 * registerChaincodeEvent.
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
	 * which is a json object representation of type "message Block"
	 * from lib/proto/fabric.proto
	 */
	registerBlockEvent(callback) {
		if (!this.connected) return;
		this.blockRegistrants.add(callback);
		if (this.blockRegistrants.size == 1) {
			var register = {
				register: {
					events: [{
						eventType: 'BLOCK'
					}]
				}
			};
			this.call.write(register);
		}
	}

	/**
	 * Unregister block event registration
	 * @param {function} callback Function to unregister
	 */
	unregisterBlockEvent(callback) {
		if (!this.connected) return;
		if (this.blockRegistrants.size <= 1) {
			var unregister = {
				unregister: {
					events: [{
						eventType: 'BLOCK'
					}]
				}
			};
			this.call.write(unregister);
		}
		this.blockRegistrants.delete(callback);
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
		logger.debug('reg txid ' + txid);
		this.txRegistrants.put(txid, callback);
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
	 * @param {object} event json object representing grpc fabric event
	 */
	txCallback(block) {
		logger.debug('txCallback block=%j', block);
		var eh = this;
		block.Data.Data.forEach(function(transaction) {
			try {
				var env = eh._common.Envelope.decode(transaction);
				var payload = eh._common.Payload.decode(env.payload);
			} catch (err) {
				logger.error('Error unmarshalling transaction from block=', err);
			}
			logger.debug('txid=' + payload.header.chainHeader.txID);
			var cb = eh.txRegistrants.get(payload.header.chainHeader.txID);
			if (cb)
				cb(transaction.txid);
		});
	};
};

module.exports = EventHub;
