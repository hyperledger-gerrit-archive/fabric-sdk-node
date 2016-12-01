/*
 Copyright 2016 IBM All Rights Reserved.

 Licensed under the Apache License, Version 2.0 (the 'License');
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

	  http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an 'AS IS' BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

'use strict';

var api = require('./api.js');
var utils = require('./utils.js');
var urlParser = require('url');
var net = require('net');
var util = require('util');
var fs = require('fs');
var Peer = require('./Peer.js');
var Orderer = require('./Orderer.js');
var settle = require('promise-settle');
var grpc = require('grpc');
var _ccTransProto = grpc.load(__dirname + '/protos/peer/chaincode_transaction.proto').protos;

var logger = utils.getLogger('Chain.js');

/**
 * The class representing a chain with which the client SDK interacts.
 *
 * The “Chain” object captures settings for a channel, which is created by
 * the orderers to isolate transactions delivery to peers participating on channel.
 * A chain must be initialized after it has been configured with the list of peers
 * and orderers. The initialization sends a CONFIGURATION transaction to the orderers
 * to create the specified channel and asks the peers to join that channel.
 *
 * @class
 */
var Chain = class {

	/**
	 * @param {string} name to identify different chain instances. The naming of chain instances
	 * is completely at the client application's discretion.
	 */
	constructor(name) {
		// Name of the chain is only meaningful to the client
		this._name = name;

		// Security enabled flag
		this._securityEnabled = true;//to do

		// The number of tcerts to get in each batch
		this._tcertBatchSize = utils.getConfigSetting('tcert-batch-size',200);

		// Is in dev mode or network mode
		this._devMode = false;

		// If in prefetch mode, we prefetch tcerts from member services to help performance
		this._preFetchMode = true;//to do - not in doc

		// Temporary variables to control how long to wait for deploy and invoke to complete before
		// emitting events.  This will be removed when the SDK is able to receive events from the
		this._deployWaitTime = utils.getConfigSetting('deploy-wait-time',20);
		this._invokeWaitTime = utils.getConfigSetting('invoke-wait-time',5);

		/**
		 * @member [CryptoSuite]{@link module:api.CryptoSuite} cryptoPrimitives The crypto primitives object provides access to the crypto suite
		 * for functions like sign, encrypt, decrypt, etc.
		 * @memberof module:api.Chain.prototype
		 */
		this.cryptoPrimitives = utils.getCryptoSuite();

		this._peers = [];
		this._orderers = [];

		this._clientContext = null;//to do - on uml diagram, but no set/get???

		//to do update logger
		logger.info('Constructed Chain instance: name - %s, securityEnabled: %s, TCert download batch size: %s, network mode: %s',
			this._name, this._securityEnabled, this._tcertBatchSize, !this._devMode);
	}

	/**
	 * Get the chain name.
	 * @returns {string} The name of the chain.
	 */
	getName() {
		return this._name;
	}

	/**
	 * Determine if security is enabled.
	 */
	isSecurityEnabled() {
		return true;//to do
	}

	/**
	 * Determine if pre-fetch mode is enabled to prefetch tcerts.
	 */
	isPreFetchMode() {
		return this._preFetchMode;
	}

	/**
	 * Set prefetch mode to true or false.
	 */
	setPreFetchMode(preFetchMode) {
		this._preFetchMode = preFetchMode;
	}

	/**
	 * Determine if dev mode is enabled.
	 */
	isDevMode() {
		return this._devMode;
	}

	/**
	 * Set dev mode to true or false.
	 */
	setDevMode(devMode) {
		this._devMode = devMode;
	}

	/**
	 * Get the tcert batch size.
	 */
	getTCertBatchSize() {
		return this._tcertBatchSize;
	}

	/**
	 * Set the tcert batch size.
	 */
	setTCertBatchSize(batchSize) {
		this._tcertBatchSize = batchSize;
	}

	/**
	 * Add peer endpoint to chain.
	 * @param {Peer} peer An instance of the Peer class that has been initialized with URL,
	 * TLC certificate, and enrollment certificate.
	 */
	addPeer(peer) {
		this._peers.push(peer);
	}

	/**
	 * Remove peer endpoint from chain.
	 * @param {Peer} peer An instance of the Peer class.
	 */
	removePeer(peer) {
		var url = peer.getUrl();
		for (let i = 0; i < this._peers.length; i++) {
			if (this._peers[i].getUrl() === url) {
				this._peers.splice(i, 1);
				logger.debug('Removed peer with url "%s".', url);
				return;
			}
		}
		logger.debug('Did not find a peer to remove with url "%s".', url);
	}

	/**
	 * Get peers of a chain from local information.
	 * @returns {Peer[]} The peer list on the chain.
	 */
	getPeers() {
		return this._peers;
	}

	/**
	 * Add orderer endpoint to a chain object, this is a local-only operation.
	 * A chain instance may choose to use a single orderer node, which will broadcast
	 * requests to the rest of the orderer network. Or if the application does not trust
	 * the orderer nodes, it can choose to use more than one by adding them to the chain instance.
	 * All APIs concerning the orderer will broadcast to all orderers simultaneously.
	 * @param {Orderer} orderer An instance of the Orderer class.
	 */
	addOrderer(orderer) {
		this._orderers.push(orderer);
	}

	/**
	 * Remove orderer endpoint from a chain object, this is a local-only operation.
	 * @param {Orderer} orderer An instance of the Orderer class.
	 */
	removeOrderer(orderer) {
		var url = orderer.getUrl();
		for (let i = 0; i < this._orderers.length; i++) {
			if (this._orderers[i].getUrl() === url) {
				this._orderers.splice(i, 1);
				logger.debug('Removed orderer with url "%s".', url);
				return;
			}
		}
		logger.debug('Did not find an orderer to remove with url "%s".', url);
	}

	/**
	 * Get orderers of a chain.
	 */
	getOrderers() {
		return this._orderers;
	}

	/**
	 * Calls the orderer(s) to start building the new chain, which is a combination
	 * of opening new message stream and connecting the list of participating peers.
	 * This is a long-running process. Only one of the application instances needs
	 * to call this method. Once the chain is successfully created, other application
	 * instances only need to call getChain() to obtain the information about this chain.
	 * @returns {boolean} Whether the chain initialization process was successful.
	 */
	initializeChain() {
		//to do
	}

	/**
	 * Calls the orderer(s) to update an existing chain. This allows the addition and
	 * deletion of Peer nodes to an existing chain, as well as the update of Peer
	 * certificate information upon certificate renewals.
	 * @returns {boolean} Whether the chain update process was successful.
	 */
	updateChain() {
		//to do
	}

	/**
	 * Get chain status to see if the underlying channel has been terminated,
	 * making it a read-only chain, where information (transactions and states)
	 * can be queried but no new transactions can be submitted.
	 * @returns {boolean} Is read-only, true or not.
	 */
	isReadonly() {
		return false;//to do
	}

	/**
	 * Queries for various useful information on the state of the Chain
	 * (height, known peers).
	 * @returns {object} With height, currently the only useful info.
	 */
	queryInfo() {
		//to do
	}

	/**
	 * Queries the ledger for Block by block number.
	 * @param {number} blockNumber The number which is the ID of the Block.
	 * @returns {object} Object containing the block.
	 */
	queryBlock(blockNumber) {
		//to do
	}

	/**
	 * Queries the ledger for Transaction by number.
	 * @param {number} transactionID
	 * @returns {object} Transaction information containing the transaction.
	 */
	queryTransaction(transactionID) {
		//to do
	}

	/**
	 * Create  a proposal for transaction. This involves assembling the proposal
	 * with the data (chaincodeID, chaincode invocation spec, etc.) and signing
	 * it using the private key corresponding to the ECert to sign.
	 * @param {string} chaincodePath Path to the chaincode to deploy.
	 * @param {object} chaincodeName A custom name to identify the chaincode on the chain.
	 * @param {string} fcn Name of the chaincode function to call after deploy to initiate the state.
	 * @param {string[]} args Arguments for calling the init function designated by “fcn”.
	 * @param {boolean} sign Whether to sign the transaction, default to True.
	 * @returns {object} The created Proposal instance or None.
	 */
	createDeploymentProposal(chaincodePath, chaincodeName, fcn, args, sign) {
		//to do - the function name in the doc is createDeployProposal
		//to do - not sure if this code is what was intended
		let proposal = {
			chaincodePath: chaincodePath,
			chaincodeId: chaincodeName,
			fcn: fcn,
			args: args,
			sign: sign
		};
		logger.debug('Chain createDeployProposal: chaincodePath: %s, chaincodeId: %s, fcn: %s, args: %s, sign: %s',
			chaincodePath, chaincodeName, fcn, args, sign);
		return proposal;
	}

	/**
	 * Sends a deployment proposal to one or more endorsing peers.
	 *
	 * @param {Object} request - An object containing the following fields:
	 *		<br>`targets` : required - An array or single Endorsing {@link Peer} objects as the targets of the request
	 *		<br>`chaincodePath` : required - String of the path to location of the source code of the chaincode
	 *		<br>`chaincodeId` : required - String of the name of the chaincode
	 *		<br>`fcn` : optional - String of the function to be called on the chaincode once deployed (default 'init')
	 *		<br>`args` : optional - String Array arguments specific to the chaincode being deployed
	 *		<br>`dockerfile-contents` : optional - String defining the
	 * @returns {Promise} A Promise for a `ProposalResponse`
	 * @see /protos/peer/fabric_proposal_response.proto
	 */
	sendDeploymentProposal(request) {
		//to do - this function is missing from the doc, so moved it here as is
		// Verify that chaincodePath is being passed
		if (!request.chaincodePath || request.chaincodePath === '') {
			logger.error('Invalid input parameter to "sendDeploymentProposal": must have "chaincodePath"');
		  	return Promise.reject(new Error('Missing chaincodePath in Deployment proposal request'));
		}

		if(!request.chaincodeId) {
			logger.error('Missing chaincodeId in the Deployment proposal request');
			return Promise.reject(new Error('Missing chaincodeId in the Deployment proposal request'));
		}

		// verify that the caller has included a peer object
		if(this.getPeers().length < 1) {
			logger.error('Missing endorsing peer objects to "sendDeploymentProposal": must have peer objects in chain');
			return Promise.reject(new Error('Missing endorsing peer objects to "sendDeploymentProposal": must have peer objects in chain'));
		}
		request.targets = chain.getPeers();

		// args is optional because some chaincode may not need any input parameters during initialization
		if (!request.args) {
			request.args = [];
		}
		let self = this;

		return packageChaincode(request.chaincodePath, request.chaincodeId, request['dockerfile-contents'])
		.then(
			function(data) {
				var targzFilePath = data;

				logger.debug('Chain.sendDeployment- Successfully generated chaincode deploy archive and name (%s)', request.chaincodeId);

				// at this point, the targzFile has been successfully generated

				// step 1: construct a ChaincodeSpec
				var args = [];
				args.push(Buffer.from(request.fcn ? request.fcn : 'init', 'utf8'));

				for (let i=0; i<request.args.length; i++)
					args.push(Buffer.from(request.args[i], 'utf8'));

				let ccSpec = {
					type: _ccProto.ChaincodeSpec.Type.GOLANG,
					chaincodeID: {
						name: request.chaincodeId
					},
					ctorMsg: {
						args: args
					}
				};

				// step 2: construct the ChaincodeDeploymentSpec
				let chaincodeDeploymentSpec = new _ccProto.ChaincodeDeploymentSpec();
				chaincodeDeploymentSpec.setChaincodeSpec(ccSpec);

				return new Promise(function(resolve, reject) {
					fs.readFile(targzFilePath, function(err, data) {
						if(err) {
							reject(new Error(util.format('Error reading deployment archive [%s]: %s', targzFilePath, err)));
						} else {
							chaincodeDeploymentSpec.setCodePackage(data);

							// TODO add ESCC/VSCC info here ??????
							let lcccSpec = {
								type: _ccProto.ChaincodeSpec.Type.GOLANG,
								chaincodeID: {
									name: 'lccc'
								},
								ctorMsg: {
									args: [Buffer.from('deploy', 'utf8'), Buffer.from('default', 'utf8'), chaincodeDeploymentSpec.toBuffer()]
								}
							};

							let proposal = self._buildProposal(lcccSpec, 'lccc');
							let signed_proposal = self._signProposal(proposal);

							return Chain._sendPeersProposal(request.targets, signed_proposal)
							.then(
								function(responses) {
									resolve([responses, proposal]);
								}
							).catch(
								function(err) {
									logger.error('Sending the deployment proposal failed. Error: %s', err.stack ? err.stack : err);
									reject(err);
								}
							);
						}
					});
				});
			}
		).catch(
			function(err) {
				logger.error('Building the deployment proposal failed. Error: %s', err.stack ? err.stack : err);
				return Promise.reject(err);
			}
		);
	}

	/**
	 * Create  a proposal for transaction. This involves assembling the proposal with the data
	 * (chaincodeName, function to call, arguments, etc.) and signing it using the private key
	 * corresponding to the ECert to sign.
	 * @param {string} chaincodeName The name given to the target chaincode to invoke.
	 * @param {string[]} args Arguments for calling the “invoke” method on the chaincode.
	 * @param {boolean} sign Whether to sign the transaction, default to True.
	 * @returns {object} The created TransactionProposal instance or None.
	 */
	createTransactionProposal(chaincodeName, args, sign){
		let proposal = {
			chaincodeId : chaincodeName,
			args: args,
			sign: sign
		};
		logger.debug('Chain createTransactionProposal: chaincodeName: %s, fcn: %s, args: %s, sign: %s',
				chaincodeName, fcn, args, sign);
		return proposal;
	}

	/**
	 * Send  the created proposal to peer for endorsement.
	 * @param {object} request The transaction proposal data.
	 * @param {Chain} chain The target chain whose peers the proposal will be sent to.
	 * @param {number} retry How many times to retry when failure, by default to 0.
	 * @returns {object} The response to send proposal request.
	 */
	sendTransactionProposal(request, retry) {
		//to do - why does doc include chain as parameter (request, chain, retry) when we can use this chain?
		logger.debug('Chain.sendTransactionProposal - start');

		if (!retry) retry = 0;//to do - use it

		// verify that the caller has included a peer object
		if(this.getPeers().length < 1) {
			logger.error('Missing endorsing peer objects to "sendTransactionProposal": must have peer objects in chain');
			return Promise.reject(new Error('Missing endorsing peer objects to "sendTransactionProposal": must have peer objects in chain'));
		}
		request.targets = this.getPeers();

		if(!request || request && !request.chaincodeId) {
			logger.error('Missing chaincodeId in the Transaction proposal request');
			return Promise.reject(new Error('Missing chaincodeId in the Transaction proposal request'));
		}

		// args is not optional because we need for transaction to execute
		if (!request.args) {
			logger.error('Missing arguments in Transaction proposal request');
			return Promise.reject(new Error('Missing arguments in Transaction proposal request'));
		}

		var args = [];
		// leaving this for now... but this call is always an invoke and we are not telling caller to include 'fcn' any longer
		args.push(Buffer.from('invoke', 'utf8'));
		logger.debug('Chain.sendTransactionProposal - adding function arg:%s', 'invoke');

		for (let i=0; i<request.args.length; i++) {
			args.push(Buffer.from(request.args[i], 'utf8'));
			logger.debug('Chain.sendTransactionProposal - adding arg:%s', request.args[i]);
		}

		let invokeSpec = {
			type: _ccProto.ChaincodeSpec.Type.GOLANG,
			chaincodeID: {
				name: request.chaincodeId
			},
			ctorMsg: {
				args: args
			}
		};

		let proposal = this._buildProposal(invokeSpec, request.chaincodeId);
		let signed_proposal = this._signProposal(proposal);

		return Chain._sendPeersProposal(request.targets, signed_proposal)
		.then(
			function(responses) {
				return Promise.resolve([responses,proposal]);
			}
		).catch(
			function(err) {
				logger.error('Failed Proposal. Error: %s', err.stack ? err.stack : err);
				return Promise.reject(err);
			}
		);

	}

	/**
	 * Create a transaction with proposal response, following the endorsement policy.
	 * @param {object[]} proposalResponses The array of proposal responses.
	 * received in the proposal call.
	 * @returns {Object} The created transaction object instance.
	 */
	createTransaction(proposalResponses) {
		//to do - how to create a transaction object instance?  Also needs proposal - proposalResponses[1]
	}

	/**
	 * Send a transaction to the chain’s orderer service (one or more orderer endpoints) for
	 * consensus and committing to the ledger.
	 *
	 * This call is asynchronous and the successful transaction commit is notified via a BLOCK
	 * or CHAINCODE event. This method must provide a mechanism for applications to attach event
	 * listeners to handle “transaction submitted”, “transaction complete” and “error” events.
	 *
	 * Note that under the cover there are two different kinds of communications with the fabric
	 * backend that trigger different events to be emitted back to the application’s handlers:
	 *   - The grpc client with the orderer service uses a “regular” stateless HTTP connection in a
	 * request/response fashion with the “broadcast” call. The method implementation should emit
	 * “transaction submitted” when a successful acknowledgement is received in the response, or
	 * “error” when an error is received
	 *   - The method implementation should also maintain a persistent connection with the Chain’s
	 * event source Peer as part of the internal event hub mechanism in order to support the fabric
	 * events “BLOCK”, “CHAINCODE” and “TRANSACTION”. These events should cause the method to emit
	 * “complete” or “error” events to the application.
	 * @param {object} transaction The transaction object constructed above.
	 * @returns {EventEmitter} A handle to allow the application to attach event handlers on
	 * “submitted”, “complete”, and “error”.
	 */
	sendTransaction(proposalResponses, chaincodeProposal) {
		//(transaction) - to do - new SDK wants transaction as param
		logger.debug('Chain.sendTransaction - start :: chain '+this._chain);

/*
		if (!transaction)  {
			logger.error('Chain.sendTransaction - Missing transaction object parameter');
			return Promise.reject(new Error('Missing transaction object parameter'));
		}
*/
		// Verify that data is being passed in
		if (!proposalResponses) {
			logger.error('Chain.sendTransaction - input proposalResponse missing');
			return Promise.reject(new Error('Missing proposalResponse object parameter'));
		}
		if (!chaincodeProposal) {
			logger.error('Chain.sendTransaction - input chaincodeProposal missing');
			return Promise.reject(new Error('Missing chaincodeProposal object parameter'));
		}
		// verify that we have an orderer configured
		if(this.getOrderers().length < 1) {
			logger.error('Chain.sendTransaction - no Orderer defined');
			return Promise.reject(new Error('no Orderer defined'));
		}

		var endorsements = [];
		let proposalResponse = proposalResponses;
		if(Array.isArray(proposalResponses)) {
			for(let i=0; i<proposalResponses.length; i++) {
				// make sure only take the valid responses to set on the consolidated response object
				// to use in the transaction object
				if (proposalResponses[i].response && proposalResponses[i].response.status === 200) {
					proposalResponse = proposalResponses[i];
					endorsements.push(proposalResponse.endorsement);
				}
			}
		} else {
			endorsements.push(proposalResponse.endorsement);
		}

//		logger.debug('Chain.sendTransaction - proposalResponse %j', proposalResponse);
//		logger.debug('Chain.sendTransaction - chaincodePropsoal %j', chaincodeProposal);

		var chaincodeEndorsedAction = new _ccTransProto.ChaincodeEndorsedAction();
		chaincodeEndorsedAction.setProposalResponsePayload(proposalResponse.payload);//Illegal buffer
		chaincodeEndorsedAction.setEndorsements(endorsements);

		var chaincodeActionPayload = new _ccTransProto.ChaincodeActionPayload();
		chaincodeActionPayload.setAction(chaincodeEndorsedAction);
		chaincodeActionPayload.setChaincodeProposalPayload(chaincodeProposal.payload);

		var transactionAction = new _transProto.TransactionAction();
		transactionAction.setHeader(chaincodeProposal.header);
		transactionAction.setPayload(chaincodeActionPayload.toBuffer());

		var actions = [];
		actions.push(transactionAction);

		var transaction2 = new _transProto.Transaction2();
		transaction2.setActions(actions);

		let header = Member._buildHeader(this._enrollment.certificate, null);

		var payload = new _commonProto.Payload();
		payload.setHeader(header);
		payload.setData(transaction2.toBuffer());

		// building manually or will get protobuf errors on send
		var envelope = {
			payload : payload.toBuffer()
		};

		var orderer = this._chain.getOrderer();
		return orderer.sendBroadcast(envelope);
	}

	/**
	 * Send an endorsement proposal to an endorser.
	 *
	 * @param {Proposal} proposal A proposal of type Proposal
	 * @see /protos/peer/fabric_proposal.proto
	 * @returns Promise for a ProposalResponse
	 */
	sendProposal(proposal) {
		logger.debug('Chain.sendProposal - Start');
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

	 // internal utility method to return one Promise when sending a proposal to many peers
	/**
	 * @private
	 */
	 static _sendPeersProposal(peers, proposal) {
		if(!Array.isArray(peers)) {
			peers = [peers];
		}
		// make function to return an individual promise
		var self = this;
		var fn = function peerSendProposal(peer) {
			return new Promise(function(resolve,reject) {
				self.sendProposal(proposal)
				.then(
					function(result) {
						resolve(result);
					}
				).catch(
					function(err) {
						logger.error('Chain-sendPeersProposal - Promise is rejected: %s',err.stack ? err.stack : err);
						return reject(err);
					}
				);
			});
		};
		// create array of promises mapping peers array to peer parameter
		// settle all the promises and return array of responses
		var promises = peers.map(fn);
		var responses = [];
		return settle(promises)
		  .then(function (results) {
			results.forEach(function (result) {
			  if (result.isFulfilled()) {
				logger.debug('Chain-sendPeersProposal - Promise is fulfilled: '+result.value());
				responses.push(result.value());
			  } else {
				logger.debug('Chain-sendPeersProposal - Promise is rejected: '+result.reason());
				responses.push(result.reason());
			  }
			});
			return responses;
		});
	}

	/**
	* return a printable representation of this object
	*/
	toString() {
		let orderers = '';
		for (let i = 0; i < this._orderers.length; i++) {
			orderers = orderers + this._orderers[i].toString() + '|';
		}
		var state = {
			name: this._name,
			orderers: this._orderers ? orderers : 'N/A'
		};

		return JSON.stringify(state);
	}

};

module.exports = Chain;
