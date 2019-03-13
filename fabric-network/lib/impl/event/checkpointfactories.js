/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const FileSystemCheckpointer = require('./filesystemcheckpointer');

function FILE_SYSTEM_CHECKPOINTER(channelName, listenerName) {
	return new FileSystemCheckpointer(channelName, listenerName);
}

module.exports = {
	FILE_SYSTEM_CHECKPOINTER
};
