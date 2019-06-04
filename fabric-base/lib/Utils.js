/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */


'use strict';

module.exports.checkParameter = (name) => {
	throw Error(`Missing ${name} parameter`);
};