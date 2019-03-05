/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
'use strict';

const Long = require('long');

const BaseCheckpointer = require('./basecheckpointer');

/**
 * Event listener base class handles initializing common properties across contract, transaction
 * and block event listeners.
 *
 * Instances of the event listener are stateful and must only be used for one listener
 * @private
 * @class
 */
class AbstractEventListener {
	/**
	 * Constructor
	 * @param {Network} network The network
	 * @param {string} listenerName The name of the listener being created
	 * @param {function} eventCallback The function called when the event is triggered.
	 * It has signature (err, ...args) where args changes depending on the event type
	 * @param {*} options Event handler options ??????DO WE HAVE SEPERATE OPTIONS???????
	 */
	constructor(network, listenerName, eventCallback, options) {
		if (!options) {
			options = {};
		}
		this.channel = network.getChannel();
		this.network = network;
		this.listenerName = listenerName;
		this.eventCallback = eventCallback;
		this.options = options;
		if (typeof this.options.checkpointer === 'function') {
			this.checkpointer = this.options.checkpointer(this.channel.getName(), this.listenerName);
		} else {
			this.checkpointer = this.options.checkpointer;
		}

		this._filtered = this.options.filtered;

		this._registered = false;
		this._firstCheckpoint = {};
		this._registration = null;
	}

	/**
	 * Called by the super classes register function. Saves information needed to start
	 * listening, and diconnects an event hub if it is the incorrect type
	 */
	register() {
		if (this._registered) {
			throw new Error('Listener already registered');
		}

		if (this.eventHub && this.eventHub.isconnected() && !!this.eventHub._filtered_stream !== this._filtered) {
			this.eventHub.disconnect();
			this.eventHub = null;
		}

		let checkpoint;
		if (this.checkpointer instanceof BaseCheckpointer) {
			this._firstCheckpoint = checkpoint = this.checkpointer.load();
			if (checkpoint && checkpoint.blockNumber) {
				this.options.startBlock = Long.fromValue(checkpoint.blockNumber);
			}
		}
	}

	/**
	 * Called by the super classes unregister function. Removes state from the listener so it
	 * can be reregistered at a later time
	 */
	unregister() {
		this._registered = false;
		delete this.options.startBlock;
		delete this.options.endBlock;
		delete this.options.disconnect;
		this._firstCheckpoint = {};
	}

	/**
	 * @retusns {boolean} Listeners registration status
	 */
	isregistered() {
		return this._registered;
	}

	/**
	 * Returns the checkpoint isntance created by the checkpoint factory
	 * @returns {BaseCheckpointer} Checkpointer instance specific to this listener
	 */
	getCheckpointer() {
		return this.checkpointer;
	}

	/**
	 * Checks if the listener has a checkpointer or not
	 * @returns {boolean} Status.
	 */
	hasCheckpointer() {
		return !!this.checkpointer;
	}

	/**
	 * Returns the event hub manager from the network
	 * @returns {EventHubManager} Event hub manager
	 */
	getEventHubManager() {
		const network = this.network;
		return network.getEventHubManager();
	}

	/**
	 * Check if the event hub error is a disconnect message
	 * @param {Error} error The error emitted by the event hub
	 * @returns {boolean} is shutdown message
	 */
	_isShutdownMessage(error) {
		if (error) {
			return error.message === 'ChannelEventHub has been shutdown';
		}
		return false;
	}
}

module.exports = AbstractEventListener;
