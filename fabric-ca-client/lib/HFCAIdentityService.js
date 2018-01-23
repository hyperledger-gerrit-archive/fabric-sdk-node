const logger = require('./utils').getLogger('HFCAIdentity');

/**
 * HFCA_PEER indicates that an identity is acting as a peer
 */
const HFCA_PEER = 'peer';
/**
 * HFCA_ORDERER indicates that an identity is acting as an orderer
 */
const HFCA_ORDERER = 'orderer';
/**
 * HFCA_CLIENT indicates that an identity is acting as a client
 */
const HFCA_CLIENT = 'client';
/**
 * HFCA_USER indicates that an identity is acting as a user
 */
const HFCA_USER = 'user';

/**
 * HFCA_HFREGISTRARROLES is an attribute that allows a registrar to manage identities of the specified roles
 */
const HFCA_HFREGISTRARROLES = 'hf.Registrar.Roles';
/**
 * HFCA_HFREGISTRARDELEGATEROLES is an attribute that allows a registrar to give the roles specified
 * to a registree for its 'hf.Registrar.Roles' attribute
 */
const HFCA_HFREGISTRARDELEGATEROLES = 'hf.Registrar.DelegateRoles';
/**
 * HFCA_HFREGISTRARATTRIBUTES is an attribute that has a list of attributes that the registrar is allowed to register
 * for an identity
 */
const HFCA_HFREGISTRARATTRIBUTES = 'hf.Registrar.Attributes';
/**
 * HFCA_HFREVOKER is a boolean attribute that allows an identity to enroll as an intermediate CA
 */
const HFCA_HFINTERMEDIATECA = 'hf.IntermediateCA';
/**
 * HFCA_HFREVOKER is a boolean attribute that allows an identity to revoker a user and/or certificates
 */
const HFCA_HFREVOKER = 'hf.Revoker';
/**
 * HFCA_HFREGISTRARROLES is a boolean attribute that allows an identity to manage affiliations
 */
const HFCA_HFAFFILIATIONMGR = 'hf.AffiliationMgr';
/**
 * HFCA_HFREGISTRARROLES is an attribute that allows an identity to generate a CRL
 */
const HFCA_HFGENCRL = 'hf.GenCRL';

class HFCAIdentity {
	constructor(client) {
		this.client = client;
	}

	/**
	 * @typedef {Object} HFCAIdentiy
	 * @property {string} enrollmentID - Required. The enrollment ID which uniquely identifies an identity
	 * @property {string} affiliation - Required. The affiliation path of the new identity
	 * @property {KeyValueAttribute[]} attrs - Array of {@link KeyValueAttribute} attributes to assign to the user
	 * @property {string} type - Optional. The type of the identity (e.g. *user*, *app*, *peer*, *orderer*, etc)
	 * @property {string} enrollmentSecret - Optional. The enrollment secret.  If not provided, a random secret is generated.
	 * @property {number} maxEnrollments - Optional. The maximum number of times that the secret can be used to enroll.
	 *    If 0, use the configured max_enrollments of the fabric-ca-server;
	 *    If > 0 and <= configured max enrollments of the fabric-ca-server, use max_enrollments;
	 *    If > configured max enrollments of the fabric-ca-server, error.
	 * @property {string} caname - Optional. Name of the CA to direct traffic to within server
	 */

	/**
	 * @typedef {Object} IdentityServiceResponseMessage
	 * @property {number} code - Integer code denoting the type of message
	 * @property {string} message - A more specific message
	 */

	/**
	 * @typedef {Object} IdentityServiceResponse
	 * @property {boolean} Success - Boolean indicating if the request was successful
	 * @property {Object} Result - The result of this request
	 * @property {IdentityServiceResponseMessage[]} Errors - An array of error messages (code and message)
	 * @property {IdentityServiceResponseMessage[]} Messages - An array of information messages (code and message)
	 */

	/**
	 * create an identity, Create a new identity with the Fabric CA server.
	 * An enrollment secret is returned which can then be used, along with the enrollment ID, to enroll a new identity.
	 * The caller must have `hf.Registrar` authority.
	 *
	 * @param {HFCAIdentiy} req - The {@link HFCAIdentiy}
	 * @param {User} registrar The identity of the registrar (i.e. who is performing the registration).
	 * @return {Promise} Return the secret of this new identity
	 */
	create(req, registrar) {
		if (typeof req === 'undefined' || req === null) {
			throw new Error('Missing required argument "request"');
		}

		if (!req.enrollmentID || !req.affiliation) {
			throw new Error('Missing required parameters.  "request.enrollmentID", "request.affiliation" are all required.');
		}
		checkRegistrar(registrar);
		if (!req.maxEnrollments) {
			// set default maxEnrollments to 1
			req.maxEnrollments = 1;
		}

		let self = this;
		let signingIdentity = registrar.getSigningIdentity();
		if (!signingIdentity) {
			throw new Error('Can not get signingIdentity from registrar');
		}

		return new Promise(function (resolve, reject) {
			const request = {
				info: {
					id: req.enrollmentID,
					type: req.type || null,
					affiliation: req.affiliation,
					attrs: req.attrs || [],
					max_enrollments: req.maxEnrollments,
				},
				secret: req.enrollmentSecret || null,
				caname: req.caname || null,
			};

			return self.client.post('identities', request, signingIdentity)
				.then(function (response) {
					return resolve(response.result.secret);
				}).catch(function (err) {
					return reject(err);
				});
		});
	}

	/**
	 * Get an identity. The caller must have `hf.Registrar` authority.
	 *
	 * @param {string} enrollmentID - Required. The enrollment ID which uniquely identifies an identity
	 * @param {User} registrar - Required. The identity of the registrar (i.e. who is performing the registration).
	 * @return {Promise} {@link IdentityServiceResponse}
	 */
	getOne(enrollmentID, registrar) {
		if (!enrollmentID || typeof enrollmentID !== 'string') {
			throw new Error('Missing required argument "enrollmentID", or argument "enrollmentID" is not a valid string');
		}
		checkRegistrar(registrar);

		let self = this;
		let signingIdentity = registrar.getSigningIdentity();
		if (!signingIdentity) {
			throw new Error('Can not get signingIdentity from registrar');
		}

		const url = 'identities/' + enrollmentID;
		return self.client.get(url, signingIdentity);
	}

	/**
	 * Get all identities that the registrar is entitled to see.
	 *
	 * @param {User} registrar - Required. The identity of the registrar (i.e. who is performing the registration).
	 * @return {Promise} {@link IdentityServiceResponse}
	 */
	getAll(registrar) {
		checkRegistrar(registrar);

		let signingIdentity = registrar.getSigningIdentity();
		if (!signingIdentity) {
			throw new Error('Can not get signingIdentity from registrar');
		}

		return this.client.get('identities', signingIdentity);
	}

	/**
	 * Delete an existing identity. The caller must have `hf.Registrar` authority.
	 *
	 * @param {string} enrollmentID
	 * @param {User} registrar
	 * @return {Promise} {@link IdentityServiceResponse}
	 */
	delete(enrollmentID, registrar) {
		if (!enrollmentID || typeof enrollmentID !== 'string') {
			throw new Error('Missing required argument "enrollmentID", or argument "enrollmentID" is not a valid string');
		}
		checkRegistrar(registrar);

		let signingIdentity = registrar.getSigningIdentity();
		if (!signingIdentity) {
			throw new Error('Can not get signingIdentity from registrar');
		}

		const url = 'identities/' + enrollmentID;
		return this.client.delete(url, signingIdentity);
	}

	/**
	 * Update an existing identity. The caller must have `hf.Registrar` authority.
	 *
	 * @param {string} enrollmentID
	 * @param {HFCAIdentiy} req
	 * @param {User} registrar
	 * @return {Promise} {@link IdentityServiceResponse}
	 */
	update(enrollmentID, req, registrar) {
		if (!enrollmentID || typeof enrollmentID !== 'string') {
			throw new Error('Missing required argument "enrollmentID", or argument "enrollmentID" is not a valid string');
		}
		checkRegistrar(registrar);
		let signingIdentity = registrar.getSigningIdentity();
		if (!signingIdentity) {
			throw new Error('Can not get signingIdentity from registrar');
		}
		const url = 'identities/' + enrollmentID;
		return this.client.put(url, req, signingIdentity);
	}
}

function checkRegistrar(registrar) {
	if (typeof registrar === 'undefined' || registrar === null) {
		throw new Error('Missing required argument "registrar"');
	}

	if (typeof registrar.getSigningIdentity !== 'function') {
		throw new Error('Argument "registrar" must be an instance of the class "User", but is found to be missing a method "getSigningIdentity()"');
	}
}

module.exports = HFCAIdentity;
module.exports.HFCAIdentityType = {
	HFCA_PEER,
	HFCA_ORDERER,
	HFCA_CLIENT,
	HFCA_USER,
};
module.exports.HFCAIdentityAttributes = {
	HFCA_HFREGISTRARROLES,
	HFCA_HFREGISTRARDELEGATEROLES,
	HFCA_HFREGISTRARATTRIBUTES,
	HFCA_HFINTERMEDIATECA,
	HFCA_HFREVOKER,
	HFCA_HFAFFILIATIONMGR,
	HFCA_HFGENCRL,
};
