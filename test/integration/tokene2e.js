/*
 Copyright IBM Corp. All Rights Reserved.

 SPDX-License-Identifier: Apache-2.0
*/

// Set env vars for the channel name and subdir for token e2e tests

// eslint-disable-next-line
process.env['channel'] = 'tokenchannel';
// eslint-disable-next-line
process.env['channeltx_subdir'] = 'v2';

// Create and join the channel and then run token e2e tests
require('./e2e/create-channel.js');
require('./e2e/join-channel.js');
require('./e2e/token.js');
