/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');

const RoundRobinEventHubSelectionStrategy = require('fabric-network/lib/impl/event/roundrobineventhubselectionstrategy');
const Peer = require('fabric-client/lib/Peer');

describe.only('RoundRobinEventHubSelectionStrategy', () => {
	let sandbox;
	let peer1, peer2;
	let strategy;
	beforeEach(() => {
		sandbox = sinon.createSandbox();
		peer1 = sandbox.createStubInstance(Peer);
		peer1.getName.returns('peer1');
		peer2 = sandbox.createStubInstance(Peer);
		peer2.getName.returns('peer2');
		strategy = new RoundRobinEventHubSelectionStrategy([peer1, peer2]);
	});

	afterEach(() => {
		sandbox.reset();
	});

	describe('#constructor', () => {
		it('should create a map of all peers', () => {
			expect(strategy.peers).to.be.instanceOf(Array);
			expect(strategy.peers.get('peer1')).to.deep.equal({peer: peer1, alive: true});
			expect(strategy.peers.get('peer2')).to.deep.equal({peer: peer2, alive: true});
			expect(strategy.lastDead).to.be.null;
		});
	});

	describe('#getNextPeer', () => {
		it('should return peer2 if peer1 is down', () => {
			strategy.peers.get('peer1').alive = false;
			expect(strategy.getNextPeer()).to.equal(peer2);
		});

		it('should reset the other peers to alive if every other peer is down', () => {
			strategy.lastDead = peer1;
			strategy.peers.get('peer1').alive = false;
			strategy.peers.get('peer2').alive = false;
			expect(strategy.getNextPeer()).to.equal(peer2);
			expect(strategy.peers.get('peer2').alive).to.be.true;
		});
	});

	describe('#updateEventHubAvailability', () => {
		it('should update the last dead peer', () => {
			strategy.updateEventHubAvailability(peer1);
			expect(strategy.lastDead).to.equal(peer1);
			expect(strategy.peers.get('peer1').alive).to.be.false;
		});

		it('should not throw if a dead peer is not given', () => {
			expect(() => strategy.updateEventHubAvailability()).not.to.throw();
		});
	});
});
