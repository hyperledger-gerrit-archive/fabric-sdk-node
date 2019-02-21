/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const rewire = require('rewire');
const ClientUtils = rewire('../lib/client-utils');
const ChannelRewire = rewire('../lib/Channel');

const Peer = require('../lib/Peer');
const Channel = require('../lib/Channel');
const ChannelPeer = ChannelRewire.__get__('ChannelPeer');

const chai = require('chai');
const sinon = require('sinon');
const should = chai.should();

describe('client-utils', () => {
	let revert;
	let FakeLogger;

	beforeEach(() => {
		revert = [];

		FakeLogger = {
			debug : () => {},
			error: () => {}
		};
		sinon.stub(FakeLogger, 'debug');
		sinon.stub(FakeLogger, 'error');
		revert.push(ClientUtils.__set__('logger', FakeLogger));
	});

	afterEach(() => {
		if (revert.length) {
			revert.forEach(Function.prototype.call, Function.prototype.call);
		}
		sinon.restore();
	});

	describe('#buildProposal', () => {
		let ChaincodeInvocationSpecStub;
		let setChaincodeSpecStub;
		let ChaincodeProposalPayloadStub;
		let setInputStub;
		let setTransientMapStub;
		let ProposalStub;
		let setHeaderStub;
		let setPayloadStub;

		beforeEach(() => {
			setChaincodeSpecStub = sinon.stub();
			ChaincodeInvocationSpecStub = sinon.stub().returns({
				setChaincodeSpec: setChaincodeSpecStub,
				toBuffer: () => 'chaincode-invocation-spec'
			});
			revert.push(ClientUtils.__set__('fabprotos.protos.ChaincodeInvocationSpec', ChaincodeInvocationSpecStub));
			setInputStub = sinon.stub();
			setTransientMapStub = sinon.stub();
			ChaincodeProposalPayloadStub = sinon.stub().returns({
				setInput: setInputStub,
				setTransientMap: setTransientMapStub,
				toBuffer: () => 'payload'
			});
			revert.push(ClientUtils.__set__('fabprotos.protos.ChaincodeProposalPayload', ChaincodeProposalPayloadStub));
			setHeaderStub = sinon.stub();
			setPayloadStub = sinon.stub();
			ProposalStub = sinon.stub().returns({
				setHeader: setHeaderStub,
				setPayload: setPayloadStub
			});
			revert.push(ClientUtils.__set__('fabprotos.protos.Proposal', ProposalStub));

		});

		it('should return a valid proposal when transientMap is an object', () => {
			const invokeSpec = 'invoke-spec';
			const header = {toBuffer: () => 'header'};
			const transientMap = {};
			const proposal = ClientUtils.buildProposal(invokeSpec, header, transientMap);
			sinon.assert.called(ChaincodeInvocationSpecStub);
			sinon.assert.calledWith(setChaincodeSpecStub, invokeSpec);
			sinon.assert.called(ChaincodeProposalPayloadStub);
			sinon.assert.calledWith(setInputStub, 'chaincode-invocation-spec');
			sinon.assert.calledWith(FakeLogger.debug, sinon.match(/adding in transientMap/));
			sinon.assert.calledWith(setHeaderStub, 'header');
			sinon.assert.calledWith(setPayloadStub, 'payload');
			proposal.should.deep.equal(new ProposalStub());
		});

		it('should return a valid proposal when transientMap is not an object', () => {
			const invokeSpec = 'invoke-spec';
			const header = {toBuffer: () => 'header'};
			const transientMap = undefined;
			const proposal = ClientUtils.buildProposal(invokeSpec, header, transientMap);
			sinon.assert.called(ChaincodeInvocationSpecStub);
			sinon.assert.calledWith(setChaincodeSpecStub, invokeSpec);
			sinon.assert.called(ChaincodeProposalPayloadStub);
			sinon.assert.calledWith(setInputStub, 'chaincode-invocation-spec');
			sinon.assert.calledWith(FakeLogger.debug, sinon.match(/not adding a transientMap/));
			sinon.assert.calledWith(setHeaderStub, 'header');
			sinon.assert.calledWith(setPayloadStub, 'payload');
			proposal.should.deep.equal(new ProposalStub());
		});
	});

	describe('#sendPeersProposal', () => {
		let peer;
		let channelPeer;

		let validResponse;
		let invalidResponse;
		let errorResponse;

		beforeEach(() => {
			const stubChannel = sinon.createStubInstance(Channel);
			peer = new Peer('grpc://localhost:7051', {name: 'stubPeer'});
			channelPeer = new ChannelPeer('mspId', stubChannel, peer);

			validResponse = {
				response: {
					status: 200
				},
				peer: peer.getCharacteristics()
			};
			invalidResponse = {
				response: {
					status: 418
				},
				peer: peer.getCharacteristics()
			};
			errorResponse = new Error('Fail');
			errorResponse.peer = peer.getCharacteristics();
		});

		it('should return valid peer responses', async () => {
			sinon.stub(peer, 'sendProposal').resolves(validResponse);

			const result = await ClientUtils.sendPeersProposal(channelPeer, 'proposal', 0);

			result.should.deep.include({
				errors: [],
				responses: [validResponse]
			});
		});


		it('should return error peer responses', async () => {
			sinon.stub(peer, 'sendProposal').rejects(errorResponse);

			const result = await ClientUtils.sendPeersProposal(channelPeer, 'proposal', 0);

			result.should.deep.include({
				responses: []
			});
			result.errors.should.be.an('Array').with.length(1);
			result.errors[0].should.be.an('Error').that.deep.includes(errorResponse);
		});

		it('should return invalid peer responses', async () => {
			sinon.stub(peer, 'sendProposal').resolves(invalidResponse);

			const result = await ClientUtils.sendPeersProposal(channelPeer, 'proposal', 0);

			result.should.deep.include({
				errors: [],
				responses: [invalidResponse]
			});
		});
	});

	describe('#signProposal', () => {
		let toBufferStub;
		let signStub;

		beforeEach(() => {
			toBufferStub = sinon.stub();
			signStub = sinon.stub();

			revert.push(ClientUtils.__set__('Buffer.from', (value) => value));
		});

		it('should return a valid signed proposal', () => {
			toBufferStub.returns('proposal');
			signStub.returns('sign');
			const signingIdentity = {sign: signStub};
			const proposal = {toBuffer: toBufferStub};
			const signedProposal = ClientUtils.signProposal(signingIdentity, proposal);
			signedProposal.should.deep.equal({signature: 'sign', proposal_bytes: 'proposal'});
		});
	});

	describe('#toEnvelope', () => {
		it('should return a valid envelope', () => {
			const data = {signature: 'signature', proposal_bytes: 'proposal'};
			const envelope = ClientUtils.toEnvelope(data);
			envelope.should.deep.equal({signature: 'signature', payload: 'proposal'});
		});
	});

	describe('#buildChannelHeader', () => {
		let channelHeaderStub;
		let channelHeaderFunctionStub;
		let chaincodeIDStub;
		let chaincodeIDFunctionsStub;
		let headerExtStub;
		let headerExtFunctionStub;

		beforeEach(() => {
			channelHeaderStub = sinon.stub();
			channelHeaderFunctionStub = {
				setType: sinon.stub(),
				setVersion: sinon.stub(),
				setChannelId: sinon.stub(),
				setTxId: sinon.stub(),
				setEpoch: sinon.stub(),
				setExtension: sinon.stub(),
				setTimestamp: sinon.stub(),
				setTlsCertHash: sinon.stub()
			};
			channelHeaderStub.returns(channelHeaderFunctionStub);
			revert.push(ClientUtils.__set__('fabprotos.common.ChannelHeader', channelHeaderStub));
			sinon.stub(ClientUtils, 'buildCurrentTimestamp').returns(null);
			chaincodeIDFunctionsStub = {setName: sinon.stub()};
			chaincodeIDStub = sinon.stub().returns(chaincodeIDFunctionsStub);
			revert.push(ClientUtils.__set__('fabprotos.protos.ChaincodeID', chaincodeIDStub));

			headerExtFunctionStub = {
				setChaincodeId: sinon.stub(),
				toBuffer: sinon.stub()
			};
			headerExtStub = sinon.stub().returns(headerExtFunctionStub);
			revert.push(ClientUtils.__set__('fabprotos.protos.ChaincodeHeaderExtension', headerExtStub));
		});

		it('should return a channel header without any extra info', () => {
			const channelHeader = ClientUtils.buildChannelHeader('type', 'channel-id', 0);
			sinon.assert.called(channelHeaderStub);
			sinon.assert.calledWith(channelHeaderFunctionStub.setType, 'type');
			sinon.assert.calledWith(channelHeaderFunctionStub.setChannelId, 'channel-id');
			sinon.assert.calledWith(channelHeaderFunctionStub.setTxId, '0');

			channelHeader.should.deep.equal(channelHeaderFunctionStub);
		});

		it('should return a channel header with all extra info', () => {
			const channelHeader = ClientUtils.buildChannelHeader('type', 'channel-id', 0, '0', 'chaincode-id', 'timestamp', 'client-cert-hash');
			sinon.assert.called(channelHeaderStub);
			sinon.assert.calledWith(channelHeaderFunctionStub.setType, 'type');
			sinon.assert.calledWith(channelHeaderFunctionStub.setChannelId, 'channel-id');
			sinon.assert.calledWith(channelHeaderFunctionStub.setTxId, '0');
			sinon.assert.calledWith(channelHeaderFunctionStub.setEpoch, '0');
			sinon.assert.calledWith(chaincodeIDFunctionsStub.setName, 'chaincode-id');
			sinon.assert.calledWith(headerExtFunctionStub.setChaincodeId, chaincodeIDFunctionsStub);
			sinon.assert.called(channelHeaderFunctionStub.setExtension);
			sinon.assert.called(channelHeaderFunctionStub.setTlsCertHash);

			channelHeader.should.deep.equal(channelHeaderFunctionStub);
		});
	});

	describe('#buildHeader', () => {
		let signatureHeaderFunctionStub;
		let signatureHeaderStub;
		let headerFunctionStub;
		let headerStub;
		let mockCreator;
		let mockChannelHeader;

		beforeEach(() => {
			signatureHeaderFunctionStub = {setCreator: sinon.stub(), setNonce: sinon.stub(), toBuffer: sinon.stub()};
			signatureHeaderStub = sinon.stub().returns(signatureHeaderFunctionStub);
			revert.push(ClientUtils.__set__('fabprotos.common.SignatureHeader', signatureHeaderStub));

			headerFunctionStub = {setSignatureHeader: () => {}, setChannelHeader: () => {}};
			sinon.stub(headerFunctionStub);
			headerStub = sinon.stub().returns(headerFunctionStub);
			revert.push(ClientUtils.__set__('fabprotos.common.Header', headerStub));


			mockCreator = {serialize: () => {}};
			sinon.stub(mockCreator);
			mockChannelHeader = {toBuffer: () => {}};
			sinon.stub(mockChannelHeader);
		});

		it('should return a valid header', () => {
			mockCreator.serialize.returns('serialize');
			const header = ClientUtils.buildHeader(mockCreator, mockChannelHeader, 'nonce');
			sinon.assert.calledWith(signatureHeaderFunctionStub.setCreator, 'serialize');
			sinon.assert.calledWith(signatureHeaderFunctionStub.setNonce, 'nonce');
			sinon.assert.called(headerFunctionStub.setSignatureHeader);
			sinon.assert.called(headerFunctionStub.setChannelHeader);
			sinon.assert.called(signatureHeaderFunctionStub.toBuffer);
			header.should.deep.equal(headerStub());
		});
	});

	describe('#checkProposalRequest', () => {
		it('should return the correct error message if no data given', () => {
			const result = ClientUtils.checkProposalRequest();
			should.equal(result, 'Missing input request object on the proposal request');
		});

		it('should return the correct error message if no request.chaincodeId given', () => {
			const result = ClientUtils.checkProposalRequest({chaincodeId: 0});
			should.equal(result, 'Missing "chaincodeId" parameter in the proposal request');
		});

		it('should return the correct error message if no request.rxId is given', () => {
			const result = ClientUtils.checkProposalRequest({chaincodeId: '0'}, {});
			should.equal(result, 'Missing "txId" parameter in the proposal request');
		});

		it('should return null if no request.rxId or all are given', () => {
			const result = ClientUtils.checkProposalRequest({chaincodeId: '0'});
			should.equal(result, null);
		});
	});

	describe('#checkInstallRequest', () => {
		it('should return the correct error message if no data is given', () => {
			const result = ClientUtils.checkInstallRequest();
			should.equal(result, 'Missing input request object on the proposal request');
		});

		it('should return the correct error message if request.chaincodeVersion is not given', () => {
			const result = ClientUtils.checkInstallRequest({});
			should.equal(result, 'Missing "chaincodeVersion" parameter in the proposal request');
		});

		it('should return the correct error message if request.chaincodeVersion is given', () => {
			const result = ClientUtils.checkInstallRequest({chaincodeVersion: '1'});
			should.equal(result, null);
		});
	});

	describe('#translateCCType', () => {
		const ccTypes = {GOLANG: 'GOLANG', CAR: 'CAR', JAVA: 'JAVA', NODE: 'NODE'};
		beforeEach(() => {
			revert.push(ClientUtils.__set__('fabprotos.protos.ChaincodeSpec.Type', ccTypes));
		});

		it('should return the correct default type', () => {
			const type = ClientUtils.translateCCType();
			type.should.equal('GOLANG');
		});

		it('should return the correct cc type', () => {
			const type = ClientUtils.translateCCType('Car');
			type.should.equal('CAR');
		});
	});

	describe('#ccTypeToString', () => {
		it('should return the correct string', () => {
			ClientUtils.ccTypeToString(ClientUtils.__get__('fabprotos.protos.ChaincodeSpec.Type.GOLANG')).should.equal('golang');
			ClientUtils.ccTypeToString(ClientUtils.__get__('fabprotos.protos.ChaincodeSpec.Type.CAR')).should.equal('car');
			ClientUtils.ccTypeToString(ClientUtils.__get__('fabprotos.protos.ChaincodeSpec.Type.JAVA')).should.equal('java');
			ClientUtils.ccTypeToString(ClientUtils.__get__('fabprotos.protos.ChaincodeSpec.Type.NODE')).should.equal('node');
		});
	});

	describe('#buildCurrentTimestamp', () => {
		let setSecondsStub;
		let setNanosStub;
		let dateStub;
		let timestampStub;
		let getTimeStub;

		beforeEach(() => {
			setSecondsStub = sinon.stub();
			setNanosStub = sinon.stub();
			getTimeStub = sinon.stub();
			dateStub = sinon.stub().returns({getTime: getTimeStub});
			timestampStub = sinon.stub().returns({setSeconds: setSecondsStub, setNanos: setNanosStub});
			revert.push(ClientUtils.__set__('fabprotos.google.protobuf.Timestamp', timestampStub));
			revert.push(ClientUtils.__set__('Date', dateStub));
		});

		it('should create a valid timestamp', () => {
			getTimeStub.returns(10000);
			const timestamp = ClientUtils.buildCurrentTimestamp();
			sinon.assert.calledWith(setSecondsStub, 10);
			sinon.assert.calledWith(setNanosStub, 0);
			timestamp.should.deep.equal(timestampStub());
		});
	});
});
