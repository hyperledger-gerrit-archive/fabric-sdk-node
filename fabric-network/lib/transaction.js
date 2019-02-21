/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const Query = require('fabric-network/lib/impl/query/query');

const logger = require('fabric-network/lib/logger').getLogger('Transaction');
const util = require('util');

const noOpTxEventHandler = {
	startListening: async () => {},
	waitForEvents: async () => {},
	cancelListening: () => {}
};

/**
 * Ensure supplied transaction arguments are not strings.
 * @private
 * @static
 * @param {Array} args transaction arguments.
 * @throws {Error} if any arguments are invalid.
 */
function verifyArguments(args) {
	const isInvalid = args.some((arg) => typeof arg !== 'string');
	if (isInvalid) {
		const argsString = args.map((arg) => util.format('%j', arg)).join(', ');
		const msg = util.format('Transaction arguments must be strings: %s', argsString);
		logger.error('verifyArguments:', msg);
		throw new Error(msg);
	}
}

/**
 * Represents a specific invocation of a transaction function, and provides
 * felxibility over how that transaction is invoked. Applications should
 * obtain instances of this class by calling
 * [Contract#createTransaction()]{@link module:fabric-network.Contract#createTransaction}.
 * <br><br>
 * Instances of this class are stateful. A new instance <strong>must</strong>
 * be created for each transaction invocation.
 * @memberof module:fabric-network
 * @hideconstructor
 */
class Transaction {
	/*
	 * @param {Contract} contract Contract to which this transaction belongs.
	 * @param {String} name Fully qualified transaction name.
	 */
	constructor(contract, name) {
		this._contract = contract;
		this._name = name;
		this._transactionId = contract.createTransactionID();
		this._transientMap = null;
		this._createTxEventHandler = (() => noOpTxEventHandler);
		this._isInvoked = false;
		this._queryHandler = contract.getNetwork().getQueryHandler();
	}

	/**
	 * Get the fully qualified name of the transaction function.
	 * @returns {String} Transaction name.
	 */
	getName() {
		return this._name;
	}

	/**
	 * Get the ID that will be used for this transaction invocation.
	 * @returns {module:fabric-client.TransactionID} Transaction ID.
	 */
	getTransactionID() {
		return this._transactionId;
	}

	/**
	 * Set the event handler strategy to be used for this transaction invocation.
	 * @private
	 * @param {Function} factoryFunction Event handler factory function.
	 * @returns {module:fabric-network.Transaction} This object, to allow function chaining.
	 */
	setEventHandlerStrategy(factoryFunction) {
		this._createTxEventHandler = factoryFunction;
		return this;
	}

	/**
	 * Set transient data that will be passed to the transaction function
	 * but will not be stored on the ledger. This can be used to pass
	 * private data to a transaction function.
	 * @param {Object} transientMap Object with String property names and
	 * Buffer property values.
	 * @returns {module:fabric-network.Transaction} This object, to allow function chaining.
	 */
	setTransient(transientMap) {
		this._transientMap = transientMap;
		return this;
	}

	/**
	 * Submit a transaction to the ledger. The transaction function <code>name</code>
	 * will be evaluated on the endorsing peers and then submitted to the ordering service
	 * for committing to the ledger.
	 * @async
     * @param {...String} [args] Transaction function arguments.
     * @returns {Buffer} Payload response from the transaction function.
	 * @throws {module:fabric-network.TimeoutError} If the transaction was successfully submitted to the orderer but
	 * timed out before a commit event was received from peers.
     */
	async submit(...args) {
		verifyArguments(args);
		this._setInvokedOrThrow();

		const network = this._contract.getNetwork();
		const channel = network.getChannel();
		const txId = this._transactionId.getTransactionID();
		const eventHandler = this._createTxEventHandler(txId, network, this._contract.getEventHandlerOptions());

		const request = this._buildRequest(args);

		// node sdk will target all peers on the channel that are endorsingPeer or do something special for a discovery environment
		const proposalResult = await channel.sendTransactionProposal(request);
		console.log('proposalResult', proposalResult);
		const validResponses = this._getValidResponses(proposalResult);

		await eventHandler.startListening();

		// Submit the endorsed transaction to the primary orderers.
		const response = await channel.sendTransaction({
			proposalResponses: validResponses,
			proposal: proposalResult.proposal
		});

		if (response.status !== 'SUCCESS') {
			const msg = util.format('Failed to send peer responses for transaction %j to orderer. Response status: %j', txId, response.status);
			logger.error('submit:', msg);
			eventHandler.cancelListening();
			throw new Error(msg);
		}

		await eventHandler.waitForEvents();

		return validResponses[0].response.payload || null;
	}

	_setInvokedOrThrow() {
		if (this._isInvoked) {
			throw new Error('Transaction has already been invoked');
		}
		this._isInvoked = true;
	}

	_buildRequest(args) {
		const request = {
			chaincodeId: this._contract.getChaincodeId(),
			txId: this._transactionId,
			fcn: this._name,
			args: args
		};
		if (this._transientMap) {
			request.transientMap = this._transientMap;
		}
		return request;
	}

	/**
     * Check for proposal response errors.
     * @private
     * @param {ProposalResponseObject} proposalResult Proposal results.
	 * @returns {ProposalResponse[]} Valid proposal responses.
     * @throws if there are no valid responses.
     */
	_getValidResponses(proposalResult) {
		const validResponses = [];
		const txId = this._transactionId.getTransactionID();

		proposalResult.responses.forEach((proposalResponse) => {
			if (proposalResponse.response.status < 400) {
				validResponses.push(proposalResponse);
			} else {
				const message = util.format('Invalid proposal response for transaction %j from peer %j with status %s: %s',
					txId, proposalResponse.peer.url, proposalResponse.response.status, proposalResponse.response.message);
				logger.warn('_validatePeerResponses:', message);
			}
		});

		proposalResult.errors.forEach((error) => {
			const message = util.format('Error sending proposal for transaction %j to peer %j: %j',
				txId, error.peer && error.peer.url, error);
			logger.warn('_validatePeerResponses:', message);
		});

		if (validResponses.length < 1) {
			const invalidPeers = proposalResult.responses.map((response) => response.peer.url);
			const errorPeers = proposalResult.errors.map((error) => error.peer && error.peer.url);
			const message = util.format(
				'No valid responses from any peers for transaction %s. Invalid responses from peers: %j. Errors sending proposal to peers: %j',
				txId, invalidPeers, errorPeers
			);
			logger.error('_validatePeerResponses:', message);
			throw new Error(message);
		}

		return validResponses;
	}

	/**
	 * Evaluate a transaction function and return its results.
	 * The transaction function will be evaluated on the endorsing peers but
	 * the responses will not be sent to the ordering service and hence will
	 * not be committed to the ledger.
	 * This is used for querying the world state.
	 * @async
     * @param {...String} [args] Transaction function arguments.
     * @returns {Buffer} Payload response from the transaction function.
     */
	async evaluate(...args) {
		verifyArguments(args);
		this._setInvokedOrThrow();

		const channel = this._contract.getNetwork().getChannel();
		const request = this._buildRequest(args);
		const query = new Query(channel, request);

		return this._queryHandler.evaluate(query);
	}
}

module.exports = Transaction;
