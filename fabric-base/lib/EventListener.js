/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';
const TYPE = 'EventListener';

const {Utils: utils} = require('fabric-common');
const logger = utils.getLogger(TYPE);
const {checkParameter, convertToLong} = require('./Utils.js');


/*
 * The EventListener is used internally to the EventHub to hold
 * an event registration callback and settings.
 */
class EventListener {
	/*
	 * Constructs a Event Listener
	 *
	 * @param {string} type - a string to indicate the type of event registration
	 *  "block", "tx", or "chaincode".
	 * @param {function} callback - Callback for event matches
	 * @param {RegistrationOpts} options - event registration options
	 * @param {boolean} default_unregister - the default value for the unregister
	 *  setting if not option setting is set by the user
	 * @param {any} event
	 *  <br>- When this listener is of type "block" then this field is not used.
	 *  <br>- When this listener is of type "chaincode" then this
	 *  field will be the chaincode event name, used as a regular
	 *  expression match on the chaincode event name within the transactions.
	 *  <br>- When this listener is of type "tx" then this field will be the
	 *  transaction id string.
	 *  In both cases this field will be compared with data in the transaction
	 *  and when there is a match
	 *  the event will have taken place and the listener's callback will be
	 *  called (notified).
	 */
	constructor(type = checkParameter('type'), callback, options = {}, default_unregister, event) {
		this.type = type;
		this.callbackFn = callback;
		this.unregister = typeof options.unregister === 'boolean' ? options.unregister : default_unregister;
		this.endBlock = convertToLong(options.endBlock, false);
		this.startBlock = convertToLong(options.startBlock, false);
		this.event = event;
	}

	/**
	 * This method will be called by the {@link EventHub} when it finds a
	 * block that matches this event listener.
	 * This method will also be called by the {@link EventHub} when the
	 * connection to the Peer's event service has received an error or
	 * shutdown. This method will call the defined callback with the
	 * event information or error instance.
	 * @param {Error} error - An Error object that was created as a result
	 *  of an error on the {@link EventHub} connection to the Peer.
	 * @param {BlockEvent} event - A {@link BlockEvent} that contains
	 *  event information.
	 */
	onEvent(error, event) {
		try {
			let notify = true;
			if (event) {
				if (this.endBlock && this.endBlock.lessThan(event.block_num)) {
					logger.debug(`${method} - skipping calling callback, event block num ${event.block_num} greater than listener's endBlock`);
					notify = false;
				}
				if (this.startBlock && this.startBlock.greaterThan(event.block_num)) {
					logger.debug(`${method} - skipping calling callback, event block num ${event.block_num} less than listener's startBlock`);
					notify = false;
				}
				if (notify) {
					this.callbackFn(error, event);
				}
			}
		} catch (error) {
			logger.warn('Event notification callback failed', error);
		}
	}

	toString() {
		return `EventListener: { type: ${this.type}, event: ${this.event ? this.event : 'all blocks'}`;
	}
}

module.exports = EventListener;
EventListener.BLOCK = 'block'; // for block type event listeners
EventListener.TX = 'tx'; // for transaction type event listeners
EventListener.CHAINCODE = 'chaincode'; // for chaincode event type event listeners

