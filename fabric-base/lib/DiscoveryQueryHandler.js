/*
 Copyright 2016, 2018 IBM All Rights Reserved.

 SPDX-License-Identifier: Apache-2.0

*/

'use strict';
const settle = require('promise-settle');

const {Utils: utils} = require('fabric-common');
const {checkParameter, randomize} = require('./Utils.js');
const logger = utils.getLogger('DiscoveryQueryHandler');


/**
 * This is an implementation for a query handler. The only requirement is to
 * have a query() method.
 * It will submit transactions to be committed to one orderer at time from a provided
 * list or a list currently assigned to the channel.
 *
 * @class
 */
class DiscoveryQueryHandler {

	/**
	 * constructor
	 *
	 * @param {ChannelDiscovery} discovery - The channel discovery source for this handler.
	 */
	constructor(discovery) {
		this.discovery = discovery;
	}

	async query(request = {}, signed_envelope = checkParameter('signed_envelope')) {
		const method = 'query';
		logger.debug('%s - start', method);

		const {request_timeout} = request;
		let results;

		let timeout = utils.getConfigSetting('request-timeout');
		if (request_timeout) {
			timeout = request_timeout;
		}

		// forces a refresh if needed
		await this.discovery.getDiscoveryResults(true);

		const peers = this.discovery.channel.getPeers();
		let return_error = null;
		if (peers && peers.length > 0) {
			logger.debug('%s - found %s peers assigned to channel', method, peers.length);
			const promises = peers.map(async (peer) => {
				return peer.sendProposal(signed_envelope, timeout);
			});
			results = await settle(promises);
		} else {
			throw new Error('No peers assigned to the channel');
		}

		return results;
	}
}


module.exports = DiscoveryQueryHandler;
