/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Client = require('fabric-client');
// @ts-ignore
import EcdsaKey = require('fabric-common/lib/impl/ecdsa/key');
// @ts-ignore
import jsrsasign = require('jsrsasign');

import {
	Identity,
	IdentityData,
	IdentityProvider,
} from '../../../types';

export interface HsmX509Identity extends Identity {
	type: 'HSM-X.509';
	credentials: {
		certificate: string;
	};
}

interface HsmX509IdentityDataV1 extends IdentityData {
	type: 'HSM-X.509';
	version: 1;
	credentials: {
		certificate: string;
	};
	mspId: string;
}

export interface HsmOptions {
	lib?: string;
	pin?: string;
	slot?: string;
	software?: boolean;
}

export class HsmX509Provider implements IdentityProvider {
	public readonly type = 'HSM-X.509';
	private readonly options: HsmOptions;

	public constructor(options: HsmOptions) {
		const defaultOptions: HsmOptions = {
			software: false,
		};
		this.options = Object.assign(defaultOptions, options);
	}

	public fromJson(data: IdentityData): HsmX509Identity {
		if (data.version === 1) {
			const x509Data = data as HsmX509IdentityDataV1;
			return {
				credentials: {
					certificate: x509Data.credentials.certificate,
				},
				mspId: x509Data.mspId,
				type: 'HSM-X.509',
			};
		} else {
			throw new Error('Unsupported identity version: ' + data.version);
		}
	}

	public toJson(identity: HsmX509Identity): IdentityData {
		const data: HsmX509IdentityDataV1 = {
			credentials: {
				certificate: identity.credentials.certificate,
			},
			mspId: identity.mspId,
			type: 'HSM-X.509',
			version: 1,
		};
		return data;
	}

	public async setUserContext(client: Client, identity: HsmX509Identity, name: string): Promise<void> {
		const cryptoSuite = Client.newCryptoSuite(this.options as Client.CryptoSetting);
		// we need to set a path in the CryptoKeyStore even though it is using HSM otherwise
		// it will make the private key ephemeral and not store it in the HSM
		cryptoSuite.setCryptoKeyStore(Client.newCryptoKeyStore({path: '/tmp'}));
		client.setCryptoSuite(cryptoSuite);

		const publicKey = jsrsasign.KEYUTIL.getKey(identity.credentials.certificate);
		const ecdsaKey = new EcdsaKey(publicKey);
		const keyBuffer = Buffer.from(ecdsaKey.getSKI(), 'hex');
		const privateKeyObj = await cryptoSuite.getKey(keyBuffer as any);

		const userData: Client.UserOpts = {
			cryptoContent: {
				privateKeyObj,
				signedCertPEM: identity.credentials.certificate,
			},
			mspid: identity.mspId,
			skipPersistence: true,
			username: name,
		};
		const user = await client.createUser(userData);
		client.setUserContext(user, true);
	}
}
