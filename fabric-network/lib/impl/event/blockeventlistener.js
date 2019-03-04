/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const AbstractEventListener = require('./abstracteventlistener');

const logger = require('fabric-network/lib/logger').getLogger('BlockEventListener');
const util = require('util');

class BlockEventListener extends AbstractEventListener {
	constructor(network, listenerName, eventCallback, options) {
		super(network, listenerName, eventCallback, options);
	}

	register() {
		super.register();
		if (!this.eventHub) {
			return this._registerWithNewEventHub();
		}
		this._registration = this.eventHub.registerBlockEvent(
			this._onEvent.bind(this),
			this._onError.bind(this),
			this.options
		);
		this.eventHub.connect();
		this._registered = true;
	}

	unregister() {
		super.unregister();
		if (this.eventHub) {
			this.eventHub.unregisterBlockEvent(this._registration);
		}
	}

	_onEvent(block) {
		const blockNumber = Number(block.number);

		try {
			this.eventCallback(null, block);
		} catch (err) {
			logger.error(util.format('Error executing callback: %s', err));
		}
		if (this.checkpointer) {
			this.checkpointer.save(this.channel.getName(), this.listenerName, null, blockNumber);
		}
		if (this._registration.unregister) {
			this.unregister();
		}
	}

	_onError(error) {
		if (error) {
			if (this._isShutdownMessage(error) && this.isregistered()) {
				this.getEventHubManager().updateEventHubAvailability(this.eventHub._peer);
				this._registerWithNewEventHub();
			}
		}
		this.eventCallback(error);
	}

	_registerWithNewEventHub() {
		this.unregister();
		if (this.checkpointer) {
			this.eventHub = this.getEventHubManager().getReplayEventHub();
		} else {
			this.eventHub = this.getEventHubManager().getEventHub();
		}
		this.register();
	}
}

module.exports = BlockEventListener;
