/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';
const TYPE = 'Channel';

const {Utils: sdk_utils} = require('fabric-common');
const EventHub = require('./EventHub.js');
const Discovery = require('./Discovery.js');
const Endorsement = require('./Endorsement.js');
const Commit = require('./Commit.js');
const Query = require('./Query.js');
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
		logger.debug(`${TYPE}.constructor[${name}] - start `);
		this.type = TYPE;

		const channelNameRegxChecker = sdk_utils.getConfigSetting('channel-name-regx-checker');
		if (channelNameRegxChecker) {
			const {pattern, flags} = channelNameRegxChecker;
			const namePattern = new RegExp(pattern ? pattern : '', flags ? flags : '');
			if (!(name.match(namePattern))) {
				throw new Error(`Failed to create Channel. channel name should match Regex ${namePattern}, but got ${name}`);
			}
		}

		this.name = name;
		this.client = client;
		this.peers = new Map();
		this.orderers = new Map();
		this.channelEventHubs = new Map();
		this.channelDiscovery = new Discovery(name, client, this);
		this.msps = new Map();

		logger.debug(`Constructed Channel instance: name - ${this.name}`);
	}

	/**
	 * Close the service connections of all assigned peers, orderers,
	 * channel event hubs, and channel discovery.
	 */
	close() {
		const method = `close[${this.name}]`;
		logger.debug(`${method} - closing connections`);
		this.peers.forEach((peer) => {
			peer.disconnect(); // TODO how to handle a shared peer ???
		});
		this.orderers.forEach((orderer) => {
			orderer.disconnect();
		});
	}

	/**
	 * Gets an Endorsement instance for this channel.
	 * @param {string} chaincodeName
	 */
	newEndorsement(chaincodeName = checkParameter('chaincodeName')) {
		const method = `newEndorsement[${this.name}]`;
		logger.debug(`${method} - start`);

		return new Endorsement(chaincodeName, this);
	}

	/**
	 * Gets a Query instance for this channel.
	 * @param {string} chaincodeName
	 */
	newQuery(chaincodeName = checkParameter('chaincodeName')) {
		const method = `newQuery[${this.name}]`;
		logger.debug(`${method} - start`);

		return new Query(chaincodeName, this);
	}

	/**
	 * Gets a Commit instance for this channel.
	 * @param {string} chaincodeName
	 */
	newCommit(chaincodeName = checkParameter('chaincodeName')) {
		const method = `newCommit[${this.name}]`;
		logger.debug(`${method} - start`);

		return new Commit(chaincodeName, this);
	}

	/**
	 * Returns a new {@link EventHub} object on each call.
	 *
	 * @param {string} name - The name for this EventHub
	 * @returns {EventHub} The EventHub instance
	 */
	newEventHub(name = checkParameter('name')) {
		const method = `newEventHub[${this.name}]`;
		logger.debug(`${method} - start`);
		return new EventHub(name, this);
	}

	/**
	 * Returns a {@link Discovery} instance with the given name.
	 * Will return a new instance.
	 *
	 * @param {string} name The name of this discovery instance.
	 * @returns {Discovery} The discovery instance.
	 */
	newDiscovery(name = checkParameter('name')) {
		const method = `newDiscovery[${this.name}]`;
		logger.debug(`${method} - start - create new Discovery name:${name} for channel:${this.name}`);
		return new Discovery(name, this);
	}

	/**
	 * @typedef {Object} MspConfig
	 * @property {string} id - The identifier for this MSP, Typically the
	 *  organization name.
	 * @property {string} name - The name for this MSP, Typically the
	 *  organization name. To avoid confusion the name and ID should be
	 *  the same. This will be key to finding this MSP configuration.
	 * @property {string[]} organizational_unit_identifiers
	 * @property {string[]} root_certs - List of root certificates trusted by
	 *  this MSP. They are used upon certificate validation.
	 * @property {string[]} intermediate_certs - List of intermediate
	 *  certificates trusted by this MSP. They are used upon certificate
	 *  validation as follows:
	 *     Validation attempts to build a path from the certificate to be
	 *     validated (which is at one end of the path) and one of the certs
	 *     in the RootCerts field (which is at the other end of the path).
	 *     If the path is longer than 2, certificates in the middle are
	 *     searched within the Intermediate Certificates pool.
	 * @property {string} admins - Identity denoting the administrator
	 *  of this MSP
	 * @property {string} tls_root_certs - TLS root certificates
	 *  trusted by this MSP
	 * @property {string} tls_intermediate_certs - TLS intermediate certificates
	 *  trusted by this MSP
	 */

	/**
	 * Get organization identifiers from the MSP's for this channel
	 * @returns {string[]} Array of IDs representing the channel's participating
	 *  organizations
	 */
	getMspids() {
		const method = `getMspids[${this.name}]`;
		logger.debug(`${method} - start`);

		const ids = [];
		for (const msp of this.msps.values()) {
			ids.push(msp.id);
		}

		return ids;
	}

	/**
	 *  Use this method to get {@link MspConfig} object
	 *  for the name provided.
	 *
	 * @returns {MspConfig} The MSP JSON object
	 */
	getMSP(name = checkParameter('name')) {
		logger.debug(`getMSP[${this.name}] - start name:${name}`);

		return this.msps.get(name);
	}

	/**
	 * Remove the MSP from this channel's list.
	 * @param {string} name - The name of the MSP
	 *  to remove
	 */
	removeMSP(name = checkParameter('name')) {
		logger.debug(`removeMSP[${this.name}] - start`);
		this.msps.delete(name);

		return this;
	}

	/**
	 * Add a MSP configuration to this channel
	 * @param {MspConfig} msp - The MSP configuration to add to this Channel
	 * @param {boolean} replace - If a MSP config has already been added to
	 *  this channel then replace it with this new configuration.
	 */
	addMSP(msp, replace) {
		const method = `addMSP[${this.name}]`;
		logger.debug(`${method} - start`);
		const name = msp.name;
		const check = this.msps.get(name);
		if (check) {
			if (replace) {
				logger.debug(`${method} - removing existing MSP  --name: ${name}`);
				this.removeMSP(check);
			} else {
				const error = new Error(`MSP ${name} already exists`);
				logger.error(`${method} - error:${error.message}`);
				throw error;
			}
		}
		logger.debug(`${method} - adding a new MSP  --name: ${name}`);
		this.msps.set(name, msp);

		return this;
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
		const method = `addPeer[${this.name}]`;
		logger.debug(`${method} - start`);
		const name = peer.name;
		const check = this.peers.get(name);
		if (check) {
			if (replace) {
				logger.debug(`${method} - removing existing Peer  --name: ${check.name} --URL: ${check.endpoint.url}`);
				this.removePeer(check);
			} else {
				const error = new Error(`Peer ${name} already exists`);
				logger.error(error.message);
				throw error;
			}
		}
		logger.debug(`${method} - adding a new Peer  --name: ${name}`);
		this.peers.set(name, peer);

		return this;
	}

	/**
	 * Remove the peer object in the channel object's list of peers.
	 * Closes the peer's endorsement and event service connections.
	 *
	 * @param {Peer} peer - An instance of the Peer class.
	 */
	removePeer(peer) {
		const method = `removePeer[${this.name}]`;
		logger.debug(`${method} - start`);
		peer.close();
		this.peers.delete(peer.name);

		return this;
	}

	/**
	 * This method will return a {@link Peer}.
	 *
	 * @param {string} name - The name of the peer assigned to this channel
	 * @returns {Peer} The Peer instance
	 */
	getPeer(name) {
		const method = `getPeer[${this.name}]`;
		logger.debug(`${method} - start`);
		return this.peers.get(name);
	}

	/**
	 * Add the orderer object to the channel object
	 *
	 * @param {Orderer} orderer - An instance of the Orderer class.
	 * @param {boolean} replace - If an orderer exist with the same name, replace
	 *  with this one.
	 */
	addOrderer(orderer, replace) {
		const method = `addOrderer[${this.name}]`;
		logger.debug(`${method} - start`);
		const name = orderer.name;
		const check = this.orderers.get(name);
		if (check) {
			if (replace) {
				logger.debug(`${method} - removing existing Orderer  --name: ${check.name} --URL: ${check.endpoint.url}`);
				this.removeOrderer(check);
			} else {
				const error = new Error(`Orderer ${name} already exists`);
				logger.error(`${method} - error::${error.message}`);
				throw error;
			}
		}
		logger.debug(`${method} - adding a new Orderer  --name: ${orderer.name}`);
		this.orderers.set(name, orderer);

		return this;
	}

	/**
	 * Remove the orderer object from channel object's list of orderers.
	 * Closes the orderer before removal.
	 *
	 * @param {Orderer} orderer - An instance of the Orderer class.
	 */
	removeOrderer(orderer) {
		const method = `removeOrderer[${this.name}]`;
		logger.debug(`${method} - start`);
		orderer.close();
		this.orderers.delete(orderer.name);

		return this;
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
		const method = `getOrderer[${this.name}]`;
		logger.debug(`${method} - start`);
		return this.orderers.get(name);
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
		const method = `getPeers[${this.name}]`;
		logger.debug(`${method} - start`);

		return this._getServiceEndpoints(this.peers.values(), 'Peer', mspid);
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
		const method = `getOrderers[${this.name}]`;
		logger.debug(`${method} - start`);
		return this._getServiceEndpoints(this.orderers.values(), 'Orderer', mspid);
	}

	_getServiceEndpoints(remotes, type, mspid) {
		const method = `_getServiceEndpoints[${this.name}]`;
		logger.debug(`${method} - start`);
		const results = [];
		for (const remote of remotes) {
			if (mspid) {
				if (remote.mspid === mspid) {
					results.push(remote);
					logger.debug(`${method} - ${type} mspid matched, added ${remote.name}`);
				} else {
					logger.debug(`${method} - ${type} not added ${remote.name}`);
				}
			} else {
				results.push(remote);
				logger.debug(`${method} - ${type} added ${remote.name}`);
			}
		}

		return results;
	}

	/*
	 * Internal utility method to get a list of Orderer objects
	 * Throws an Error if no orderers are found
	 */
	_getTargetOrderers(targets) {
		const method = `_getTargetOrderers[${this.name}]`;
		logger.debug(`${method} - start`);
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
	getTargetPeers(targets) {
		const method = `getTargetPeers[${this.name}]`;
		logger.debug(`${method} - start`);
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
		const method = `buildChannelHeader[${this.name}]`;
		logger.debug(`${method} - start - type ${type} chaincode_id ${chaincode_id} tx_id ${tx_id}`);
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
	}

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

function buildCurrentTimestamp() {
	const now = new Date();
	const timestamp = new fabprotos.google.protobuf.Timestamp();
	timestamp.setSeconds(now.getTime() / 1000);
	timestamp.setNanos((now.getTime() % 1000) * 1000000);
	return timestamp;
}

module.exports = Channel;
