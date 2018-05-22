/**
 * Copyright 2016-2017 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

var tape = require('tape');
var _test = require('tape-promise').default;
var test = _test(tape);
var util = require('util');
var path = require('path');
var fs = require('fs-extra');

var Client = require('fabric-client');
var CA_Client = require('fabric-ca-client');

// THIS TEST FILE MUST BE RUN FIRST so that node.js will not load the two clients in this order

test('\n\n ** config testing **\n\n', function (t) {
	// this setting is in both configs, so we want to to find the fabric-client's version not the fabric-ca-client
	let timeout = Client.getConfigSetting('request-timeout');
	t.equal(timeout, 45000, 'the timeout is correct, which means the configs were loaded in the correct order');
	t.pass('Got to the end');
	t.end();
});
