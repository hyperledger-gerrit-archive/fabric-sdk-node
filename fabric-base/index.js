/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

const {Utils} = require('fabric-common');

const path = require('path');

const config = Utils.getConfig();
const default_config = path.resolve(__dirname, './config/default.json');
config.reorderFileStores(default_config);

module.exports = require('./lib/Client.js');