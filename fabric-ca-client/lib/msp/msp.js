'use strict';

var api = require('../api.js');
var utils = require('../utils.js');
var logger = utils.getLogger('msp.js');


/**
 * MSP is the minimal Membership Service Provider Interface to be implemented
 * to manage identities (in terms of signing and signature verification) represented
 * by private keys and certificates generated from different algorithms (ECDSA, RSA, etc)
 * and PKIs (software-managed or HSM based)
 * @class
 */
var MSP = class {
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
		if (!config)
			throw new Error('Missing required parameter "config"');

		if (!config.id)
			throw new Error('Parameter "config" missing required field "id"');

		if (!config.cryptoSuite)
			throw new Error('Parameter "config" missing required field "cryptoSuite"');

		this._rootCerts = config.rootCerts;
		this._intermediateCerts = config.intermediateCerts;
		this._signer = config.signer;
		this._admins = config.admins;
		this.cryptoSuite = config.cryptoSuite;
		this._id = config.id;
		this._organization_units = config.orgs;
	}

	/**
	 * Get provider identifier
	 * @returns {string}
	 */
	getId() {
		return this._id;
	}

	/**
	 * Get organizational unit identifiers
	 * @returns {string[]}
	 */
	getOrganizationUnits() {
		return this._organization_units;
	}

	/**
	 * Obtain the policy to govern changes
	 * @returns {Object}
	 */
	getPolicy() {
		throw new Error('Not implemented yet');
	}

	/**
	 * Checks whether the supplied identity is valid
	 * @param {Identity} id
	 * @returns {boolean}
	 */
	validate(id) {
		return true;
	}

};

module.exports = MSP;
