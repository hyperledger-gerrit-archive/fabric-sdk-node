/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Client, User, IdentityContext } from 'fabric-common';

export interface ActionOptions {
	readonly requestTimeout?: Number;
}

/**
 * The base administrative class for Action requests.
 * @memberof module:fabric-admin
 */
export class Action {
	public readonly client: Client;
	public readonly idx: IdentityContext;
	public requestTimeout: Number = 3000;


	/**
	 * Create a action instance used for request on a fabric network.
	 * @param {module:fabric-base.Client} client - network view and connection information.
	 * @param {module:fabric-base.User} user - identity to be used for network request.
	 */
	public constructor(client: Client, user: User, options?: ActionOptions) {
		this.client = client;
		this.idx = client.newIdentityContext(user)
		this.set(options);
	}

	/**
	 * Apply the provided settings to this instance
	 * @param {ActionOptions} options - The Action settings
	 */
	public set(options?: ActionOptions) {
		if (options && options.requestTimeout) {
			this.requestTimeout = options.requestTimeout;
		}

		return this;
	}


}