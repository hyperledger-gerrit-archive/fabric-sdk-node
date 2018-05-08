const grpc = require('grpc');
const fs = require('fs');
const Policy = require('./Policy.js');
const _collectionProto = grpc.load(__dirname + '/protos/common/collection.proto').common;
const _mspPrProto = grpc.load(__dirname + '/protos/msp/msp_principal.proto').common;
const _policiesProto = grpc.load(__dirname + '/protos/common/policies.proto').common;

const utils = require('./utils.js');
const logger = utils.getLogger('SideDB.js');

class CollectionConfig {
	static buildCollectionConfigPackage(collectionsConfig) {
		try {
			let content = collectionsConfig;
			if (typeof collectionsConfig === 'string') {
				logger.debug('Read CollectionsConfig From %s', collectionsConfig);
				content = fs.readFileSync(collectionsConfig, 'utf8');
				content = JSON.parse(content);
			}
			if (!Array.isArray(content)) {
				logger.error('Expect collections config of type Array, found %s', typeof content);
				throw new Error('Expect collections config of type Array');
			}
			console.log(content[0]);
			let collectionConfigPackage = [];
			content.forEach(config => {
				const collectionConfig = buildCollectionConfig(config);
				collectionConfigPackage.push(collectionConfig);
			});
			collectionConfigPackage = new _collectionProto.CollectionConfigPackage(collectionConfigPackage);

			return collectionConfigPackage;
		} catch (e) {
			logger.error(e);
			throw e;
		}
	}
}

function buildCollectionConfig(collectionsConfig) {
	/**
	 * collectionsConfig can be either:
	 *   - A string represents the collection-config.json file path
	 *   - An array of collectionConfig
	 */
	try {
		// TODO: validation check
		const {
			name,
			policy,
			maxPeerCount,
			requiredPeerCount
		} = collectionsConfig;
		let static_collection_config = {
			name,
			member_orgs_policy: {},
			required_peer_count: requiredPeerCount,
			maximum_peer_count: maxPeerCount
		};

		let principals = [];
		policy.identities.forEach((identity) => {
			let newPrincipal = Policy.buildPrincipal(identity);
			principals.push(newPrincipal);
		});

		let signaturePolicy = Policy.buildSignaturePolicy(policy.policy);

		let signaturePolicyEnvelope = {
			version: 0,
			rule: signaturePolicy,
			identities: principals
		};

		static_collection_config.member_orgs_policy.signature_policy = signaturePolicyEnvelope;

		return {
			static_collection_config
		};
	} catch (e) {
		logger.error(e);
		throw e;
	}
}

module.exports = {
	CollectionConfig
};
