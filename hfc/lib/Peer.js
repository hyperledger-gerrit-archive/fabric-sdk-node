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
var Remote = require('./Remote');
var EventHub = require('./EventHub');
var grpc = require('grpc');

var _serviceProto = grpc.load(__dirname + '/protos/peer/peer.proto').protos;

var logger = utils.getLogger('Peer.js');

/**
 * The Peer class represents a peer in the target blockchain network to which
 * HFC sends endorsement proposals, transaction ordering or query requests.
 *
 * The Peer class represents the remote Peer node and its network membership materials,
 * aka the ECert used to verify signatures. Peer membership represents organizations,
 * unlike User membership which represents individuals.
 *
 * When constructed, a Peer instance can be designated as an event source, in which case
 * a “eventSourceUrl” attribute should be configured. This allows the SDK to automatically
 * attach transaction event listeners to the event stream.
 *
 * It should be noted that Peer event streams function at the Peer level and not at the
 * chain and chaincode levels.
 *
 * @class
 */
var Peer = class extends Remote {

	/**
	 * Constructs a Peer given its endpoint configuration settings.
	 *
	 * @param {string} url The URL with format of "grpcs://host:port".
	 * @param {Object} opts The options for the connection to the peer.
	 */
	constructor(url, opts) {
		super(url, opts);
		logger.info('Peer.const - url: %s options ',url, this._options);
		this._endorserClient = new _serviceProto.Endorser(this._endpoint.addr, this._endpoint.creds, this._options);
		this._name = null;
		this._roles = [];
		this._event_source_url = null;
		this._event_hub = null;
	}

	/**
	 * Get the Peer name. Required property for the instance objects.
	 * @returns {string} The name of the Peer
	 */
	getName() {
		return this._name;
	}

	/**
	 * Set the Peer name / id.
	 * @param {string} name
	 */
	setName(name) {
		this._name = name;
	}

	/**
	 * Get the user’s roles the Peer participates in. It’s an array of possible values
	 * in “client”, and “auditor”. The member service defines two more roles reserved
	 * for peer membership: “peer” and “validator”, which are not exposed to the applications.
	 * @returns {string[]} The roles for this user.
	 */
	getRoles() {
		return this._roles();
	}

	/**
	 * Set the user’s roles the Peer participates in. See getRoles() for legitimate values.
	 * @param {string[]} roles The list of roles for the user.
	 */
	setRoles(roles) {
		this._roles = roles;
	}

	/**
	 * Returns the Peer's enrollment certificate.
	 * @returns {object} Certificate in PEM format signed by the trusted CA
	 */
	getEnrollmentCertificate() {

	}

    /**
	 * Set the Peer’s enrollment certificate.
	 * @param {object} enrollment Certificate in PEM format signed by the trusted CA
	 */
	setEnrollmentCertificate(enrollment) {
		if (typeof enrollment.privateKey === 'undefined' || enrollment.privateKey === null || enrollment.privateKey === '') {
			throw new Error('Invalid enrollment object. Must have a valid private key.');
		}

		if (typeof enrollment.certificate === 'undefined' || enrollment.certificate === null || enrollment.certificate === '') {
			throw new Error('Invalid enrollment object. Must have a valid certificate.');
		}

		this._enrollment = enrollment;
	}

	/**
	 * Set the Peer's event source url
	 * @param {string} url
	 */
	setEventSourceURL(url) {
		this._event_source_url = url;
		this._event_hub = new EventHub(url, this._options);
		this._event_hub.setPeer(this);
	}

	/**
	 * Get the Peer's event source url
	 * return {string} url
	 */
	getEventSourceURL() {
		return this._event_source_url;
	}

	/**
	 * Get the Peer's event source (EventHub
	 * return {EventHub} event source
	 */
	getEventSource() {
		return this._event_hub;
	}

	/**
	 * Indicates if this Peer is an event source
	 * @returns true : if this peer is an event source
	 *          false : if this peer is not an event source
	 */
	isEventSource() {
		return (this._event_hub) ? true : false;
	}

	/**
	 * Send an endorsement proposal to an endorser.
	 *
	 * @param {Proposal} proposal A proposal of type Proposal
	 * @see /protos/peer/proposal.proto
	 * @returns Promise for a ProposalResponse
	 */
	sendProposal(proposal) {
		logger.debug('Peer.sendProposal - Start');
		var self = this;

		// Send the transaction to the peer node via grpc
		// The rpc specification on the peer side is:
		//     rpc ProcessProposal(Proposal) returns (ProposalResponse) {}
		return new Promise(function(resolve, reject) {
			self._endorserClient.processProposal(proposal, function(err, proposalResponse) {
				if (err) {
					logger.error('GRPC client got an error response from the peer. %s', err.stack ? err.stack : err);
					reject(new Error(err));
				} else {
					if (proposalResponse) {
						logger.info('Received proposal response: code - %s', JSON.stringify(proposalResponse.response));
						resolve(proposalResponse);
					} else {
						logger.error('GRPC client failed to get a proper response from the peer.');
						reject(new Error('GRPC client failed to get a proper response from the peer.'));
					}
				}
			});
		});
	}

	/**
	* return a printable representation of this object
	*/
	toString() {
		return ' Peer : {' +
			'url:' + this._url +
		'}';
	}

};

module.exports = Peer;
