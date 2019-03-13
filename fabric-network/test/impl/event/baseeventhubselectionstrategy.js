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

describe('BaseEventHubSelectionStrategy', () => {
	let sandbox;
	let baseEventHubSelectionStrategy;
	let peers;

	beforeEach(() => {
		sandbox = sinon.createSandbox();
		peers = ['peer1'];
		baseEventHubSelectionStrategy = new BaseEventHubSelectionStrategy(peers);
	});

	afterEach(() => {
		sandbox.reset();
	});

	describe('#constructor', () => {
		it('should set peers', () => {
			expect(baseEventHubSelectionStrategy.peers).to.equal(peers);
		});
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

	describe('#getPeers', () => {
		it('should return the peers', () => {
			expect(baseEventHubSelectionStrategy.getPeers()).to.equal(peers);
		});
	});
});
