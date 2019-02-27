/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
chai.use(require('chai-as-promised'));

const BaseEventHubSelectionStrategy = require('fabric-network/lib/impl/event/baseeventhubselectionstrategy');

describe('EventHubManager', () => {
	let sandbox;
	let baseEventHubSelectionStrategy;

	beforeEach(() => {
		sandbox = sinon.createSandbox();
		baseEventHubSelectionStrategy = new BaseEventHubSelectionStrategy();
	});

	afterEach(() => {
		sandbox.reset();
	});

	describe('#getNextPeer', () => {
		it('should throw if called', () => {
			expect(() => baseEventHubSelectionStrategy.getNextPeer()).to.throw('method not implemented');
		});
	});

	describe('#updateEventHubAvailability', () => {
		it('should throw if called', () => {
			expect(() => baseEventHubSelectionStrategy.updateEventHubAvailability()).to.throw('method not implemented');
		});
	});
});
