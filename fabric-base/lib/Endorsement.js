/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';
const TYPE = 'Endorsement';

const {Utils: utils} = require('fabric-common');
const logger = utils.getLogger(TYPE);

const Proposal = require('./Proposal.js')

/**
 * @classdesc
 * This class represents an Endorsement definition.
 * This class allows an application to contain all proposal attributes and
 * artifacts in one place during an endorsement.
 *
 * @class
 */
class Endorsement extends Proposal {

	/**
	 * Construct a Proposal object.
	 *
	 * @param {string} chaincodeName - The chaincode this proposal will execute
	 * @param {Channel} channel - The channel of this proposal
	 * @returns {Proposal} The Proposal instance.
	 */
	constructor(chaincodeName = checkParameter('chaincodeName'), channel = checkParameter('channel')) {
		const method = `constructor[${chaincodeName}]`;
		logger.debug('%s - start', method);
		this.type = TYPE;
		super(chaincodeName, channel);
	}

	/**
	 * return a printable representation of this object
	 */
	toString() {

		return `Endorsement: {chaincodeName: ${this.chaincodeName}, channel: ${this.channel.name}`;
	}
};

module.exports = Endorsement;