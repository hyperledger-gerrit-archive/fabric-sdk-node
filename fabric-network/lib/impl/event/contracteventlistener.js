/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const AbstractEventListener = require('./abstracteventlistener');
const BaseCheckpointer = require('./basecheckpointer');
const logger = require('fabric-network/lib/logger').getLogger('ContractEventListener');
const util = require('util');

/**
 * The Contract Event Listener handles contract events from the chaincode.
 *
 * @class
 */
class ContractEventListener extends AbstractEventListener {
	/**
	 * Constructor.
	 * @param {Contract} contract The contract instance
	 * @param {string} listenerName The name of the listener
	 * @param {string} eventName The name of the contract event being listened for
	 * @param {function} eventCallback The event callback called when an event is recieved.
	 * It has signature (err, BlockEvent, blockNumber, transactionId)
	 * @param {*} options
	 */
	constructor(contract, listenerName, eventName, eventCallback, options) {
		super(contract.getNetwork(), listenerName, eventCallback, options);
		this.contract = contract;
		this.eventName = eventName;
	}

	/**
	 * Finds and connects to an event hub then creates the listener registration
	 */
	register() {
		super.register();
		if (!this.eventHub) {
			return this._registerWithNewEventHub();
		}
		this._registration = this.eventHub.registerChaincodeEvent(
			this.contract.getChaincodeId(),
			this.eventName,
			this._onEvent.bind(this),
			this._onError.bind(this),
			this.options
		);
		this._registered = true;
		this.eventHub.connect(!this._filtered);
	}

	/**
	 * Unregisters the registration from the event hub
	 */
	unregister() {
		super.unregister();
		if (this.eventHub) {
			this.eventHub.unregisterChaincodeEvent(this._registration);
		}
	}

	/**
	 * The callback triggered when the event was successful. Checkpoints the last
	 * block and transaction seen once the callback has run and unregisters the
	 * listener if the unregister flag was provided
	 * @param {ChaincodeEvent} event the event emitted
	 * @param {number} blockNumber the block number this transaction was commited inside
	 * @param {string} transactionId the transaction ID of the transaction this event was emitted by
	 * @param {string} status the status of the the transaction
	 */
	_onEvent(event, blockNumber, transactionId, status) {
		logger.info(`_onEvent[${this.listenerName}]:`, util.format('success for transaction %s', transactionId));
		blockNumber = Number(blockNumber);
		if (this.checkpointer instanceof BaseCheckpointer) {
			const checkpoint = this.checkpointer.load();
			if (checkpoint && checkpoint.transactionIds && checkpoint.transactionIds.includes(transactionId)) {
				logger.info(util.format('_onEvent skipped transaction: %s', transactionId));
				return;
			}
			this.checkpointer.save(transactionId, blockNumber);
		}

		try {
			this.eventCallback(null, event, blockNumber, transactionId, status);
		} catch (err) {
			logger.info(util.format('_onEvent error from callback: %s', err));
		}
		if (this._registration.unregister) {
			this.unregister();
		}
	}

	/**
	 * This callback is triggerend when the event was unsuccessful. If the error indicates
	 * that the event hub shutdown and the listener is still registered, it updates the
	 * {@link EventHubSelectionStrategy} status of event hubs (if implemented) and finds a
	 * new event hub to connect to
	 * @param {Error} error The error emitted
	 */
	_onError(error) {
		logger.info('_onError:', util.format('received error from peer %s: %j', this.eventHub.getPeerAddr(), error));
		if (error) {
			if (this._isShutdownMessage(error) && this.isregistered()) {
				this.getEventHubManager().updateEventHubAvailability(this.eventHub._peer);
				this._registerWithNewEventHub();
			}
		}
		this.eventCallback(error);
	}

	/**
	 * Finds a new event hub for the listener in the event of one shutting down. Will
	 * create a new instance if checkpointer is being used, or reuse one if not
	 */
	_registerWithNewEventHub() {
		this.unregister();
		if (this.checkpointer instanceof BaseCheckpointer) {
			this.eventHub = this.getEventHubManager().getReplayEventHub();
		} else {
			this.eventHub = this.getEventHubManager().getEventHub();
		}
		this.register();
	}
}

module.exports = ContractEventListener;
