/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import chai = require('chai');
const expect = chai.expect;

import {
	X509Identity,
	X509Provider,
} from '../../../src/impl/wallet/x509identity';
import { IdentityData } from '../../../types';

describe('X509Identity', () => {
	const provider = new X509Provider();
	const identityJsonV1: any = {
		credentials: {
			certificate: 'CERTIFICATE',
			privateKey: 'PRIVATE_KEY',
		},
		mspId: 'alice',
		type: provider.type,
		version: 1,
	};
	const identityDataV1 = identityJsonV1 as IdentityData;

	it('Created from v1 JSON', () => {
		const result = provider.fromJson(identityDataV1);

		const expected: X509Identity = {
			credentials: {
				certificate: identityJsonV1.credentials.certificate,
				privateKey: identityJsonV1.credentials.privateKey,
			},
			mspId: identityJsonV1.mspId,
			type: identityJsonV1.type,
		};
		expect(result).to.deep.equal(expected);
	});

	it('Throws when created from JSON with no version', () => {
		const json = {
			type: identityJsonV1.type,
		} as IdentityData;
		expect(() => provider.fromJson(json))
			.to.throw('Unsupported identity version: undefined');
	});

	it('Throws when created from JSON with unsuported version', () => {
		const json: IdentityData = {
			type: identityJsonV1.type,
			version: Number.MAX_SAFE_INTEGER,
		};
		expect(() => provider.fromJson(json))
			.to.throw('Unsupported identity version: ' + Number.MAX_SAFE_INTEGER);
	});

	it('Serializes to JSON that can be used to recreate the identity', () => {
		const identity = provider.fromJson(identityJsonV1);

		const json = provider.toJson(identity);
		const result = provider.fromJson(json);

		expect(result).to.deep.equal(identity);
	});
});
