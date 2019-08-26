/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';
const TYPE = 'Proposal';

const settle = require('promise-settle');

const {Utils: utils} = require('fabric-common');
const logger = utils.getLogger(TYPE);

const fabprotos = require('fabric-protos');

const {buildHeader, checkParameter} = require('./Utils.js');
const IdentityContext = require('./IdentityContext.js');
const ServiceAction = require('./ServiceAction.js');

/**
 * @classdesc
 * This is an abstract class represents a Proposal definition and the
 * base for actions on a proposal.
 * This class allows an application to contain all proposal attributes and
 * artifacts in one place during runtime. Use the {@link Endorsement}
 * {@link Query} and {@link Commit} to endorse, query,
 * and to commit a proposal.
 *
 * @class
 */
class Proposal extends ServiceAction {
	/**
	 * Construct a Proposal object.
	 *
	 * @param {string} chaincodeName - The chaincode this proposal will execute
	 * @param {Channel} channel - The channel of this proposal
	 * @returns {Proposal} The Proposal instance.
	 */
	constructor(chaincodeName = checkParameter('chaincodeName'), channel = checkParameter('channel')) {
		super();
		logger.debug(`${TYPE}.constructor[${chaincodeName}] - start `);
		this.type = TYPE;

		this.chaincodeName = chaincodeName;
		this.channel = channel;
		this.collections_interest = [];
		this.chaincodes_collections_interest = [];
		this._proposal = null;
		this._transactionId = null;
	}

	/**
	 * Returns the transaction ID used for the proposal
	 *
	 * @returns {string} The transaction ID of the proposal
	 */
	getTransactionId() {
		const method = `getTransactionId[${this.chaincodeName}]`;
		logger.debug('%s - start', method);
		if (!this._proposal && !this._proposal.transactionId) {
			throw Error('The proposal has not been built');
		}

		return this._proposal.transactionId;
	}

	/**
	 * Returns a JSON object representing this proposals chaincodes
	 * and collections as an interest for the Discovery Service.
	 * The {@link Discovery} will use the interest to build a query
	 * request for an endorsement plan to a Peer's Discovery service.
	 * Use the {@link Proposal#addCollectionInterest} to add collections
	 * for the chaincode of this proposal.
	 * Use the {@link Proposal#addChaincodeCollectionInterest} to add
	 * chaincodes and collections that this chaincode code will call.
	 * @example
	 *    [
	 *      { name: "mychaincode", collection_names: ["mycollection"] }
	 *    ]
	 */
	buildProposalInterest() {
		const method = `buildProposalInterest[${this.chaincodeName}]`;
		logger.debug('%s - start', method);

		let interest = [];
		const chaincode = {};
		interest.push(chaincode);
		chaincode.name = this.chaincodeName;
		if (this.collections_interest.length > 0) {
			chaincode.collection_names = this.collections_interest;
		}
		if (this.chaincodes_collections_interest.length > 0) {
			interest = interest.concat(this.chaincodes_collections_interest);
		}

		return interest;
	}

	/**
	 * Use this method to add collection names associated
	 * with this proposal's chaincode name. These will be
	 * used to build a Discovery interest. {@link Proposal#buildProposalInterest}
	 * @param {string} collection_name - collection name
	 */
	addCollectionInterest(collection_name) {
		const method = `addCollectionInterest[${this.chaincodeName}]`;
		logger.debug('%s - start', method);
		if (typeof collection_name === 'string') {
			this.collections_interest.push(collection_name);
		} else {
			throw Error('Invalid collection_name parameter');
		}
	}

	/**
	 * Use this method to add a chaincode name and collection names
	 * that this proposal's chaincode will call. These will be used
	 * to build a Discovery interest. {@link Proposal#buildProposalInterest}
	 * @param {string} chaincode_name - chaincode name
	 * @param  {...string} collection_names - one or more collection names
	 */
	addChaincodeCollectionsInterest(chaincode_name, ...collection_names) {
		const method = `addChaincodeCollectionsInterest[${this.chaincodeName}]`;
		logger.debug('%s - start', method);
		if (typeof chaincode_name === 'string') {
			const added_chaincode = {};
			added_chaincode.name = chaincode_name;
			if (collection_names) {
				added_chaincode.collection_names = collection_names;
			}
			this.chaincodes_collections_interest.push(added_chaincode);
		} else {
			throw Error('Invald chaincode_name parameter');
		}
	}
	/**
	 * @typedef {Object} BuildProposalRequest
	 * @property {string} [fcn] - Optional. The function name. May be used by
	 * the chaincode to control the flow within the chaincode. Default 'invoke'
	 * @property {string[]} [args] - Optional. The arguments needed by the
	 * chaincode execution. These should be strings or byte buffers.
	 * These will be converted into byte buffers before building the protobuf
	 * object to be sent to the fabric peer for endorsement.
	 * @property {Map} [transientMap] - Optional. A map with the key value pairs
	 * of the transient data.
	 * @property {boolean} [init] - Optional. If this proposal should be an
	 * chaincode initialization request. This will set the init setting in the
	 * protobuf object sent to the peer.
	 */

	/**
	 * Use this method to build a proposal. The proposal will be stored
	 * internally and also returned as bytes. Use the bytes when signing
	 * the proposal externally. When signing the proposal externally the
	 * user object of the IdentityContext does not have to have
	 * a signing identity, only an identity that has the user's certificate is
	 * required. This identity will be used to build
	 * the protobuf objects of the proposal that must be signed later and sent
	 * to the fabric Peer for endorsement.
	 *
	 * @param {IdentityContext} idContext - Contains the {@link User} object
	 * needed to build this proposal.
	 * @param {BuildProposalRequest} request - The proposals values of the request.
	 */
	build(idContext = checkParameter('idContext'), request) {
		const method = `build[${this.chaincodeName}][${this.type}]`;
		logger.debug('%s - start - %s', method);

		const {fcn,  args = [], transientMap, init} = request;

		if (!Array.isArray(args)) {
			throw Error('Proposal parameter "args" must be an array.');
		}

		if (transientMap) {
			this._proposal.transientMap = transientMap;
		}
		if (typeof init === 'boolean') {
			this._proposal.init = init;
		}

		this._proposal.transactionId = idContext.newTransactionId();
		this._proposal.nonce = idContext.newNonce();

		this._proposal.args = [];
		if (fcn) {
			this._proposal.fcn = fcn;
			this._proposal.args.push(Buffer.from(this._proposal.fcn, 'utf8'));
			logger.debug('%s - adding function arg:%s', method, this._proposal.fcn);
		} else {
			logger.debug('%s - not adding a function arg:%s', method);
		}

		for (let i = 0; i < args.length; i++) {
			logger.debug('%s - adding arg %s', method, args[i]);
			if (typeof args[i] === 'string') {
				this._proposal.args.push(Buffer.from(args[i], 'utf8'));
			} else {
				this._proposal.args.push(args[i]);
			}
		}

		logger.debug('%s - chaincode ID:%s', method, this._proposal.chaincodeName);
		const chaincodeSpec = new fabprotos.protos.ChaincodeSpec();
		chaincodeSpec.setType(fabprotos.protos.ChaincodeSpec.Type.GOLANG);
		const chaincode_id = new fabprotos.protos.ChaincodeID();
		chaincode_id.setName(this.chaincodeName);
		chaincodeSpec.setChaincodeId(chaincode_id);
		const input = new fabprotos.protos.ChaincodeInput();
		input.setArgs(this._proposal.args);
		if (this._proposal.init) {
			input.setIsInit(true);
		}
		chaincodeSpec.setInput(input);

		const channelHeader = this.channel.buildChannelHeader(
			fabprotos.common.HeaderType.ENDORSER_TRANSACTION,
			this.chaincodeName,
			this._proposal.transactionId
		);

		this._proposal.header = buildHeader(this._proposal.nonce, channelHeader);

		// construct the ChaincodeInvocationSpec
		const cciSpec = new fabprotos.protos.ChaincodeInvocationSpec();
		cciSpec.setChaincodeSpec(chaincodeSpec);

		const cc_payload = new fabprotos.protos.ChaincodeProposalPayload();
		cc_payload.setInput(cciSpec.toBuffer());

		if (this._proposal.transientMap) {
			cc_payload.setTransientMap(this._proposal.transientMap);
		}

		this._proposal.proposal = new fabprotos.protos.Proposal();
		this._proposal.proposal.setHeader(this._proposal.header.toBuffer());
		this._proposal.proposal.setPayload(cc_payload.toBuffer());

		this._payload = this._proposal.proposal.toBuffer();
		return this._payload;
	}

	/**
	 * @typedef {Object} SendRequest
	 * @property {Peer[]} [targets] - Optional. The peers to send the proposal.
	 * @property {Number} [request_timeout] - Optional. The request timeout
	 */

	/**
	 * @typedef {Object} ProposalResponse
	 * @property {Error[]} errors -  errors returned from the endorsement
	 * @property {Response[]} responses - endorsements returned from the endorsement
	 */

	/**
	 * Send a signed transaction proposal to peer(s)
	 *
	 * @param {SendRequest} request options
	 * @returns {ProposalResponse} The results of sending
	 */
	async send(request) {
		const method = `send[${this.chaincodeName}]`;
		logger.debug('%s - start', method);
		const {handler, targets, request_timeout} = request;
		const signed_envelope = this.getSignedProposalEnvelope();
		this._proposalResponses = [];
		this._proposalErrors = [];

		if (handler) {
			const results = await handler.endorse(request, signed_envelope);
			logger.debug('%s - have results from handler', method);
			results.forEach((result) => {
				if (result instanceof Error) {
					logger.debug('%s - result is an error: %s', method, result);
					this._proposalErrors.push(result);
				} else {
					logger.debug('%s - result is endorsed', method);
					this._proposalResponses.push(result);
				}
			});
		} else if (targets) {
			logger.debug('%s - have targets', method);
			const peers = this.channel.getTargetPeers(targets);
			const promises = peers.map(async (peer) => {
				return peer.sendProposal(signed_envelope, request_timeout);
			});

			logger.debug('%s - about to send to all peers', method);
			const results = await settle(promises);
			logger.debug('%s - have results from peers', method);
			results.forEach((result) => {
				if (result.isFulfilled()) {
					logger.debug('%s - Promise is fulfilled: %s', method, result.value());
					this._proposalResponses.push(result.value());
				} else {
					logger.debug('%s - Promise is rejected: %s', method, result.reason());
					this._proposalErrors.push(result.reason());
				}
			});
		} else {
			// need to have a handler or targets defined to have a proposal endorsed
			logger.error('%s - no targets or handler', method);
			throw Error('Missing handler and targets parameters');
		}

		const return_results =  {
			errors: this._proposalErrors.length > 0 ? this._proposalErrors : null,
			responses: this._proposalResponses.length > 0 ? this._proposalResponses : null
		};

		if (this.type === 'Query') {
			this._proposalResponses.forEach((response) => {
				if (response.response && response.response.payload && response.response.status === 200) {
					logger.debug('%s - good status', method);
					this._queryResults.push(response.response.payload);
				} else {
					logger.error('%s - unknown or missing results in query', method);
					this._queryResults.push(response);
				}
			});
			return_results.queryResults = this._queryResults.length > 0 ? this._query.queryResults : null;
		}

		return return_results;
	}

	/**
	 * Utility method to verify a single proposal response. It checks the
	 * following aspects:
	 * <li>The endorser's identity belongs to a legitimate MSP of the channel
	 *     and can be successfully deserialized
	 * <li>The endorsement signature can be successfully verified with the
	 *     endorser's identity certificate
	 * <br><br>
	 * This method requires that the initialize method of this channel object
	 * has been called to load this channel's MSPs. The MSPs will have the
	 * trusted root certificates for this channel.
	 *
	 * @param {ProposalResponse} proposal_response - The endorsement response
	 * from the peer,
	 * includes the endorser certificate and signature over the
	 * proposal + endorsement result + endorser certificate.
	 * @returns {boolean} A boolean value of true when both the identity and
	 * the signature are valid, false otherwise.
	 */
	async verifyProposalResponse(proposal_response) {
		const method = `verifyProposalResponse[${this.chaincodeName}]`;
		logger.debug('%s - start', method);

		if (!proposal_response) {
			throw new Error('Missing proposal response');
		}
		if (proposal_response instanceof Error) {

			return false;
		}
		if (!proposal_response.endorsement) {
			throw new Error('Parameter must be a ProposalResponse Object');
		}

		const endorsement = proposal_response.endorsement;
		let identity;

		const sid = fabprotos.msp.SerializedIdentity.decode(endorsement.endorser);
		const mspid = sid.getMspid();
		logger.debug('%s - found mspid %s', method, mspid);
		const msp = this._msp_manager.getMSP(mspid);

		if (!msp) {
			throw new Error(`Failed to locate an MSP instance matching the endorser identity\'s organization  ${mspid}`);
		}
		logger.debug('%s - found endorser\'s MSP', method);

		try {
			identity = await msp.deserializeIdentity(endorsement.endorser, false);
			if (!identity) {
				throw new Error('Unable to find the endorser identity');
			}
		} catch (error) {
			logger.error('%s - getting endorser identity failed with: ', method, error);

			return false;
		}

		try {
			// see if the identity is trusted
			if (!identity.isValid()) {
				logger.error('Endorser identity is not valid');

				return false;
			}
			logger.debug('%s - have a valid identity', method);

			// check the signature against the endorser and payload hash
			const digest = Buffer.concat([proposal_response.payload, endorsement.endorser]);
			if (!identity.verify(digest, endorsement.signature)) {
				logger.error('%s - Proposal signature is not valid', method);

				return false;
			}
		} catch (error) {
			logger.error('%s - verify failed with: ', method, error);

			return false;
		}

		logger.debug('%s - This endorsement has both a valid identity and valid signature', method);

		return true;
	}

	/**
	 * Utility method to examine a set of proposals to check they contain
	 * the same endorsement result write sets.
	 * This will validate that the endorsing peers all agree on the result
	 * of the chaincode execution.
	 *
	 * @param {ProposalResponse[]} proposal_responses - The proposal responses
	 * from all endorsing peers
	 * @returns {boolean} True when all proposals compare equally, false otherwise.
	 */
	compareProposalResponseResults(proposal_responses) {
		const method = `compareProposalResponseResults[${this.chaincodeName}]`;
		logger.debug('%s - start', method);

		if (!Array.isArray(proposal_responses)) {
			throw new Error('proposal_responses must be an array but was ' + typeof proposal_responses);
		}
		if (proposal_responses.length === 0) {
			throw new Error('proposal_responses is empty');
		}

		if (proposal_responses.some((response) => response instanceof Error)) {

			return false;
		}

		const first_one = this._getProposalResponseResults(proposal_responses[0]);
		for (let i = 1; i < proposal_responses.length; i++) {
			const next_one = this._getProposalResponseResults(proposal_responses[i]);
			if (next_one.equals(first_one)) {
				logger.debug('%s - read/writes result sets match index=%s', method, i);
			} else {
				logger.error('%s - read/writes result sets do not match index=%s', method, i);
				return false;
			}
		}

		return true;
	}

	/**
	 * return a printable representation of this object
	 */
	toString() {

		return `Proposal: {chaincodeName: ${this.chaincodeName}, channel: ${this.channel.name}`;
	}
};

module.exports = Proposal;
