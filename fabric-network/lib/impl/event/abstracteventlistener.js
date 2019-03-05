/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
'use strict';

const Long = require('long');

const BaseCheckpointer = require('./basecheckpointer');

class AbstractEventListener {
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

	unregister() {
		this._registered = false;
		delete this.options.startBlock;
		delete this.options.endBlock;
		delete this.options.disconnect;
		this._firstCheckpoint = {};
	}

	isregistered() {
		return this._registered;
	}

	getCheckpointer() {
		return this.checkpointer;
	}

	hasCheckpointer() {
		return !!this.checkpointer;
	}

	getEventHubManager() {
		const network = this.network;
		return network.getEventHubManager();
	}

	_disconnectEventHub() {
		if (!this.eventHub) {
			// Log no event hub given
			return;
		}
		if (this.eventHub.isconnected()) {
			this.eventHub.disconnect();
		}
	}

	_isShutdownMessage(error) {
		if (error) {
			return error.message === 'ChannelEventHub has been shutdown';
		}
		return false;
	}
}

module.exports = AbstractEventListener;
