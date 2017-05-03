'use strict';

var api = require('../api.js');
var MSP = require('./msp.js');
var idModule = require('./identity.js');
var Identity = idModule.Identity;
var SigningIdentity = idModule.SigningIdentity;
var utils = require('../utils.js');
var logger = utils.getLogger('ChannelMSP.js');

var grpc = require('grpc');
var identityProto = grpc.load(__dirname + '/../protos/identity.proto').msp;
var _mspConfigProto = grpc.load(__dirname + '/../protos/msp/mspconfig.proto').msp;


/**
 * MSP is the minimal Membership Service Provider Interface to be implemented
 * to manage identities (in terms of signing and signature verification) represented
 * by private keys and certificates generated from different algorithms (ECDSA, RSA, etc)
 * and PKIs (software-managed or HSM based)
 * @class
 */
var ChannelMSP = class extends MSP {
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
	 */
	constructor(config) {
		logger.debug('const - start');
		super();

		if (!config.cryptoSuite)
			throw new Error('Parameter "config" missing required field "cryptoSuite"');

		if (typeof config.signer !== 'undefined') {
			// when constructing local msp, a signer property is required and it must be an instance of SigningIdentity
			if (!(config.signer instanceof SigningIdentity)) {
				throw new Error('Parameter "signer" must be an instance of SigningIdentity');
			}
		}
	}

	/**
	 * Returns the Protobuf representation of this MSP Config
	 */
	toProtobuf() {
		var proto_msp_config = new _mspConfigProto.MSPConfig();
		proto_msp_config.setType(0); //FABRIC
		var proto_fabric_msp_config = new _mspConfigProto.FabricMSPConfig();
		proto_fabric_msp_config.setName(this._id);
		proto_fabric_msp_config.setRootCerts(this._rootCerts);
		if(this._intermediateCerts) {
			proto_fabric_msp_config.setIntermediateCerts(this._intermediateCerts);
		}
		if(this._admins) {
			proto_fabric_msp_config.setAdmins(this._admins);
		}
		if(this._organization_units) {
			//organizational_unit_identifiers
			proto_fabric_msp_config.setOrganizationalUnitIdentifiers(this._organization_units);
		}
		proto_msp_config.setConfig(proto_fabric_msp_config.toBuffer());
		return proto_msp_config;
	}

	/**
	 * DeserializeIdentity deserializes an identity
	 * @param {byte[]} serializedIdentity - A protobuf-based serialization of an object with
	 * 	      two fields: mspid and idBytes for certificate PEM bytes
	 * @param {boolean} storeKey - if the user should be stored in the key store. Only when
	 *        false will a promise not be returned
	 * @returns {Promise} Promise for an {@link Identity} instance or
	 *           or the Identity object itself if "storeKey" argument is false
	 */
	deserializeIdentity(serializedIdentity, storeKey) {
		logger.debug('importKey - start');
		var store_key = true; //default
		// if storing is not required and therefore a promise will not be returned
		// then storeKey must be set to false;
		if(typeof storeKey === 'boolean') {
			store_key = storeKey;
		}
		var sid = identityProto.SerializedIdentity.decode(serializedIdentity);
		var cert = sid.IdBytes.toBinary();
		logger.debug('Encoded cert from deserialized identity: %s', cert);
		if(!store_key) {
			var publicKey =this.cryptoSuite.importKey(cert, { algorithm: api.CryptoAlgorithms.X509Certificate }, false);
			// TODO: the id of the new Identity instance should probably be derived from the subject info in the cert?
			var sdk_identity = new Identity('SomeDummyValue', cert, publicKey, this);
			return sdk_identity;
		}
		else {
			return this.cryptoSuite.importKey(cert, { algorithm: api.CryptoAlgorithms.X509Certificate })
			.then((publicKey) => {
				// TODO: the id of the new Identity instance should probably be derived from the subject info in the cert?
				return new Identity('SomeDummyValue', cert, publicKey, this);
			});
		}
	}

	/**
	 * Returns a signing identity corresponding to the provided identifier
	 * @param {string} identifier The identifier of the requested identity object
	 * @returns {SigningIdentity}
	 */
	getSigningIdentity(identifier) {
		throw new Error('Not implemented yet');
	}

	/**
	 * Returns the default signing identity
	 * @returns {SigningIdentity}
	 */
	getDefaultSigningIdentity() {
		return this._signer;
	}

};

module.exports = ChannelMSP;
