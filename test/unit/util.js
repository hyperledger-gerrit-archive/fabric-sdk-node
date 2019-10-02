/**
 * Copyright 2016 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require('fs-extra');
const util = require('util');

const {Utils:utils} = require('fabric-common');
const Constants = require('./constants.js');
const logger = utils.getLogger('TestUtil');

// all temporary files and directories are created under here
const tempdir = Constants.tempdir;

logger.info(util.format(
	'\n\n*******************************************************************************' +
	'\n*******************************************************************************' +
	'\n*                                          ' +
	'\n* Using temp dir: %s' +
	'\n*                                          ' +
	'\n*******************************************************************************' +
	'\n*******************************************************************************\n', tempdir));

module.exports.getTempDir = function() {
	fs.ensureDirSync(tempdir);
	return tempdir;
};

// specifically set the values to defaults because they may have been overridden when
// running in the overall test bucket ('gulp test')
module.exports.resetDefaults = function() {
	global.hfc.config = undefined;
	require('nconf').reset();
};
