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

var utils = require('./utils.js');
var Remote = require('./Remote.js');
var Block = require('./Block');
var grpc = require('grpc');
var HashTable = require('hashtable');
var logger = utils.getLogger('EventHub.js');

var _events = grpc.load(__dirname + '/protos/peer/events.proto').protos;
var _common = grpc.load(__dirname + '/protos/common/common.proto').common;
var _ccTransProto = grpc.load(__dirname + '/protos/peer/transaction.proto').protos;
var _transProto = grpc.load(__dirname + '/protos/peer/transaction.proto').protos;
var _responseProto = grpc.load(__dirname + '/protos/peer/proposal_response.proto').protos;
var _ccProposalProto = grpc.load(__dirname + '/protos/peer/proposal.proto').protos;
var _ccEventProto = grpc.load(__dirname + '/protos/peer/chaincodeevent.proto').protos;

var _validation_codes = {};
var keys = Object.keys(_transProto.TxValidationCode);
for(var i = 0;i<keys.length;i++) {
	var new_key = _transProto.TxValidationCode[keys[i]];
	_validation_codes[new_key] = keys[i];
}

/*
 * The ChainCodeCBE is used internal to the EventHub to hold chaincode
 * event registration callbacks.
 */
var ChainCodeCBE = class {
	/*
	 * Constructs a chaincode callback entry
	 *
	 * @param {string} ccid - chaincode id
	 * @param {string} eventNameFilter - The regex used to filter events
	 * @param {function} cb - Callback for filter matches
	 * @param {function} error - Callback for connection errors
	 */
	constructor(ccid, eventNameFilter, cb, error) {
		// chaincode id
		this.ccid = ccid;
		// event name regex filter
		this.eventNameFilter = new RegExp(eventNameFilter);
		// callback function to invoke on successful filter match
		this.cb = cb;
		// callback function to invoke on a connection failure
		this.error = error;
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

	constructor(clientContext) {
		logger.debug('const ');
		// hashtable of clients registered for chaincode events
		this.chaincodeRegistrants = new HashTable();
		// set of clients registered for block events
		this.block_registrant_count = 0;
		this.blockRegistrants = new HashTable();
		this.blockRegistrantsError = new HashTable();
		// hashtable of clients registered for transactional events
		this.txRegistrants = new HashTable();
		this.txRegistrantsError = new HashTable();
		// peer node to connect to
		this.ep = null;
		// grpc event client interface
		this._client = null;
		// grpc chat streaming interface
		this.call = null;
		// fabric connection state of this eventhub
		this.connected = false;
		// reference to the client instance holding critical context such as signing identity
		if (typeof clientContext === 'undefined' || clientContext === null || clientContext === '')
			throw new Error('Missing required argument: clientContext');

		if (typeof clientContext.getUserContext !== 'function')
			throw new Error('Invalid clientContext argument: missing required function "getUserContext"');

		if (typeof clientContext.getUserContext() === 'undefined' || clientContext.getUserContext() === null)
			throw new Error('The clientContext has not been properly initialized, missing userContext');

		this._clientContext = clientContext;
	}

	/**
	 * Set peer url for event source<p>
	 * Note: Only use this if creating your own EventHub. The chain
	 * class creates a default eventHub that most Node clients can
	 * use (see eventHubConnect, eventHubDisconnect and getEventHub).
	 * @param {string} peeraddr peer url
	 * @param {object} opts An Object that may contain options to pass to grpcs calls
	 * <br>- pem {string} The certificate file, in PEM format,
	 *    to use with the gRPC protocol (that is, with TransportCredentials).
	 *    Required when using the grpcs protocol.
	 * <br>- ssl-target-name-override {string} Used in test environment only, when the server certificate's
	 *    hostname (in the 'CN' field) does not match the actual host endpoint that the server process runs
	 *    at, the application can work around the client TLS verify failure by setting this property to the
	 *    value of the server certificate's hostname
	 * <br>- any other standard grpc call options will be passed to the grpc service calls directly
	 */

	setPeerAddr(peerUrl, opts) {
		logger.debug('setPeerAddr -  %s',peerUrl);
		this.ep = new Remote(peerUrl, opts);
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
		logger.debug('connect - start');
		if (this.connected) {
			logger.debug('connect - end - already conneted');
			return;
		}
		if (!this.ep) throw Error('Must set peer address before connecting.');
		this._client = new _events.Events(this.ep._endpoint.addr, this.ep._endpoint.creds, this.ep._options);
		this.call = this._client.chat();
		this.connected = true;

		var eh = this; // for callback context
		this.call.on('data', function(event) {
			if (event.Event == 'block') {
				var block = Block.decodeBlock(event.block);
				eh._sendBlockCallbacks(block);
				eh._sendTxCallbacks(block);
				eh._sendChainCodeCallbacks(block);
			}
			else if (event.Event == 'register'){
				logger.debug('connect - register event received');
			}
			else if (event.Event == 'unregister'){
				if(eh.connected) eh.disconnect();
				logger.debug('connect - unregister event received');
			}
			else {
				logger.debug('connect - unknown event %s',event.Event);
			}
		});
		this.call.on('end', function() {
			if(eh.connected) eh.disconnect();
		});
		this.call.on('error', function() {
			if(eh.connected) eh.disconnect();
		});

		this._sendSignedEvent(true);
		logger.debug('connect - end');
	}

	/**
	 * Disconnects the connection to the peer event source.
	 * Will close all event listeners and send an `Error` to
	 * all listeners with an "error" callback.
	 */
	disconnect() {
		this.connected = false;
		this._closeAllCallbacks(new Error('EventHub has been shutdown'));
		if(this.call) {
			this._sendSignedEvent(false);
			this.call.end();
		}
	}

	/*
	 * Internal method
	 * Builds a signed event registration
	 * and sends it to the peer's event hub.
	 */
	_sendSignedEvent(register) {
		var user = this._clientContext.getUserContext();
		var signedEvent = new _events.SignedEvent();
		var event = new _events.Event();
		var reg = {events: [{event_type: 'BLOCK'}]};

		if(register) {
			event.setRegister(reg);
		}
		else {
			event.setUnregister(reg);
		}

		event.setCreator(user.getIdentity().serialize());
		signedEvent.setEventBytes(event.toBuffer());
		var sig = user.getSigningIdentity().sign(event.toBuffer());
		signedEvent.setSignature(Buffer.from(sig));
		this.call.write(signedEvent);
	}

	/*
	 * Internal method to close out all callbacks
	 * Sends an error to all registered event error callbacks
	 */
	_closeAllCallbacks(err) {
		logger.debug('_closeAllCallbacks - start');

		var closer = function(key, cb) {
			logger.debug('_closeAllCallbacks - closing this callback %s',key);
			cb(err);
		};

		logger.debug('_closeAllCallbacks - blockRegistrantsError %s',this.blockRegistrantsError.size());
		this.blockRegistrantsError.forEach(closer);
		this.blockRegistrants.clear();
		this.blockRegistrantsError.clear();

		logger.debug('_closeAllCallbacks - txRegistrantsError %s',this.txRegistrantsError.size());
		this.txRegistrantsError.forEach(closer);
		this.txRegistrants.clear();
		this.txRegistrantsError.clear();

		var cc_closer = function(key, cbtable) {
			cbtable.forEach(function(cbe) {
				logger.debug('_closeAllCallbacks - closing this chaincode event %s %s',cbe.ccid, cbe.eventNameFilter);
				if(cbe.error) {
					cbe.error(err);
				}
			});
		};

		logger.debug('_closeAllCallbacks - chaincodeRegistrants %s',this.chaincodeRegistrants.size());
		this.chaincodeRegistrants.forEach(cc_closer);
		this.chaincodeRegistrants.clear();
	}

	/*
	 * Internal method
	 * checks for a connection and if not connected
	 * throws an error
	 */
	_checkConnection(throw_error) {
		if(this.connected) {
			logger.debug(' this hub %s is connected', this.ep.getUrl());
		}
		else {
			logger.debug('this hub %s is not connected', this.ep.getUrl());
			if(throw_error) {
				throw new Error('The event hub has not been connected to the event source');
			}
		}
	}

	/**
	 * Register a callback function to receive chaincode events.
	 * @param {string} ccid - string chaincode id
	 * @param {string} eventname - string The regex string used to filter events
	 * @param {function} callback - callback function for filter matches
	 * that takes a single parameter which is a json object representation
	 * of type "message ChaincodeEvent" from lib/proto/chaincodeevent.proto
	 * @param {function} error - callback function to be notified when this
	 * event hub is shutdown.
	 * @returns {object} ChainCodeCBE object that should be treated as an opaque
	 * handle used to unregister (see unregisterChaincodeEvent)
	 */
	registerChaincodeEvent(ccid, eventname, callback, error) {
		logger.debug('registerChaincodeEvent - start');
		if(!ccid) {
			throw new Error('Missing "ccid" parameter');
		}
		if(!eventname) {
			throw new Error('Missing "eventname" parameter');
		}
		if(!callback) {
			throw new Error('Missing "callback" parameter');
		}
		this._checkConnection(true);
		var cbe = new ChainCodeCBE(ccid, eventname, callback, error);
		var cbtable = this.chaincodeRegistrants.get(ccid);
		if (!cbtable) {
			cbtable = new Set();
			this.chaincodeRegistrants.put(ccid, cbtable);
		}
		cbtable.add(cbe);

		return cbe;
	}

	/**
	 * Unregister chaincode event registration
	 * @param {object} cbe - ChainCodeCBE handle return from call to
	 * registerChaincodeEvent.
	 */
	unregisterChaincodeEvent(cbe) {
		logger.debug('unregisterChaincodeEvent - start');
		this._checkConnection();
		if(!cbe) {
			throw new Error('Missing "cbe" parameter');
		}
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
	 * @param {function} error - callback function to be notified when this
	 * event hub is shutdown.
	 * @returns {Promise} Promise for a successful registration, no returned values
	 */
	registerBlockEvent(callback, error) {
		logger.debug('registerBlockEvent - start');
		if(!callback) {
			throw new Error('Missing "callback" parameter');
		}
		this._checkConnection(true);
		this.block_registrant_count++;
		this.blockRegistrants.put(this.block_registrant_count, callback);
		if(error) this.blockRegistrantsError.put(this.block_registrant_count, error);
	}

	/**
	 * Unregister block event registration
	 * @param {function} callback Function to unregister
	 */
	unregisterBlockEvent(callback) {
		logger.debug('unregisterBlockEvent - start');
		var user = this._clientContext.getUserContext();
		this._checkConnection();
		if(!callback) {
			throw new Error('Missing "callback" parameter');
		}
		var keys = this.blockRegistrants.keys();
		logger.debug('unregisterBlockEvent - keys %s',keys);
		for(var i in keys) {
			var key = keys[i];
			logger.debug('unregisterBlockEvent - removing key %s',key);
			if(this.blockRegistrants.get(key) === callback ) {
				this.blockRegistrants.remove(key);
				this.blockRegistrantsError.remove(key);
			}
		}
	}

	/**
	 * Register a callback function to receive transactional events.
	 * @param {string} txid string transaction id
	 * @param {function} callback Function that takes a parameter which
	 * is a json object representation of type "message Transaction"
	 * from lib/proto/fabric.proto and a parameter which is a boolean
	 * that indicates if the transaction is invalid (true=invalid)
	 * @param {function} error - callback function to be notified when this
	 * event hub is shutdown.
	 */
	registerTxEvent(txid, callback, error) {
		logger.debug('registerTxEvent txid ' + txid);
		if(!txid) {
			throw new Error('Missing "txid" parameter');
		}
		if(!callback) {
			throw new Error('Missing "callback" parameter');
		}
		this._checkConnection(true);
		this.txRegistrants.put(txid, callback);
		if(error) this.txRegistrantsError.put(txid, error);
	}

	/**
	 * Unregister transactional event registration.
	 * @param txid string transaction id
	 */
	unregisterTxEvent(txid) {
		logger.debug('unregisterTxEvent txid ' + txid);
		this._checkConnection();
		if(!txid) {
			throw new Error('Missing "txid" parameter');
		}
		this.txRegistrants.remove(txid);
		this.txRegistrantsError.remove(txid);
	}

	/*
	 * private internal method for processing block events
	 * @param {object} block protobuf object
	 */
	_sendBlockCallbacks(block) {
		logger.debug('_sendBlockCallbacks block=%s', block.header.number);
		if(this.blockRegistrants.size == 0) {
			logger.debug('_sendBlockCallbacks - no registered block events');
			return;
		}

		// send to all registered block listeners
		this.blockRegistrants.forEach(function(key, cb) {
			cb(block);
		});
	}

	/*
	 * private internal method for processing tx events
	 * @param {object} block protobuf object which might contain the tx from the fabric
	 */
	_sendTxCallbacks(block) {
		logger.debug('_sendTxCallbacks block=%s', block.header.number);
		if(this.txRegistrants.size() == 0) {
			logger.debug('_sendTxCallbacks - no registered transaction events');
			return;
		}

		var txStatusCodes = block.metadata.metadata[_common.BlockMetadataIndex.TRANSACTIONS_FILTER];

		for (var index=0; index < block.data.data.length; index++) {
			logger.debug('_sendTxCallbacks - trans index=%s',index);
			var channel_header = block.data.data[index].payload.header.channel_header;
			var val_code = convertValidationCode(txStatusCodes[index]);
			logger.debug('_sendTxCallbacks - txid=%s  val_code=%s',val_code, channel_header.tx_id);
			var cb = this.txRegistrants.get(channel_header.tx_id);
			if (cb){
				logger.debug('_sendTxCallbacks - about to call the transaction call back for code=%s tx=%s', val_code, channel_header.tx_id);
				cb(channel_header.tx_id, val_code);
			}
		}
	};

	/*
	 * private internal method for processing chaincode events
	 * @param {object} block protobuf object which might contain the chaincode event from the fabric
	 */
	_sendChainCodeCallbacks(block) {
		logger.debug('_sendChainCodeCallbacks block=%s', block.header.number);
		if(this.chaincodeRegistrants.size() == 0) {
			logger.debug('_sendChainCodeCallbacks - no registered chaincode events');
			return;
		}

		for (var index=0; index < block.data.data.length; index++) {
			logger.debug('_sendChainCodeCallbacks - trans index=%s',index);
			try {
				var env = block.data.data[index];
				var payload = env.payload;
				var channel_header = payload.header.channel_header;
				if (channel_header.type == _common.HeaderType.ENDORSER_TRANSACTION) {
					var tx = payload.data;
					var chaincodeActionPayload = tx.actions[0].payload;
					var propRespPayload = chaincodeActionPayload.action.proposal_response_payload;
					var caPayload = propRespPayload.extension;
					var ccEvent = caPayload.events;
					logger.debug('_sendChainCodeCallbacks - ccEvent %s',ccEvent);
					var cbtable = this.chaincodeRegistrants.get(ccEvent.chaincode_id);
					if (!cbtable) {
						return;
					}
					cbtable.forEach(function(cbe) {
						if (cbe.eventNameFilter.test(ccEvent.event_name)) {
							cbe.cb(ccEvent);
						}
					});
				}
			} catch (err) {
				logger.error('on.data - Error unmarshalling transaction=', err);
			}
		}
	};
};

function convertValidationCode(code) {
	return _validation_codes[code];
}

module.exports = EventHub;