/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const util = require('util');
const tokenUtils = require('./token-utils.js');
const utils = require('./utils.js');
const logger = utils.getLogger('TokenClient.js');

/**
 * @classdesc
 * The TokenClient class provides the APIs to perform token operations.
 * A TokenClient instance is created based on a Client instance and a Channel instance.
 * An application using the SDK may need to interact with multiple channels,
 * each through a separate instance of the TokenClient.
 * <br><br>
 * see the tutorial {@tutorial fabtoken}
 *
 * @class
 */
const TokenClient = class {

	/**
	 * Construct a TokenClient object.
	 *
   * @param {Client} client - The Client instance.
	 * @param {Channel} channel - The channel object.
	 * @param {Peer[]} targets - The prover peer(s) that are trusted by the token client
	 */
	constructor(client, channel, targets) {
		logger.debug('constructor - Start');
		if (!client) {
			throw new Error('Missing required "client" parameter on the constructor call');
		}
		if (!channel) {
			throw new Error('Missing required "channel" parameter the constructor call');
		}
		this._client = client;
		this._channel = channel;
		this._targets = targets;
	}

	/**
	 * Gets the client for the token client.
	 *
	 * @returns {Client} the client
	 */
	getClient() {
		return this._client;
	}

	/**
	 * Gets the channel for the token client.
	 *
	 * @returns {Channel} the channel
	 */
	getChannel() {
		return this._channel;
	}

	/**
	 * Gets the targets for the token client.
	 *
	 * @returns {Peer[]|string[]} the targets
	 */
	getTargets() {
		return this._targets;
	}

	/**
	 * Sets the prover peers.
	 *
	 * @returns {Peer[]|string[]} The prover peers
	 */
	setTargets(targets) {
		this._targets = targets;
	}

	/**
	 * @typedef {Object} TokenParam
	 *          This object contains properties that specify the recipient, type,
	 *          and quantity of a token kind.
	 * @property {byte[]} recipient - Required for issue and transfer. The owner of the token.
	 * @property {string} type - Required for issue. The type of the token.
	 * @property {Number} quantity - Required. The quantity of the token.
   */

	/**
	 * @typedef {Object} TokenRequest
	 *          This object contains properties that will be used by the token request.
	 * @property {Peer[] | string[]} targets - Optional. The peers that will receive this request,
	 *           when not provided the targets in the TokenClient instance will
	 *           be used. The request will be sent to the peers with proverPeer roles
	 *           if no targets are specified.
	 * @property {string} commandName - Required. The token command name, such as
	 *           issue, transfer, redeem, and list.
	 * @property {byte[]} tokenIds - Required for transfer and redeem.
	             An array of token ids that will be spent by the token command.
	 * @property {TokenParam[]} params - Required. One or multiple TokenParam
	 *           for the token command.
	 * @property {TransactionID} txId - Required. Transaction ID to use for this request.
	 */

	/**
	 * Send issue request to a prover peer to get token transaction
	 * and broadcast the transaction to orderers.
	 *
	 * @param {TokenRequest} request - Required. A TokenRequest object.
	 *        Its TokenParam must have recipient, type, and quantity properties.
	 * @param {Number} timeout - Optional. A number indicating milliseconds to wait on the
	 *        response before rejecting the promise with a timeout error. This
	 *        overrides the default timeout of the Peer instance and the global
	 *        timeout in the config settings.
	 * * @returns {Promise} A Promise for a "BroadcastResponse" message returned by
	 *          the orderer that contains a single "status" field for a
	 *          standard [HTTP response code]{@link https://github.com/hyperledger/fabric/blob/v1.0.0/protos/common/common.proto#L27}.
	 *          This will be an acknowledgement from the orderer of a successfully
	 *          submitted transaction.
	 */
	async issue(request, timeout) {
		logger.debug('issue - Start');
		tokenUtils.checkTokenRequest(request, 'issue');

		// copy request so that we can make update
		const sendRequest = Object.assign({}, request);
		sendRequest.tokenCommand = tokenUtils.buildIssueCommand(request);
		const result = await this._sendAndCommit(sendRequest, timeout);
		logger.info('issue, returns %s', util.inspect(result, {depth: null}));
		return result;
	}

	/**
	 * Sends a transfer request to a prover peer to get token transaction
	 * and broadcast the transaction to orderers.
	 *
	 * @param {TokenRequest} request - Required. A TokenRequest object.
	 *        Its TokenParam must have recipient and quantity properties.
	 * @param {Number} timeout - Optional. A number indicating milliseconds to wait on the
	 *        response before rejecting the promise with a timeout error. This
	 *        overrides the default timeout of the Peer instance and the global
	 *        timeout in the config settings.
	 * * @returns {Promise} A Promise for a "BroadcastResponse" message returned by
	 *          the orderer that contains a single "status" field for a
	 *          standard [HTTP response code]{@link https://github.com/hyperledger/fabric/blob/v1.0.0/protos/common/common.proto#L27}.
	 *          This will be an acknowledgement from the orderer of a successfully
	 *          submitted transaction.
	 */
	async transfer(request, timeout) {
		logger.debug('transfer - Start');
		tokenUtils.checkTokenRequest(request, 'transfer');

		// copy request so that we can make update
		const sendRequest = Object.assign({}, request);
		sendRequest.tokenCommand = tokenUtils.buildTransferCommand(request);
		const result = await this._sendAndCommit(sendRequest, timeout);
		return result;
	}

	/**
	 * Sends a redeem request to a prover peer to get token transaction
	 * and broadcast the token transaction to orderer.
	 *
	 * @param {TokenRequest} request - Required. A TokenRequest object.
	 *        Its TokenParam must have quantity property.
	 * @param {Number} timeout - Optional. A number indicating milliseconds to wait on the
	 *        response before rejecting the promise with a timeout error. This
	 *        overrides the default timeout of the Peer instance and the global
	 *        timeout in the config settings.
	 * @returns {Promise} A Promise for a "BroadcastResponse" message returned by
	 *          the orderer that contains a single "status" field for a
	 *          standard [HTTP response code]{@link https://github.com/hyperledger/fabric/blob/v1.0.0/protos/common/common.proto#L27}.
	 *          This will be an acknowledgement from the orderer of a successfully
	 *          submitted transaction.
	 */
	async redeem(request, timeout) {
		logger.debug('redeem - Start');
		tokenUtils.checkTokenRequest(request, 'redeem');

		// copy request so that we can make update
		const sendRequest = Object.assign({}, request);
		sendRequest.tokenCommand = tokenUtils.buildRedeemCommand(request);
		const result = await this._sendAndCommit(sendRequest, timeout);
		return result;
	}

	/**
	 * Sends a list request to a prover peer to list unspent tokens owned by the user.
	 *
	 * @param {TokenRequest} request - Optional. A TokenRequest object.
	 *        If provided, it can pass in targets and txId.
	 * @param {Number} timeout - Optional. A number indicating milliseconds to wait on the
	 *        response before rejecting the promise with a timeout error. This
	 *        overrides the default timeout of the Peer instance and the global
	 *        timeout in the config settings.
	 * @returns {Promise} A Promise for TokenOutput[] array returned by the prover peer
	 *          that contains all unspent tokens owned by the user.
	 */
	async list(request, timeout) {
		logger.debug('list - Start');

		// copy request so that we can make update
		const sendRequest = Object.assign({}, request);

		// Create txId if it is not passed in.
		// This is allowed because list command has no transaction.
		if (!sendRequest.txId) {
			sendRequest.txId = this._client.newTransactionID();
		}
		if (sendRequest.commandName !== undefined && sendRequest.commandName !== 'list') {
			throw new Error(util.format('Wrong "commandName" in request on list call: %s', sendRequest.commandName));
		}

		sendRequest.tokenCommand = tokenUtils.buildListCommand();

		if (!sendRequest.targets) {
			sendRequest.targets = this._targets;
		}
		const commandResp = await this._channel.sendTokenCommand(sendRequest, timeout);
		const tokens = commandResp.unspent_tokens.tokens;
		return tokens;
	}

	/**
	 * Internal method that sends a token command to a prover peer to
	 * get a token transaction and then broadcast the transaction to orders.
	 *
	 * @param {TokenRequest} request - Required. A TokenRequest object.
	 *        Its TokenParam must have quantity property.
	 * @param {Number} timeout - Optional. A number indicating milliseconds to wait on the
	 *        response before rejecting the promise with a timeout error. This
	 *        overrides the default timeout of the Peer instance and the global
	 *        timeout in the config settings.
	 * @returns {Promise} A Promise for a "BroadcastResponse" message returned by
	 *          the orderer that contains a single "status" field for a
	 *          standard [HTTP response code]{@link https://github.com/hyperledger/fabric/blob/v1.0.0/protos/common/common.proto#L27}.
	 *          This will be an acknowledgement from the orderer of a successfully
	 *          submitted transaction.
	 */
	async _sendAndCommit(request, timeout) {
		if (!request.targets) {
			request.targets = this._targets;
		}

		const commandResp = await this._channel.sendTokenCommand(request, timeout);
		const tokentx = commandResp.get('token_transaction');
		request.tokenTransaction = tokentx;
		const result = await this._channel.sendTokenTransaction(request, timeout);
		return result;
	}
};

module.exports = TokenClient;
