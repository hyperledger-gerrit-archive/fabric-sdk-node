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
const Channel = require('./Channel.js');
const TransactionContext = require('./TransactionContext.js');

/**
 * @classdesc
 * This class represents a Proposal definition.
 * <br><br>
 * see the tutorial {@tutorial proposal}
 * <br><br>
 * This class allows an application to contain all proposal attributes and
 * artifacts in one place during runtime. Use this class to endorse, commit,
 * and to query.
 *
 * @class
 */
const Proposal = class {

	/**
	 * Construct a Proposal object.
	 *
	 * @param {string} chaincodeName - The chaincode this proposal will execute
	 * @param {Channel} channel - The channel of this proposal
	 * @returns {Proposal} The Proposal instance.
	 */
	constructor(chaincodeName = checkParameter('chaincodeName'), channel = checkParameter('channel')) {
		logger.debug('Proposal.const');
		this.type = TYPE;

		this.chaincodeName = chaincodeName;
		this.channel = channel;

		this._endorsement = null;
		this._commit = null;
		this._query = null;

		this.collections_interest = [];
		this.chaincodes_collections_interest = [];
	}

	/**
	 * Returns the transaction ID used for the endorsement
	 * 
	 * @returns {string} The transaction ID of the proposal that was used
	 *  for the endorsement.
	 */
	getEndorsementTransactionId() {
		if (!this._endorsement || !this._endorsement.proposal) {
			throw Error('The endorsement proposal is not built');
		}
		
		return this._endorsement.txId;
	}

	/**
	 * Returns a JSON object representing this proposals chaincodes
	 * and collections as an interest for the Discovery Service.
	 * The {@link ChannelDiscovery} will use the interest to build a query
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
		const method = 'getProposalInterest';
		logger.debug('%s - start', method);

		const interest = [];
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
	 * with this porposal's chaincode name. These will be
	 * used to build a Discovery interest. {@link Proposal#buildProposalInterest}
	 * @param {string} collection_name 
	 */
	addCollectionInterest(collection_name) {
		if (typeof collection_name === 'string') {
			this.collections_interest.push(collection_name);
		} else {
			throw Error('Invalid collection_name parameter');
		}
	}

	/**
	 * Use this method to add a chaincode name and collections names
	 * that this proposal's chaincode will call. These will be used
	 * to build a Discovery interest. {@link Proposal#buildProposalInterest}
	 * @param {string} chaincode_name 
	 * @param  {...string} collection_names 
	 */
	addChaincodeCollectionsInterest(chaincode_name, ...collection_names) {
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
	 * user object of the TransactionContext does not have to have
	 * a signing identity, only an identity that has the user's certificate is
	 * required. This identity will be used to build
	 * the protobuf objects of the proposal that must be signed later and sent
	 * to the fabric Peer for endorsement.
	 * 
	 * @param {TransactionContext} txContext - Contains the {@link User} object
	 * needed to build this proposal.
	 * @param {BuildProposalRequest} request - The proposals values of the request.
	 */
	buildProposal(txContext = checkParameter('txContext'), request) {
		this._endorsement = {};
		this._endorsement.type = 'endorsement';

		return this._buildProposal(txContext, request, this._endorsement);
	}

	/*
	 * internal method to build proposal for both an endorsement and query
	 */
	_buildProposal(txContext, request, proposal) {
		const method = 'buildProposal';
		logger.debug('%s - start - %s', method, proposal.type);
	
		const {fcn,  args = [], transientMap, init} = request;
		if (fcn) {
			proposal.fcn = fcn;
		}
		if (transientMap) {
			proposal.transientMap = transientMap;
		}
		if (typeof init === 'boolean') {
			proposal.init = init;
		}

		txContext.calculateTxId();
		proposal.args = [];
		proposal.args.push(Buffer.from(proposal.fcn, 'utf8'));
		logger.debug('%s - adding function arg:%s', method, proposal.fcn);
	
		for (let i = 0; i < args.length; i++) {
			logger.debug('%s - adding arg %s', method, args[i]);
			if (typeof args[i] === 'string') {
				proposal.args.push(Buffer.from(args[i], 'utf8'));
			} else {
				proposal.args.push(args[i]);
			}
		}
	
		logger.debug('%s - chaincode ID:%s', method, proposal.chaincodeName);
		const chaincodeSpec = new fabprotos.protos.ChaincodeSpec();
		chaincodeSpec.setType(fabprotos.protos.ChaincodeSpec.Type.GOLANG);
		const chaincode_id = new fabprotos.protos.ChaincodeID();
		chaincode_id.setName(this.chaincodeName);
		chaincodeSpec.setChaincodeId(chaincode_id);
		const input = new fabprotos.protos.ChaincodeInput();
		input.setArgs(proposal.args);
		if (proposal.init) {
			input.setIsInit(true);
		}
		chaincodeSpec.setInput(input);
	
		const channelHeader = this.channel.buildChannelHeader(
			fabprotos.common.HeaderType.ENDORSER_TRANSACTION,
			this.chaincodeName,
			txContext.txId
		);
		
		proposal.header = buildHeader(txContext, channelHeader);
		
		// construct the ChaincodeInvocationSpec
		const cciSpec = new fabprotos.protos.ChaincodeInvocationSpec();
		cciSpec.setChaincodeSpec(chaincodeSpec);

		const cc_payload = new fabprotos.protos.ChaincodeProposalPayload();
		cc_payload.setInput(cciSpec.toBuffer());

		if (proposal.transientMap) {
			cc_payload.setTransientMap(proposal.transientMap);
		}

		proposal.txId = txContext.txId;
		proposal.proposal = new fabprotos.protos.Proposal();
		proposal.proposal.setHeader(proposal.header.toBuffer());
		proposal.proposal.setPayload(cc_payload.toBuffer());
		
		return proposal.proposal.toBuffer();
	}

	/**
	 * Use this method with a TransactionContext that contains a User that has
	 * a Signing Identity.
	 * OR
	 * Use this method with a byte[] to set the signature
	 * when the application has done the signing outside of
	 * this object.
	 * Use the results of the {@link Proposal#buildProposal}
	 * as the bytes that will be signed.
	 * @param {TransactionContext | byte[]} param - When 'param' is a
	 * {@link TransactionContext} the signing identity of the user
	 *  will sign the current proposal bytes as generated by {@link Proposal#buildProposal}.
	 *  When the 'param' is a byte[], the bytes will be used as the final
	 *  proposal signature.
	 */
	signProposal(param = checkParameter('param')) {
		if (!this._endorsement || !this._endorsement.proposal) {
			throw Error('The endorsement proposal is not built');
		}
		if ( param.type = TransactionContext.TYPE) {
			const txContext = param;
			const signer = txContext.user.getSigningIdentity();
			this._endorsement.signature = Buffer.from(signer.sign(this._endorsement.proposal.toBuffer()));
		} else if (param instanceof Buffer) {
			this._endorsement.signature = param;
		} else {
			throw Error('Parameter is an unknown proposal signature type');
		}

		return this;
	}

	/**
	 * Returns a signed envelope from the signature and the built proposal as
	 * bytes
	 * 
	 * This method is not intended for use by an application. It will be used
	 * internally by {@link Proposal#endorse} during endorsement processing.
	 * @returns {object} An object with the signature and the proposal bytes
	 *  ready to send to the Peer.
	 */
	getSignedProposalEnvelope() {
		if (!this._endorsement || !this._endorsement.proposal) {
			throw Error('The endorsement proposal is not built');
		}
		if (!this._endorsement || !this._endorsement.signature) {
			throw Error('The endorsement proposal is not signed');
		}

		const signed_envelope = {signature: this._endorsement.signature, proposal_bytes: this._endorsement.proposal.toBuffer()};

		return signed_envelope;
	}

	/**
	 * @typedef {Object} EndorseRequest
	 * @property {Peer[]} [targets] - Optional. The peers to send the proposal.
	 * @property {Number} [request_timeout] - Optional. The request timeout
	 */

	/**
	 * @typedef {Object} EndorseResponse
	 * @property {Error[]} errors -  errors returned from the endorsement
	 * @property {ProposalResponse} response - endorsements returned from the endorsement
	 */

	/**
	 * Send a signed transaction proposal to peer(s)
	 *
	 * @param {EndorseRequest} request
	 * @returns {EndorseResponse}
	 */
	async endorse(request) {
		const method = 'endorse';
		const {handler, targets, request_timeout} = request;
		const signed_envelope = this.getSignedProposalEnvelope();
		this._endorsement.proposalResponses = [];
		this._endorsement.proposalErrors = [];

		if (handler) {
			const results = await handler.endorse(request, signed_envelope);
			logger.debug('%s - have results from handler', method);
			results.forEach((result) => {
				if (result instanceof Error) {
					logger.debug('%s - result is an error: %s', method, result);
					this._endorsement.proposalErrors.push(result);
				} else {
					logger.debug('%s - result is endorsed', method);
					this._endorsement.proposalResponses.push(result);
				}
			});
		} else if (targets) {
			logger.debug('%s - have targets', method);
			const peers = this.channel._getTargetPeers(targets, Channel.ENDORSING_PEER_ROLE);
			const promises = peers.map(async (peer) => {
				return peer.sendProposal(signed_envelope, request_timeout);
			});

			logger.debug('%s - about to send to all peers', method);
			const results = await settle(promises);
			logger.debug('%s - have results from peers', method);
			results.forEach((result) => {
				if (result.isFulfilled()) {
					logger.debug('%s - Promise is fulfilled: %s', method, result.value());
					this._endorsement.proposalResponses.push(result.value());
				} else {
					logger.debug('%s - Promise is rejected: %s', method, result.reason());
					this._endorsement.proposalErrors.push(result.reason());
				}
			});
		} else {
			// need to have a handler or targets defined to have a proposal endorsed
			logger.error('%s - no targets or handler', method);
			throw Error('Missing handler and targets parameters');
		}

		const return_results =  {
			errors: this._endorsement.proposalErrors.length > 0 ? this._endorsement.proposalErrors : null,
			responses: this._endorsement.proposalResponses.length > 0 ? this._endorsement.proposalResponses : null
		};

		return return_results;
	}

	/**
	 * This method is used to build the protobuf objects of the commit.
	 * The commit must next be signed before being sent to be committed.
	 * The {@link Proposal#buildAndSignCommit} method should be used if the
	 * signing will be done by the application's user.
	 * 
	 * @returns {byte[]} The commits payload bytes that need to be
	 *  signed.
	 */
	buildCommit() {
		const method = 'buildCommit';
		logger.debug('%s - start', method);
		if (!this._endorsement && !this._endorsement.proposalResponses) {
			throw Error('Proposal is not endorsed');
		}

		const endorsements = [];
		for (const proposalResponse of this._endorsement.proposalResponses) {
			if (proposalResponse && proposalResponse.response && proposalResponse.response.status === 200) {
				endorsements.push(proposalResponse.endorsement);
			}
		}

		if (endorsements.length < 1) {
			logger.error('%s - no valid endorsements found', method);
			throw new Error('no valid endorsements found');
		}
		const proposalResponse = this._endorsement.proposalResponses[0];

		const chaincodeEndorsedAction = new fabprotos.protos.ChaincodeEndorsedAction();
		chaincodeEndorsedAction.setProposalResponsePayload(proposalResponse.payload);
		chaincodeEndorsedAction.setEndorsements(endorsements);

		const chaincodeActionPayload = new fabprotos.protos.ChaincodeActionPayload();
		chaincodeActionPayload.setAction(chaincodeEndorsedAction);

		// the TransientMap field inside the original proposal payload is only meant for the
		// endorsers to use from inside the chaincode. This must be taken out before sending
		// to the orderer, otherwise the transaction will be rejected by the validators when
		// it compares the proposal hash calculated by the endorsers and returned in the
		// proposal response, which was calculated without the TransientMap
		const originalChaincodeProposalPayload = fabprotos.protos.ChaincodeProposalPayload.decode(this._endorsement.proposal.getPayload());
		const chaincodeProposalPayloadNoTrans = new fabprotos.protos.ChaincodeProposalPayload();
		chaincodeProposalPayloadNoTrans.setInput(originalChaincodeProposalPayload.input); // only set the input field, skipping the TransientMap
		chaincodeActionPayload.setChaincodeProposalPayload(chaincodeProposalPayloadNoTrans.toBuffer());

		const transactionAction = new fabprotos.protos.TransactionAction();
		transactionAction.setHeader(this._endorsement.header.getSignatureHeader());
		transactionAction.setPayload(chaincodeActionPayload.toBuffer());

		const actions = [];
		actions.push(transactionAction);

		const transaction = new fabprotos.protos.Transaction();
		transaction.setActions(actions);

		this._commit = {};
		this._commit.payload = new fabprotos.common.Payload();
		this._commit.payload.setHeader(this._endorsement.header);
		this._commit.payload.setData(transaction.toBuffer());

		return this._commit.payload.toBuffer();
	}

	/**
	 * Use this method with a TransactionContext that contains a User that has
	 * a Signing Identity.
	 * OR
	 * Use this method with a byte[] to set the signature
	 * when the application has done the signed the commit externally.
	 * Use the results of the {@link Proposal#buildCommit}
	 * as the bytes that will be signed.
	 * @param {TransactionContext | byte[]} param - When 'param' is a
	 * {@link TransactionContext} the signing identity of the user
	 *  will sign the current commit bytes as generated by {@link Proposal#buildCommit}.
	 *  When the 'param' is a byte[], the bytes will be used as the final
	 *  commit signature.
	 */
	signCommit(param = checkParameter('param')) {
		if (!this._commit || !this._commit.payload) {
			throw Error('The commit is not built')
		}
		if (param.type === TransactionContext.TYPE) {
			const txContext = param;
			const signer = txContext.user.getSigningIdentity();
			this._commit.signature = Buffer.from(signer.sign(this._commit.payload.toBuffer()));
		} else if (param instanceof Buffer) {
			this._commit.signature = param;
		} else {
			throw Error('Parameter is an unknown commit signature type');
		}

		return this;
	}

	/**
	 * return a signed envelope from the signature and the commit as bytes
	 * 
	 * This method is not intended for use by an application. It will be used
	 * by the {@link Proposal#commit} during commit processing.
	 * @returns {object} An object with the signature and the commit bytes
	 */
	getSignedCommitEnvelope() {
		if (!this._commit || !this._commit.signature) {
			throw Error('This commit request is not signed');
		}
		if (!this._commit || !this._commit.payload) {
			throw Error('This proposal is not built');
		}
		const signed_envelope = {signature: this._commit.signature, payload: this._commit.payload.toBuffer()};

		return signed_envelope;
	}

	/**
	 * Send the proposal responses that contain the endorsements of a transaction proposal
	 * to an orderer for further processing. This is the 2nd phase of the transaction
	 * lifecycle in the fabric. The orderer will globally order the transactions in the
	 * context of this channel and deliver the resulting blocks to the committing peers for
	 * validation against the chaincode's endorsement policy. When the committing peers
	 * successfully validate the transactions, it will mark the transaction as valid inside
	 * the block. After all transactions in a block have been validated, and marked either as
	 * valid or invalid (with a [reason code]{@link https://github.com/hyperledger/fabric/blob/v1.0.0/protos/peer/transaction.proto#L125}),
	 * the block will be appended (committed) to the channel's ledger on the peer.
	 * <br><br>
	 * This method will use the proposal responses returned from the {@link Proposal#endorse} along
	 * with the proposal that was sent for endorsement.
	 *
	 * @param {CommitRequest} request - {@link CommitRequest}
	 * @returns commit results
	 */
	async commit(request = {}) {
		const method = 'commit';
		logger.debug('%s - start', method);

		const {handler, targets, request_timeout} = request;

		const envelope = this.getSignedCommitEnvelope();

		if (handler) {
			logger.debug('%s - calling the handler');
			const result = await request.handler.commit(request, envelope);
			return result;
		} else if (targets) {
			logger.debug('%s - sending to the targets');
			const orderers = this.channel._getTargetOrderers(targets);
			let bad_result = {};
			bad_result.status = 'UNKNOWN';
			for (const orderer of orderers) {
				const result = await orderer.sendBroadcast(envelope, request_timeout);
				if (result.status === 'SUCCESS') {

					return result;
				} else {
					bad_result = result;
				}
			}

			return bad_result;
		} else {
			throw Error('Missing targets parameter');
		}
	}

	/**
	 * @typedef {Object} BuildQueryRequest
	 * @property {string} [fcn] - Optional. The function name. May be used by
	 * the chaincode to control the flow within the chaincode. Default 'invoke'
	 * @property {string[]} [args] - Optional. The arguments needed by the
	 * chaincode execution. These should be strings or byte buffers.
	 * These will be converted into byte buffers before building the protobuf
	 * object to be sent to the fabric peer for endorsement.
	 */

	/**
	 * Use this method to build a query. The query will be stored
	 * internally and also returned as bytes. Use the bytes when signing
	 * the query externally. When signing the query externally the
	 * user object of the TransactionContext does not have to have
	 * a signing identity, only an identity that has the user's certificate is
	 * required. This identity will be used to build
	 * the protobuf objects of the query that must be signed later and sent
	 * to the fabric Peer.
	 * 
	 * @param {TransactionContext} txContext - Contains the {@link User} object
	 * needed to build this query.
	 * @param {BuildQueryRequest} request - The query values of the request.
	 */
	buildQuery(txContext, request) {
		this._query = {};
		this._query.type = 'query';
		this._buildProposal(txContext, request, this._query);

		return this._query.proposal.toBuffer();
	}

	/**
	 * Use this method with a TransactionContext that contains a User that has
	 * a Signing Identity.
	 * OR
	 * Use this method with a byte[] to set the signature
	 * when the application has done the signing outside of
	 * this object.
	 * Use the results of the {@link Proposal#buildQuery}
	 * as the bytes that will be signed.
	 * @param {TransactionContext | byte[]} param - When 'param' is a
	 * {@link TransactionContext} the signing identity of the user
	 *  will sign the current proposal bytes as generated by {@link Proposal#buildQuery}.
	 *  When the 'param' is a byte[], the bytes will be used as the final
	 *  proposal signature.
	 */
	signQuery(param = checkParameter('param')) {
		if (!this._query || !this._query.proposal) {
			throw Error('The query is not built');
		}
		if ( param.type = TransactionContext.TYPE) {
			const txContext = param;
			const signer = txContext.user.getSigningIdentity();
			this._query.signature = Buffer.from(signer.sign(this._query.proposal.toBuffer()));
		} else if (param instanceof Buffer) {
			this._query.signature = param;
		} else {
			throw Error('Parameter is an unknown query signature type');
		}

		return this;
	}

	/**
	 * Returns a signed envelope from the signature and the built query as
	 * bytes
	 * 
	 * This method is not intended for use by an application. It will be used
	 * internally by {@link Proposal#query} during query processing.
	 * @returns {object} An object with the signature and the proposal bytes
	 *  ready to send to the Peer.
	 */
	getSignedQueryEnvelope() {
		if (!this._query || !this._query.proposal) {
			throw Error('The query is not built');
		}
		if (!this._query || !this._query.signature) {
			throw Error('The query is not signed');
		}
		const signed_envelope = {signature: this._query.signature, proposal_bytes: this._query.proposal.toBuffer()};

		return signed_envelope;
	}

	/**
	 * @typedef {Object} QueryRequest
	 * @property {Peer[]} [targets] - Optional. The peers to send the query.
	 * @property {Number} [request_timeout] - Optional. The request timeout
	 */

	/**
	 * @typedef {Object} QueryResponse
	 * @property {Error[]} errors -  errors returned from the endorsement
	 * @property {ProposalResponse[]} responses - endorsements returned from the endorsement
	 * @property {queryResults} results - the value of the endorsement, the query results
	 */

	/**
	 * Send a signed transaction proposal to peer(s) as a query
	 *
	 * @param {QueryRequest} query request
	 * @returns {QueryResponse}
	 */
	async query(request) {
		const method = 'query';
		const {targets, request_timeout} = request;
		if (targets) {
			const signed_envelope = this.getSignedQueryEnvelope();
			const peers = this.channel._getTargetPeers(targets, Channel.CHAINCODE_QUERY_ROLE);
			const promises = peers.map(async (peer) => {
				return peer.sendProposal(signed_envelope, request_timeout);
			});
			this._query.proposalResponses = [];
			this._query.proposalErrors = [];
			const results = await settle(promises);
			results.forEach((result) => {
				if (result.isFulfilled()) {
					logger.debug('%s - Promise is fulfilled:%s', method, result.value());
					this._query.proposalResponses.push(result.value());
				} else {
					logger.error('%s - Promise is rejected:', method, result.reason());
					this._query.proposalErrors.push(result.reason());
				}
			});

			this._query.queryResults = [];
			this._query.proposalResponses.forEach((response) => {
				if (response.response && response.response.payload && response.response.status === 200) {
					logger.debug('%s - good status', method);
					this._query.queryResults.push(response.response.payload);
				} else {
					logger.error('%s - unknown or missing results in query', method);
					this._query.queryResults.push(response);
				}
			});

			const return_results = {
				errors: this._query.proposalErrors.length > 0 ? this._query.proposalErrors : null,
				responses: this._query.proposalResponses.length > 0 ? this._query.proposalResponses : null,
				results: this._query.queryResults.length > 0 ? this._query.queryResults : null
			};

			return return_results;
		} else {
			// pass this off to the channel and discovery
			return Error('For now need to have target peers until discovery is working');
		}
	}

	/**
	 * @typedef {Object} CommitRequest
	 * @property {Orderer[]|string[]} [targets] Optional. The orderer instances
	 *  or string names of the orderers to send the endorsed proposal. These will
	 *  be used one at a time until one returns 'SUCCESS' in the commit of the
	 *  commit request.
	 * @property {Number} [request_timeout] - Optional. The request timeout

	 */

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
		const method = 'verifyProposalResponse';
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
			throw new Error(util.format('Failed to locate an MSP instance matching the endorser identity\'s organization %s', mspid));
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
		const method = 'compareProposalResponseResults'
		logger.debug('%s - start');

		if (!Array.isArray(proposal_responses)) {
			throw new Error('proposal_responses must be an array but was ' + typeof proposal_responses);
		}
		if (proposal_responses.length === 0) {
			throw new Error('proposal_responses is empty');
		}

		if (proposal_responses.some((response) => response instanceof Error)) {

			return false;
		}

		const first_one = _getProposalResponseResults(proposal_responses[0]);
		for (let i = 1; i < proposal_responses.length; i++) {
			const next_one = _getProposalResponseResults(proposal_responses[i]);
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

		return `Proposal: {chaincodeName: ${this.chaincodeName}, channel: ${this.channel.name}, fcn: ${this.fcn}`;
	}
};

module.exports = Proposal;
