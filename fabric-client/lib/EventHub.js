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
var BlockDecoder = require('./BlockDecoder.js');
var grpc = require('grpc');
var logger = utils.getLogger('EventHub.js');

var _events = grpc.load(__dirname + '/protos/peer/events.proto').protos;
var _common = grpc.load(__dirname + '/protos/common/common.proto').common;
var _ccTransProto = grpc.load(__dirname + '/protos/peer/transaction.proto').protos;
var _transProto = grpc.load(__dirname + '/protos/peer/transaction.proto').protos;
var _responseProto = grpc.load(__dirname + '/protos/peer/proposal_response.proto').protos;
var _ccProposalProto = grpc.load(__dirname + '/protos/peer/proposal.proto').protos;
var _ccEventProto = grpc.load(__dirname + '/protos/peer/chaincode_event.proto').protos;

var _validation_codes = {};
var keys = Object.keys(_transProto.TxValidationCode);
for(var i = 0;i<keys.length;i++) {
	let new_key = _transProto.TxValidationCode[keys[i]];
	_validation_codes[new_key] = keys[i];
}

var _header_types = {};
keys = Object.keys(_common.HeaderType);
for(var j in keys) {
	let new_key = _common.HeaderType[keys[j]];
	_header_types[new_key] = keys[j];
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
	 * @param {function} onEvent - Callback for filter matches
	 * @param {function} onError - Callback for connection errors
	 */
	constructor(ccid, eventNameFilter, onEvent, onError) {
		// chaincode id
		this.ccid = ccid;
		// event name regex filter
		this.eventNameFilter = new RegExp(eventNameFilter);
		// callback function to invoke on successful filter match
		this.onEvent = onEvent;
		// callback function to invoke on a connection failure
		this.onError = onError;
	}
};

/**
 * The EventHub class is used to distribute events from an
 * event source(peer).
 * <br><br>Sample usage:
<br><pre>
var eh = client.newEventHub();
eh.setPeerAddr(
	'grpcs://localhost:9999',
	{
		pem: Buffer.from(certdata).toString(),
		'ssl-target-name-override': 'peer1']
	}
);
eh.connect();
  eh.registerTxEvent(
  	transactionId,
	(tx, code) => {
		eh.unregisterTxEvent(transactionId);
		console.log('Transaction ' + transactionId +
		'has completed');
	},
	(err) => {
		eh.unregisterTxEvent(transactionId);
		console.log('Transaction listener has been closed on ' +
		eh.getPeerAddr());
	}
);
</pre><br>
 * Use the "newEventHub" method on {@link Client} to get a new EventHub instance.
 * Use the "setPeerAddr" method on EventHub to indicate to the EventHub
 * instance the Peer's event hub address.
 * Use the "connect" method on EventHub to connect to the Peer's event
 * hub. This operation will be asynchronous and as such the call will not
 * fail if there is an issue with the connection.
 * Use the "registerTxEvent", "registerChaincodeEvent", or "registerBlockEvent"
 * calls to register your callback listeners to be notified when this EventHub
 * receives an event. Notice in the example there is both a callback for processing
 * the event and one to process error issues. The primary error to watch for is
 * a network issue that will cause the connection to close. Registering
 * an error callback will guarantee that you get notified of network issues,
 * otherwise there is no path available for this EventHub to notify the
 * listeners.
 * @class
 */
var EventHub = class {

	/**
	 * Constructs an unconnected EventHub
	 *
	 * @param {Client} clientContext An instance of the Client class
	 * which has already been initialzed with a userContext.
	 *
	 */

	constructor(clientContext) {
		logger.info('const ');
		// hashtable of clients registered for chaincode events
		this._chaincodeRegistrants = {};
		// set of clients registered for block events
		this._block_registrant_count = 1;
		this._blockOnEvents = {};
		this._blockOnErrors = {};
		// hashtable of clients registered for transactional events
		this._transactionOnEvents = {};
		this._transactionOnErrors = {};
		// peer node to connect to
		this._ep = null;
		// grpc event client interface
		this._event_client = null;
		// grpc chat streaming interface
		this._stream = null;
		// fabric connection state of this eventhub
		this._connected = false;
		this._connect_running = false;
		// should this event hub reconnect on registrations
		this._force_reconnect = true;
		// connect count for this instance
		this._current_stream = 0;
		// heartbeat
		this._heartbeat_timer = null;
		this._activity_received = false;
		this._keep_alive_response = false;

		// reference to the client instance holding critical context such as signing identity
		if (typeof clientContext === 'undefined' || clientContext === null || clientContext === '')
			throw new Error('Missing required argument: clientContext');

		if (typeof clientContext.getUserContext !== 'function')
			throw new Error('Invalid clientContext argument: missing required function "getUserContext"');

		if (typeof clientContext.getUserContext() === 'undefined' || clientContext.getUserContext() === null)
			throw new Error('The clientContext has not been properly initialized, missing userContext');

		this._clientContext = clientContext;
	}

	/*
	 * Internal method to manage the heartbeat timer.
	 *
	 * The heartbeat timer will fire on an interval based on the "heartbeat-time" or if
	 * not set based on the "request-timeout" config setting.
	 * When the heartbeat timer fires it will check to see if there has been activity
	 * during this interval, if there has been activity then restart the timer.
	 * If there has not been activity, check to see if there has been a registration
	 * response received. If there has been a registration response then make another
	 * registration and restart the timer. If there has not been a registration response,
	 * then something is wrong and shutdown this event stream
	 */
	_startHeartbeatTimer() {
		clearTimeout(this._heartbeat_timer);
		var heartbeat_time = utils.getConfigSetting('heartbeat-time', this._ep._request_timeout);
		logger.info('_startHeartbeatTimer -  timer set to:%s',heartbeat_time);
		if(heartbeat_time <= 0) {
			logger.info('_startHeartbeatTimer -  not starting timer set to:%s',heartbeat_time);
			return;
		}

		var self = this;
		this._heartbeat_timer = setTimeout(() => {
			logger.info('heartbeat timer - woke up after:%s', heartbeat_time);
			if(self._activity_received) {
				logger.info('heatbeat timer - event activity has been received');
				self._activity_received = false;
				self._startHeartbeatTimer();
			}
			else if(self._keep_alive_response) {
				logger.info('heatbeat timer - registration response has been received');
				self._keep_alive_response = false;
				self._sendKeepAlive();

				// restart timer
				self._startHeartbeatTimer();
			}
			else {
				logger.info('heartbeat timer - send back failure to all callbacks');
				this._disconnect(new Error('EventHub has been shutdown due to loss of heartbeat'));
			}
		}, heartbeat_time);
	}

	/**
	 * Set peer url for event source<p>
	 * @param {string} peeraddr peer url
	 * @param {object} opts An Object that may contain options to pass to grpcs calls
	 * <br>- pem {string} The certificate file, in PEM format,
	 *    to use with the gRPC protocol (that is, with TransportCredentials).
	 *    Required when using the grpcs protocol.
	 * <br>- ssl-target-name-override {string} Used in test environment only, when the server certificate's
	 *    hostname (in the 'CN' field) does not match the actual host endpoint that the server process runs
	 *    at, the application can work around the client TLS verify failure by setting this property to the
	 *    value of the server certificate's hostname
	 * <br>- any other standard grpc stream options will be passed to the grpc service calls directly
	 */
	setPeerAddr(peerUrl, opts) {
		logger.info('setPeerAddr -  %s',peerUrl);
		//clean up
		this._disconnect(new Error('EventHub has been shutdown due to new Peer address assignment'));
		this._ep = new Remote(peerUrl, opts);
	}

	/**
	 * Get the peer url for this event source
	 */
	getPeerAddr() {
		var addr = null;
		if(this._ep) {
			addr = this._ep._endpoint.addr;
		}

		return addr;
	}

	/**
	 * Get connected state of eventhub
	 * @returns true if connected to event source, false otherwise
	 */
	isconnected() {
		return this._connected;
	}

	/**
	 * Establishes a connection with the peer event source
	 * The peer address must be set using the "setPeerAddr"
	 * method before calling this method.
	 *
	 * The connection will be established asynchronously.
	 */
	connect(){
		logger.info('connect - start');
		this._connect_running = false; //override a running connect
		this._connect();
	}

	/*
	 * Internal use only
	 * Establishes a connection with the peer event source
	 * @param {boolean} force - internal use only, will reestablish the
	 *                  the connection to the peer event hub
	 */
	_connect(force) {
		if(this._connect_running) {
			logger.info('_connect - connect is running');
			return;
		}
		if (!force && this._connected) {
			logger.info('_connect - end - already conneted');
			return;
		}
		if (!this._ep) throw Error('Must set peer address before connecting.');

		this._connect_running = true;
		this._current_stream++;
		var stream_id = this._current_stream;
		logger.info('_connect - start stream:',stream_id);
		var self = this; // for callback context

		var send_timeout = setTimeout(function(){
			logger.error('_connect - timed out after:%s', self._ep._request_timeout);
			self._connect_running = false;
			self._disconnect(new Error('Unable to connect to the peer event hub'));
		}, self._ep._request_timeout);

		this._event_client = new _events.Events(this._ep._endpoint.addr, this._ep._endpoint.creds, this._ep._options);
		this._stream = this._event_client.chat();

		this._stream.on('data', function(event) {
			self._connect_running = false;
			clearTimeout(send_timeout);
			logger.info('on.data - event stream:%s _current_stream:%s',stream_id, self._current_stream);
			if(stream_id != self._current_stream) {
				logger.info('on.data - incoming event was from a cancel stream');
				return;
			}

			var state = -1;
			if(self._stream) state = self._stream.call.channel_.getConnectivityState();
			logger.info('on.data - grpc stream state :%s',state);
			if (event.Event == 'block') {
				self._activity_received = true;
				var block = BlockDecoder.decodeBlock(event.block);
				self._processBlockOnEvents(block);
				self._processTxOnEvents(block);
				self._processChainCodeOnEvents(block);
			}
			else if (event.Event == 'register'){
				logger.info('on.data - register event received');
				self._connected = true;
				self._keep_alive_response = true;
			}
			else if (event.Event == 'unregister'){
				if(self._connected) self._disconnect(new Error('Peer event hub has disconnected due to an "unregister" event'));
				logger.info('on.data - unregister event received');
			}
			else if (event.Event == 'keep_alive'){
				logger.info('on.data - keep alive event received');
				self._keep_alive_response = true;
			}
			else {
				logger.info('on.data - unknown event %s',event.Event);
			}
		});

		this._stream.on('end', function() {
			self._connect_running = false;
			clearTimeout(send_timeout);
			logger.info('on.end - event stream:%s _current_stream:%s',stream_id, self._current_stream);
			if(stream_id != self._current_stream) {
				logger.info('on.end - incoming event was from a cancel stream');
				return;
			}

			var state = -1;
			if(self._stream) state = self._stream.call.channel_.getConnectivityState();
			logger.info('on.end - grpc stream state :%s',state);
			if(self._connected) self._disconnect(new Error('Peer event hub has disconnected due to an "end" event'));
		});

		this._stream.on('error', function(err) {
			self._connect_running = false;
			clearTimeout(send_timeout);
			logger.info('on.error - event stream:%s _current_stream:%s',stream_id, self._current_stream);
			if(stream_id != self._current_stream) {
				logger.info('on.error - incoming event was from a cancel stream');
				return;
			}

			var state = -1;
			if(self._stream) state = self._stream.call.channel_.getConnectivityState();
			logger.info('on.error - grpc stream state :%s',state);
			if(err instanceof Error) {
				self._disconnect(err);
			}
			else {
				self._disconnect(new Error(err));
			}
		});

		this._activity_received = false;
		this._keep_alive_response = false;
		this._sendRegistration(true);
		this._startHeartbeatTimer();
		logger.info('_connect - end stream:',stream_id);
	}

	/**
	 * Disconnects the connection to the peer event source.
	 * Will close all event listeners and send an `Error` to
	 * all listeners that provided an "onError" callback.
	 */
	disconnect() {
		this._disconnect(new Error('EventHub has been shutdown'));
	}

	/* Internal method
	 * Disconnects the connection to the peer event source.
	 * Will close all event listeners and send an `Error` to
	 * all listeners that provided an "onError" callback.
	 */
	_disconnect(err) {
		logger.info('_disconnect - start -- called due to:: %s',err.message);
		clearTimeout(this._heartbeat_timer); //heartbeat not needed
		this._connected = false;
		this._closeAllCallbacks(err);
		if(this._stream) {
			logger.info('_disconnect - shutdown existing stream');
			this._sendRegistration(false);
			this._stream.end();
			this._stream = null;
		}
		logger.info('_disconnect - end -- called due to:: %s',err.message);
	}

	/*
	 * Internal method
	 * Builds a signed event registration
	 * and sends it to the peer's event hub.
	 */
	_sendRegistration(register) {
		logger.info('_sendRegistration - start -- register:: %s',register);
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
		this._stream.write(signedEvent);
	}

	/*
	 * Internal method
	 * Builds a signed event keep alive
	 * and sends it to the peer's event hub.
	 */
	_sendKeepAlive() {
		logger.info('_sendKeepAlive - start');
		var user = this._clientContext.getUserContext();
		var signedEvent = new _events.SignedEvent();
		var event = new _events.Event();
		event.setKeepAlive(Buffer.from('KEEPALIVE'));

		event.setCreator(user.getIdentity().serialize());
		signedEvent.setEventBytes(event.toBuffer());
		var sig = user.getSigningIdentity().sign(event.toBuffer());
		signedEvent.setSignature(Buffer.from(sig));
		this._stream.write(signedEvent);
	}

	/*
	 * Internal method
	 * Will close out all callbacks
	 * Sends an error to all registered event "onError" callbacks
	 */
	_closeAllCallbacks(err) {
		logger.info('_closeAllCallbacks - start');

		var closer = function(list) {
			for (let key in list) {
				let cb = list[key];
				logger.info('_closeAllCallbacks - closing this callback %s',key);
				cb(err);
			}
		};

		logger.info('_closeAllCallbacks - blockOnErrors %s', Object.keys(this._blockOnErrors).length);
		closer(this._blockOnErrors);
		this._blockOnEvents = {};
		this._blockOnErrors = {};

		logger.info('_closeAllCallbacks - transactionOnErrors %s', Object.keys(this._transactionOnErrors).length);
		closer(this._transactionOnErrors);
		this._transactionOnEvents = {};
		this._transactionOnErrors = {};

		var self = this;
		var cc_closer = function(key) {
			var cbtable = self._chaincodeRegistrants[key];
			cbtable.forEach(function(cbe) {
				logger.info('_closeAllCallbacks - closing this chaincode event ccid:%s eventNameFilter:%s',cbe.ccid, cbe.eventNameFilter);
				if(cbe.onError) {
					cbe.onError(err);
				}
			});
		};

		logger.info('_closeAllCallbacks - chaincodeRegistrants %s', Object.keys(this._chaincodeRegistrants).length);
		Object.keys(this._chaincodeRegistrants).forEach(cc_closer);
		this._chaincodeRegistrants = {};
	}

	/*
	 * Internal method
	 * checks for a connection and will restart
	 */
	_checkConnection(throw_error, force_reconnect) {
		logger.info('_checkConnection - start throw_error %s, force_reconnect %s',throw_error, force_reconnect);
		var state = 0;
		if(this._stream) {
			state = this._stream.call.channel_.getConnectivityState();
		}
		if(this._connected || this._connect_running) {
			logger.info('_checkConnection - this hub %s is connected or trying to connect with stream channel state %s', this._ep.getUrl(), state);
		}
		else {
			logger.info('_checkConnection - this hub %s is not connected with stream channel state %s', this._ep.getUrl(), state);
			if(throw_error && !force_reconnect) {
				throw new Error('The event hub has not been connected to the event source');
			}
		}

		if(force_reconnect) {
			try {
				if(this._stream) {
					var is_paused = this._stream.isPaused();
					logger.info('_checkConnection - grpc isPaused :%s',is_paused);
					if(is_paused) {
						this._stream.resume();
						logger.info('_checkConnection - grpc resuming ');
					}
					var state = this._stream.call.channel_.getConnectivityState();
					logger.info('_checkConnection - grpc stream state :%s',state);
					if(state != 2) {
						// try to reconnect
						this._connect(true);
					}
				}
				else {
					logger.info('_checkConnection - stream was shutdown - will reconnected');
					// try to reconnect
					this._connect(true);
				}
			}
			catch(error) {
				logger.error('_checkConnection - error ::' + error.stack ? error.stack : error);
				var err = new Error('Event hub is not connected ');
				this._disconnect(err);
				throw err;
			}
		}
	}

	/**
	 * Register a callback function to receive chaincode events.
	 * This EventHub instance must be connected to a remote
	 * peer's event hub before registering for events by calling
	 * the "connect()" method.
	 * An error may be thrown by this call if no "onError" callback
	 * is provided and this EventHub has noticed that the connection has not been
	 * established. However since the connection establishment is running
	 * asynchronously, a register call could be made before this EventHub has been
	 * notified of the network issue. The best practice would be to provide an
	 * "onError" callback to be notified when this EventHub has an issue.
	 * @param {string} ccid - string chaincode id
	 * @param {string} eventname - string The regex string used to filter events
	 * @param {function} onEvent - callback function for filter matches
	 * that takes a single parameter which is a json object representation
	 * of type "message ChaincodeEvent" from lib/proto/chaincode_event.proto
	 * @param {function} onError - optional callback function to be notified when this
	 * event hub is shutdown. The shutdown may be caused by a network error or by
	 * a call to the "disconnect()" method.
	 * @returns {object} ChainCodeCBE object that should be treated as an opaque
	 * handle used to unregister (see unregisterChaincodeEvent)
	 */
	registerChaincodeEvent(ccid, eventname, onEvent, onError) {
		logger.info('registerChaincodeEvent - start');
		if(!ccid) {
			throw new Error('Missing "ccid" parameter');
		}
		if(!eventname) {
			throw new Error('Missing "eventname" parameter');
		}
		if(!onEvent) {
			throw new Error('Missing "onEvent" parameter');
		}
		var have_error_cb = onError ? true : false;
		// when there is no error callback throw an error
		// when this hub is not connected
		this._checkConnection(!have_error_cb, false);

		var cbe = new ChainCodeCBE(ccid, eventname, onEvent, onError);
		var cbtable = this._chaincodeRegistrants[ccid];
		if (!cbtable) {
			cbtable = new Set();
			this._chaincodeRegistrants[ccid] = cbtable;
		}
		cbtable.add(cbe);

		// when there is an error callback try to reconnect this
		// event hub if is not connected
		if(have_error_cb) {
			this._checkConnection(false, this._force_reconnect);
		}

		return cbe;
	}

	/**
	 * Unregister chaincode event registration
	 * @param {object} cbe - ChainCodeCBE handle return from call to
	 * registerChaincodeEvent.
	 */
	unregisterChaincodeEvent(cbe) {
		logger.info('unregisterChaincodeEvent - start');
		if(!cbe) {
			throw new Error('Missing "cbe" parameter');
		}
		var cbtable = this._chaincodeRegistrants[cbe.ccid];
		if (!cbtable) {
			logger.info('No event registration for ccid %s ', cbe.ccid);
			return;
		}
		cbtable.delete(cbe);
		if (cbtable.size <= 0) {
			delete this._chaincodeRegistrants[cbe.ccid];
		}
	}

	/**
	 * Register a callback function to receive block events.
	 * This EventHub instance must be connected to a remote
	 * peer's event hub before registering for events by calling
	 * the "connect()" method.
	 * An error may be thrown by this call if no "onError" callback
	 * is provided and this EventHub has noticed that the connection has not been
	 * established. However since the connection establishment is running
	 * asynchronously, a register call could be made before this EventHub has been
	 * notified of the network issue. The best practice would be to provide an
	 * "onError" callback to be notified when this EventHub has an issue.
	 * @param {function} onEvent Function that takes a single parameter
	 * which is a JSON object representation of type GRPC message "Block"
	 * from lib/proto/common/common.proto.
	 * @see {@link Block}
	 * @param {function} onError - optional callback function to be notified when this
	 * event hub is shutdown.
	 * @returns {int} This is the block registration number that must be
	 * used to unregister (see unregisterBlockEvent)
	 */
	registerBlockEvent(onEvent, onError) {
		logger.info('registerBlockEvent - start');
		if(!onEvent) {
			throw new Error('Missing "onEvent" parameter');
		}
		var have_error_cb = onError ? true : false;
		// when there is no error callback throw and error
		// when this hub is not connected
		this._checkConnection(!have_error_cb, false);

		var block_registration_number = this._block_registrant_count++;
		this._blockOnEvents[block_registration_number] = onEvent;

		// when there is an error callback try to reconnect this
		// event hub if is not connected
		if(have_error_cb) {
			this._blockOnErrors[block_registration_number] = onError;
			this._checkConnection(false, this._force_reconnect);
		}

		return block_registration_number;
	}

	/**
	 * Unregister the block event listener with the block
	 * registration number.
	 * @param {int} The block registration number that was returned
	 * during registration.
	 */
	unregisterBlockEvent(block_registration_number) {
		logger.info('unregisterBlockEvent - start  %s',block_registration_number);
		if(!block_registration_number) {
			throw new Error('Missing "block_registration_number" parameter');
		}
		delete this._blockOnEvents[block_registration_number];
		delete this._blockOnErrors[block_registration_number];
	}

	/**
	 * Register a callback function to receive transactional events.
	 * This EventHub instance must be connected to a remote
	 * peer's event hub before registering for events by calling
	 * the "connect()" method.
	 * An error may be thrown by this call if no "onError" callback
	 * is provided and this EventHub has noticed that the connection has not been
	 * established. However since the connection establishment is running
	 * asynchronously, a register call could be made before this EventHub has been
	 * notified of the network issue. The best practice would be to provide an
	 * "onError" callback to be notified when this EventHub has an issue.
	 * @param {string} txid string transaction id
	 * @param {function} onEvent Function that takes a parameter which
	 * is a json object representation of type "message Transaction"
	 * from lib/proto/fabric.proto and a parameter which is a boolean
	 * that indicates if the transaction is invalid (true=invalid)
	 * @param {function} onError - optional callback function to be notified when this
	 * event hub is shutdown.
	 */
	registerTxEvent(txid, onEvent, onError) {
		logger.info('registerTxEvent txid ' + txid);
		if(!txid) {
			throw new Error('Missing "txid" parameter');
		}
		if(!onEvent) {
			throw new Error('Missing "onEvent" parameter');
		}
		var have_error_cb = onError ? true : false;
		// when there is no onError callback throw and error
		// when this hub is not connected
		this._checkConnection(!have_error_cb, false);

		this._transactionOnEvents[txid] = onEvent;

		// when there is an onError callback try to reconnect this
		// event hub if is not connected
		if(have_error_cb) {
			this._transactionOnErrors[txid] = onError;
			this._checkConnection(false, this._force_reconnect);
		}
	}

	/**
	 * Unregister transactional event registration.
	 * @param txid string transaction id
	 */
	unregisterTxEvent(txid) {
		logger.info('unregisterTxEvent txid ' + txid);
		if(!txid) {
			throw new Error('Missing "txid" parameter');
		}
		delete this._transactionOnEvents[txid];
		delete this._transactionOnErrors[txid];
	}

	/*
	 * private internal method for processing block events
	 * @param {object} block protobuf object
	 */
	_processBlockOnEvents(block) {
		logger.info('_processBlockOnEvents block=%s', block.header.number);
		if(Object.keys(this._blockOnEvents).length == 0) {
			logger.info('_processBlockOnEvents - no registered block event "listeners"');
			return;
		}

		// send to all registered block listeners
		let self = this;
		Object.keys(this._blockOnEvents).forEach(function(key) {
			var cb = self._blockOnEvents[key];
			cb(block);
		});
	}

	/*
	 * private internal method for processing tx events
	 * @param {object} block protobuf object which might contain the tx from the fabric
	 */
	_processTxOnEvents(block) {
		logger.info('_processTxOnEvents block=%s', block.header.number);
		if(Object.keys(this._transactionOnEvents).length == 0) {
			logger.info('_processTxOnEvents - no registered transaction event "listeners"');
			return;
		}

		var txStatusCodes = block.metadata.metadata[_common.BlockMetadataIndex.TRANSACTIONS_FILTER];

		for (var index=0; index < block.data.data.length; index++) {
			logger.info('_processTxOnEvents - trans index=%s',index);
			var channel_header = block.data.data[index].payload.header.channel_header;
			var val_code = convertValidationCode(txStatusCodes[index]);
			logger.info('_processTxOnEvents - txid=%s  val_code=%s', channel_header.tx_id, val_code);
			var cb = this._transactionOnEvents[channel_header.tx_id];
			if (cb){
				logger.info('_processTxOnEvents - about to stream the transaction call back for code=%s tx=%s', val_code, channel_header.tx_id);
				cb(channel_header.tx_id, val_code);
			}
		}
	};

	/*
	 * private internal method for processing chaincode events
	 * @param {object} block protobuf object which might contain the chaincode event from the fabric
	 */
	_processChainCodeOnEvents(block) {
		logger.info('_processChainCodeOnEvents block=%s', block.header.number);
		if(Object.keys(this._chaincodeRegistrants).length == 0) {
			logger.info('_processChainCodeOnEvents - no registered chaincode event "listeners"');
			return;
		}

		for (var index=0; index < block.data.data.length; index++) {
			logger.info('_processChainCodeOnEvents - trans index=%s',index);
			try {
				var env = block.data.data[index];
				var payload = env.payload;
				var channel_header = payload.header.channel_header;
				if (channel_header.type === _header_types[3]) {
					var tx = payload.data;
					var chaincodeActionPayload = tx.actions[0].payload;
					var propRespPayload = chaincodeActionPayload.action.proposal_response_payload;
					var caPayload = propRespPayload.extension;
					var ccEvent = caPayload.events;
					logger.info('_processChainCodeOnEvents - ccEvent %s',ccEvent);
					var cbtable = this._chaincodeRegistrants[ccEvent.chaincode_id];
					if (!cbtable) {
						return;
					}
					cbtable.forEach(function(cbe) {
						if (cbe.eventNameFilter.test(ccEvent.event_name)) {
							cbe.onEvent(ccEvent);
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