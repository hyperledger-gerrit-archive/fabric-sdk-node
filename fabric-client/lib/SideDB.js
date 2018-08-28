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

const grpc = require('grpc');
const fs = require('fs');
const Long = require('long');
const Policy = require('./Policy.js');
const _collectionProto = grpc.load(__dirname + '/protos/common/collection.proto').common;

const utils = require('./utils.js');
const logger = utils.getLogger('SideDB.js');
const { format } = require('util');

class CollectionConfig {

	/**
	 * @typedef {Object} collectionConfig
	 * @property {string} name
	 * @property policy
	 * @property {number} maxPeerCount integer
	 * @property {number} requiredPeerCount integer
	 * @property {!Long|number|string|!{low: number, high: number, unsigned: boolean}} blockToLive param will be converted to unsigned int64 as Long
	 */

	/**
	 *
	 * @param {string|collectionConfig[]} collectionsConfigs can be either:
	 * A string represents the collections-config.json file path;
	 * An array of collectionConfig;
	 */
	static buildCollectionConfigPackage(collectionsConfigs) {
		try {
			let content = collectionsConfigs;
			if (typeof collectionsConfigs === 'string') {
				logger.debug('Read CollectionsConfig From %s', collectionsConfigs);
				content = fs.readFileSync(collectionsConfigs, 'utf8');
				content = JSON.parse(content);
			}
			if (!Array.isArray(content) || content.length === 0) {
				logger.error('Expect collections config of type Array, found %s', typeof content);
				throw new Error('Expect collections config of type Array');
			}
			let collectionConfigPackage = [];
			content.forEach(config => {
				const collectionConfig = this.buildCollectionConfig(config);
				collectionConfigPackage.push(collectionConfig);
			});
			collectionConfigPackage = new _collectionProto.CollectionConfigPackage(collectionConfigPackage);

			return collectionConfigPackage;
		} catch (e) {
			logger.error(e);
			throw e;
		}
	}

	/**
	 *
	 * @param {collectionConfig} collectionConfig
	 * @returns {collectionConfig}
	 */
	static checkCollectionConfig(collectionConfig) {
		let {
			name,
			policy,
			maxPeerCount,
			requiredPeerCount,
			blockToLive
		} = collectionConfig;
		if (!name || typeof name !== 'string') {
			throw new Error(format('CollectionConfig Requires Param "name" of type string, found %j(type: %s)', name, typeof name));
		}
		if (!policy) {
			throw new Error('Missing Required Param "policy"');
		}
		Policy.checkPolicy(policy);
		if (!Number.isInteger(maxPeerCount)) {
			throw new Error(format('CollectionConfig Requires Param "maxPeerCount" of type number, found %j(type: %s)', maxPeerCount, typeof maxPeerCount));
		}
		if (!Number.isInteger(requiredPeerCount)) {
			throw new Error(format('CollectionConfig Requires Param "requiredPeerCount" of type number, found %j(type: %s)', requiredPeerCount, typeof requiredPeerCount));
		}

		if(maxPeerCount<requiredPeerCount){
			throw new Error(`CollectionConfig Requires Param "maxPeerCount" bigger than "requiredPeerCount", found maxPeerCount==${maxPeerCount}, requiredPeerCount==${requiredPeerCount}`);
		}

		if(!blockToLive) {
			blockToLive = 0; //default is never purge
		} else if (Number.isNaN(Number.parseInt(blockToLive)) ||
			Long.fromValue(blockToLive, true).isNegative()) {
			throw new Error(format('CollectionConfig Requires Param "blockToLive" of type unsigned int64, found %j(type: %s)', blockToLive, typeof blockToLive));
		} else {
			const test = Long.fromValue(blockToLive, true);
			logger.debug('checkCollectionConfig blockToLive parse from %j and parsed to %s)', blockToLive, test);

			if(test.toString() !== blockToLive.toString()) {
				throw new Error(format('CollectionConfig Requires Param "blockToLive" to be a valid unsigned int64, input is %j and parsed to %s)', blockToLive, test));
			}
		}

		return {
			name,
			policy,
			maxPeerCount,
			requiredPeerCount,
			blockToLive
		};
	}

	/**
	 * @param {collectionConfig} collectionConfig
	 */
	static buildCollectionConfig(collectionConfig) {
		try {
			const {
				name,
				policy,
				maxPeerCount,
				requiredPeerCount,
				blockToLive
			} = this.checkCollectionConfig(collectionConfig);

			const static_collection_config = {
				name,
				member_orgs_policy: {},
				required_peer_count: requiredPeerCount,
				maximum_peer_count: maxPeerCount,
				block_to_live: blockToLive
			};

			const principals = [];
			policy.identities.forEach((identity) => {
				const newPrincipal = Policy.buildPrincipal(identity);
				principals.push(newPrincipal);
			});

			const signaturePolicy = Policy.buildSignaturePolicy(policy.policy);

			const signaturePolicyEnvelope = {
				version: 0,
				rule: signaturePolicy,
				identities: principals
			};

			static_collection_config.member_orgs_policy.signature_policy = signaturePolicyEnvelope;

			return { static_collection_config };
		} catch (e) {
			logger.error(e);
			throw e;
		}
	}
}

module.exports = CollectionConfig;
