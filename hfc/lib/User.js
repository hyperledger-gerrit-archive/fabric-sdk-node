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
var util = require('util');

/**
 * The User class represents users that have been enrolled and represented by
 * an enrollment certificate (ECert) and a signing key. The ECert must have
 * been signed by one of the CAs the blockchain network has been configured to trust.
 * An enrolled user (having a signing key and ECert) can conduct chaincode deployments,
 * transactions and queries with the Chain.
 *
 * User ECerts can be obtained from a CA beforehand as part of deploying the application,
 * or it can be obtained from the optional Fabric COP service via its enrollment process.
 *
 * Sometimes User identities are confused with Peer identities. User identities represent
 * signing capability because it has access to the private key, while Peer identities in
 * the context of the application/SDK only has the certificate for verifying signatures.
 * An application cannot use the Peer identity to sign things because the application doesn’t
 * have access to the Peer identity’s private key.
 *
 * @class
 */
var User = class {

	/**
	 * Constructor for a user.
	 *
	 * @param {string} name - The user name.
	 * @param {string[]} roles - The roles for this user.
	 */
	constructor(cfg, chain) {
		if (util.isString(cfg)) {
			this._name = cfg;
			this._roles = null; //string[]
		} else if (util.isObject(cfg)) { //to do
			var req = cfg;
			this._name = req.enrollmentID || req.name;
			this._roles = req.roles || ['fabric.user'];
		}
		this._enrollmentSecret = '';
		this._enrollment = null;
	}

    /**
	 * Get the user name. Required property for the instance objects.
	 * @returns {string} The user name.
	 */
	getName() {
		return this._name;
	}

   	/**
	 * Get the user’s roles. An array of possible values in “client”, and “auditor”.
     * The member service defines two more roles reserved for peer membership:
     * “peer” and “validator”, which are not exposed to the applications.
	 * @returns {string[]} The roles for this user.
	 */
	getRoles() {
		return this._roles;
	}

    /**
	 * Get the underlying ECert representing the user’s identity.
	 * @returns {Enrollment} The enrollment certificate in PEM format signed by the trusted CA.
	 */
	getEnrollmentCertificate() {
		return this._enrollment;
	}

    /**
	 * Set the user name. Required property for the instance objects.
	 * @param {string} name The user name.
	 */
	setName(name) {
		this._name = name;
	}

   	/**
	 * Set the user’s roles. An array of possible values in “client”, and “auditor”.
     * The member service defines two more roles reserved for peer membership:
     * “peer” and “validator”, which are not exposed to the applications.
	 * @param {string[]} roles The array of roles for this user.
	 */
	setRoles(roles) {
		this._roles = roles;
	}

    /**
	 * Set the user’s Enrollment Certificate.
	 */
	setEnrollmentCertificate(enrollment) {
		if (typeof enrollment.privateKey === 'undefined' || enrollment.privateKey === null || enrollment.privateKey === '') {
			throw new Error('Invalid enrollment object. Must have a valid private key.');
		}

		if (typeof enrollment.certificate === 'undefined' || enrollment.certificate === null || enrollment.certificate === '') {
			throw new Error('Invalid enrollment object. Must have a valid certificate.');
		}

		this._enrollment = enrollment;
	}

	/**
	 * Gets a batch of TCerts to use for transaction. There is a 1-to-1 relationship between
	 * TCert and Transaction. The TCert can be generated locally by the SDK using the
	 * user’s crypto materials.
	 * @param {number} number The amount of TCerts in the batch.
	 * @param {string[]} attributes The list of attributes to include in the TCert.
	 * @returns {TCert[]} An array of TCerts.
	*/
	generateTCerts(number, attributes) {
		//to do
	}

};

module.exports = User;