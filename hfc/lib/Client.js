/*
 Copyright 2016 IBM All Rights Reserved.

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

var Chain = require('./Chain.js');
var sdkUtils = require('./utils.js');
var logger = sdkUtils.getLogger('Client.js');

/**
 * Main interaction handler with end user. A client instance provides a handler to interact
 * with a network of peers, orderers and optionally member services. An application using the
 * SDK may need to interact with multiple networks, each through a separate instance of the Client.
 *
 * Each client when initially created should be initialized with configuration data from the
 * consensus service, which includes a list of trusted roots, orderer certificates and IP addresses,
 * and a list of peer certificates and IP addresses that it can access. This must be done out of band
 * as part of bootstrapping the application environment. It is also the responsibility of the application
 * to maintain the configuration of a client as the SDK does not persist this object.
 *
 * Each Client instance can maintain several chains representing channels and the associated sub-ledgers.
 *
 * @class
 *
 */
var Client = class {

	constructor() {
		this._chains = [];
		this._stateStore = null;
		this._cryptoSuite = null;
		this._userContext = null;
	}

    /**
	 * Initializes a chain instance with the given name. This is really representing the “Channel”
     * (as explained above), and this call returns an empty object. To initialize the channel,
     * a list of participating endorsers and orderer peers must be configured first on the returned object.
     * @param {string} name The name of the chain.  Recommend using namespaces to avoid collision.
	 * @returns {Chain} The uninitialized chain instance.
	 */
	newChain(name) {
		var chain = new Chain(name);
		this._chains.push(chain);
		return chain;
	}

	/**
	 * Get a chain instance from the state storage. This allows existing chain instances to be saved
	 * for retrieval later and to be shared among instances of the application. Note that it’s the
	 * application/SDK’s responsibility to record the chain information. If an application is not able
	 * to look up the chain information from storage, it may call another API that queries one or more
	 * Peers for that information.
	 * @param {string} name The name of the chain.
	 * @returns {Chain} The chain instance or error if the state store has not been set or a
	 * chain does not exist under that name.
	 */
	getChain(name) {
		for(var i = 0; i < this._chains.length; i++) {
			if (this._chains[i].getName(name) === name) {
				return this._chains[i];
			}
		}
		logger.error('Chain not found for name '+name+'.');
		return new Error('Chain not found for name '+name+'.');
	}

	/**
	 * This is a network call to the designated Peer(s) to discover the chain information.
	 * The target Peer(s) must be part of the chain to be able to return the requested information.
	 * @param {string} name The name of the chain.
	 * @param {Peer[]} peers Array of target Peers to query.
	 * @returns {Chain} The chain instance for the name or error if the target Peer(s) does not know
	 * anything about the chain.
	 */
	queryChainInfo(name, peers) {
		//to do
	}

	/**
	 * Sends a proposal to one or more endorsing peers that will be handled by the chaincode.
	 * This request will be presented to the chaincode 'invoke' and must understand
	 * from the arguments that this is a query request. The chaincode must also return
	 * results in the byte array format and the caller will have to be able to decode
	 * these results
	 *
	 * @param {Object} request A JSON object with the following
	 *		<br>targets : An array or single Endorsing {@link Peer} objects as the targets of the request
	 *		<br>chaincodeId : The id of the chaincode to perform the query
	 *		<br>`args` : an array of arguments specific to the chaincode 'innvoke'
	 *             that represent a query invocation on that chaincode
	 * @returns {Promise} A Promise for an array of byte array results from the chaincode on all Endorsing Peers
	 */
	queryByChaincode(chainName, request) {
		//to do - is this queryChainInfo?
		logger.debug('Client.queryByChaincode - start');
		var self = this;
		return self.getChain(chainName).sendTransactionProposal(request)
		.then(
			function(results) {
				var responses = results[0];
				var proposal = results[1];
				logger.debug('Client-queryByChaincode - response %j', responses);
				if(responses && Array.isArray(responses)) {
					var results = [];
					for(let i = 0; i < responses.length; i++) {
						if(responses[i].response && responses[i].response.payload) {
							results.push(responses[i].response.payload);
						}
					}
					return Promise.resolve(results);
				}
				return Promise.reject(new Error('Payload results are missing from the chaincode query'));
			}
		).catch(
			function(err) {
				logger.error('Failed Query by chaincode. Error: %s', err.stack ? err.stack : err);
				return Promise.reject(err);
			}
		);
	}

	/**
	 * The enrollment materials for Users that have appeared in the instances of the application.
	 *
	 * The SDK should have a built-in key value store file-based implementation to allow easy setup during
	 * development. Production systems would use a store backed by database for more robust storage and
	 * clustering, so that multiple app instances can share app state via the database.
	 * This API makes this pluggable so that different store implementations can be selected by the application.
	 * @param {KeyValueStore} keyValueStore Instance of an alternative KeyValueStore implementation provided by
	 * the consuming app.
	 */
	setStateStore(keyValueStore) {
		this._stateStore = keyValueStore;
	}

	/**
	 * Save the state of this member to the key value store.
	 * @returns {Promise} A Promise for a 'true' upon successful save
	 */
	saveState() {
		//to do - this function is not in the doc - what is the name of the key to setValue?
		return this._stateStore.setValue(this._userContext._name, this._userContext.toString());
	}

	/**
	 * Sets an instance of the CryptoSuite interface implementation. A crypto suite encapsulates algorithms
	 * for digital signatures and encryption with asymmetric key pairs, message encryption with a symmetric key,
	 * and secure hashing and MAC.
	 * @param {object} suite An instance of a crypto suite implementation.
	 */
	setCryptoSuite(suite) {
		this._cryptoSuite = suite;
	}

	/**
	 * Sets an instance of the User class as the security context of this client instance. This user’s
	 * credentials (ECert) will be used to conduct transactions and queries with the blockchain network.
	 * Upon setting the user context, the SDK saves the object in a persistence cache if the “state store”
	 * has been set on the Client instance. If no state store has been set, this cache will not be established
	 * and the application is responsible for setting the user context again if the application crashes and is recovered.
	 * @param {User} user An instance of the User class encapsulating the authenticated user’s signing materials
	 * (private key and enrollment certificate)
	 */
	setUserContext(user) {
		this._userContext = user;
	}

	/**
	 * As explained above, the client instance can have an optional state store. The SDK saves enrolled users
	 * in the storage which can be accessed by authorized users of the application (authentication is done by
	 * the application outside of the SDK). This function attempts to load the user by name from the local storage
	 * (via the KeyValueStore interface). The loaded user object must represent an enrolled user with a valid
	 * enrollment certificate signed by a trusted CA (such as the COP server).
	 * @param {string} name The name of the user.
	 * @returns {Promise} The user object corresponding to the name, or null if the user does not exist or if the
	 * state store has not been set.
	 */
	getUserContext(name) {
		var self = this;
		return new Promise(function(resolve, reject) {
			if (!self._userContext) {
				logger.error('No UserContext was found on this Client instance: name - "%s"', name);
				return reject(new Error('No UserContext was found.  You must first call Client setUserContext'));
			}
			if (self._userContext._name != name) {
				logger.error('UserContext: name - "%s" does not match getUserContext(%s)', self._userContext._name, name);
				return reject(new Error('UserContext name does not match name passed to getUserContext'));
			}
			if (!self._stateStore) {
				logger.error('No key value store was found on this Client instance: name - "%s"', name);
				return reject(new Error('No key value store was found.  You must first call Client setStateStore'));
			}

			self.restoreState(name).then(
				function(member) {
					logger.debug('Requested user "%s" resolved successfully on this Client instance: name - %s', name, name);
					return resolve(member);
				}
			).catch(
				function(err) {
					logger.error('Failed to construct an instance of requested user "%s" on this Client instance. Error: %s', name, err.stack ? err.stack : err);
					reject(err);
				}
			);
		});
	}

	/**
	 * Restore the state of this member from the key value store (if found).  If not found, do nothing.
	 * @returns {Promise} A Promise for a 'true' upon successful restore
	 */
	restoreState(name) {
		var self = this;

		return new Promise(function(resolve, reject) {
			if (!self._stateStore.getValue) {
				logger.error('KeyValueStore.getValue function is undefined.  Need to setValue on KeyValueStore.');
				reject(new Error('KeyValueStore.getValue function is undefined.  Need to setValue on KeyValueStore.'));
			}

			self._stateStore.getValue(name)
			.then(
				function(memberStr) {
					if (memberStr) {
						// The member was found in the key value store, so restore the state.
						return self._userContext.fromString(memberStr)
						.then(function(data) {
							logger.info('Successfully loaded user "%s" from local key value store', name);
							return resolve(data);
						});
					} else {
						logger.info('Failed to load user "%s" from local key value store', name);
						return reject('Failed to load user from local key value store');
					}
				}
			).catch(
				function(err) {
					logger.error('Failed to load user "%s" from local key value store. Error: %s', name, err.stack ? err.stack : err);
					reject(err);
				}
			);
		});
	}

	/**
	 * A convenience method for obtaining the state store object in use for this client.
	 * @return {KeyValueStore} The KeyValueStore implementation object set within this Client, or null if it does not exist.
	 */
	getStateStore() {
		return this._stateStore;
	}
};

module.exports = Client;