/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Channel, Client, Endorser, Endorsement, ProposalResponse, User, Utils} from 'fabric-common';
import { Action, ActionOptions} from '../../../src/action';

const  ChannelQueryResponse = require('fabric-protos').protos.ChannelQueryResponse;
const logger = Utils.getLogger('QueryChannels');

export interface QueryChannelsOptions extends ActionOptions {
	readonly target: Endorser;
}

export interface QueryChannelsResponse {
	channels: string[];
}

/**
 * The administrative class for quering for channels.
 * @memberof module:fabric-admin
 */
export class QueryChannels extends Action {

	/**
	 * Create a chaincode instance used to manage a chaincode on a fabric network.
	 * @param {module:fabric-base.Client} client - network view and connection information.
	 * @param {module:fabric-base.User} user - identity to be used for network request.
	 */
	public constructor(client: Client, user: User, options?: ActionOptions) {
		super(client, user, options);
	}

	/**
	 * Query for channels from the specified target
	 * @param {QueryChannelsOptions} [options] - The options to perform the query
	 * @returns {Prmoise<QueryChannelsResponse>} A promise for the channel names
	 */
	public async query(options?: QueryChannelsOptions): Promise<QueryChannelsResponse> {
		const method: string = 'query';
		logger.debug('%s - start');
		let target: Endorser;
		if (options && options.requestTimeout) {
			this.requestTimeout = options.requestTimeout;
		}
		if (options && options.target) {
			target = options.target;
		} else {
			// TBD get a target from the client
		}

		let _requestTimeout = this.requestTimeout;
		if (options && options.requestTimeout) {
			_requestTimeout = options.requestTimeout;
		}

		const channel: Channel = this.client.newChannel();
		const endorsement: Endorsement = channel.newEndorsement('cscc');
		const request = {
			fcn: 'GetChannels'
		}
		endorsement.build(this.idx, request);
		endorsement.sign(this.idx);
		const pr: ProposalResponse = await endorsement.send();

		const results: QueryChannelsResponse = {
			channels: []
		}

		// lets look at the proposal response
		if (pr.errors && pr.errors.length > 0) {
			throw pr.errors[0];
		} else {
			if (pr.responses) {
				for (const response of pr.responses) {
					if (response.response.status >= 400) {
						logger.error('%s - bad status %s - %s', method, response.response.status, response.response.message);
						throw Error(response.response.message);
					} else {
						logger.debug('%s - response status :: %d', method, response.response.status);
						const cqr = ChannelQueryResponse.decode(response.response.payload);
						for (const channel of cqr.channels) {
							logger.debug('%s >>> channel id %s ', method, channel.channel_id);
							results.channels.push(channel.channel_id);
						}

						logger.debug('%s channels found:%s', method, results.channels.length);
						return results;
					}
				}
			}
		}

		throw Error('No response on channeles query');
	}
}