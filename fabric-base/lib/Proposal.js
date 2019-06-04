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
 * artifacts in one place during runtime.
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
		this.fcn = 'invoke';
		this.args = [];
		this.transientMap = null;
		this.init = false;
		this.proposal = null;
		this.submission = null;
		this.txId;
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
	 * return a signed envelope from the signature and the proposal as bytes
	 * 
	 * This method is not intended for use by an application. It will be used
	 * by the {@link Channel#endorsements} during endorsement processing.
	 * @returns {object} An object with the signature and the proposal bytes
	 */
	getSignedProposalEnvelope() {
		const signed_envelope = {signature: this.proposal_signature, proposal_bytes: this.proposal.toBuffer()};
		return signed_envelope;
	}

	/**
	 * return a signed envelope from the signature and the submission as bytes
	 * 
	 * This method is not intended for use by an application. It will be used
	 * by the {@link Proposal#commit} during commit processing.
	 * @returns {object} An object with the signature and the submission bytes
	 */
	getSignedCommitEnvelope() {
		const signed_envelope = {signature: this.commit_signature, payload: this.submitPayload.toBuffer()};
		return signed_envelope;
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
		if ( param.type = TransactionContext.TYPE) {
			const txContext = param;
			const signer = txContext.user.getSigningIdentity();
			this.proposal_signature = Buffer.from(signer.sign(this.proposal_bytes));
		} else if (param instanceof Buffer) {
			this.proposal_signature = param;
		} else {
			throw Error('Parameter is an unknown proposal signature type');
		}

		return this;
	}

	/**
	 * Use this method with a TransactionContext that contains a User that has
	 * a Signing Identity.
	 * OR
	 * Use this method with a byte[] to set the signature
	 * when the application has done the signing outside of
	 * this object.
	 * Use the results of the {@link Proposal#buildCommit}
	 * as the bytes that will be signed.
	 * @param {TransactionContext | byte[]} param - When 'param' is a
	 * {@link TransactionContext} the signing identity of the user
	 *  will sign the current commit bytes as generated by {@link Proposal#buildCommit}.
	 *  When the 'param' is a byte[], the bytes will be used as the final
	 *  commit signature.
	 */
	signCommit(param = checkParameter('param')) {
		if (param.type === TransactionContext.TYPE) {
			const txContext = param;
			const signer = txContext.user.getSigningIdentity();
			this.commit_signature = Buffer.from(signer.sign(this.payload_bytes));
		} else if (param instanceof Buffer) {
			this.commit_signature = param;
		} else {
			throw Error('Parameter is an unknown commit signature type');
		}

		return this;
	}

	/**
	 * Use this method when signing the proposal externally to the NodeSDK-Base
	 * application. The user object of the TransactionContext does not have to
	 * a signing identity, only an identity that has the user's certificate is
	 * required. This identity will be used to build
	 * the protobuf objects of the proposal that will be signed later and sent
	 * to the fabric Peer for endorsement.
	 * 
	 * @param {TransactionContext} txContext - Contains the {@link User} object
	 * needed to build this proposal. The context must also have a
	 * transaction ID and nonce value
	 * @param {BuildProposalRequest} request - The proposals values of the request.
	 */
	buildProposal(txContext = checkParameter('txContext'), request) {
		const method = 'buildProposal';
		logger.debug('%s - start', method);
	
		const {fcn,  args = [], transientMap, init} = request;
		if (fcn) {
			this.fcn = fcn;
		}
		if (transientMap) {
			this.transientMap = transientMap;
		}
		if (typeof init === 'boolean') {
			this.init = init;
		}

		txContext.calculateTxId();
		this.args = [];
		this.args.push(Buffer.from(this.fcn, 'utf8'));
		logger.debug('%s - adding function arg:%s', method, this.fcn);
	
		for (let i = 0; i < args.length; i++) {
			logger.debug('%s - adding arg %s', method, args[i]);
			if (typeof args[i] === 'string') {
				this.args.push(Buffer.from(args[i], 'utf8'));
			} else {
				this.args.push(args[i]);
			}
		}
	
		logger.debug('%s - chaincode ID:%s', method, this.chaincodeName);
		const chaincodeSpec = new fabprotos.protos.ChaincodeSpec();
		chaincodeSpec.setType(fabprotos.protos.ChaincodeSpec.Type.GOLANG);
		const chaincode_id = new fabprotos.protos.ChaincodeID();
		chaincode_id.setName(this.chaincodeName);
		chaincodeSpec.setChaincodeId(chaincode_id);
		const input = new fabprotos.protos.ChaincodeInput();
		input.setArgs(this.args);
		if (this.init) {
			input.setIsInit(true);
		}
		chaincodeSpec.setInput(input);
	
		const channelHeader = this.channel.buildChannelHeader(
			fabprotos.common.HeaderType.ENDORSER_TRANSACTION,
			this.chaincodeName,
			txContext.txId
		);
		
		this.header = buildHeader(txContext.user.getIdentity(), channelHeader, txContext.nonce);
		
		// construct the ChaincodeInvocationSpec
		const cciSpec = new fabprotos.protos.ChaincodeInvocationSpec();
		cciSpec.setChaincodeSpec(chaincodeSpec);

		const cc_payload = new fabprotos.protos.ChaincodeProposalPayload();
		cc_payload.setInput(cciSpec.toBuffer());

		if (this.transientMap) {
			cc_payload.setTransientMap(this.transientMap);
		}

		this.txId = txContext.txId;
		this.proposal = new fabprotos.protos.Proposal();
		this.proposal.setHeader(this.header.toBuffer());
		this.proposal.setPayload(cc_payload.toBuffer());
		this.proposal_bytes = this.proposal.toBuffer();
		
		return this.proposal_bytes;
	}


	/**
	 * This method is used to build the protobuf objects of the submission.
	 * The submission must next be signed before being sent to be committed.
	 * The {@link Proposal#buildAndSignCommit} method should be used if the
	 * signing will be done by the application's user.
	 * 
	 * @returns {byte[]} The submissions payload bytes that need to be
	 *  signed.
	 */
	buildCommit() {
		const method = 'buildCommit';
		logger.debug('%s - start', method);
		const endorsements = [];
		for (const proposalResponse of this.proposalResponses) {
			if (proposalResponse && proposalResponse.response && proposalResponse.response.status === 200) {
				endorsements.push(proposalResponse.endorsement);
			}
		}

		if (endorsements.length < 1) {
			logger.error('%s - no valid endorsements found', method);
			throw new Error('no valid endorsements found');
		}
		const proposalResponse = this.proposalResponses[0];

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
		const originalChaincodeProposalPayload = fabprotos.protos.ChaincodeProposalPayload.decode(this.proposal.getPayload());
		const chaincodeProposalPayloadNoTrans = new fabprotos.protos.ChaincodeProposalPayload();
		chaincodeProposalPayloadNoTrans.setInput(originalChaincodeProposalPayload.input); // only set the input field, skipping the TransientMap
		chaincodeActionPayload.setChaincodeProposalPayload(chaincodeProposalPayloadNoTrans.toBuffer());

		const transactionAction = new fabprotos.protos.TransactionAction();
		transactionAction.setHeader(this.header.getSignatureHeader());
		transactionAction.setPayload(chaincodeActionPayload.toBuffer());

		const actions = [];
		actions.push(transactionAction);

		const transaction = new fabprotos.protos.Transaction();
		transaction.setActions(actions);


		this.submitPayload = new fabprotos.common.Payload();
		this.submitPayload.setHeader(this.header);
		this.submitPayload.setData(transaction.toBuffer());
		this.payload_bytes = this.submitPayload.toBuffer();

		return this.payload_bytes;
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
	 * Send a signed transaction proposal to peer(s) as an invoke
	 *
	 * @param {EndorseRequest} request
	 * @returns {EndorseResponse}
	 */
	async endorse(request) {
		const {targets, request_timeout} = request;
		if (targets) {
			const signed_envelope = this.getSignedProposalEnvelope();
			const peers = this.channel._getTargetPeers(targets, Channel.ENDORSING_PEER_ROLE);
			const promises = peers.map(async (peer) => {
				return peer.sendProposal(signed_envelope, request_timeout);
			});
			this.proposalResponses = [];
			this.proposalErrors = [];
			const results = await settle(promises);
			results.forEach((result) => {
				if (result.isFulfilled()) {
					logger.debug(`endorse - Promise is fulfilled: ${result.value()}`);
					this.proposalResponses.push(result.value());
				} else {
					logger.debug(`endorse - Promise is rejected: ${result.reason()}`);
					this.proposalErrors.push(result.reason());
				}
			});

			const return_results =  {
				errors: this.proposalErrors.length > 0 ? this.proposalErrors : null,
				responses: this.proposalResponses.length > 0 ? this.proposalResponses : null
			};

			return return_results;
		} else {
			// pass this off to the channel and discovery
			return Error('For now need to have target peers until discovery is working');
		}
	}
	/**
	 * @typedef {Object} QueryResponse
	 * @property {Error[]} errors -  errors returned from the endorsement
	 * @property {ProposalResponse} response - endorsements returned from the endorsement
	 * @property {queryResults} results - the value of the endorsement, the query results
	 */
	/**
	 * Send a signed transaction proposal to peer(s) as a query
	 *
	 * @param {EndorseRequest} query request
	 * @returns {byte[]}
	 */
	async query(request) {
		const {targets, request_timeout} = request;
		if (targets) {
			const signed_envelope = this.getSignedProposalEnvelope();
			const peers = this.channel._getTargetPeers(targets, Channel.CHAINCODE_QUERY_ROLE);
			const promises = peers.map(async (peer) => {
				return peer.sendProposal(signed_envelope, request_timeout);
			});
			this.proposalResponses = [];
			this.proposalErrors = [];
			const results = await settle(promises);
			results.forEach((result) => {
				if (result.isFulfilled()) {
					logger.debug(`query - Promise is fulfilled: ${result.value()}`);
					this.proposalResponses.push(result.value());
				} else {
					logger.debug(`query - Promise is rejected: ${result.reason()}`);
					this.proposalErrors.push(result.reason());
				}
			});

			this.queryResults = [];
			this.proposalResponses.forEach((response) => {
				if (response.response && response.response.payload && response.response.status === 200) {
					logger.error('query - good status');
					this.queryResults.push(response.response.payload);
				} else {
					logger.error('query - unknown or missing results in query');
					this.queryResults.push(response);
				}
			});

			const return_results = {
				errors: this.proposalErrors.length > 0 ? this.proposalErrors : null,
				responses: this.proposalResponses.length > 0 ? this.proposalResponses : null,
				results: this.queryResults.length > 0 ? this.queryResults : null
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
	 *  be used one at a time until one returns 'SUCCESS' in the submission of the
	 *  commit request.
	 * @property {Number} [request_timeout] - Optional. The request timeout

	 */

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
	 * @returns submission results
	 */
	async commit(request) {
		const method = 'commit';
		logger.debug('%s - start', method);

		const {targets, request_timeout} = request;

		const envelope = this.getSignedCommitEnvelope();

		if (request.targets) {
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
		} else if (this.channel._commit_handler) {
			return this.channel._commit_handler.commit(request);
		} else {
			throw Error('Missing targets parameter');
		}
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
		logger.debug('verifyProposalResponse - start');
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
		logger.debug('getMSPbyIdentity - found mspid %s', mspid);
		const msp = this._msp_manager.getMSP(mspid);

		if (!msp) {
			throw new Error(util.format('Failed to locate an MSP instance matching the endorser identity\'s organization %s', mspid));
		}
		logger.debug('verifyProposalResponse - found endorser\'s MSP');

		try {
			identity = await msp.deserializeIdentity(endorsement.endorser, false);
			if (!identity) {
				throw new Error('Unable to find the endorser identity');
			}
		} catch (error) {
			logger.error('verifyProposalResponse - getting endorser identity failed with: ', error);
			return false;
		}

		try {
			// see if the identity is trusted
			if (!identity.isValid()) {
				logger.error('Endorser identity is not valid');
				return false;
			}
			logger.debug('verifyProposalResponse - have a valid identity');

			// check the signature against the endorser and payload hash
			const digest = Buffer.concat([proposal_response.payload, endorsement.endorser]);
			if (!identity.verify(digest, endorsement.signature)) {
				logger.error('Proposal signature is not valid');
				return false;
			}
		} catch (error) {
			logger.error('verifyProposalResponse - verify failed with: ', error);
			return false;
		}

		logger.debug('verifyProposalResponse - This endorsement has both a valid identity and valid signature');
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
		logger.debug('compareProposalResponseResults - start');

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
				logger.debug('compareProposalResponseResults - read/writes result sets match index=%s', i);
			} else {
				logger.error('compareProposalResponseResults - read/writes result sets do not match index=%s', i);
				return false;
			}
		}

		return true;
	}

	/**
	 * return a printable representation of this object
	 */
	toString() {
		return 'Proposal: {' +
			'chaincodeName: ' + this.chaincodeName +
			', channel: ' + this.channel.name +
			', fcn: ' + this.fcn +
		'}';
	}

};

module.exports = Proposal;
