/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';
const TYPE = 'ServiceHandler';

const settle = require('promise-settle');

const {Utils: utils} = require('fabric-common');
const logger = utils.getLogger(TYPE);

const fabprotos = require('fabric-protos');

const {buildHeader, checkParameter} = require('./Utils.js');
const IdentityContext = require('./IdentityContext.js');

/**
 * @classdesc
 * This is an abstract class that represents an action on a fabric service.
 *
 * @class
 */
const ServiceHandler = class {

	/**
	 * Construct a ServiceHandler abstract object.
	 *
	 * @returns {ServiceHandler} The ServiceHandler instance.
	 */
	constructor() {
		logger.debug(`${TYPE}.constructor - start `);
	}

	/**
	 * implementing class must implement
	 */
	commit() {
		throw Error('Implement the commit()');
	}

	/**
	 * implementing class must implement
	 */
	endorse() {
		throw Error('Implement the endorse()');
	}

	/**
	 * implementing class must implement
	 */
	query() {
		throw Error('Implement the query()');
	}

	/**
	 * implementing class must implement
	 */
	toString() {
		throw Error('Implement the toString()');
	}
};

module.exports = ServiceHandler;
