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

const logger = require('./utils').getLogger('IdentityService');
const checkRegistrar = require('./helper').checkRegistrar;

class AffiliationService {
	constructor(client) {
		this.client = client;
	}

	/**
	 * @typedef {Object} AffiliationRequest
	 * @property {string} name - Required. The affiliation path to create
	 * @property {string} caname - Optional. Name of the CA to send the request to within the Fabric CA server
	 * @property {boolean} force - Optional.
	 *     - For create affiliation request, if any of the parent affiliations do not exist and 'force' is true,
	 *       create all parent affiliations also
	 *     - For delete affiliation request, if force is true and there are any child affiliations or any identities
	 *       are associated with this affiliation or child affiliations, these identities and child affiliations
	 *       to be deleted; otherwise, an error is returned.
	 *
	 */

	/**
	 * Create a new affiliation.
	 * The caller must have hf.AffiliationMgr authority.
	 *
	 * @param {AffiliationRequest} req - Required. The {@link AffiliationRequest}
	 * @param {User} registrar - Required. The identity of the registrar (i.e. who is performing the registration).
	 * @return {Promise} {@link ServiceResponse}
	 */
	create(req, registrar) {
		if (typeof req === 'undefined' || req === null) {
			throw new Error('Missing required argument "req"');
		}

		if (!req.name) {
			throw new Error('Missing required parameters.  "req.name" is required.');
		}
		checkRegistrar(registrar);

		let signingIdentity = registrar.getSigningIdentity();
		if (!signingIdentity) {
			throw new Error('Can not get signingIdentity from registrar');
		}

		let url = 'affiliations';
		if (req.force === true) {
			url = url + '?force=true';
		}
		logger.debug('create new affiliation with url ' + url);
		const request = {
			info: {
				name: req.name,
			},
			caname: req.caname,
			force: req.force,
		};
		return this.client.post(url, request, signingIdentity);
	}

	/**
	 * List a specific affiliation at or below the caller's affinity.
	 * The caller must have hf.AffiliationMgr authority.
	 *
	 * @param {string} affiliation - The affiliation path to be queried.
	 * @param {User} registrar - Required. The identity of the registrar (i.e. who is performing the registration).
	 * @return {Promise} {@link ServiceResponse}
	 */
	getOne(affiliation, registrar) {
		if (!affiliation || typeof affiliation !== 'string') {
			throw new Error('Missing required argument "affiliation", or argument "affiliation" is not a valid string');
		}
		checkRegistrar(registrar);

		let signingIdentity = registrar.getSigningIdentity();
		if (!signingIdentity) {
			throw new Error('Can not get signingIdentity from registrar');
		}

		const url = 'affiliations/' + affiliation;
		return this.client.get(url, signingIdentity);
	}

	/**
	 * List all affiliations equal to and below the caller's affiliation.
	 * The caller must have hf.AffiliationMgr authority.
	 *
	 * @param {User} registrar - Required. The identity of the registrar (i.e. who is performing the registration).
	 * @return {Promise} {@link ServiceResponse}
	 */
	getAll(registrar) {
		checkRegistrar(registrar);

		let signingIdentity = registrar.getSigningIdentity();
		if (!signingIdentity) {
			throw new Error('Can not get signingIdentity from registrar');
		}

		return this.client.get('affiliations', signingIdentity);
	}

	/**
	 * Delete an affiliation.
	 * The caller must have hf.AffiliationMgr authority.
	 *
	 * @param {AffiliationRequest} req - Required. The {@link AffiliationRequest}
	 * @param {User} registrar - Required. The identity of the registrar (i.e. who is performing the registration).
	 * @return {Promise} {@link ServiceResponse}
	 */
	delete(req, registrar) {
		if (!req.name || typeof req.name !== 'string') {
			throw new Error('Missing required argument "req.name", or argument "req.name" is not a valid string');
		}
		checkRegistrar(registrar);

		let signingIdentity = registrar.getSigningIdentity();
		if (!signingIdentity) {
			throw new Error('Can not get signingIdentity from registrar');
		}

		let url = 'affiliations/' + req.name;
		if (req.force === true) {
			url = url + '?force=true';
		}
		return this.client.delete(url, signingIdentity);
	}

	/**
	 * Rename an affiliation.
	 * The caller must have hf.AffiliationMgr authority.
	 *
	 * @param {string} affiliation - The affiliation path to be updated
	 * @param {AffiliationRequest} req - Required. The {@link AffiliationRequest}
	 * @param {User} registrar
	 * @return {Promise} {@link ServiceResponse}
	 */
	update(affiliation, req, registrar) {
		if (!affiliation || typeof affiliation !== 'string') {
			throw new Error('Missing required argument "affiliation", or argument "affiliation" is not a valid string');
		}

		if (!req.name || typeof req.name !== 'string') {
			throw new Error('Missing required argument "req.name", or argument "req.name" is not a valid string');
		}
		checkRegistrar(registrar);

		let signingIdentity = registrar.getSigningIdentity();
		if (!signingIdentity) {
			throw new Error('Can not get signingIdentity from registrar');
		}

		let url = 'affiliations/' + affiliation;
		if (req.force === true) {
			url = url + '?force=true';
		}
		const request = {
			info: {
				name: req.name,
			},
			force: req.force,
			caname: req.caname,
		};

		return this.client.put(url, request, signingIdentity);
	}
}

module.exports = AffiliationService;
