/*
 Copyright 2016-2017 IBM All Rights Reserved.

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
var FabricCA = require('fabric-ca-client');

var logger = utils.getLogger('NetworkConfig101.js');
var CHANNELS_CONFIG = 'channels';
var ORGS_CONFIG = 'organizations';
var PEERS_CONFIG = 'peers';
var ORDERERS_CONFIG = 'orderers';
var CA_CONFIG = 'certificateAuthorities';
var ENDORSING_PEER_ROLE = 'endorsingPeer';
var CHAINCODE_QUERY_ROLE = 'chaincodeQuery';
var LEDGER_QUERY_ROLE = 'ledgerQuery';
var EVENT_SOURCE_ROLE = 'eventSource';
var ROLES = [ENDORSING_PEER_ROLE, CHAINCODE_QUERY_ROLE, LEDGER_QUERY_ROLE, EVENT_SOURCE_ROLE];
var TLS_CACERTS = 'tlsCACerts';
var CONNECTION_OPTIONS = 'grpcOptions';
var URL = 'url';
var NAME = 'name';
var PEM = 'pem';
var PATH = 'path';

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

	getChannel(name) {
		var method = 'getChannel';
		logger.debug('%s - name %s',method, name);
		var channel = null;
		if(this._network_config && this._network_config[CHANNELS_CONFIG]) {
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
				peer.setName(peer_config[NAME]);
				if(channel_org) {
					for(let i in ROLES) {
						if(typeof channel_org[ROLES[i]] === 'boolean') {
							peer.setRole(ENDORSING_PEER_ROLE, channel_org[ROLES[i]]);
						}
					}
				}
			}
		}

		return peer;
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

	getCertificate(name, type) {
		var method = 'getCertificate';
		logger.debug('%s - name %s - type %s',method, name, type);
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

	/*
	 * Internal method to add orderer instances to a channel as defined
	 * by the network configuration
	 */
	_addPeers_under_orgs(channel) {
		// get the organization list for this channel
		if(this._network_config &&
			this._network_config[CHANNELS_CONFIG] &&
			this._network_config[CHANNELS_CONFIG][channel.getName()] ) {
			let channel_orgs = this._network_config[CHANNELS_CONFIG][channel.getName()][ORGS_CONFIG];
			if(Array.isArray(channel_orgs)) for(let i in channel_orgs){
				let channel_org = channel_orgs[i];
				// get full organization definition
				if(this._network_config && this._network_config[ORGS_CONFIG]) {
					let organization = this._network_config[ORGS_CONFIG][channel_org.name];
					if(organization) {
						// get all peer names for this organization
						let org_peers = organization[PEERS_CONFIG];
						if(Array.isArray(org_peers)) for(let j in org_peers) {
							let peer_name = org_peers[j];
							let peer = this.getPeer(peer_name, channel_org);
							if(peer) channel.addPeer(peer);
						}
					}
				}

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
			result = FabricCA.normalizeX509(result); //This does not work, removes line feed at end
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
