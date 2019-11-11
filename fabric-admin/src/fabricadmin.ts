/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Client, User } from 'fabric-common';
import {QueryChannels, QueryChannelsOptions, QueryChannelsResponse} from './impl/query/queryChannels';

/**
 * The administrative service for a Hyperledger Fabric network. Will provide lifecycle
 * functions on Chaincode and runtime information. Information on channels and ledgers
 * may be queired from the fabric network.
 * @memberof module:fabric-admin
 */
export class FabricAdmin {
	private readonly client: Client;
	private readonly user: User;

	/**
	 * Create a Fabric Admin instance backed by a given fabric-common client and
	 * fabric-common user.
	 * @param {module:fabric-base.Client} client - The view and access to the fabric network
	 */
	public constructor(client: Client, user: User) {
		this.client = client;
		this.user = user;
	}

	/**
	 * Query for the channels that are available
	 * @param {QueryChannels} options - The options to make the request.
	 * @returns {Promise<QueryChannelsResponce>}
	 */
	public async queryChannels(options: QueryChannelsOptions): Promise<QueryChannelsResponse> {
		const worker: QueryChannels = new QueryChannels(this.client, this.user);
		return worker.query(options);
	}
}
