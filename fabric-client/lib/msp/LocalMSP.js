'use strict';

var api = require('../api.js');
var MSP = require('./msp.js');
var CKS = require('../impl/CryptoKeyStore.js');
var utils = require('../utils.js');
var path = require('path');
const os = require('os');
var util = require('util');
var logger = utils.getLogger('LocalMSP.js');

/*var grpc = require('grpc');
var identityProto = grpc.load(__dirname + '/../protos/identity.proto').msp;
var _mspConfigProto = grpc.load(__dirname + '/../protos/msp/mspconfig.proto').msp;
*/

/**
 * MSP is the minimal Membership Service Provider Interface to be implemented
 * to manage identities (in terms of signing and signature verification) represented
 * by private keys and certificates generated from different algorithms (ECDSA, RSA, etc)
 * and PKIs (software-managed or HSM based)
 * @class
 */
var LocalMSP = class extends MSP {
	/**
	 * Setup the MSP instance according to configuration information
	 * @param {Object} config A configuration object specific to the implementation. For this
	 * implementation it uses the following fields:
	 *		<br>`rootCerts`: array of {@link Identity} representing trust anchors for validating
	 *           signing certificates. Required for MSPs used in verifying signatures
	 *		<br>`intermediateCerts`: array of {@link Identity} representing trust anchors for validating
	 *           signing certificates. optional for MSPs used in verifying signatures
	 *		<br>`admins`: array of {@link Identity} representing admin privileges
	 *		<br>`signer`: {@link SigningIdentity} signing identity. Required for MSPs used in signing
	 *		<br>`id`: {string} value for the identifier of this instance
	 *		<br>`orgs`: {string} array of organizational unit identifiers
	 *		<br>`cryptoSuite': the underlying {@link module:api.CryptoSuite} for crypto primitive operations
	 * @param {object} opts Implementation-specific options object for the {@link KeyValueStore} class to instantiate an instance
	 * @param {string} KVSImplClass Optional. The built-in key store saves private keys. The key store may be backed by different
	 * {@link KeyValueStore} implementations. If specified, the value of the argument must point to a module implementing the
	 * KeyValueStore interface.
	 */
	constructor(config) {
		logger.debug('constructor - start');
		super(config);

		if (!config.storeConfig) {
			config.storeConfig = {};
		}
		if (typeof config.storeConfig.opts === 'undefined' || config.storeConfig.opts === null) {
			config.storeConfig.opts = {
				path: LocalMSP.getDefaultKeyStorePath()
			};
		}

		var superClass;
		if (typeof config.KVSImplClass !== 'undefined' && config.KVSImplClass !== null) {
			superClass = config.KVSImplClass;
		} else {
			// no super class specified, use the default key value store implementation
			superClass = require(utils.getConfigSetting('key-value-store'));
			logger.debug('constructor, no super class specified, using config: '+utils.getConfigSetting('key-value-store'));
		}

		this._store = null;
		this._storeConfig = {
			superClass: superClass,
			opts: config.storeConfig.opts
		};
		this.cryptoSuite = config.cryptoSuite;
	}

	_getKeyStore() {
		var self = this;
		return new Promise((resolve, reject) => {
			if (self._store === null) {
				logger.info(util.format('This class requires a CryptoKeyStore to save keys, using the store: %j', self._storeConfig));

				CKS(self._storeConfig.superClass, self._storeConfig.opts)
				.then((ks) => {
					logger.debug('_getKeyStore returning ks');
					self._store = ks;
					return resolve(self._store);
				}).catch((err) => {
					reject(err);
				});
			} else {
				logger.debug('_getKeyStore resolving store');
				return resolve(self._store);
			}
		});
	}

	static getDefaultKeyStorePath() {
		return path.join(os.homedir(), '.hfc-key-store');
	}
};

module.exports = LocalMSP;
