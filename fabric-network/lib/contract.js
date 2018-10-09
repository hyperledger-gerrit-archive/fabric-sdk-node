/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const logger = require('./logger').getLogger('Contract');
const util = require('util');

/**
 * Represents a smart contract (chaincode) instance in a network.
 * Applications should get a Contract instance using the
 * networks's [getContract]{@link Network#getContract} method.
 */
class Contract {

	constructor(network, chaincodeId, gateway, queryHandler, namespace='') {
		logger.debug('in Contract constructor');

		this.network = network;
		this.channel = network.getChannel();
		this.chaincodeId = chaincodeId;
		this.gateway = gateway;
		this.queryHandler = queryHandler;
		this.eventHandlerOptions = gateway.getOptions().eventHandlerOptions;
		this.namespace = namespace;
	}

	/**
     * Check for proposal response errors.
     * @private
     * @param {any} responses the responses from the install, instantiate or invoke
     * @return {Object} number of ignored errors and valid responses
     * @throws if there are no valid responses at all.
     */
	_validatePeerResponses(responses) {
		logger.debug('in _validatePeerResponses');

		if (!responses.length) {
			logger.error('_validatePeerResponses: No results were returned from the request');
			throw new Error('No results were returned from the request');
		}

		const validResponses = [];
		const invalidResponses = [];
		const invalidResponseMsgs = [];

		responses.forEach((responseContent) => {
			if (responseContent instanceof Error) {

				// this is either an error from the sdk, peer response or chaincode response.
				// we can distinguish between sdk vs peer/chaincode by the isProposalResponse flag in the future.
				// TODO: would be handy to know which peer the response is from and include it here.
				const warning = util.format('Response from attempted peer comms was an error: %j', responseContent);
				logger.warn('_validatePeerResponses: ' + warning);
				invalidResponseMsgs.push(warning);
				invalidResponses.push(responseContent);
			} else {

				// anything else is a successful response ie status will be less the 400.
				// in the future we can do things like verifyProposalResponse and compareProposalResponseResults
				// as part of an extended client side validation strategy but for now don't perform any client
				// side checks as the peers will have to do this anyway and it impacts client performance
				validResponses.push(responseContent);
			}
		});

		if (validResponses.length === 0) {
			const errorMessages = [ 'No valid responses from any peers.' ];
			invalidResponseMsgs.forEach(invalidResponse => errorMessages.push(invalidResponse));
			const msg = errorMessages.join('\n');
			logger.error('_validatePeerResponses: ' + msg);
			throw new Error(msg);
		}

		return {validResponses, invalidResponses};
	}

	/**
	 * Submit a transaction to the ledger.  The transaction function <code>transactionName</code>
	 * will be executed on the endorsing peers and then submitted to the ordering service
	 * for committing to the ledger.
     * @param {string} transactionName Transaction function name
     * @param {...string} parameters Transaction function parameters
     * @returns {Buffer} Payload response from the transaction function
     */
	async submitTransaction(transactionName, ...parameters) {
		logger.debug('in submitTransaction: ' + transactionName);

		// form the transaction name with the namespace
		const fullTxName = (this.namespace==='') ? transactionName : `${this.namespace}:${transactionName}`;

		this._verifyTransactionDetails('submitTransaction', fullTxName, parameters);

		const txId = this.gateway.getClient().newTransactionID();
		const eventHandler = this._createTxEventHandler(txId.getTransactionID());

		// Submit the transaction to the endorsers.
		const request = {
			chaincodeId: this.chaincodeId,
			txId,
			fcn: fullTxName,
			args: parameters
		};

		// node sdk will target all peers on the channel that are endorsingPeer or do something special for a discovery environment
		const results = await this.channel.sendTransactionProposal(request);
		const proposalResponses = results[0];
		const proposal = results[1];

		// get only the valid responses to submit to the orderer
		const {validResponses} = this._validatePeerResponses(proposalResponses);

		eventHandler && (await eventHandler.startListening());

		// Submit the endorsed transaction to the primary orderers.
		const response = await this.channel.sendTransaction({
			proposalResponses: validResponses,
			proposal
		});

		if (response.status !== 'SUCCESS') {
			const msg = util.format('Failed to send peer responses for transaction \'%j\' to orderer. Response status: %j', txId.getTransactionID(), response.status);
			logger.error('submitTransaction:', msg);
			eventHandler && eventHandler.cancelListening();
			throw new Error(msg);
		}

		eventHandler && (await eventHandler.waitForEvents());

		// return the payload from the invoked chaincode
		let result = null;
		if (validResponses[0].response.payload && validResponses[0].response.payload.length > 0) {
			result = validResponses[0].response.payload;
		}
		return result;
	}

	/**
	 * Create an appropriate transaction event handler, if one is configured.
	 * @private
	 * @param {String} transactionId The transation ID to listen for.
	 * @returns {TransactionEventHandler|null} A transactionevent handler, or null if non is configured.
	 */
	_createTxEventHandler(transactionId) {
		const eventHandlerFactoryFn = this.eventHandlerOptions.strategy;
		if (eventHandlerFactoryFn) {
			return eventHandlerFactoryFn(transactionId, this.network, this.eventHandlerOptions);
		} else {
			return null;
		}
	}

	/**
	 * Verify the supplied transaction details.
	 * @private
	 * @param {String} methodName Requesting method name, used for logging.
	 * @param {String} transactionName Name of a transaction.
	 * @param {String[]} parameters transaction parameters.
	 * @throws {Error} if the details are not acceptable.
	 */
	_verifyTransactionDetails(methodName, transactionName, parameters) {
		this._verifyTransactionName(methodName, transactionName);
		this._verifyTransactionParameters(methodName, parameters);
	}

	/**
	 * Ensure a supplied transaction name is valid.
	 * @private
	 * @param {String} methodName Requesting method name, used for logging.
	 * @param {String} transactionName Name of a transaction.
	 * @throws {Error} if the name is not valid.
	 */
	_verifyTransactionName(methodName, transactionName) {
		if(typeof transactionName !== 'string' || transactionName.length === 0) {
			const msg = util.format('Transaction name must be a non-empty string: %j', transactionName);
			logger.error(methodName + ':', msg);
			throw new Error(msg);
		}
	}

	/**
	 * Ensure supplied transaction parameters are valid.
	 * @private
	 * @param {String} methodName Requesting method name, used for logging.
	 * @param {String[]} parameters transaction parameters.
	 * @throws {Error} if any parameters are invalid.
	 */
	_verifyTransactionParameters(methodName, parameters) {
		const invalidParameters = parameters.filter((parameter) => typeof parameter !== 'string');
		if (invalidParameters.length > 0) {
			const invalidParamString = invalidParameters
				.map((parameter) => util.format('%j', parameter))
				.join(', ');
			const msg = 'Transaction parameters must be strings: ' + invalidParamString;
			logger.error(methodName + ':', msg);
			throw new Error(msg);
		}
	}

	/**
	 * Execute a transaction function and return its results.
	 * The transaction function <code>transactionName</code>
	 * will be executed on the endorsing peers but the responses will not be sent to to
	 * the ordering service and hence will not be committed to the ledger.
	 * This is used for querying the world state.
     * @param {string} transactionName Transaction function name
     * @param {...string} parameters Transaction function parameters
     * @returns {Buffer} Payload response from the transaction function
     */
	async executeTransaction(transactionName, ...parameters) {

		// form the transaction name with the namespace
		const fullTxName = (this.namespace==='') ? transactionName : `${this.namespace}:${transactionName}`;
		this._verifyTransactionDetails('executeTransaction', fullTxName, parameters);
		const txId = this.gateway.getClient().newTransactionID();
		const result = await this.queryHandler.queryChaincode(this.chaincodeId, txId, fullTxName, parameters);
		return result ? result : null;
	}
}

module.exports = Contract;
