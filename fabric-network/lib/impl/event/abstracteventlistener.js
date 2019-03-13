/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
'use strict';

const Long = require('long');

const EventHubDisconnectError = require('fabric-client/lib/errors/EventHubDisconnectError');
const BaseCheckpointer = require('./basecheckpointer');
const logger = require('fabric-client/lib/utils').getLogger('AbstractEventListener');

/**
 * @typedef {Object} module:fabric-network.Network~ListenerOptions
 * @memberof module:fabric-network
 * @property {module:fabric-network.Network~CheckpointerFactory} checkpointer The function that returns a checkpointer
 * @property {boolean} replay event replay and checkpointing on listener
 * @extends RegistrationOpts
 */

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
	 * @param {module:fabric-network.Network} network The network
	 * @param {string} listenerName The name of the listener being created
	 * @param {function} eventCallback The function called when the event is triggered.
	 * It has signature (err, ...args) where args changes depending on the event type
	 * @param {module:fabric-network.Network~ListenerOptions} options Event handler options
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
		if (typeof options.checkpointer === 'function') {
			this.checkpointer = options.checkpointer(this.channel.getName(), listenerName);
		} else {
			this.checkpointer = options.checkpointer;
		}
		if (this.useEventReplay()) {
			if (!this.getCheckpointer()) {
				logger.error('Opted to use checkpointing without defining a checkpointer');
			}
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
	async register() {
		if (this._registered) {
			throw new Error('Listener already registered');
		}
		if (this.eventHub && this.eventHub.isconnected() && !!this.eventHub.isFiltered() !== this._filtered) {
			this.eventHub.disconnect();
			this.eventHub = null;
		}

		let checkpoint;
		if (this.useEventReplay() && this.checkpointer instanceof BaseCheckpointer) {
			this._firstCheckpoint = checkpoint = await this.checkpointer.load();
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
	 * Returns the event hub manager from the network
	 * @returns {EventHubManager} Event hub manager
	 */
	getEventHubManager() {
		const network = this.network;
		return network.getEventHubManager();
	}

	useEventReplay() {
		return this.options.replay;
	}

	/**
	 * Check if the event hub error is a disconnect message
	 * @param {Error} error The error emitted by the event hub
	 * @returns {boolean} is shutdown message
	 * @private
	 */
	_isShutdownMessage(error) {
		if (error) {
			return error instanceof EventHubDisconnectError;
		}
		return false;
	}
}

module.exports = AbstractEventListener;
