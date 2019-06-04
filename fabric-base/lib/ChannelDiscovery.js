/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';
const TYPE = 'ChannelDiscovery';
const Long = require('long');

const {Utils: common_utils} = require('fabric-common');
const {checkParameter} = require('./Utils.js');
const Remote = require('./Remote.js');
const TransactionContext = require('./TransactionContext.js');
const DiscoveryEndorseHandler = require('./DiscoveryEndorseHandler.js');
const DiscoveryCommitHandler = require('./DiscoveryCommitHandler.js');
const DiscoveryQueryHandler = require('./DiscoveryQueryHandler.js');

const logger = common_utils.getLogger(TYPE);

const fabprotos = require('fabric-protos');

/**
 * The ChannelDiscovery class represents a peer in the target fabric network that
 * is providing the discovery service for the channel.
 *
 * @class
 * @extends Remote
 */
class ChannelDiscovery extends Remote {

	/**
	 * Construct a ChannelDiscovery object with the name.
	 * Use the connect method with options to establish a
	 * connection with the fabric network endpoint.
	 *
	 * @param {string} name - The name of this discovery peer
	 * @param {Client} client - The client instance
	 * @returns {ChannelDiscovery} The ChannelDiscovery instance.
	 */
	constructor(name = checkParameter('name'), client = checkParameter('client'), channel = checkParameter('channel')) {
		const method = `constructor[${name}]`;
		logger.debug('%s - start', method);
		super(name, client);
		this.channel = channel;
		this.type = TYPE;
		this.refresh_age = 5 * 60 * 1000; // 5 minutes default

		this.discoveryResults = null;
		this.as_localhost = false;

		this.discoveryService = null;
	}

	/**
	 * Use this method to get a new endorsement handler that will use this
	 * instance of the Discovery service.
	 *
	 * @returns {DiscoveryEndorsementHandler} Discovery endorsement handler
	 */
	newEndorsementHandler() {
		const method = `newEndorsementHandler[${this.name}]`;
		logger.debug('%s - start', method);
		const handler = new DiscoveryEndorseHandler(this);

		return handler;
	}

	/**
	 * Use this method to get a new commit handler that will use this
	 * instance of the Discovery service.
	 *
	 * @returns {DiscoveryCommitHandler} Discovery commit handler
	 */
	newCommitHandler() {
		const method = `newCommitHandler[${this.name}]`;
		logger.debug('%s - start', method);
		const handler = new DiscoveryCommitHandler(this);

		return handler;
	}

	/**
	 * Use this method to get a new query handler that will use this
	 * instance of the Discovery service.
	 *
	 * @returns {DiscoveryQueryHandler} Discovery query handler
	 */
	newQueryHandler() {
		const method = `newQueryHandler[${this.name}]`;
		logger.debug('%s - start', method);
		const handler = new DiscoveryQueryHandler(this);

		return handler;
	}


	/**
	 * Connects to a Peer with the given url and opts.
	 * If a connection exist it will be closed and replaced by
	 * a new connection using the options provided.
	 *
	 * @param {Endpoint} endpoint - Service connection options including the url.
	 * @param {ConnectionOpts} options - Any specific options for this instance
	 *  of the connection to the peer. These will override options from the
	 *  endpoint service connection options.
	 */
	async connect(endpoint = checkParameter('endpoint'), options = {}) {
		const method = `connect[${this.name}]`;
		logger.debug('%s - start', method);

		this.endpoint = endpoint;
		this.options = endpoint.options;
		Object.assign(this.options, options); // merge options

		if (this.discoveryService) {
			logger.debug('%s - discovery service exist, will close %s', method, this.name);
			this.close();
		} else {
			logger.debug('%s - discovery service does not exist for %s', method, this.name);
		}
		if (!this.discoveryService) {
			logger.debug('%s - create discovery service for %s', method, this.name);
			this.discoveryService = new fabprotos.discovery.Discovery(this.endpoint.addr, this.endpoint.creds, this.options);
		}

		await this.waitForReady(this.discoveryService);
	}

	/**
	 * Check the connection status
	 */
	async checkConnection() {
		const method = `checkConnection[${this.name}]`;
		logger.debug('%s - start ', method);

		if (this.connected) {
			try {
				await this.waitForReady(this.discoveryService);
				return true;
			} catch (error) {
				logger.error('ChannelDiscovery %s Connection failed :: %s', this.endpoint.url, error);
			}
		}

		return false;
	}
	/**
	 * @typedef {Object} BuildDiscoveryRequest - This Discovery request
	 *  is a GRPC object to be signed and sent to the Discovery service
	 *  of the Peer. The request will be based on either the proposal
	 *  or the interests parameters. This request must be signed before
	 *  sending to the peer.
	 * @property {Proposal} [proposal] - Optional. Include the proposal
	 *  to build the discovery request based on the proposal. This will get
	 *  the discovery interest (chaincode names and collections) from the
	 *  the proposal. Use the {@link Proposal#addCollectionInterest} to
	 *  add collections to the proposal's chaincode. Use the
	 *  {@link Proposal#addChaincodeCollectionsInterest} to add chaincodes
	 *  and collections that will be called by the proposal's chaincode.
	 * @property {DiscoveryChaincode} [interest] - Optional. An
	 *  array of {@link DiscoveryChaincodeInterest} that have chaincodes
	 *  and collections to calculate the endorsement plans.
	 * @example <caption>"single chaincode"</caption>
	 *  {interest: [
	 *     { name: "mychaincode"}
	 *  ]}
	 * @example <caption>"chaincode to chaincode"</caption>
	 *  {interest: [
	 *      { name: "mychaincode"}, { name: "myotherchaincode"}
	 *  ]}
	 * @example <caption>"single chaincode with a collection"</caption>
	 *  {interest: [
	 *     { name: "mychaincode", collection_names: ["mycollection"] }
	 *  ]}
	 * @example <caption>"chaincode to chaincode with a collection"</caption>
	 *  {interest: [
	 *     { name: "mychaincode", collection_names: ["mycollection"] },
	 *     { name: "myotherchaincode", collection_names: ["mycollection"] }}
	 *  ]}
	 * @example <caption>"chaincode to chaincode with collections"</caption>
	 *  {interest: [
	 *     { name: "mychaincode", collection_names: ["mycollection", "myothercollection"] },
	 *     { name: "myotherchaincode", collection_names: ["mycollection", "myothercollection"] }}
	 *  ]}
	 */

	/**
	 * @typedef {Object} DiscoveryChaincodesInterest
	 * @property {DiscoveryChaincodeCall[]} interest - An array of
	 *  {@link DiscoveryChaincodeCall} objects.
	 */

	/**
	 * @typedef {Object} DiscoveryChaincodeCall
	 * @property {string} name - The name of the chaincode
	 * @property {string[]} [collection_names] - The names of the related collections
	 */

	/**
	 * Use this method to build a discovery request.
	 *
	 * @param {TransactionContext} txContext - Contains the {@link User} object
	 * needed to build this request.
	 * @param {BuildDiscoveryRequest} request - The discovery settings of the request.
	 */
	buildRequest(txContext = checkParameter('txContext'), request = {}) {
		const method = `buildDiscoveryRequest[${this.name}]`;
		logger.debug('%s - start', method);

		// always get the config, we need the msps, do not need local
		const {config = true,  local = false, interest, proposal} = request;
		const channelId = this.channel.name;
		const discovery_request = new fabprotos.discovery.Request();
		const authentication = new fabprotos.discovery.AuthInfo();
		authentication.setClientIdentity(txContext.serializeIdentity());
		const cert_hash = txContext.getClientCertHash();
		if (cert_hash) {
			authentication.setClientTlsCertHash(cert_hash);
		}
		discovery_request.setAuthentication(authentication);

		// be sure to add all entries to this array before setting into the grpc object
		const queries = [];

		if (config) {
			let query = new fabprotos.discovery.Query();
			queries.push(query);
			query.setChannel(channelId);

			const config_query = new fabprotos.discovery.ConfigQuery();
			query.setConfigQuery(config_query);
			logger.debug('%s - adding config query', method);

			query = new fabprotos.discovery.Query();
			queries.push(query);
			query.setChannel(channelId);

			const peer_query = new fabprotos.discovery.PeerMembershipQuery();
			query.setPeerQuery(peer_query);
			logger.debug('%s - adding peer membership query', method);
		}

		if (local) {
			const query = new fabprotos.discovery.Query();
			const local_peers = new fabprotos.discovery.LocalPeerQuery();
			query.setLocalPeers(local_peers);
			logger.debug('%s - adding local peers query', method);
			queries.push(query);
		}

		// add a chaincode query to get endorsement plans
		if (proposal) {
			const query = new fabprotos.discovery.Query();
			query.setChannel(channelId);

			const _interests = [];
			const proposal_interest = proposal.buildProposalInterest();
			const proto_interest = this._buildProtoChaincodeInterest(proposal_interest);
			_interests.push(proto_interest);

			const cc_query = new fabprotos.discovery.ChaincodeQuery();
			cc_query.setInterests(_interests);
			query.setCcQuery(cc_query);
			logger.debug('%s - adding proposal chaincodes/collections query', method);
			queries.push(query);
		} else if (interest) {
			const query = new fabprotos.discovery.Query();
			query.setChannel(channelId);

			const _interests = [];
			const proto_interest = this._buildProtoChaincodeInterest(interest);
			_interests.push(proto_interest);

			const cc_query = new fabprotos.discovery.ChaincodeQuery();
			cc_query.setInterests(_interests);
			query.setCcQuery(cc_query);
			logger.debug('%s - adding interest chaincodes/collections query', method);
			queries.push(query);
		}

		// be sure to set the array after completely building it
		discovery_request.setQueries(queries);
		this.request = discovery_request;

		return discovery_request.toBuffer();
	}

	/* internal method
	 *  Takes an array of {@link DiscoveryChaincodeCall} that represent the
	 *  chaincodes and associated collections to build an interest.
	 *  The interest becomes part of the query object needed by the discovery
	 *  service to calculate the endorsement plan for an invocation.
	 */
	_buildProtoChaincodeInterest(interest) {
		const method = `_buildProtoChaincodeInterest[${this.name}]`;
		logger.debug('%s - start', method);
		const chaincode_calls = [];
		for (const chaincode of interest) {
			const chaincode_call = new fabprotos.discovery.ChaincodeCall();
			if (typeof chaincode.name === 'string') {
				chaincode_call.setName(chaincode.name);
				if (chaincode.collection_names) {
					if (Array.isArray(chaincode.collection_names)) {
						const collection_names = [];
						chaincode.collection_names.map(name => {
							if (typeof name === 'string') {
								collection_names.push(name);
							} else {
								throw Error('The collection name must be a string');
							}
						});
						chaincode_call.setCollectionNames(collection_names);
					} else {
						throw Error('collection_names must be an array of strings');
					}
				}
				chaincode_calls.push(chaincode_call);
			} else {
				throw Error('Chaincode name must be a string');
			}
		}
		const interest_proto = new fabprotos.discovery.ChaincodeInterest();
		interest_proto.setChaincodes(chaincode_calls);

		return interest_proto;
	}
	/**
	 * Use this method with a TransactionContext that contains a User that has
	 * a Signing Identity.
	 * OR
	 * Use this method with a byte[] to set the signature
	 * when the application has done the signing outside of
	 * this object.
	 * Use the results of the {@link ChannelDiscovery#buildRequest}
	 * as the bytes that will be signed.
	 * @param {TransactionContext | byte[]} param - When 'param' is a
	 * {@link TransactionContext} the signing identity of the user
	 *  will sign the current request bytes as generated by {@link ChannelDiscovery#buildRequest}.
	 *  When the 'param' is a byte[], the bytes will be used as the final
	 *  request signature.
	 */
	signRequest(param = checkParameter('param')) {
		const method = `signRequest[${this.name}]`;
		logger.debug('%s - start', method);
		if (!this.request) {
			throw Error('The discovery request is not built');
		}
		if (param.type === TransactionContext.TYPE) {
			const txContext = param;
			const signer = txContext.user.getSigningIdentity();
			this.signature = Buffer.from(signer.sign(this.request.toBuffer()));
		} else if (param instanceof Buffer) {
			this.signature = param;
		} else {
			throw Error('Parameter is an unknown discovery request signature type');
		}

		return this;
	}

	/**
	 * Returns a signed envelope from the signature and the built request as
	 * bytes
	 *
	 * This method is not intended for use by an application. It will be used
	 * internally by {@link ChannelDiscovery#discover} during discovery processing.
	 * @returns {object} An object with the signature and the proposal bytes
	 *  ready to send to the Peer.
	 */
	getSignedRequestEnvelope() {
		const method = `getSignedRequestEnvelope[${this.name}]`;
		logger.debug('%s - start', method);
		if (!this.request) {
			throw Error('The discovery request is not built');
		}
		if (!this.signature) {
			throw Error('The discovery request is not signed');
		}
		const signed_envelope = {signature: this.signature, payload: this.request.toBuffer()};

		return signed_envelope;
	}

	/**
	 * @typedef {Object} DiscoverRequest
	 * @property {boolean} [as_localhost] - Optional. When discovery is running in a
	 *  virtual environment, the host name of peers and orderers created by this
	 *  service may have to converted to localhost for connections to be established.
	 * @property {number} [request_timeout] - Optional. The request timeout
	 * @property {number} [refresh_age] - Optional. The milliseconds before the
	 *  discovery results will be refreshed automatically. When the {@link ChannelDiscovery#getDiscoveryResults}
	 *  is called with refresh = true and the age of the discovery results
	 *  is older then 'refresh_age' the current signed request will be sent
	 *  to the peer's discovery service.
	 *  Default: 5 minutes.
	 */

	/**
	 * Send a signed transaction proposal to peer(s)
	 *
	 * @param {DiscoverRequest} request
	 * @returns {DiscoveryResults}
	 */
	async discover(request = {}) {
		const method = `discover[${this.name}]`;
		logger.debug('%s - start', method);

		const {request_timeout, as_localhost, refresh_age} = request;

		if (typeof as_localhost === 'boolean') {
			this.as_localhost = as_localhost;
		}

		if (typeof refresh_age === 'number') {
			this.refresh_age = refresh_age;
		}

		if (typeof request_timeout === 'number') {
			this.request_timeout = request_timeout;
		}

		const signed_envelope = this.getSignedRequestEnvelope();

		logger.debug('%s - about to discover on %s', method, this.endpoint.url);
		this.discoveryResults = {};
		const response = await this.sendDiscovery(signed_envelope, request_timeout);

		logger.debug('%s - processing discovery response', method);
		if (response && response.results) {
			let error_msg = null;
			logger.debug('%s - parse discovery response.results', method);
			for (const index in response.results) {
				const result = response.results[index];
				if (result.result === 'error') {
					logger.error('%s - Channel:%s received discovery error:%s', method, this.name, result.error.content);
					error_msg = result.error.content;
					break;
				} else {
					logger.debug('%s - process result index:%s', method, index);
					if (result.config_result) {
						logger.debug('%s - process result - have config_result in %s', method, index);
						const config = await this._processConfig(result.config_result);
						this.discoveryResults.msps = config.msps;
						this.discoveryResults.orderers = config.orderers;
					}
					if (result.members) {
						logger.debug('%s - process result - have members in %s', method, index);
						this.discoveryResults.peers_by_org = await this._processMembership(result.members, this.discoveryResults.msps);
					}
					if (result.cc_query_res) {
						logger.debug('%s - process result - have cc_query_res in %s', method, index);
						this.discoveryResults.endorsement_plan = await this._processChaincode(result.cc_query_res);
					}
					logger.debug('%s - completed processing result %s', method, index);
				}
			}

			if (error_msg) {
				throw Error(`Discovery: ${this.name} error: ${error_msg}`);
			} else {
				this.discoveryResults.timestamp = (new Date()).getTime();
				return this.discoveryResults;
			}
		} else {
			throw new Error('Discovery has failed to return results');
		}
	}

	/**
	 * Get the discovered results. The results are from the discovery service
	 * of the Peer and based on the discovery request of {@link ChannelDiscovery#BuildDiscoveryRequest}
	 * that was sent to the Peer with {@link Discover#discover}.
	 * @param {boolean} [refresh] - Optional. Refresh the discovery results if
	 *  results are older then the refresh age.
	 */
	async getDiscoveryResults(refresh) {
		const method = `getDiscoveryResults[${this.name}]`;
		logger.debug('%s - start', method);
		if (!this.discoveryResults) {
			throw Error('No discovery results found');
		}
		if (refresh && (new Date()).getTime() - this.discoveryResults.timestamp > this.refresh_age) {
			await this.discover({as_localhost: this.as_localhost, request_timeout: this.request_timeout});
		}
		return this.discoveryResults;
	}

	/**
	 * Send an discovery request to this peer.
	 *
	 * @param {SignedRequest} request - A protobuf encoded byte array of type
	 *  [Proposal]{@link https://github.com/hyperledger/fabric/blob/release-1.2/protos/discovery/protocol.proto}
	 * @param {Number} timeout - A number indicating milliseconds to wait on the
	 *  response before rejecting the promise with a timeout error. This
	 *  overrides the default timeout of the Peer instance and the global
	 *  timeout in the config settings.
	 * @returns {Promise} A Promise for a {@link DiscoveryResponse}
	 */
	sendDiscovery(signedEnvelope = checkParameter('signedEnvelope'), timeout) {
		const method = `sendDiscovery[${this.name}]`;
		logger.debug('%s - start ----%s %s', method, this.name, this.endpoint.url);
		const self = this;

		if (this.connected === false) {
			throw Error(`Discovery Client ${this.name} ${this.endpoint.url} is not connected`);
		}

		let rto = self.options['request-timeout'];
		if (typeof timeout === 'number') {
			rto = timeout;
		}

		return new Promise((resolve, reject) => {
			const send_timeout = setTimeout(() => {
				clearTimeout(send_timeout);
				logger.error('%s - timed out after:%s', method, rto);
				return reject(new Error('REQUEST_TIMEOUT'));
			}, rto);

			self.discoveryService.discover(signedEnvelope, (err, response) => {
				clearTimeout(send_timeout);
				if (err) {
					logger.debug('%s - Received discovery response from: %s status: %s', method, self.endpoint.url, err);
					if (err instanceof Error) {
						err.peer = self.getCharacteristics();
						reject(err);
					} else {
						const return_error = new Error(err);
						return_error.connection = self.getCharacteristics();
						reject(return_error);
					}
				} else {
					if (response) {
						logger.debug('%s - Received discovery response from peer "%s"', method, self.endpoint.url);
						response.connection = self.getCharacteristics();
						resolve(response);
					} else {
						const return_error = new Error(`GRPC service failed to get a proper response from the peer ${self.endpoint.url}.`);
						return_error.connection = self.getCharacteristics();
						logger.error('%s - rejecting with:%s', method, return_error);
						reject(return_error);
					}
				}
			});
		});
	}

	async _processChaincode(q_chaincodes) {
		const method = '_processChaincode';
		logger.debug('%s - start', method);
		const endorsement_plans = [];
		let index;
		if (q_chaincodes && q_chaincodes.content) {
			if (Array.isArray(q_chaincodes.content)) {
				for (index in q_chaincodes.content) {
					const q_endors_desc = q_chaincodes.content[index];
					const endorsement_plan = {};
					endorsement_plan.chaincode = q_endors_desc.chaincode;
					endorsement_plans.push(endorsement_plan);

					// GROUPS
					endorsement_plan.groups = {};
					for (const group_name in q_endors_desc.endorsers_by_groups) {
						logger.debug('%s - found group: %s', method, group_name);
						const group = {};
						group.peers = await this._processPeers(q_endors_desc.endorsers_by_groups[group_name].peers);
						// all done with this group
						endorsement_plan.groups[group_name] = group;
					}

					// LAYOUTS
					endorsement_plan.layouts = [];
					for (index in q_endors_desc.layouts) {
						const q_layout = q_endors_desc.layouts[index];
						const layout = {};
						for (const group_name in q_layout.quantities_by_group) {
							layout[group_name] = q_layout.quantities_by_group[group_name];
						}
						logger.debug('%s - layout :%j', method, layout);
						endorsement_plan.layouts.push(layout);
					}
				}
			}
		}

		if (endorsement_plans.length === 1) {

			return endorsement_plans[0];
		} else {
			throw Error('Plan layouts are invalid');
		}
	}

	async _processConfig(q_config) {
		const method = `_processConfig[${this.name}]`;
		logger.debug('%s - start', method);
		const config = {};
		config.msps = {};
		config.orderers = {};

		try {
			if (q_config.msps) {
				for (const id in q_config.msps) {
					logger.debug('%s - found organization %s', method, id);
					const q_msp = q_config.msps[id];
					const msp_config = {
						id: id,
						name: id,
						organizational_unit_identifiers: q_msp.organizational_unit_identifiers,
						root_certs: common_utils.convertBytetoString(q_msp.root_certs),
						intermediate_certs: common_utils.convertBytetoString(q_msp.intermediate_certs),
						admins: common_utils.convertBytetoString(q_msp.admins),
						tls_root_certs: common_utils.convertBytetoString(q_msp.tls_root_certs),
						tls_intermediate_certs: common_utils.convertBytetoString(q_msp.tls_intermediate_certs)
					};
					config.msps[id] = msp_config;
					this.channel.addMSP(msp_config, true);
				}
			}
			/*
			"orderers":{"OrdererMSP":{"endpoint":[{"host":"orderer.example.com","port":7050}]}}}
			*/
			if (q_config.orderers) {
				for (const mspid in q_config.orderers) {
					logger.debug('%s - found orderer org: ', method, mspid);
					config.orderers[mspid] = {};
					config.orderers[mspid].endpoints = [];
					for (const endpoint of q_config.orderers[mspid].endpoint) {
						config.orderers[mspid].endpoints.push(endpoint);
					}
				}
				await this._buildOrderers(config.orderers, config.msps);
			}
		} catch (err) {
			logger.error('%s - Problem with discovery config: %s', method, err);
		}

		return config;
	}

	async _processMembership(q_members, msps = {}) {
		const method = `_processMembership[${this.name}]`;
		logger.debug('%s - start', method);
		const peers_by_org = {};
		if (q_members.peers_by_org) {
			for (const mspid in q_members.peers_by_org) {
				logger.debug('%s - found org:%s', method, mspid);
				peers_by_org[mspid] = {};
				peers_by_org[mspid].peers = await this._processPeers(q_members.peers_by_org[mspid].peers, msps[mspid]);
			}
		}
		return peers_by_org;
	}

	async _processPeers(q_peers, msp = {}) {
		const method = `_processPeers[${this.name}]`;
		const peers = [];
		for (const q_peer of q_peers) {
			const peer = {};
			// IDENTITY
			const q_identity = fabprotos.msp.SerializedIdentity.decode(q_peer.identity);
			peer.mspid = q_identity.mspid;

			// MEMBERSHIP
			const q_membership_message = fabprotos.gossip.GossipMessage.decode(q_peer.membership_info.payload);
			peer.endpoint = q_membership_message.alive_msg.membership.endpoint;
			peer.name = q_membership_message.alive_msg.membership.endpoint;
			logger.debug('%s - found peer :%s', method, peer.endpoint);

			// STATE
			if (q_peer.state_info) {
				const message_s = fabprotos.gossip.GossipMessage.decode(q_peer.state_info.payload);
				if (message_s && message_s.state_info && message_s.state_info.properties && message_s.state_info.properties.ledger_height) {
					peer.ledger_height = Long.fromValue(message_s.state_info.properties.ledger_height);
				} else {
					logger.debug('%s - did not find ledger_height', method);
					throw new Error('Malformed state_info');
				}
				logger.debug('%s - found ledger_height :%s', method, peer.ledger_height);
				peer.chaincodes = [];
				for (const index in message_s.state_info.properties.chaincodes) {
					const q_chaincode = message_s.state_info.properties.chaincodes[index];
					const chaincode = {};
					chaincode.name = q_chaincode.getName();
					chaincode.version = q_chaincode.getVersion();
					// TODO metadata ?
					logger.debug('%s - found chaincode :%j', method, chaincode);
					peer.chaincodes.push(chaincode);
				}
			}

			// all done with this peer
			peers.push(peer);
			// build the GRPC instance
			await this._buildPeer(peer, msp);
		}

		return peers;
	}

	async _buildOrderers(orderers, msps) {
		const method = `_buildOrderers[${this.name}]`;
		logger.debug('%s - start', method);

		for (const msp_id in orderers) {
			logger.debug('%s - orderer msp:%s', method, msp_id);
			for (const endpoint of orderers[msp_id].endpoints) {
				endpoint.name = this._buildOrderer(endpoint.host, endpoint.port, msp_id, msps[msp_id]);
			}
		}
	}

	async _buildOrderer(host, port, msp_id, msp) {
		const method = `_buildOrderer[${this.name}]`;
		logger.debug('%s - start mspid:%s endpoint:%s:%s', method, msp_id, host, port);

		const address = `${host}:${port}`;
		const found = this.channel.getOrderer(address);
		if (found) {
			logger.debug('%s - orderer is already added to the channel - %s', method, address);
			return found.name;
		}

		const url = this._buildUrl(host, port);
		if (msp_id && msp) {
			logger.debug('%s - create a new orderer %s', method, url);
			const orderer = this.client.getOrderer(address, msp_id);
			this.channel.addOrderer(orderer);
			const end_point = this.client.newEndpoint(this._buildOptions(address, url, host, msp));
			try {
				await orderer.connect(end_point);
			} catch (error) {
				logger.error('%s - Unable to connect to the discovered orderer %s due to %s', method, address, error);
			}
		} else {
			throw new Error('No TLS cert information available');
		}

		return address;
	}

	async _buildPeer(discovery_peer, msp) {
		const method = `_buildPeer[${this.name}]`;
		logger.debug('%s - start', method);

		const address = discovery_peer.endpoint;
		const msp_id = discovery_peer.mspid;

		const found = this.channel.getPeer(address); // address is used as name
		if (found) {
			logger.debug('%s - peer is already added to the channel - %s', method, address);
			return;
		}
		logger.debug('%s - did not find peer %s', method, address);
		const host_port = address.split(':');
		const url = this._buildUrl(host_port[0], host_port[1]);
		if (msp_id && msp) {
			logger.debug('%s - create a new peer %s', method, url);
			const peer = this.client.getPeer(discovery_peer.name, msp_id);
			this.channel.addPeer(peer);
			const end_point = this.client.newEndpoint(this._buildOptions(address, url, host_port[0], msp));
			try {
				logger.debug('%s - about to connect to peer %s url:%s', method, address, url);
				await peer.connect(end_point);
				logger.debug('%s - connected to peer %s url:%s', method, address, url);
			} catch (error) {
				logger.error('%s - Unable to connect to the discovered peer %s due to %s', method, address, error);
			}
		} else {
			throw new Error(`No TLS cert information available for peer ${address}`);
		}

		return;
	}

	_buildUrl(hostname, port) {
		const method = `_buildUrl[${this.name}]`;
		logger.debug('%s - start', method);

		let t_hostname = hostname;
		// endpoints may be running in containers on the local system
		if (this.as_localhost) {
			t_hostname = 'localhost';
		}

		// If we connect to the discovery peer over TLS, any peers returned by
		// discovery should also use TLS. If we connect to the discovery peer
		// without TLS, then any peers returned by discovery should not use TLS.
		// A mixed set of TLS and non-TLS peers is unlikely but possible via the
		// override.
		let protocol = this.isTLS() ? 'grpcs' : 'grpc';
		const overrideProtocol = this.client.getConfigSetting('discovery-override-protocol');
		if (overrideProtocol) {
			protocol = overrideProtocol;
		}
		return `${protocol}://${t_hostname}:${port}`;
	}

	_buildOptions(name, url, host, msp = {}) {
		const method = `_buildOptions[${this.name}]`;
		logger.debug('%s - start', method);
		const caroots = this._buildTlsRootCerts(msp);
		const opts = {
			url: url,
			pem: caroots,
			'ssl-target-name-override': host,
			name: name
		};

		return opts;
	}

	_buildTlsRootCerts(msp = {}) {
		const method = `_buildTlsRootCerts[${this.name}]`;
		logger.debug('%s - start', method);
		let caroots = '';
		if (msp.tls_root_certs) {
			caroots = caroots + msp.tls_root_certs;
		}
		if (msp.tls_intermediate_certs) {
			caroots = caroots + msp.tls_intermediate_certs;
		}

		return caroots;
	}

	/**
	 * Will return a {@link ChannelEventHub} instance that has been connected
	 * with the Peer's event service. The event hub is ready to start
	 * listening for events on the channel's ledger.
	 * The name provided must be a Peer that has been discovered by this
	 * discovery service.
	 * This service will use the discovered peer's connection information
	 * to connect to the peer's event service.
	 * @param {string} name - The name of a discovered peer in the
	 *  form 'hostname:port'.
	 * @param {object} [options] - Optional. Unique connection options
	 */
	async newChannelEventHub(name = checkParameter('name'), options) {
		const method = `getChannelEventHub[${this.name}]`;
		logger.debug('%s - start', method);
		const peer = this.peers.get(name);
		if (peer) {
			const hub = this.client.newChannelEventHub(name);
			try {
				logger.debug('%s - will try to connect to peer event service for %s', method, name);
				await hub.connect(peer.endpoint, options);
				return hub;
			} catch (error) {
				logger.error('%s - Unable to connect to the Peer event service %s', method, error);
				throw error;
			}
		} else {
			throw Error(`Peer not found with name ${name}`);
		}
	}

	/**
	 * Close the connection of the discovery service.
	 */
	disconnect() {
		const method = `disconnect[${this.name}]`;
		logger.debug('%s - start', method);

		if (this.discoveryService) {
			logger.debug('%s - closing peer discovery connection %s', method, this.endpoint.addr);
			this.discoveryService.close();
			this.discoveryService = null;
		}
	}
}

module.exports = ChannelDiscovery;
