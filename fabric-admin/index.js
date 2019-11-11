/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * <h3>Overview</h3>
 *
 * <p>This module provides a higher level API for administrative function on a Hyperledger Fabric blockchain network.</p>
 *
 * [TypeScript]{@link http://www.typescriptlang.org/} definitions are included in this module.
 *
 * <h3>Getting started</h3>
 *
 * <p>The entry point used to interact with a Hyperledger Fabric blockchain network is the
 * [FabricAdmin]{@link module:fabric-admin.FabricAdmin} class. Once instantiated, this long-living object provides a
 * view of a blockchain network, and enables access to any of the network endpoints.</p>
 *
 * @example
 * // Obtain the administrative instance using your existing client and user.
 * // User must have administrative access.
 * const fabricAdmin = new FabricAdmin(client, user);
 *
 * // Query for channels
 * const response = await fabricAdmin.queryChannels(peer1));
 *
 * @module fabric-admin
 */

module.exports.FabricAdmin = require('./lib/fabricadmin');

// query for a channel id list
module.exports.QueryChannels = require('./lib/impl/query/queryChannels').QueryChannels;
module.exports.QueryChannelsOptions = require('./lib/impl/query/queryChannels').QueryChannelsOptions;
module.exports.QueryChannelsResponse = require('./lib/impl/query/queryChannels').QueryChannelsResponse;