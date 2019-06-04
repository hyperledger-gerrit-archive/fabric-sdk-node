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
const Orderer = require('./Orderer.js');
const Proposal = require('./Proposal.js');
const fabprotos = require('fabric-protos');
const logger = sdk_utils.getLogger(TYPE);
const checkParameter = require('./Utils.js').checkParameter;

/**
 * Channels provide data isolation for a set of participating organizations.
 * <br><br>
 * A Channel object captures the settings needed to interact with a fabric backend in the
 * context of a channel. These settings including the list of participating organizations,
 * represented by instances of Membership Service Providers (MSP), peers,
 * and orderers.
 * <br><br>
 * A client application can use the Channel object to create new channels with the orderer,
 * update an existing channel, send various channel-aware requests to the peers such as
 * invoking chaincodes to process transactions or queries.
 * <br><br>
 * A Channel object is also responsible for verifying endorsement signatures in transaction
 * proposal responses. A channel object must be initialized after it has been configured with
 * the list of peers and orderers. The initialization sends a get configuration block request
 * to the primary orderer to retrieve the configuration settings for this channel.
 *
 * @class
 */
const Channel = class {

	/**
	 * Returns a new instance of the class. This is a client-side-only call. To
	 * create a new channel in the fabric, call [createChannel()]{@link Client#createChannel}.
	 *
	 * @param {string} name - Name to identify the channel. This value is used
	 *        as the identifier of the channel when making channel-aware requests
	 *        with the fabric, such as invoking chaincodes to endorse transactions.
	 *        The naming of channels is enforced by the ordering service and must
	 *        be unique within the fabric backend. Channel name in fabric network
	 *        is subject to a pattern revealed in the configuration setting
	 *        <code>channel-name-regx-checker</code>.
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
		this.peers = new Map(); //channel peers
		this.orderers = new Map();
		this.channelEventHubs = new Map();

		logger.debug('Constructed Channel instance: name - %s', this.name);
	}

	/**
	 * Close the service connections of all assigned peers and orderers
	 */
	close() {
		logger.debug('close - closing connections');
		this.peers.forEach((channel_peer) => {
			channel_peer.close();
		});
		this._orderers.forEach((orderer) => {
			orderer.close();
		});
	}

	newProposal(chaincodeName = checkParameter('chaincodeName')) {
		const method = 'getProposal';
		logger.debug('%s - start', method);

		return new Proposal(chaincodeName, this);
	}

	/**
	 * @typedef {Object} InitializeRequest
	 * @property {string | Peer | ChannelPeer} [target] - Optional. The target peer to be used
	 *           to make the initialization requests for configuration information.
	 *           When used with `targets` parameter, the peer referenced here will be
	 *           added to the `targets` array.
	 *           Default is to use the first ChannelPeer assigned to this channel.
	 * @property {string[] | Peer[] | ChannelPeer[]} [targets] - Optional. The target peers to be used
	 *           to make the initialization requests for configuration information.
	 *             When used with `target` parameter, the peer referenced there will be
	 *           added to the `targets` array.
	 *           Default is to use the first ChannelPeer assigned to this channel.
	 * @property {boolean} [discover] - Optional. Use the discovery service on the
	 *           the target peer to load the configuration and network information.
	 *           Default is false. When false, the target peer will use the
	 *           Peer query to load only the configuration information.
	 * @property {string} [endorsementHandler] - Optional. The path to a custom
	 *           endorsement handler implementing {@link EndorsementHandler}.
	 * @property {string} [commitHandler] - Optional. The path to a custom
	 *           commit handler implementing {@link CommitHandler}.
	 * @property {boolean} [asLocalhost] - Optional. Convert discovered host addresses
	 *           to be 'localhost'. Will be needed when running a docker composed
	 *           fabric network on the local system; otherwise should be disabled. Defaults to true.
	 * @property {byte[]} [configUpdate] - Optional. To initialize this channel with
	 *           a serialized ConfigUpdate protobuf object.
	 */

	/**
	 * @typedef {Object} OrganizationIdentifier
	 * @property {string} id The organization's MSP id
	 */

	/**
	 * Get organization identifiers from the MSP's for this channel
	 * @returns {OrganizationIdentifier[]} Array of OrganizationIdentifier Objects
	 *          representing the channel's participating organizations
	 */
	getOrganizations() {
		const method = 'getOrganizations';
		logger.debug('%s - start', method);
		const msps = this._msp_manager.getMSPs();
		const mspIds = Object.keys(msps);
		const orgs = mspIds.map((mspId) => {
			return {id: mspId};
		});
		logger.debug('%s - orgs::%j', method, orgs);
		return orgs;
	}

	/**
	 * Add the peer object to the channel object. A channel object can be optionally
	 * configured with a list of peer objects, which will be used when calling certain
	 * methods such as [sendInstantiateProposal()]{@link Channel#sendInstantiateProposal},
	 * [sendUpgradeProposal()]{@link Channel#sendUpgradeProposal},
	 * [sendTransactionProposal]{@link Channel#sendTransactionProposal}.
	 *
	 * @param {Peer} peer - An instance of the Peer class that has been initialized with URL
	 *        and other gRPC options such as TLS credentials and request timeout.
	 * @param {string} mspid - The mpsid of the organization this peer belongs.
	 * @param {ChannelPeerRoles} [roles] Optional. The roles this peer will perform
	 *        on this channel.  A role that is not defined will default to true
	 * @param {boolean} replace - If a peer exist with the same name, replace
	 *        with this one.
	 */
	addPeer(peer, mspid, roles, replace) {
		const name = peer.getName();
		const check = this.peers.get(name);
		if (check) {
			if (replace) {
				logger.debug('/n removing old peer  --name: %s --URL: %s', peer.getName(), peer.getUrl());

				this.removePeer(check);
			} else {
				const error = new Error();
				error.name = 'DuplicatePeer';
				error.message = 'Peer ' + name + ' already exists';
				logger.error(error.message);
				throw error;
			}
		}
		logger.debug('/n adding a new peer  --name: %s --URL: %s', peer.getName(), peer.getUrl());

		const channel_peer = new ChannelPeer(mspid, this, peer, roles);
		this.peers.set(name, channel_peer);
	}

	/**
	 * Remove the peer object in the channel object's list of peers
	 * whose endpoint url property matches the url or name of the peer that is
	 * passed in.
	 *
	 * @param {Peer} peer - An instance of the Peer class.
	 */
	removePeer(peer) {
		this.peers.delete(peer.getName());
	}

	/**
	 * This method will return a {@link ChannelPeer}. This object holds a reference
	 * to the {@link Peer} and the {@link ChannelEventHub} objects and the attributes
	 * of how the peer is defined on the channel.
	 *
	 * @param {string} name - The name of the peer assigned to this channel
	 * @returns {ChannelPeer} The ChannelPeer instance
	 */
	getChannelPeer(name) {
		const channel_peer = this.peers.get(name);

		if (!channel_peer) {
			throw new Error(util.format(PEER_NOT_ASSIGNED_MSG, name));
		}

		return channel_peer;
	}

	/**
	 * Returns a list of {@link ChannelPeer} assigned to this channel instance.
	 * A {@link ChannelPeer} provides a reference to peer and channel event hub along
	 * with how this peer is being used on this channel.
	 * @returns {ChannelPeer[]} The channel peer list on the channel.
	 */
	getChannelPeers() {
		return this.getPeers();
	}

	/**
	 * Add the orderer object to the channel object, this is a client-side-only operation.
	 * An application may add more than one orderer object to the channel object, however
	 * the SDK only uses the first one in the list to send broadcast messages to the
	 * orderer backend.
	 *
	 * @param {Orderer} orderer - An instance of the Orderer class.
	 * @param {boolean} replace - If an orderer exist with the same name, replace
	 *        with this one.
	 */
	//TODO --- do we need MSPID
	addOrderer(orderer, replace) {
		const name = orderer.getName();
		const check = this._orderers.get(name);
		if (check) {
			if (replace) {
				this.removeOrderer(check);
			} else {
				const error = new Error();
				error.name = 'DuplicateOrderer';
				error.message = 'Orderer ' + name + ' already exists';
				logger.error(error.message);
				throw error;
			}
		}
		this._orderers.set(name, orderer);
	}

	/**
	 * Remove the first orderer object in the channel object's list of orderers
	 * whose endpoint url property matches the url of the orderer that is
	 * passed in.
	 *
	 * @param {Orderer} orderer - An instance of the Orderer class.
	 */
	removeOrderer(orderer) {
		this._orderers.delete(orderer.getName());
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
		const orderer = this._orderers.get(name);

		if (!orderer) {
			throw new Error(util.format(ORDERER_NOT_ASSIGNED_MSG, name));
		}

		return orderer;
	}

	/**
	 * Returns the orderers of this channel object.
	 * @returns {Orderer[]} The list of orderers in the channel object
	 */
	getOrderers() {
		logger.debug('getOrderers - list size: %s.', this._orderers.size);
		const orderers = [];
		this._orderers.forEach((orderer) => {
			orderers.push(orderer);
		});
		return orderers;
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
	 * Returns an existing {@link ChannelEventHub} object associated with the
	 * channel Peer. An channel event hub object encapsulates the
	 * properties of an event stream on a peer node, through which the peer publishes
	 * notifications of blocks being committed in the channel's ledger.
	 *
	 * @param {string} name - The channel event hub name associated with this
	 *  channel event hub. Use the {@link Peer#getName} method to get the name
	 *  of a peer instance that has been added to this channel.
	 * @returns {ChannelEventHub} - The ChannelEventHub associated with the peer.
	 */
	getChannelEventHub(name = checkParameter('name')) {
		const _channel_peer = this.peers.get(name);
		if (!_channel_peer) {
			throw new Error(util.format(PEER_NOT_ASSIGNED_MSG, name));
		}

		return _channel_peer.getChannelEventHub();
	}

	/*
	 * Internal utility method to get a list of Orderer object
	 * Throws an Error if no orderers are found
	 */
	_getTargetOrderers(targets) {
		if (!Array.isArray(targets)) {
			throw Error('Targets must be an array');
		}

		const orderers = [];
		for (const target of targets) {
			if (typeof target === 'string') {
				const orderer = this._orderers.get(target);
				if (!orderer) {
					throw Error(`Orderer named ${target} not found`);
				}
				orderers.push(orderer);
			} else if (target && target.constructor && target.constructor.name === 'Orderer') {
				orderers.push(target);
			} else {
				throw Error('Target orderer is not valid');
			}
		}

		return orderers;
	}

	/*
	 * utility method to decide on the targets for requests
	 * Returns an array of one or more {@link ChannelPeers}.
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
					const channel_peer = this.peers.get(peer);
					if (channel_peer) {
						peers.push(channel_peer.getPeer());
					} else {
						throw new Error(`Target peer ${peer} not found`);
					}
				} else if (peer && peer.constructor && peer.constructor.name === 'Peer') {
					peers.push(peer);
				} else if (peer && peer.constructor && peer.constructor.name === 'ChannelPeer') {
					peers.push(peer);
				} else {
					throw new Error('Target peer is not valid');
				}
			}
		} else {
			this.peers.forEach((channel_peer) => {
				if (channel_peer.isInRole(role)) {
					peers.push(channel_peer);
				}
			});
		}

		// method will be used by a call where we only want one target
		if (targets.length === 0) {
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
 *           proposals for endorsements. The peer must have the chaincode installed.
 *           The app can also use this property to decide which peers to send the
 *           chaincode install request.
 *           Default: true
 *
 * @property {boolean} [chaincodeQuery] Optional. This peer may be sent transaction
 *           proposals meant only as a query. The peer must have the chaincode
 *           installed. The app can also use this property to decide which peers
 *           to send the chaincode install request.
 *           Default: true
 *
 * @property {boolean} [ledgerQuery] Optional. This peer may be sent query proposals
 *           that do not require chaincodes, like queryBlock(), queryTransaction(), etc.
 *           Default: true
 *
 * @property {boolean} [eventSource] Optional. This peer may be the target of a
 *           event listener registration? All peers can produce events, but the
 *           application typically only needs to connect to one.
 *           Default: true
 */

/**
 * The ChannelPeer class represents a peer in the target blockchain network on this channel.
 *
 * @class
 */
const ChannelPeer = class {
	/**
	 * Construct a ChannelPeer object with the given Peer and opts.
	 * A channel peer object holds channel based references:
	 *   MSP ID of the Organization this peer belongs.
	 *   {@link Channel} object used to know the channel this peer is interacting.
	 *   {@link Peer} object used for interacting with the Hyperledger fabric network.
	 *   {@link ChannelEventHub} object used for listening to block changes on the channel.
	 *   List of {@link ChannelPeerRoles} to indicate the roles this peer performs on the channel.
	 *
	 * The roles this Peer performs on this channel are indicated with is object.
	 *
	 * @param {string} mspid - The mspid of the organization this peer belongs.
	 * @param {Channel} channel - The Channel instance.
	 * @param {Peer} peer - The Peer instance.
	 * @param {ChannelPeerRoles} roles - The roles for this peer.
	 */
	constructor(mspid, channel, peer, roles) { //TODO add name
		this.mspid = mspid;
		if (channel && channel.constructor && channel.constructor.name === 'Channel') {
			if (peer && peer.constructor && peer.constructor.name === 'Peer') {
				this.channel = channel;
				this.name = peer.getName();
				this.peer = peer;
				this.roles = {};
				logger.debug('ChannelPeer.const - url: %s', peer.getUrl());
				if (roles && typeof roles === 'object') {
					this.roles = Object.assign(roles, this.roles);
				}
			} else {
				throw new Error('Missing Peer parameter');
			}
		} else {
			throw new Error('Missing Channel parameter');
		}
	}

	/**
	 * Close the associated peer service connections.
	 * <br>see {@link Peer#close}
	 * <br>see {@link ChannelEventHub#close}
	 */
	close() {
		this.peer.close();
		if (this.channel_event_hub) {
			this.channel_event_hub.close();
		}
	}


	/**
	 * Get the MSP ID.
	 *
	 * @returns {string} The mspId.
	 */
	getMspid() {
		return this.mspid;
	}

	/**
	 * Get the name. This is a client-side only identifier for this
	 * object.
	 *
	 * @returns {string} The name of the object
	 */
	getName() {
		return this.name;
	}

	/**
	 * Get the URL of this object.
	 *
	 * @returns {string} Get the URL associated with the peer object.
	 */
	getUrl() {
		return this.peer.getUrl();
	}

	/**
	 * Set a role for this peer.
	 *
	 * @param {string} role - The name of the role
	 * @param {boolean} isIn - The boolean value of does this peer have this role
	 */
	setRole(role, isIn) {
		this.roles[role] = isIn;
	}

	/**
	 * Checks if this peer is in the specified role.
	 * The default is true when the incoming role is not defined.
	 * The default will be true when this peer does not have the role defined.
	 *
	 * @returns {boolean} If this peer has this role.
	 */
	isInRole(role) {
		if (!role) {
			throw new Error('Missing "role" parameter');
		} else if (typeof this.roles[role] === 'undefined') {
			return true;
		} else {
			return this.roles[role];
		}
	}

	/**
	 * Checks if this peer is in the specified organization.
	 * The default is true when the incoming organization name is not defined.
	 * The default will be true when this peer does not have the organization name defined.
	 *
	 * @param {string} mspid - The mspid of the organization
	 * @returns {boolean} If this peer belongs to the organization.
	 */
	isInOrg(mspid) {
		if (!mspid || !this.mspid) {
			return true;
		} else {
			return mspid === this.mspid;
		}
	}

	/**
	 * Get the channel event hub for this channel peer. The ChannelEventHub instance will
	 * be assigned when using the {@link Channel} newChannelEventHub() method. When using
	 * a common connection profile, the ChannelEventHub will be automatically assigned
	 * on the Channel Peers as they are created and added to the channel.
	 *
	 * @return {ChannelEventHub} - The ChannelEventHub instance associated with this {@link Peer} instance.
	 */
	getChannelEventHub() {
		if (!this.channel_event_hub) {
			this.channel_event_hub = new ChannelEventHub(this.name, this.channel, this.peer);
		}

		return this.channel_event_hub;
	}

	/**
	 * Get the Peer instance this ChannelPeer represents on the channel.
	 *
	 * @returns {Peer} The associated Peer instance.
	 */
	getPeer() {
		return this.peer;
	}

	/**
	 * Wrapper method for the associated peer so this object may be used as a {@link Peer}
	 * {@link Peer#sendProposal}
	 */
	sendProposal(proposal, timeout) {
		return this.peer.sendProposal(proposal, timeout);
	}

	toString() {
		return this.peer.toString();
	}
}; // endof ChannelPeer

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
