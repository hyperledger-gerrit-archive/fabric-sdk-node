/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
'use strict';

const Client = require('fabric-client');

class IDManager {
	async initialize(ccp) {
		this.client = await Client.loadFromConfig(ccp);
	}

	async registerUser(userID, issuerWallet, issuerId, options = {}) {
		const identity = await issuerWallet.get(issuerId);
		const provider = issuerWallet.getProviderRegistry().getProvider(identity.type);
		await provider.setUserContext(this.client, identity, issuerId);
		const user = await this.client.getUserContext();

		const registerRequest = {
			enrollmentID: userID,
			affiliation: options.affiliation || 'org1',  // or eg. org1.department1
			attrs: [],
			maxEnrollments: options.maxEnrollments || -1,  // infinite enrollment by default
			role: options.role || 'client'
		};

		if (options.issuer) {
			// Everyone we create can register clients.
			registerRequest.attrs.push({
				name: 'hf.Registrar.Roles',
				value: 'client'
			});

			// Everyone we create can register clients that can register clients.
			registerRequest.attrs.push({
				name: 'hf.Registrar.Attributes',
				value: 'hf.Registrar.Roles, hf.Registrar.Attributes'
			});
		}

		let idAttributes = options.attributes;
		if (typeof idAttributes === 'string') {
			try {
				idAttributes = JSON.parse(idAttributes);
			} catch (error) {
				const newError = new Error('attributes provided are not valid JSON. ' + error);
				throw newError;
			}
		}

		for (const attribute in idAttributes) {
			registerRequest.attrs.push({
				name: attribute,
				value: idAttributes[attribute]
			});
		}

		const userSecret = await this.client.getCertificateAuthority().register(registerRequest, user);
		return userSecret;
	}

	async enroll(userID, secret) {
		const cryptoSuite = this.client.getCryptoSuite();
		if (!cryptoSuite) {
			this.client.setCryptoSuite(Client.newCryptoSuite());
		}
		const options = {enrollmentID: userID, enrollmentSecret: secret};
		return await this.client.getCertificateAuthority().enroll(options);
	}
}

module.exports = IDManager;
