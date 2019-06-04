/*
 Copyright 2016, 2018 IBM All Rights Reserved.

 SPDX-License-Identifier: Apache-2.0

*/

'use strict';

const {Utils: utils} = require('fabric-common');
const {checkParameter, randomize} = require('./Utils.js');
const logger = utils.getLogger('DiscoveryCommitHandler');


/**
 * This is an implementation for a commit handler. The only requirement is to
 * have a commit()
 * It will submit transactions to be committed to one orderer at time from a provided
 * list or a list currently assigned to the channel.
 *
 * @class
 * @extends CommitHandler
 */
class DiscoveryCommitHandler {

	/**
	 * constructor
	 *
	 * @param {Channel} channel - The channel for this handler.
	 */
	constructor(discovery) {
		this.discovery = discovery;
	}

	async commit(request = {}, signed_envelope = checkParameter('signed_envelope')) {
		const method = 'commit';
		logger.debug('%s - start', method);

		const {request_timeout} = request;

		let timeout = utils.getConfigSetting('request-timeout');
		if (request_timeout) {
			timeout = request_timeout;
		}

		// force a refresh if needed
		await this.discovery.getDiscoveryResults(true);

		const orderers = this.discovery.channel.getOrderers();
		let return_error = null;
		if (orderers && orderers.length > 0) {
			logger.debug('%s - found %s orderers assigned to channel', method, orderers.length);
			randomize(orderers);

			// loop through the orderers trying to complete one successfully
			for (const orderer of orderers) {
				logger.debug('%s - starting orderer %s', method, orderer.name);
				try {
					const results = await orderer.sendBroadcast(signed_envelope, timeout);
					if (results) {
						if (results.status === 'SUCCESS') {
							logger.debug('%s - Successfully sent transaction to the orderer %s', method, orderer.name);
							return results;
						} else {
							logger.debug('%s - Failed to send transaction successfully to the orderer status:%s', method, results.status);
							return_error = new Error('Failed to send transaction successfully to the orderer status:' + results.status);
						}
					} else {
						return_error = new Error('Failed to send transaction to the orderer');
						logger.debug('%s - Failed to send transaction to the orderer %s', method, orderer.name);
					}
				} catch (error) {
					logger.debug('%s - Caught: %s', method, error.toString());
					return_error = error;
				}

				logger.debug('%s - finished orderer %s ', method, orderer.name);
			}

			logger.debug('%s - return error %s ', method, return_error.toString());
			throw return_error;
		} else {
			throw new Error('No orderers assigned to the channel');
		}
	}
}


module.exports = DiscoveryCommitHandler;
