/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
	Identity,
	IdentityData,
	WalletStore,
} from 'fabric-network';

import { IdentityProviderRegistry } from './identityproviderregistry';

const encoding = 'utf8';

export class Wallet {
	private readonly providerRegistry: IdentityProviderRegistry = new IdentityProviderRegistry();
	private readonly store: WalletStore;

	public constructor(store: WalletStore) {
		this.store = store;
	}

	public async put(label: string, identity: Identity): Promise<void> {
		const json = this.providerRegistry.getProvider(identity.type).toJson(identity);
		const jsonString = JSON.stringify(json);
		const buffer = Buffer.from(jsonString, 'utf8');
		await this.store.put(label, buffer);
	}

	public async get(label: string): Promise<Identity|undefined> {
		const buffer = await this.store.get(label);
		if (!buffer) {
			return undefined;
		}

		const jsonString = buffer.toString(encoding);
		const json: IdentityData = JSON.parse(jsonString);
		return this.providerRegistry.getProvider(json.type).fromJson(json);
	}

	public async list(): Promise<string[]> {
		return await this.store.list();
	}

	public async delete(label: string): Promise<void> {
		await this.store.delete(label);
	}

	public getProviderRegistry(): IdentityProviderRegistry {
		return this.providerRegistry;
	}
}
