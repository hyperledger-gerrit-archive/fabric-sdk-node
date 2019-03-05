/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const AbstractEventListener = require('./abstracteventlistener');
const logger = require('fabric-network/lib/logger').getLogger('TransactionEventListener');
const util = require('util');

class TransactionEventListener extends AbstractEventListener {
	constructor(network, transactionId, eventCallback, options) {
		const listenerName = transactionId;
		super(network, listenerName, eventCallback, options);
		this.transactionId = transactionId;
	}

	register() {
		super.register();
		if (!this.eventHub) {
			logger.info('No event hub. Retrieving new one.');
			return this._registerWithNewEventHub();
		}
		if (this._isAlreadyRegistered(this.eventHub)) {
			logger.info('Event hub already has registrations. Generating new event hub instance.');
			this.eventHub = this.getEventHubManager().getEventHub(this.eventHub._peer, true);
		}
		const txid = this.eventHub.registerTxEvent(
			this.transactionId,
			this._onEvent.bind(this),
			this._onError.bind(this),
			Object.assign({unregister: true}, this.options)
		);
		this._registration = this.eventHub._transactionRegistrations[txid];
		this.eventHub.connect();
		this._registered = true;
	}

	setEventHub(eventHub) {
		this.eventHub = eventHub;
	}

	unregister() {
		super.unregister();
		if (this.eventHub) {
			this.eventHub.unregisterTxEvent(this.transactionId);
		}
	}

	_onEvent(txid, status, blockNumber) {
		logger.info('_onEvent:', util.format('success for transaction %s', txid));
		blockNumber = Number(blockNumber);

		try {
			this.eventCallback(null, txid, status, blockNumber);
		} catch (err) {
			logger.info(util.format('_onEvent error from callback: %s', err));
		}
		if (this._registration.unregister) {
			this.unregister();
		}
	}

	_onError(error) {
		logger.info('_onError:', util.format('received error from peer %s: %j', this.eventHub.getPeerAddr(), error));
		this.eventCallback(error);
	}


	_registerWithNewEventHub() {
		this.unregister();
		this.eventHub = this.getEventHubManager().getReplayEventHub();
		this.options.disconnect = true;
		this.register();
	}

	_isAlreadyRegistered(eventHub) {
		if (!eventHub) {
			throw new Error('Event hub not given');
		}
		const registrations = eventHub._transactionRegistrations;
		if (registrations[this.transactionId]) {
			return true;
		}
		return false;
	}
}

module.exports = TransactionEventListener;
