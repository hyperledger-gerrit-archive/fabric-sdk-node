/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const logger = require('fabric-network/lib/logger').getLogger('EventHubFactory');

/**
 * Factory for obtaining event hubs for peers on a given channel.
 * Where possible, ensures that event hubs are connected.
 * @private
 * @class
 */
class EventHubFactory {
	/**
	 * Constructor.
	 * @param {Channel} channel Channel used to create event hubs.
	 */
	constructor(channel) {
		if (!channel) {
			const message = 'Channel not set';
			logger.error('constructor:', message);
			throw new Error(message);
		}
		logger.debug('constructor:', channel.getName());
		this.channel = channel;
		this.eventHubs = new Map();
	}

	/**
     * Gets event hubs for all specified peers.
     * @param {ChannelPeer[]} peers Peers for which event hubs should be obtained.
     * @returns {ChannelEventHub[]} Event hubs, which may or may not be connected.
     */
	getEventHubs(peers) {
		return peers.map((peer) => this.getEventHub(peer));
	}

	getEventHub(peer) {
		const peerName = peer.getName();
		let eventHub = this.eventHubs.get(peerName);
		if (!eventHub) {
			eventHub = this.channel.newChannelEventHub(peer);
			this.eventHubs.set(peerName, eventHub);
		}
		return eventHub;
	}

	dispose() {
		this.eventHubs.forEach((eventHub) => eventHub.close());
		this.eventHubs.clear();
	}
}

module.exports = EventHubFactory;
