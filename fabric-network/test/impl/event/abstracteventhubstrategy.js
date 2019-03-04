/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const chai = require('chai');
const expect = chai.expect;

const AbstractEventHubStrategy = require('fabric-network/lib/impl/event/abstracteventhubselectionstrategy');

describe('AbstractEventHubStrategy', () => {
	let strategy;

	beforeEach(() => {
		strategy = new AbstractEventHubStrategy();
	});
	describe('#getNextPeer', () => {
		it('should throw', () => {
			expect(() => strategy.getNextPeer()).to.throw(/Abstract/);
		});
	});
	describe('#updateEventHubAvailability', () => {
		it('should throw', () => {
			expect(() => strategy.updateEventHubAvailability()).to.throw(/Abstract/);
		});
	});
});
