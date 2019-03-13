/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const EventHubFactory = require('./eventhubfactory');

/**
 * The Event Hub Manager is responsible for creating and distributing event hubs.
 * It uses the event hub factory to resuse event hubs that exists, and maintains
 * its own list of new event hubs that are used for event replay
 * @private
 * @class
 */
class EventHubManager {
	/**
	 * Constructor
	 * @param {Network} network The network
	 */
	constructor(network) {
		this.channel = network.getChannel();
		this.eventHubFactory = new EventHubFactory(this.channel);
		this.eventHubSelectionStrategy = network.getEventHubSelectionStrategy();
		this.newEventHubs = [];
	}
	/**
	 * Gets an event hub. If given a peer, it will get that peers event hub, otherwise
	 * it will get the next peer defined by the {@link EventHubSelectionStategy}
	 * @param {Peer} peer A peer instance
	 * @param {boolean} filtered Flag to decide between filtered and unfiltered events
	 * @returns {ChannelEventHub} The event hub
	 */
	getEventHub(peer, filtered) {
		if (!peer) {
			peer = this.eventHubSelectionStrategy.getNextPeer();
		}
		peer = peer.getPeer ? peer.getPeer() : peer;
		const eventHub = this.eventHubFactory.getEventHub(peer);
		if (eventHub.isconnected() && eventHub.isFiltered() !== !!filtered) {
			return this.getReplayEventHub(peer);
		}
		return eventHub;
	}

	/**
	 * Gets a list of event hubs from the {@link EventHubFactory} for a list of peers
	 * @param {Peer[]} peers A list of peer instances
	 */
	getEventHubs(peers) {
		return this.eventHubFactory.getEventHubs(peers);
	}

	/**
	 * Gets a new event hub instance for a give peer and updates the list of new event
	 * hubs that have been created
	 * @param {Peer} peer A peer instance
	 * @returns {ChannelEventHub} The event hub
	 */
	getReplayEventHub(peer) {
		for (const index in this.newEventHubs) {
			const eventHub = this.newEventHubs[index];
			if (this._isNewEventHub(eventHub) && (!peer || eventHub.getName() === peer.getName())) {
				this.newEventHubs.splice(index, 1);
			}
		}
		peer = this.eventHubSelectionStrategy.getNextPeer();
		const eh = this.channel.newChannelEventHub(peer);
		this.newEventHubs.push(eh);
		return eh;
	}

	/**
	 * When called with a peer, it updates the {@link EventHubSelectionStategy} with the
	 * new status of a peer to allow for intelligent strategies
	 * @param {Peer} deadPeer A peer instance
	 */
	updateEventHubAvailability(deadPeer) {
		return this.eventHubSelectionStrategy.updateEventHubAvailability(deadPeer);
	}

	/**
	 * Disconnect from and delete all event hubs
	 */
	dispose() {
		this.eventHubFactory.dispose();
		this.newEventHubs.forEach((eh) => eh.disconnect());
	}

	getEventHubFactory() {
		return this.eventHubFactory;
	}

	/**
	 * Check if an event hub has any registrations
	 * @param {ChannelEventHub} eventHub An event hub instance
	 * @returns {boolean}
	 */
	_isNewEventHub(eventHub) {
		if (!eventHub) {
			throw new Error('event hub not given');
		}
		const chaincodeRegistrations = Object.values(eventHub._chaincodeRegistrants).length;
		const blockRegistrations = Object.values(eventHub._blockRegistrations).length;
		const txRegistrations = Object.values(eventHub._transactionRegistrations).length;
		return (chaincodeRegistrations + blockRegistrations + txRegistrations) === 0;
	}
}

module.exports = EventHubManager;
