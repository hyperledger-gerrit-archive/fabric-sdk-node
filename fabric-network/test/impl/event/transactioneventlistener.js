'use strict';

const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');

const Contract = require('fabric-network/lib/contract');
const Network = require('fabric-network/lib/network');
const EventHubManager = require('fabric-network/lib/impl/event/eventhubmanager');
const ChannelEventHub = require('fabric-client/lib/ChannelEventHub');
const TransactionEventListener = require('fabric-network/lib/impl/event/transactioneventlistener');

describe('TransactionEventListener', () => {
	let sandbox;
	let eventHubManagerStub;
	let eventHubStub;
	let contractStub;
	let networkStub;
	let listener;
	let callback;

	beforeEach(() => {
		sandbox = sinon.createSandbox();
		eventHubStub = sandbox.createStubInstance(ChannelEventHub);
		eventHubStub._transactionRegistrations = [];
		contractStub = sandbox.createStubInstance(Contract);
		networkStub = sandbox.createStubInstance(Network);
		contractStub.getNetwork.returns(networkStub);
		eventHubManagerStub = sinon.createStubInstance(EventHubManager);
		networkStub.getEventHubManager.returns(eventHubManagerStub);

		callback = () => {};
		listener = new TransactionEventListener(networkStub, 'transactionId', callback, {});
	});

	afterEach(() => {
		sandbox.reset();
	});

	describe('#constructor', () => {
		it('should set the listener name and transactionId', () => {
			expect(listener.transactionId).to.equal('transactionId');
			expect(listener.listenerName).to.equal('transactionId');
		});
	});

	describe('#register', () => {
		beforeEach(() => {
			sandbox.stub(listener, '_registerWithNewEventHub');
			// sandbox.stub(eventHubManagerStub, 'getEventHub');
		});

		it('should grab a new event hub if one isnt given', () => {
			listener.register();
			sinon.assert.called(listener._registerWithNewEventHub);
		});

		it('should assign a new event hub if given on has registrations', () => {
			const newEventHub = sandbox.createStubInstance(ChannelEventHub);
			newEventHub._transactionRegistrations = {};
			eventHubManagerStub.getEventHub.returns(newEventHub);
			listener.eventHub = eventHubStub;
			eventHubStub._peer = 'peer';
			eventHubStub._transactionRegistrations = {transactionId: 'registration'};
			listener.register();
			sinon.assert.calledWith(eventHubManagerStub.getEventHub, 'peer');
		});

		it('should call registerTxEvent', () => {
			listener.eventHub = eventHubStub;
			listener.register();
			sinon.assert.calledWith(
				eventHubStub.registerTxEvent,
				'transactionId',
				sinon.match.func,
				sinon.match.func,
				{unregister: true}
			);
			sinon.assert.called(eventHubStub.connect);
			expect(listener._registered).to.be.true;
		});
	});

	describe('#unregister', () => {
		it('should not call ChannelEventHub.unregisterTxEvent', () => {
			listener.unregister();
			sinon.assert.notCalled(eventHubStub.unregisterTxEvent);
		});

		it('should call ChannelEventHub.unregisterBlockEvent', () => {
			listener.eventHub = eventHubStub;
			listener.register();
			listener.unregister();
			sinon.assert.calledWith(eventHubStub.unregisterTxEvent, 'transactionId');
		});
	});

	describe('#_onEvent', () => {
		beforeEach(() => {
			listener._registration = {};
			sandbox.spy(listener, 'unregister');
			sandbox.stub(listener, 'eventCallback');
		});

		it('should call the event callback', () => {
			const blockNumber = '10';
			const transactionId = 'transactionId';
			const status = 'VALID';
			listener._onEvent(transactionId, status, blockNumber);
			sinon.assert.calledWith(listener.eventCallback, null, transactionId, status, Number(blockNumber));
			sinon.assert.notCalled(listener.unregister);
		});

		it('should unregister if registration.unregister is set', () => {
			const blockNumber = '10';
			const transactionId = 'transactionId';
			const status = 'VALID';
			listener._registration.unregister = true;
			listener._onEvent(transactionId, status, blockNumber);
			sinon.assert.calledWith(listener.eventCallback, null, transactionId, status, 10);
			sinon.assert.called(listener.unregister);
		});

		it('should not fail if eventCallback throws', () => {
			const blockNumber = '10';
			const transactionId = 'transactionId';
			const status = 'VALID';
			listener.eventCallback.throws(new Error('forced error'));
			listener._onEvent(transactionId, status, blockNumber);
		});
	});

	describe('#_onError', () => {
		beforeEach(() => {
			eventHubStub._peer = 'peer';
			listener._registration = {};
			sandbox.spy(listener, 'unregister');
			sandbox.stub(listener, 'eventCallback');
		});
		it('should call eventCallback', () => {
			listener.eventHub = eventHubStub;
			const error = new Error();
			listener._onError(error);
			sinon.assert.calledWith(listener.eventCallback, error);
		});
	});

	describe('#setEventHub', () => {
		it('should set the eventhub', () => {
			listener.setEventHub('new event hub');
			expect(listener.eventHub).to.equal('new event hub');
		});
	});

	describe('#_registerWithNewEventHub', () => {
		beforeEach(() => {
			listener._registration = {};
			sandbox.spy(listener, 'unregister');
			sandbox.stub(listener, 'eventCallback');
			eventHubManagerStub.getReplayEventHub.returns(eventHubStub);
			sinon.stub(listener, 'register');
		});

		it('should call the correct methods', () => {
			listener._registerWithNewEventHub();
			sinon.assert.called(listener.unregister);
			sinon.assert.called(eventHubManagerStub.getReplayEventHub);
			expect(listener.eventHub).to.equal(eventHubStub);
			expect(listener.options.disconnect).to.be.true;
			sinon.assert.called(listener.register);
		});
	});

	describe('#_isAlreadyRegistered', () => {
		it('should throw if no event hub is given', () => {
			expect(() => listener._isAlreadyRegistered()).to.throw(/Event hub not given/);
		});

		it('should return false if no registration exists', () => {
			expect(listener._isAlreadyRegistered(eventHubStub)).to.be.false;
		});

		it('should return true if registration exists', () => {
			eventHubStub._transactionRegistrations = {transactionId: 'registration'};
			expect(listener._isAlreadyRegistered(eventHubStub)).to.be.true;
		});
	});
});
