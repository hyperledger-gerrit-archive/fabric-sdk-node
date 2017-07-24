/*
 Copyright 2016, 2017 IBM All Rights Reserved.

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

	  http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

'use strict';

var api = require('../api.js');
var fs = require('fs-extra');
var path = require('path');
var util = require('util');
var utils = require('../utils');
var Channel = require('../Channel.js');
var Peer = require('../Peer.js');
var EventHub = require('../EventHub.js');
var Orderer = require('../Orderer.js');
var Organization = require('../Organization.js');
var FabricCA = require('fabric-ca-client');

var logger = utils.getLogger('NetworkConfig101.js');
var CHANNELS_CONFIG = 'channels';
var ORGS_CONFIG = 'organizations';
var PEERS_CONFIG = 'peers';
var ORDERERS_CONFIG = 'orderers';
var CA_CONFIG = 'certificateAuthorities';
var TLS_CACERTS = 'tlsCACerts';
var CONNECTION_OPTIONS = 'grpcOptions';
var URL = 'url';
var EVENT_URL = 'eventUrl';
var NAME = 'name';
var PEM = 'pem';
var PATH = 'path';
var ROLES = api.NetworkConfig.ROLES;

/**
 * This is an implementation of the [NetworkConfig]{@link module:api.NetworkConfig} API.
 * It will be used to work with the v1.0.1 version of a JSON based network configuration.
 *
 * @class
 * @extends module:api.NetworkConfig
 */
var NetworkConfig101 = class extends api.NetworkConfig {

	/**
	 * constructor
	 *
	 * @param {Object} network_config - Network Configuration as represented in a JSON object
	 */
	constructor(network_config, client_context) {
		super();
		logger.debug('constructor, network_config: ' + JSON.stringify(network_config));
		this._network_config = network_config;
		this._client_context = client_context;
	}

	addSettings(additions) {
		var method = 'addSettings';
		logger.debug('%s - additions %j',method, additions);
		if(additions && additions._network_config) {
			if(additions._network_config.client) {
				this._network_config.client = additions._network_config.client;
			}
			if(additions._network_config.channels) {
				this._network_config.channels = additions._network_config.channels;
			}
			if(additions._network_config.organizations) {
				this._network_config.organizations = additions._network_config.organizations;
			}
			if(additions._network_config.orderers) {
				this._network_config.orderers = additions._network_config.orderers;
			}
			if(additions._network_config.peers) {
				this._network_config.peers = additions._network_config.peers;
			}
			if(additions._network_config.certificateAuthorities) {
				this._network_config.certificateAuthorities = additions._network_config.certificateAuthorities;
			}
		}
	}

	getChannel(name) {
		var method = 'getChannel';
		logger.debug('%s - name %s',method, name);
		var channel = null;
		if(name && this._network_config && this._network_config[CHANNELS_CONFIG]) {
			var channel_config = this._network_config[CHANNELS_CONFIG][name];
			if(channel_config) {
				channel = new Channel(name, this._client_context);
				this._addPeers(channel);
				this._addOrderers(channel);
			}
		}

		return channel;
	}

	getPeer(name, channel_org) {
		var method = 'getPeer';
		logger.debug('%s - name %s',method, name);
		var peer = null;
		if(this._network_config && this._network_config[PEERS_CONFIG]) {
			let peer_config = this._network_config[PEERS_CONFIG][name];
			if(peer_config) {
				let opts = {};
				opts.pem = getCertFromConfig(peer_config);
				Object.assign(opts, peer_config[CONNECTION_OPTIONS]);
				peer = new Peer(peer_config[URL], opts);
				peer.setName(name);
				if(channel_org) {
					for(let i in ROLES) {
						if(typeof channel_org[ROLES[i]] === 'boolean') {
							peer.setRole(ROLES[i], channel_org[ROLES[i]]);
						}
					}
				}
			}
		}

		return peer;
	}

	getEventHub(name) {
		var method = 'getEventHub';
		logger.debug('%s - name %s',method, name);
		var event_hub = null;
		if(this._network_config && this._network_config[PEERS_CONFIG]) {
			let peer_config = this._network_config[PEERS_CONFIG][name];
			if(peer_config) {
				let opts = {};
				opts.pem = getCertFromConfig(peer_config);
				Object.assign(opts, peer_config[CONNECTION_OPTIONS]);
				event_hub = new EventHub(this._client_context);
				event_hub.setPeerAddr(peer_config[EVENT_URL], opts);
			}
		}

		return event_hub;
	}

	getOrderer(name) {
		var method = 'getOrderer';
		logger.debug('%s - name %s',method, name);
		var orderer = null;
		if(this._network_config && this._network_config[ORDERERS_CONFIG]) {
			let orderer_config = this._network_config[ORDERERS_CONFIG][name];
			if(orderer_config) {
				let opts = {};
				opts.pem = getCertFromConfig(orderer_config);
				Object.assign(opts, orderer_config[CONNECTION_OPTIONS]);
				orderer = new Orderer(orderer_config[URL], opts);
				orderer.setName(orderer_config[NAME]);
			}
		}

		return orderer;
	}

	getOrganizations() {
		var method = 'getOrganizations';
		logger.debug('%s - start',method);
		var organizations = [];
		if(this._network_config && this._network_config[ORGS_CONFIG]) {
			for(let organization_name in  this._network_config[ORGS_CONFIG]) {
				let organization_config = this._network_config[ORGS_CONFIG][organization_name];
				var organization = new Organization(organization_name);
				if(organization_config[PEERS_CONFIG]) {
					for(let i in organization_config[PEERS_CONFIG]) {
						let peer_name = organization_config[PEERS_CONFIG][i];
						let peer = this.getPeer(peer_name);
						if(peer) organization.addPeer(peer);
					}
				}
				organizations.push(organization);
			}
		}

		return organizations;
	}


	/*
	 * Internal method to add orderer instances to a channel as defined
	 * by the network configuration
	 */
	_addOrderers(channel) {
		// get the organization list for this channel
		if(this._network_config &&
			this._network_config[CHANNELS_CONFIG] &&
			this._network_config[CHANNELS_CONFIG][channel.getName()] ) {
			let orderer_names = this._network_config[CHANNELS_CONFIG][channel.getName()][ORDERERS_CONFIG];
			if(Array.isArray(orderer_names)) for(let i in orderer_names){
				let orderer_name = orderer_names[i];
				let orderer = this.getOrderer(orderer_name);
				if(orderer) channel.addOrderer(orderer);
			}
		}
	}

	/*
	 * Internal method to add orderer instances to a channel as defined
	 * by the network configuration
	 */
	_addPeers(channel) {
		// get the organization list for this channel
		if(this._network_config &&
			this._network_config[CHANNELS_CONFIG] &&
			this._network_config[CHANNELS_CONFIG][channel.getName()] ) {
			let channel_peers = this._network_config[CHANNELS_CONFIG][channel.getName()][PEERS_CONFIG];
			if(channel_peers) for(let peer_name in channel_peers) {
				let channel_peer = channel_peers[peer_name];
				let peer = this.getPeer(peer_name, channel_peer);
				if(peer) channel.addPeer(peer);
			}
		}

	}
};

function getCertFromConfig(config) {
	var result = null;
	let tls_config = config[TLS_CACERTS];
	if(tls_config) {
		if(tls_config[PEM]) {
			// cert value is directly in the configuration
			result = tls_config[PEM];
		} else if(tls_config[PATH]) {
			// cert value is in a file
			result = readCertFileSync(tls_config[PATH]);
			result = FabricCA.normalizeX509(result); //This removes line feed at end
			result = result + '\n';
		}
	}

	return result;
}

function readCertFileSync(config_path) {
	let config_loc = path.resolve(config_path);
	let data = fs.readFileSync(config_loc);
	return Buffer.from(data).toString();
}

module.exports = NetworkConfig101;
