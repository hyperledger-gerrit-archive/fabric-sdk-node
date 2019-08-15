/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { IdentityProvider } from '../../../types';
import { X509Provider } from './x509identity';

const defaultProviders: IdentityProvider[] = [
	new X509Provider(),
];

function getDefaultProviders(): Map<string, IdentityProvider> {
	const reducer = (accumulator: Map<string, IdentityProvider>, provider: IdentityProvider): Map<string, IdentityProvider> => {
		accumulator.set(provider.type, provider);
		return accumulator;
	};
	return defaultProviders.reduce(reducer, new Map());
}

export class IdentityProviderRegistry {
	private readonly providers = getDefaultProviders();

	public getProvider(type: string): IdentityProvider {
		const provider = this.providers.get(type);
		if (!provider) {
			throw new Error('Unknown identity type: ' + type);
		}
		return provider;
	}

	public addProvider(provider: IdentityProvider): void {
		this.providers.set(provider.type, provider);
	}
}
