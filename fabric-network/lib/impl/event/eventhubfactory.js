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
		this._channel = channel;
		this._savedEventHubs = new Map();
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
		let eventHub = this._getSavedEventHub(peerName);
		if (!eventHub) {
			eventHub = this._channel.newChannelEventHub(peer);
			this._setSavedEventHub(peerName, eventHub);
		}
		return eventHub;
	}

	_getSavedEventHub(peerName) {
		const saved = this._savedEventHubs.get(peerName);
		return saved ? saved.eventHub : undefined;
	}

	_setSavedEventHub(peerName, eventHub) {
		const saved = {
			original: {
				close: eventHub.close,
				disconnect: eventHub.disconnect
			},
			eventHub
		};
		eventHub.close = eventHub.disconnect = () => {
			// No-op to prevent client code from disconnecting a shared event hub
		};
		this._savedEventHubs.set(peerName, saved);
	}

	dispose() {
		this._savedEventHubs.forEach((saved) => {
			const eventHub = saved.eventHub;
			const original = saved.original;
			for (const key in original) {
				eventHub[key] = original[key];
			}
			eventHub.disconnect();
		});
		this._savedEventHubs.clear();
	}
}

module.exports = EventHubFactory;
