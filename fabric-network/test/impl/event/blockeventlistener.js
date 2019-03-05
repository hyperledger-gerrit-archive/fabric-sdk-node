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

const Contract = require('fabric-network/lib/contract');
const Network = require('fabric-network/lib/network');
const ChannelEventHub = require('fabric-client/lib/ChannelEventHub');
const Channel = require('fabric-client/lib/Channel');
const BlockEventListener = require('fabric-network/lib/impl/event/blockeventlistener');
const EventHubManager = require('fabric-network/lib/impl/event/eventhubmanager');
const Checkpointer = require('fabric-network/lib/impl/event/basecheckpointer');

describe('BlockEventListener', () => {
	let sandbox;
	let channelStub;
	let contractStub;
	let networkStub;
	let eventHubStub;
	let checkpointerStub;
	let eventHubManagerStub;
	let blockEventListener;

	beforeEach(() => {
		sandbox = sinon.createSandbox();
		channelStub = sandbox.createStubInstance(Channel);
		channelStub.getName.returns('mychannel');
		contractStub = sandbox.createStubInstance(Contract);
		contractStub.getChaincodeId.returns('chaincodeid');
		networkStub = sandbox.createStubInstance(Network);
		networkStub.getChannel.returns(channelStub);
		contractStub.getNetwork.returns(networkStub);
		eventHubManagerStub = sinon.createStubInstance(EventHubManager);
		networkStub.getEventHubManager.returns(eventHubManagerStub);
		eventHubStub = sandbox.createStubInstance(ChannelEventHub);
		checkpointerStub = sandbox.createStubInstance(Checkpointer);
		blockEventListener = new BlockEventListener(networkStub, 'test', () => {}, {});
	});
	describe('#register', () => {
		it('should register a block event, connect to the event hub and set the register flag', () => {
			blockEventListener.eventHub = eventHubStub;
			sandbox.spy(blockEventListener._onEvent, 'bind');
			sandbox.spy(blockEventListener._onError, 'bind');
			blockEventListener.register();
			sinon.assert.calledWith(
				eventHubStub.registerBlockEvent,
				sinon.match.func,
				sinon.match.func,
				{}
			);
			sinon.assert.calledWith(blockEventListener._onEvent.bind, blockEventListener);
			sinon.assert.calledWith(blockEventListener._onError.bind, blockEventListener);
			sinon.assert.called(eventHubStub.connect);
			expect(blockEventListener._registered).to.be.true;
		});

		it('should call _registerWithNewEventHub', () => {
			sandbox.stub(blockEventListener, '_registerWithNewEventHub');
			blockEventListener.register();
			sinon.assert.called(blockEventListener._registerWithNewEventHub);
		});
	});

	describe('#unregister', () => {
		it('should not call ChannelEventHub.unregisterBlockEvent', () => {
			blockEventListener.unregister();
			sinon.assert.notCalled(eventHubStub.unregisterBlockEvent);
		});

		it('should call ChannelEventHub.unregisterBlockEvent', () => {
			eventHubStub.registerBlockEvent.returns('registration');
			blockEventListener.eventHub = eventHubStub;
			blockEventListener.register();
			blockEventListener.unregister();
			sinon.assert.calledWith(eventHubStub.unregisterBlockEvent, 'registration');
		});
	});

	describe('#_onEvent', () => {
		beforeEach(() => {
			blockEventListener._registration = {};
			sandbox.spy(blockEventListener, 'unregister');
			sandbox.stub(blockEventListener, 'eventCallback');
		});

		it('should call the event callback', () => {
			const block = {number: '10'};
			blockEventListener._onEvent(block);
			sinon.assert.calledWith(blockEventListener.eventCallback, null, block);
			sinon.assert.notCalled(checkpointerStub.save);
			sinon.assert.notCalled(blockEventListener.unregister);
		});

		it('should save a checkpoint', () => {
			const block = {number: '10'};
			blockEventListener.checkpointer = checkpointerStub;
			blockEventListener._onEvent(block);
			sinon.assert.calledWith(checkpointerStub.save, null, 10);
		});

		it('should unregister if registration.unregister is set', () => {
			const block = {number: '10'};
			blockEventListener._registration.unregister = true;
			blockEventListener._onEvent(block);
			sinon.assert.calledWith(blockEventListener.eventCallback, null, block);
			sinon.assert.called(blockEventListener.unregister);
		});

		it ('should not save a checkpoint if the callback fails', () => {
			const block = {number: '10'};
			blockEventListener.eventCallback.throws(new Error());
			blockEventListener.checkpointer = checkpointerStub;
			blockEventListener._onEvent(block);
			sinon.assert.calledWith(blockEventListener.eventCallback, null, block);
			sinon.assert.calledWith(checkpointerStub.save, null, 10);
		});
	});

	describe('#_onError', () => {
		beforeEach(() => {
			eventHubStub._peer = 'peer';
			blockEventListener._registration = {};
			sandbox.spy(blockEventListener, 'unregister');
			sandbox.stub(blockEventListener, 'eventCallback');
			sandbox.stub(blockEventListener, '_registerWithNewEventHub');
		});

		it('should call the event callback with an error', () => {
			const error = new Error();
			blockEventListener._onError(error);
			sinon.assert.calledWith(blockEventListener.eventCallback, error);
		});

		it('should update event hub availability and reregister if disconnected', () => {
			const error = Error('ChannelEventHub has been shutdown');
			blockEventListener.eventHub = eventHubStub;
			blockEventListener._registered = true;
			blockEventListener._onError(error);
			sinon.assert.calledWith(eventHubManagerStub.updateEventHubAvailability, 'peer');
			sinon.assert.called(blockEventListener._registerWithNewEventHub);
			sinon.assert.calledWith(blockEventListener.eventCallback, error);
		});

		it('should call the error callback if the error is null', () => {
			const error = null;
			blockEventListener.eventHub = eventHubStub;
			blockEventListener._registered = true;
			blockEventListener._onError(error);
			sinon.assert.calledWith(blockEventListener.eventCallback, error);
		});
	});

	describe('#_registerWithNewEventHub', () => {
		beforeEach(() => {
			blockEventListener._registration = {};
			sandbox.spy(blockEventListener, 'unregister');
			sandbox.stub(blockEventListener, 'eventCallback');
			eventHubManagerStub.getReplayEventHub.returns(eventHubStub);
			eventHubManagerStub.getEventHub.returns(eventHubStub);
			sinon.stub(blockEventListener, 'register');
		});

		it('should call unregister, get a new event hub and reregister', () => {
			blockEventListener._registerWithNewEventHub();
			sinon.assert.called(blockEventListener.unregister);
			sinon.assert.called(eventHubManagerStub.getEventHub);
			sinon.assert.called(blockEventListener.register);
		});

		it('should get a replay event hub if a checkpointer is present', () => {
			blockEventListener.checkpointer = checkpointerStub;
			blockEventListener._registerWithNewEventHub();
			sinon.assert.called(blockEventListener.unregister);
			sinon.assert.called(eventHubManagerStub.getReplayEventHub);
			sinon.assert.called(blockEventListener.register);
		});
	});
});
