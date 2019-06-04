/**
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const dockersteps = require('./docker_steps');
const adminsteps = require('./admin_steps');
const networksteps = require('./network_steps');
const chaincodesteps = require('./chaincode_steps');
const basesteps = require('./base_steps');

module.exports = function () {
	adminsteps.call(this);
	dockersteps.call(this);
	networksteps.call(this);
	chaincodesteps.call(this);
	basesteps.call(this);
};
