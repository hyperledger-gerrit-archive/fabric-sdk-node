/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';
const TYPE = 'Channel';

const util = require('util');

const {Utils: sdk_utils} = require('fabric-common');
const Peer = require('./Peer.js');
const ChannelEventHub = require('./ChannelEventHub.js');
const ChannelDiscovery = require('./ChannelDiscovery.js');
const Orderer = require('./Orderer.js');
const Proposal = require('./Proposal.js');
const fabprotos = require('fabric-protos');
const logger = sdk_utils.getLogger(TYPE);
const checkParameter = require('./Utils.js').checkParameter;

/**
 * Channels provide data isolation for a set of participating organizations.
 * <br><br>
 * A Channel object captures the settings needed to interact with a fabric network in the
 * context of a channel. These settings including the list of participating organizations,
 * represented by instances of Membership Service Providers (MSP), peers,
 * and orderers.
 *
 * @class
 */
const Channel = class {

	/**
	 * Returns a new instance of the Channel class. 
	 *
	 * @param {string} name - Name to identify the channel. This value is used
	 *  as the identifier of the channel when making channel-aware requests
	 *  with the fabric, such as invoking chaincodes to endorse transactions.
	 *  The naming of channels is enforced by the ordering service and must
	 *  be unique within the fabric network. A channel name in fabric network
	 *  is subject to a pattern revealed in the configuration setting
	 *  <code>channel-name-regx-checker</code>.
	 * @param {Client} client - The Client instance.
	 */
	constructor(name = checkParameter('name'), client = checkParameter('client')) {
		logger.debug('const - start');
		this.type = TYPE;

		const channelNameRegxChecker = sdk_utils.getConfigSetting('channel-name-regx-checker');
		if (channelNameRegxChecker) {
			const {pattern, flags} = channelNameRegxChecker;
			const namePattern = new RegExp(pattern ? pattern : '', flags ? flags : '');
			if (!(name.match(namePattern))) {
				throw new Error(util.format('Failed to create Channel. channel name should match Regex %s, but got %j', namePattern, name));
			}
		}

		this.name = name;
		this.client = client;
		this.peers = new Map();
		this.orderers = new Map();
		this.msps = new Map();

		logger.debug('Constructed Channel instance: name - %s', this.name);
	}

	/**
	 * Close the service connections of all assigned peers, orderers, and channel event hubs.
	 */
	close() {
		logger.debug('close - closing connections');
		this.peers.forEach((peer) => {
			peer.close();
		});
		this.orderers.forEach((orderer) => {
			orderer.close();
		});
	}

	newProposal(chaincodeName = checkParameter('chaincodeName')) {
		const method = 'getProposal';
		logger.debug('%s - start', method);

		return new Proposal(chaincodeName, this);
	}

	/**
	 * Get organization identifiers from the MSP's for this channel
	 * @returns {string[]} Array of IDs representing the channel's participating
	 *  organizations
	 */
	getMspids() {
		const method = 'getMspids';
		logger.debug('%s - start', method);

		return null;
	}

	getMSP(name) {

	}

	removeMSP(msp) {
		this.msps.delete(msp.name);
	}

	addMSP(msp, replace) {
		const method = 'addMSP';
		logger.debug('%s - start', method);
		const name = msp.name;
		const check = this.msps.get(name);
		if (check) {
			if (replace) {
				logger.debug('/n removing existing MSP  --name: %s', check.name);
				this.removeMSP(check);
			} else {
				const error = new Error(`MSP ${name} already exists`);
				logger.error(error.message);
				throw error;
			}
		}
		logger.debug('/n adding a new MSP  --name: %s', msp.name);
		this.msps.set(name, msp);
	}

	/**
	 * Add the peer object to the channel object. A channel object can be optionally
	 * configured with a list of peer objects, which will be used when calling certain
	 * methods such as [sendInstantiateProposal()]{@link Channel#sendInstantiateProposal},
	 * [sendUpgradeProposal()]{@link Channel#sendUpgradeProposal},
	 * [sendTransactionProposal]{@link Channel#sendTransactionProposal}.
	 *
	 * @param {Peer} peer - An instance of the Peer class
	 * @param {boolean} replace - If a peer exist with the same name, replace
	 *  with this one.
	 */
	addPeer(peer, replace) {
		const method = 'addPeer';
		logger.debug('%s - start', method);
		const name = peer.name;
		const check = this.peers.get(name);
		if (check) {
			if (replace) {
				logger.debug('/n removing existing Peer  --name: %s --URL: %s', check.name, check.endpoint.url);
				this.removePeer(check);
			} else {
				const error = new Error(`Peer ${name} already exists`);
				logger.error(error.message);
				throw error;
			}
		}
		logger.debug('/n adding a new Peer  --name: %s', peer.name);
		this.peers.set(name, peer);
	}

	/**
	 * Remove the peer object in the channel object's list of peers.
	 * Closes the peer's endorsement and event service connections.
	 *
	 * @param {Peer} peer - An instance of the Peer class.
	 */
	removePeer(peer) {
		peer.close();
		this.peers.delete(peer.name);
	}

	/**
	 * This method will return a {@link Peer}.
	 *
	 * @param {string} name - The name of the peer assigned to this channel
	 * @returns {Peer} The Peer instance
	 */
	getPeer(name) {
		const peer = this.peers.get(name);

		return peer;
	}

	/**
	 * Add the orderer object to the channel object
	 *
	 * @param {Orderer} orderer - An instance of the Orderer class.
	 * @param {boolean} replace - If an orderer exist with the same name, replace
	 *  with this one.
	 */
	addOrderer(orderer, replace) {
		const method = 'addOrderer';
		logger.debug('%s - start', method);
		const name = orderer.name;
		const check = this.orderers.get(name);
		if (check) {
			if (replace) {
				logger.debug('/n removing existing Orderer  --name: %s --URL: %s', check.name, check.endpoint.url);
				this.removeOrderer(check);
			} else {
				const error = new Error(`Orderer ${name} already exists`);
				logger.error(error.message);
				throw error;
			}
		}
		logger.debug('/n adding a new Orderer  --name: %s', orderer.name);
		this.orderers.set(name, orderer);
	}

	/**
	 * Remove the orderer object from channel object's list of orderers.
	 * Closes the orderer before removal.
	 *
	 * @param {Orderer} orderer - An instance of the Orderer class.
	 */
	removeOrderer(orderer) {
		orderer.close();
		this.orderers.delete(orderer.name);
	}

	/**
	 * This method will return a {@link Orderer} instance if assigned to this
	 * channel. Peers that have been created by the {@link Client#newOrderer}
	 * method and then added to this channel may be reference by the url if no
	 * name was provided in the options during the create.
	 *
	 * @param {string} name - The name or url of the orderer
	 * @returns {Orderer} The Orderer instance.
	 */
	getOrderer(name) {
		const orderer = this.orderers.get(name);

		return orderer;
	}

	/**
	 * Will return an array of {@link Peer} instances that have been
	 * assigned to this channel instance. Include a MSPID to only return peers
	 * in a specific organization.
	 * 
	 * @param {string} [mspid] - Optional. The mspid of the peers to return
	 * @return {Peer[]} the list of {@link Peer}s.
	 */
	getPeers(mspid) {
		return this._getRemotes(this.peers.values(), 'Peer', mspid);
	}

	/**
	 * Will return an array of {@link Orderer} instances that have been
	 * assigned to this channel instance. Include a MSPID to only return orderers
	 * in a specific organization.
	 * 
	 * @param {string} [mspid] - Optional. The mspid of the peers to return
	 * @return {Orderer[]} the list of {@link Orderer}s.
	 */
	getOrderers(mspid) {
		return this._getRemotes(this.orderers.values(), 'Orderer', mspid);
	}

	_getRemotes(remotes, type, mspid) {
		const method = '_getRemotes';
		logger.debug('%s - start', method);
		const results = [];
		for (const remote of remotes) {
			if (mspid) {
				if (remote.mspid === mspid) {
					results.push(remote);
					logger.debug('%s - %s mspid matched, added %s', method, type, remote.name);
				} else {
					logger.debug('%s - %s not added %s', method, type, remote.name);
				}
			} else {
				results.push(remote);
				logger.debug('%s - %s added %s', method, type, remote.name);
			}
		}

		return results;
	}

	/**
	 * Returns a new {@link ChannelEventHub} object on each call.
	 * An event hub object encapsulates the
	 * properties of an event stream on a peer node, through which the peer publishes
	 * notifications of blocks being committed in the channel's ledger.
	 * This method will create a new ChannelEventHub and not save a reference.
	 * Use the {getChannelEventHub} to reuse a ChannelEventHub.
	 *
	 * @param {string} name - The name for this ChannelEventHub
	 * @param {Peer | string} peer - A Peer instance or the name of a
	 *        peer that has been assigned to the channel.
	 * @returns {ChannelEventHub} The ChannelEventHub instance
	 */
	newChannelEventHub(name = checkParameter('name')) {
		const channel_event_hub = new ChannelEventHub(name, this);

		return channel_event_hub;
	}

	/**
	 * Returns a list of {@link ChannelEventHub} based on the peers that are
	 * defined in this channel that are in the organization.
	 *
	 * @param {string} mspid - The mspid of an organization
	 * @returns {ChannelEventHub[]} An array of ChannelEventHub instances
	 */
	async newChannelEventHubsForOrg(mspid = checkParameter('mspid')) {
		const method = 'getChannelEventHubsForOrg';
		logger.debug('%s - starting - mspid: %s', method, mspid);

		const channel_event_hubs = [];
		for (const peer of this.peers.values()) {
			if (peer.mspid === mspid) {
				const channel_event_hub = new ChannelEventHub(peer.name, this);
				await channel_event_hub.connect(peer.endpoint);
				channel_event_hubs.push(channel_event_hub);
			}
		}

		if (channel_event_hubs.length === 0) {
			throw new Error('No channel event hubs found');
		}

		return channel_event_hubs;
	}

	/**
	 * Returns a {@link ChannelDiscovery} instance with the given name.
	 * Will return a new instance.
	 *
	 * @param {string} name The name of this discovery instance.
	 * @returns {ChannelDiscovery} The discovery instance.
	 */
	newChannelDiscovery(name = checkParameter('name')) {
		const method = 'newChannelDiscovery';
		logger.debug('%s start', method);

		logger.debug('%s create new channel discovery name:%s for channel:%s', method, name, this.name);
		const channelDiscovery = new ChannelDiscovery(name, this.client, this);

		return channelDiscovery;
	}

	/*
	 * Internal utility method to get a list of Orderer objects
	 * Throws an Error if no orderers are found
	 */
	_getTargetOrderers(targets) {
		if (!Array.isArray(targets)) {
			throw Error('Targets must be an array');
		}

		const orderers = [];
		for (const target of targets) {
			if (typeof target === 'string') {
				const orderer = this.orderers.get(target);
				if (!orderer) {
					throw Error(`Orderer named ${target} not found`);
				}
				orderers.push(orderer);
			} else if (target && target.type === 'Orderer') {
				orderers.push(target);
			} else {
				throw Error('Target orderer is not valid');
			}
		}

		if (orderers.length === 0) {
			throw new Error('No target orderer found');
		}

		return orderers;
	}

	/*
	 * utility method to decide on the targets for requests
	 * Returns an array of one or more {@link Peers}.
	 * Throws an Error if no targets are found.
	 */
	_getTargetPeers(targets) {
		const peers = [];
		if (targets) {
			let _targets = targets;
			if (!Array.isArray(targets)) {
				_targets = [targets];
			}
			for (const peer of _targets) {
				if (typeof peer === 'string') {
					const _peer = this.peers.get(peer);
					if (_peer) {
						peers.push(_peer);
					} else {
						throw new Error(`Target peer ${peer} not found`);
					}
				} else if (peer && peer.type === 'Peer') {
					peers.push(peer);
				} else {
					throw new Error('Target peer is not valid');
				}
			}
		}

		if (peers.length === 0) {
			throw new Error('No target peer found');
		}

		return peers;
	}

	/*
 	 * This function will build a common channel header
 	 */
	buildChannelHeader(type = checkParameter('type'), chaincode_id = checkParameter('chaincode_id'), tx_id = checkParameter('tx_id')) {
		logger.debug('buildChannelHeader - type %s chaincode_id %s tx_id %s',type, tx_id, chaincode_id);
		const channelHeader = new fabprotos.common.ChannelHeader();
		channelHeader.setType(type); // int32
		channelHeader.setVersion(1); // int32

		channelHeader.setChannelId(this.name); // string
		channelHeader.setTxId(tx_id.toString()); // string
		// 	channelHeader.setEpoch(epoch); // uint64

		const chaincodeID = new fabprotos.protos.ChaincodeID();
		chaincodeID.setName(chaincode_id);

		const headerExt = new fabprotos.protos.ChaincodeHeaderExtension();
		headerExt.setChaincodeId(chaincodeID);

		channelHeader.setExtension(headerExt.toBuffer());
		channelHeader.setTimestamp(buildCurrentTimestamp()); // google.protobuf.Timestamp
		channelHeader.setTlsCertHash(this.client.getClientCertHash());

		return channelHeader;
	};

	/**
	 * return a printable representation of this channel object
	 */
	toString() {
		const orderers = [];
		for (const orderer of this.getOrderers()) {
			orderers.push(orderer.toString());
		}

		const peers = [];
		for (const peer of this.getPeers()) {
			peers.push(peer.toString());
		}

		const state = {
			name: this.name,
			orderers: orderers.length > 0 ? orderers : 'N/A',
			peers: peers.length > 0 ? peers : 'N/A'
		};

		return JSON.stringify(state).toString();
	}
};

/**
 * @typedef {Object} ChannelPeerRoles
 * @property {boolean} [endorsingPeer] Optional. This peer may be sent transaction
 *  proposals for endorsements. The peer must have the chaincode installed.
 *  The app can also use this property to decide which peers to send the
 *  chaincode install request.
 *  Default: true
 *
 * @property {boolean} [chaincodeQuery] Optional. This peer may be sent transaction
 *  proposals meant only as a query. The peer must have the chaincode
 *  installed. The app can also use this property to decide which peers
 *  to send the chaincode install request.
 *  Default: true
 *
 * @property {boolean} [ledgerQuery] Optional. This peer may be sent query proposals
 *  that do not require chaincodes, like queryBlock(), queryTransaction(), etc.
 *  Default: true
 *
 * @property {boolean} [eventSource] Optional. This peer may be the target of a
 *  event listener registration? All peers can produce events, but the
 *  application typically only needs to connect to one.
 *  Default: true
 */

function buildCurrentTimestamp() {
	const now = new Date();
	const timestamp = new fabprotos.google.protobuf.Timestamp();
	timestamp.setSeconds(now.getTime() / 1000);
	timestamp.setNanos((now.getTime() % 1000) * 1000000);
	return timestamp;
}

module.exports = Channel;
module.exports.ENDORSING_PEER_ROLE = 'endorsingPeer';
module.exports.CHAINCODE_QUERY_ROLE = 'chaincodeQuery';
module.exports.LEDGER_QUERY_ROLE = 'ledgerQuery';
module.exports.EVENT_SOURCE_ROLE = 'eventSource';
module.exports.DISCOVERY_ROLE = 'discover';
module.exports.ALL_ROLES = 'all';
