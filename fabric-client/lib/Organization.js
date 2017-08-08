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

var api = require('./api.js');
var utils = require('./utils.js');
var util = require('util');

var logger = utils.getLogger('Organization.js');

/**
 * The Organization class represents an organization in the target blockchain network.
 *
 * @class
 */
var Organization = class {

	/**
	 * Construct a Organization object
	 * @param {string} name - The name of this organization
	 * @returns {Organization} The Organization instance.
	 */
	constructor(name) {
		logger.debug('Organization.const ');
		this._name = name;
		this._peers = [];
	}

	/**
	 * Gets the name of this organization
	 *
	 * @returns {string} The name of this organization
	 */
	getName() {
		return this._name;
	}

	/**
	 * Add a {@link Peer} to this organization
	 *
	 * @param {Peer} peer - The peer instance to add to this organizations list of peers
	 */
	addPeer(peer) {
		this._peers.push(peer);
	}

	/**
	 * Gets the list of this organizations {@link Peer}
	 *
	 * @returns [{Peer}] An array of {@link Peer} objects
	 */
	getPeers() {
		return this._peers;
	}

	/**
	 * return a printable representation of this object
	 */
	toString() {
		var peers = '';
		this._peers.forEach((peer) => {peers = peers + peer.toString();});
		return ' Organization : {' +
			'peers : ' +  peers +
		'}';
	}

};

module.exports = Organization;
