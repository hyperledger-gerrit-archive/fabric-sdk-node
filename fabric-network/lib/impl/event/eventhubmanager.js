/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const EventHubFactory = require('./eventhubfactory');

class EventHubManager {
	constructor(network) {
		this.channel = network.getChannel();
		this.eventHubFactory = new EventHubFactory(this.channel);
		this.eventHubSelectionStrategy = network.getEventHubSelectionStrategy();
		this.newEventHubs = [];
	}

	getEventHub(peer) {
		if (!peer) {
			peer = this.eventHubSelectionStrategy.getNextPeer();
		}
		peer = peer.getPeer ? peer.getPeer() : peer;
		return this.eventHubFactory.getEventHub(peer);
	}

	getEventHubs(peers) {
		return this.eventHubFactory.getEventHubs(peers);
	}

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

	getReplayEventHubs(peers) {
		return peers.map((peer) => {
			for (const eventHub of this.newEventHubs) {
				if (peer.getName() === eventHub.getName() && this._isNewEventHub(eventHub)) {
					return eventHub;
				}
			}
			return this.getReplayEventHub(peer);
		});
	}

	updateEventHubAvailability(deadPeer) {
		return this.eventHubSelectionStrategy.updateEventHubAvailability(deadPeer);
	}

	dispose() {
		this.eventHubFactory.dispose();
		this.newEventHubs.forEach((eh) => eh.disconnect());
	}

	getEventHubFactory() {
		return this.eventHubFactory;
	}

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
