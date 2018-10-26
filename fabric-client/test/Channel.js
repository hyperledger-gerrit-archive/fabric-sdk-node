/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const sinon = require('sinon');
const chai = require('chai');
const rewire = require('rewire');
const chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
const expect = chai.expect;

const Channel = require('fabric-client/lib/Channel');
const ChannelRewire = rewire('fabric-client/lib/Channel');
const ChannelEventHub = require('fabric-client/lib/ChannelEventHub');
const Client = require('fabric-client/lib/Client');
const { Identity, SigningIdentity } = require('fabric-client/lib/msp/identity');
const MSP = require('fabric-client/lib/msp/msp');
const MSPManager = require('fabric-client/lib/msp/msp-manager');
const Orderer = require('fabric-client/lib/Orderer');
const Peer = require('fabric-client/lib/Peer');
const TransactionID = require('fabric-client/lib/TransactionID');
const sdk_utils = require('fabric-client/lib/utils.js');

const ProtoLoader = require('fabric-client/lib/ProtoLoader');
const responseProto = ProtoLoader.load(__dirname + '/../lib/protos/peer/proposal_response.proto').protos;
const proposalProto = ProtoLoader.load(__dirname + '/../lib/protos/peer/proposal.proto').protos;
const chaincodeProto = ProtoLoader.load(__dirname + '/../lib/protos/peer/chaincode.proto').protos;
const identitiesProto = ProtoLoader.load(__dirname + '/../lib/protos/msp/identities.proto').msp;
const transactionProto = ProtoLoader.load(__dirname + '/../lib/protos/peer/transaction.proto').protos;
const commonProto = ProtoLoader.load(__dirname + '/../lib/protos/common/common.proto').common;
const configtxProto = ProtoLoader.load(__dirname + '/../lib/protos/common/configtx.proto').common;

const fakeHandlerModulePath = 'fabric-client/test/FakeHandler';
const fakeHandler = require(fakeHandlerModulePath).create();

describe('Channel', () => {
	const channelName = 'channel-name';
	const mspId = 'mspId';

	let client;
	let channel;
	let peer1;
	let peer2;
	let orderer1;
	let orderer2;

	let stubMsp;
	let stubMspIdentity;
	let stubSigningIdentity;

	beforeEach(() => {
		client = new Client();
		channel = new Channel(channelName, client);
		peer1 = new Peer('grpc://localhost', { name: 'Peer1' });
		peer2 = new Peer('grpc://localhost', { name: 'Peer2' });
		orderer1 = new Orderer('grpc://localhost', { name: 'Orderer1' });
		orderer2 = new Orderer('grpc://localhost', { name: 'Orderer2' });

		stubMspIdentity = sinon.createStubInstance(Identity);
		stubMspIdentity.isValid.returns(true);
		stubMspIdentity.verify.returns(true);

		stubMsp = sinon.createStubInstance(MSP);
		stubMsp.deserializeIdentity.returns(stubMspIdentity);

		sinon.stub(channel.getMSPManager(), 'getMSP').withArgs(mspId).returns(stubMsp);

		stubSigningIdentity = sinon.createStubInstance(SigningIdentity);
		stubSigningIdentity.serialize.returns(Buffer.from('fake-serialized-signing-identity'));
		stubSigningIdentity.sign.callsFake((digest) => `fake-signature-of-${digest}`);
		sinon.stub(client, '_getSigningIdentity').returns(stubSigningIdentity);

	});

	afterEach(() => {
		sinon.restore();
	});

	/**
	 * Create a skeleton proposal response object.
	 * @param {String} results value for the payload.extension.results field of the proposal response
	 * @returns {ProposalResponse} protobuff
	 */
	function createProposalResponse(results) {
		const extension = new proposalProto.ChaincodeAction();
		extension.response = new responseProto.Response();
		extension.results = Buffer.from(results);

		const payload = new responseProto.ProposalResponsePayload();
		payload.extension = extension.toBuffer();

		const identity = new identitiesProto.SerializedIdentity();
		identity.mspid = mspId;

		const endorsement = new responseProto.Endorsement();
		endorsement.endorser = identity.toBuffer();

		const response = new responseProto.Response();
		response.status = 200;

		const proposalResponse = new responseProto.ProposalResponse();
		proposalResponse.response = response;
		proposalResponse.payload = payload.toBuffer();
		proposalResponse.endorsement = endorsement;

		return proposalResponse;
	}

	function createGetConfigBlockResponse(channelGroup = new configtxProto.ConfigGroup()) {
		const proposalResponse = createProposalResponse('GetConfigBlock response');

		const config = new configtxProto.Config();
		config.channel_group = channelGroup;

		const configEnvelope = new configtxProto.ConfigEnvelope();
		configEnvelope.config = config;

		const envelopePayload = new commonProto.Payload();
		envelopePayload.data = configEnvelope.toBuffer();

		const envelope = new commonProto.Envelope();
		envelope.payload = envelopePayload.toBuffer();

		const blockData = new commonProto.BlockData();
		blockData.data = [ envelope.toBuffer() ];

		const block = new commonProto.Block();
		block.data = blockData;

		proposalResponse.response.payload = block.toBuffer();

		return proposalResponse;
	}

	function createConfigUpdate() {
		const readSet = new configtxProto.ConfigGroup();

		const writeSet = new configtxProto.ConfigGroup();

		const configUpdate = new configtxProto.ConfigUpdate();
		configUpdate.channel_id = channelName;
		configUpdate.read_set = readSet;
		configUpdate.write_set = writeSet;

		return configUpdate;
	}

	describe('#constructor', () => {
		// Default channel name regex is /^[a-z][a-z0-9.-]*$/
		const invalidChannelName = '!INVALID_CHANNEL_NAME!';
		const channelNameCheckProperty = 'channel-name-regx-checker';

		it('throws if no name parameter', () => {
			expect(() => new Channel(undefined, client)).to.throw('name');
		});

		it('throws if name parameter not a string', () => {
			expect(() => new Channel(418, client)).to.throw('name');
		});

		it('throws if name parameters does not match channel-name-regex-checker', () => {
			sinon.stub(sdk_utils, 'getConfigSetting').withArgs(channelNameCheckProperty).returns({
				pattern: '^[a-z]+$',
				flags: 'i'
			});
			expect(() => new Channel(invalidChannelName, client)).to.throw(invalidChannelName);
		});

		it('no regex check of name parameter if configuration contains an empty object', () => {
			sinon.stub(sdk_utils, 'getConfigSetting').withArgs(channelNameCheckProperty).returns({});
			expect(new Channel(invalidChannelName, client)).to.be.an.instanceof(Channel);
		});

		it('no regex check of name parameter if no channel-name-regx-checker configuration present', () => {
			sinon.stub(sdk_utils, 'getConfigSetting').withArgs(channelNameCheckProperty).returns(null);
			expect(new Channel(invalidChannelName, client)).to.be.an.instanceof(Channel);
		});

		it('throws if no clientContext parameter', () => {
			expect(() => new Channel(channelName, undefined)).to.throw('clientContext');
		});
	});

	describe('add/remove peers', () => {
		// getPeer*() and getChannelPeer*() functions should behave identically

		it('new channel has no peers', () => {
			expect(channel.getChannelPeers(), 'getChannelPeer').to.be.empty;
			expect(channel.getPeers(), 'getPeer').to.be.empty;
		});

		it('throws getting a non-existent peer', () => {
			const peerName = 'NON_EXISTENT_PEER';
			expect(() => channel.getChannelPeer(peerName), 'getChannelPeer').to.throw(peerName);
			expect(() => channel.getPeer(peerName), 'getPeer').to.throw(peerName);
		});

		it('can get added peer', () => {
			channel.addPeer(peer1, 'mspId');

			expect(channel.getChannelPeer(peer1.getName()), 'getChannelPeer').to.exist;
			expect(channel.getPeer(peer1.getName()), 'getPeer').to.exist;
		});

		it('channel has only added peer', () => {
			channel.addPeer(peer1, 'mspId');

			const channelPeerNames = channel.getChannelPeers().map((peer) => peer.getName());
			expect(channelPeerNames, 'getChannelPeers').to.deep.equal([peer1.getName()]);

			const peerNames = channel.getPeers().map((peer) => peer.getName());
			expect(peerNames, 'getPeers').to.deep.equal([peer1.getName()]);
		});

		it('throws getting removed peer', () => {
			channel.addPeer(peer1, 'mspId');
			channel.removePeer(peer1);

			expect(() => channel.getChannelPeer(peer1.getName()), 'getChannelPeer').to.throw(peer1.getName());
			expect(() => channel.getPeer(peer1.getName()), 'getPeer').to.throw(peer1.getName());
		});

		it('channel does not have removed peer', () => {
			channel.addPeer(peer1, 'mspId');
			channel.removePeer(peer1);

			expect(channel.getChannelPeers(), 'getChannelPeer').to.be.empty;
			expect(channel.getPeers(), 'getPeer').to.be.empty;
		});

		it('throws adding a duplicate peer with replace parameter unset', () => {
			channel.addPeer(peer1, 'mspId');
			expect(() => channel.addPeer(peer1, 'mspId')).to.throw().with.property('name', 'DuplicatePeer');
		});

		it('allows adding a duplicate peer with replace parameter set', () => {
			channel.addPeer(peer1, 'mspId');
			channel.addPeer(peer1, 'mspId', null, true);

			expect(channel.getChannelPeers().length).to.equal(1);
		});

		it('sets specified roles on added peer', () => {
			const roles = {
				endorsingPeer: false,
				chaincodeQuery: false,
				ledgerQuery: false,
				eventSource: false,
				discover: false
			};
			channel.addPeer(peer1, 'mspId', roles);

			const channelPeer = channel.getChannelPeer(peer1.getName());

			Object.getOwnPropertyNames(roles).forEach((role) => {
				expect(channelPeer.isInRole(role), role).to.equal(roles[role]);
			});
		});
	});

	describe('#getPeersForOrg', () => {
		it('returns empty array for non-existent org', () => {
			expect(channel.getPeersForOrg('no-such-msp-id')).to.be.empty;
		});

		it('returns peers for org', () => {
			const org1 = 'org1';
			const org2 = 'org2';
			channel.addPeer(peer1, org1);
			channel.addPeer(peer2, org2);

			const org1PeerNames = channel.getPeersForOrg(org1).map((peer) => peer.getName());
			expect(org1PeerNames, 'org1').to.deep.equal([peer1.getName()]);

			const org2PeerNames = channel.getPeersForOrg(org2).map((peer) => peer.getName());
			expect(org2PeerNames, 'org2').to.deep.equal([peer2.getName()]);
		});

		it('uses org from client if none supplied', () => {
			const org1 = 'org1';
			const org2 = 'org2';
			client.loadFromConfig({
				version: '1.0',
				client: {
					organization: 'Org1'
				},
				organizations: {
					'Org1': {
						mspid: org1
					}
				}
			});
			channel.addPeer(peer1, org1);
			channel.addPeer(peer2, org2);

			const peerNames = channel.getPeersForOrg().map((peer) => peer.getName());
			expect(peerNames).to.deep.equal([peer1.getName()]);
		});
	});

	describe('add/remove orderers', () => {
		it('new channel has no orderers', () => {
			expect(channel.getOrderers()).to.be.empty;
		});

		it('throws getting a non-existent peer', () => {
			const ordererName = 'NON_EXISTENT_ORDERER';
			expect(() => channel.getChannelPeer(ordererName)).to.throw(ordererName);
		});

		it('can get added orderer', () => {
			channel.addOrderer(orderer1);
			expect(channel.getOrderer(orderer1.getName())).to.exist;
		});

		it('channel has only added orderer', () => {
			channel.addOrderer(orderer1);

			const ordererNames = channel.getOrderers().map((orderer) => orderer.getName());
			expect(ordererNames).to.deep.equal([orderer1.getName()]);
		});

		it('throws getting removed orderer', () => {
			channel.addOrderer(orderer1);
			channel.removeOrderer(orderer1);

			expect(() => channel.getOrderer(orderer1.getName())).to.throw(orderer1.getName());
		});

		it('channel does not have removed orderer', () => {
			channel.addOrderer(orderer1);
			channel.removeOrderer(orderer1);

			expect(channel.getOrderers()).to.be.empty;
		});

		it('throws adding a duplicate orderer with replace parameter unset', () => {
			channel.addOrderer(orderer1);
			expect(() => channel.addOrderer(orderer1)).to.throw().with.property('name', 'DuplicateOrderer');
		});

		it('allows adding a duplicate peer with replace parameter set', () => {
			channel.addOrderer(orderer1);
			channel.addOrderer(orderer1, true);

			expect(channel.getOrderers().length).to.equal(1);
		});
	});

	describe('#close', () => {
		it('calls close on all channel peers', () => {
			const peers = [ peer1, peer2 ];
			peers.forEach((peer) => {
				sinon.spy(peer, 'close');
				channel.addPeer(peer, `${peer.getName()}Org`);
			});

			channel.close();

			peers.forEach((peer) => {
				expect(peer.close.calledOnce, peer.getName()).to.be.true;
			});
		});

		it('calls close on all orderers', () => {
			const orderers = [ orderer1, orderer2 ];
			orderers.forEach((orderer) => {
				sinon.spy(orderer, 'close');
				channel.addOrderer(orderer);
			});

			channel.close();

			orderers.forEach((orderer) => {
				expect(orderer.close.calledOnce, orderer.getName()).to.be.true;
			});
		});
	});

	describe('#getName', () => {
		it('returns the channel name', () => {
			expect(channel.getName()).to.equal(channelName);
		});
	});

	describe('#newChannelEventHub', () => {
		it('returns a channel event hub for a peer', () => {
			expect(channel.newChannelEventHub(peer1)).to.be.an.instanceof(ChannelEventHub);
		});

		it('returns a channel event hub for a named peer assigned to the channel', () => {
			channel.addPeer(peer1);
			expect(channel.newChannelEventHub(peer1.getName())).to.be.an.instanceof(ChannelEventHub);
		});

		it('throws for a named peer not assigned to the channel', () => {
			const peerName = 'NON_EXISTENT_PEER';
			expect(() => channel.newChannelEventHub(peerName)).to.throw(peerName);
		});
	});

	describe('#getChannelEventHub', () => {
		it('throws for non-string name parameter', () => {
			expect(() => channel.getChannelEventHub(418)).to.throw('name');
		});

		it('returns a channel event hub for a named peer assigned to the channel', () => {
			channel.addPeer(peer1);
			expect(channel.getChannelEventHub(peer1.getName())).to.be.an.instanceof(ChannelEventHub);
		});

		it('returns the same channel event hub on subsequent calls', () => {
			channel.addPeer(peer1);
			const channelEventHub = channel.newChannelEventHub(peer1.getName());
			expect(channel.getChannelEventHub(peer1.getName())).to.deep.equal(channelEventHub);
		});

		it('throws for a peer not assigned to the channel', () => {
			const peerName = 'NON_EXISTENT_PEER';
			expect(() => channel.getChannelEventHub(peerName)).to.throw(peerName);
		});
	});

	describe('#getChannelEventHubsForOrg', () => {
		function assertChannelEventHubsMatchPeers(eventHubs, peers) {
			eventHubs.forEach((eventHub) => {
				expect(eventHub).to.be.an.instanceof(ChannelEventHub);
			});

			const eventHubNames = eventHubs.map((eventHub) => eventHub.getName());
			const peerNames = peers.map((peer) => peer.getName());
			expect(eventHubNames).to.deep.equal(peerNames);
		}

		it('returns empty results if no peers in org', () => {
			expect(channel.getChannelEventHubsForOrg('NON_EXISTENT_ORG')).to.be.empty;
		});

		it('returns channel event hubs for peers in a given organization', () => {
			const org1 = 'org1';
			const org2 = 'org2';
			channel.addPeer(peer1, org1);
			channel.addPeer(peer2, org2);

			const eventHubs = channel.getChannelEventHubsForOrg(org1);

			assertChannelEventHubsMatchPeers(eventHubs, [ peer1 ]);
		});

		it('returns channel event hubs for channel\'s orgnanization if no organization specified', () => {
			const org1 = 'org1';
			const org2 = 'org2';
			client.loadFromConfig({
				version: '1.0',
				client: {
					organization: 'Org1'
				},
				organizations: {
					'Org1': {
						mspid: org1
					}
				}
			});
			channel.addPeer(peer1, org1);
			channel.addPeer(peer2, org2);

			const eventHubs = channel.getChannelEventHubsForOrg();

			assertChannelEventHubsMatchPeers(eventHubs, [ peer1 ]);
		});

		it('does not return channel event hubs for peers that are not event sources', () => {
			const org = 'org';
			channel.addPeer(peer1, org);
			channel.addPeer(peer2, org, { eventSource: false });

			const eventHubs = channel.getChannelEventHubsForOrg(org);

			assertChannelEventHubsMatchPeers(eventHubs, [ peer1 ]);
		});
	});

	describe('organizations', () => {
		let mspManager;

		beforeEach(() => {
			mspManager = new MSPManager();
		});

		it('set/get MSP manager', () => {
			channel.setMSPManager(mspManager);
			const result = channel.getMSPManager();
			expect(result).to.equal(mspManager);
		});

		it('returns empty array if no member services providers', () => {
			channel.setMSPManager(mspManager);
			const orgs = channel.getOrganizations();
			expect(orgs).to.be.an('array').that.is.empty;
		});

		it('returns member services provider IDs from MSP manager', () => {
			const mspId1 = 'mspId1';
			const mspId2 = 'mspId2';
			mspManager.addMSP({ id: mspId1 });
			mspManager.addMSP({ id: mspId2 });
			channel.setMSPManager(mspManager);

			const orgs = channel.getOrganizations();

			expect(orgs).to.have.deep.members([{ id: mspId1 }, { id: mspId2 }]);
		});
	});

	describe('#toString', () => {
		it('include channel name', () => {
			const result = channel.toString();
			expect(result).to.have.string(channel.getName());
		});

		it('include peers', () => {
			channel.addPeer(peer1, 'org1');
			channel.addPeer(peer2, 'org2');

			const result = channel.toString();

			[peer1, peer2].forEach((peer) => {
				expect(result).to.have.string(peer.toString());
			});
		});

		it('include orderers', () => {
			channel.addOrderer(orderer1);
			channel.addOrderer(orderer2);

			const result = channel.toString();

			[orderer1, orderer2].forEach((orderer) => {
				expect(result).to.have.string(orderer.toString());
			});
		});
	});

	describe('#compareProposalResponseResults', () => {
		it('throws if argument is not an array', () => {
			expect(() => channel.compareProposalResponseResults()).to.throw('proposal_responses must be an array');
		});

		it('throws if argument is an empty array', () => {
			expect(() => channel.compareProposalResponseResults([])).to.throw('proposal_responses is empty');
		});

		it('returns true for a single poposal response', () => {
			const proposalResponse1 = createProposalResponse('foo');
			const result = channel.compareProposalResponseResults([ proposalResponse1 ]);
			expect(result).to.be.true;
		});

		it('returns true for matching poposal responses', () => {
			const proposalResponse1 = createProposalResponse('foo');
			const proposalResponse2 = createProposalResponse('foo');
			const result = channel.compareProposalResponseResults([ proposalResponse1, proposalResponse2 ]);
			expect(result).to.be.true;
		});

		it('returns false for non-matching poposal responses', () => {
			const proposalResponse1 = createProposalResponse('foo');
			const proposalResponse2 = createProposalResponse('bar');
			const result = channel.compareProposalResponseResults([ proposalResponse1, proposalResponse2 ]);
			expect(result).to.be.false;
		});
	});

	describe('#generateUnsignedProposal', () => {
		const mspId = 'org1';
		const certificate = 'fake-cert';
		const admin = false;
		let request;

		beforeEach(() => {
			request = {
				fcn: 'functionName',
				args: ['a', 'b', 'c'],
				chaincodeId: 'chaincode-id',
			};
		});

		function getArgsFromProposal(proposal) {
			const payload = proposalProto.ChaincodeProposalPayload.decode(proposal.getPayload());
			const invocationSpec = chaincodeProto.ChaincodeInvocationSpec.decode(payload.getInput());
			const argBuffers = invocationSpec.chaincode_spec.getInput().getArgs();
			return argBuffers.map((buffer) => buffer.toString('utf8'));
		}

		it('throws if request is missing', () => {
			expect(() => channel.generateUnsignedProposal(null, mspId, certificate, admin)).to.throw('request');
		});

		it('throws if request.args is not an array', () => {
			request.args = undefined;
			expect(() => channel.generateUnsignedProposal(request, mspId, certificate, admin)).to.throw('args');
		});

		it('throws if request.chaincodeId is missing', () => {
			delete request.chaincodeId;
			expect(() => channel.generateUnsignedProposal(request, mspId, certificate, admin)).to.throw('chaincodeId');
		});

		it('returns proposal with args array of [functionName, requestArgs...]', () => {
			const result = channel.generateUnsignedProposal(request, mspId, certificate, admin);
			const args = getArgsFromProposal(result.proposal);

			const expectedArgs = Array.of(request.fcn, ...request.args);
			expect(args).to.be.an('array')
				.that.deep.equals(expectedArgs);
		});

		it('returns a proposal with function name "invoke" if no request.fcn is missing', () => {
			delete request.fcn;

			const result = channel.generateUnsignedProposal(request, mspId, certificate, admin);
			const args = getArgsFromProposal(result.proposal);

			const expectedArgs = Array.of('invoke', ...request.args);
			expect(args).to.be.an('array')
				.that.deep.equals(expectedArgs);
		});

		it('returns a proposal with request.argbytes appended to args array', () => {
			const argbytesValue = 'argbytes';
			request.argbytes = Buffer.from(argbytesValue);

			const result = channel.generateUnsignedProposal(request, mspId, certificate, admin);
			const args = getArgsFromProposal(result.proposal);

			const expectedArgs = Array.of(request.fcn, ...request.args, argbytesValue);
			expect(args).to.be.an('array')
				.that.deep.equals(expectedArgs);
		});

		it('returns a transaction ID', () => {
			const result = channel.generateUnsignedProposal(request, mspId, certificate, admin);
			expect(result.txId).to.be.an.instanceOf(TransactionID);
		});

		it('returns admin transaction ID if admin parameter is true', () => {
			const result = channel.generateUnsignedProposal(request, mspId, certificate, true);
			expect(result.txId.isAdmin()).to.be.true;
		});

		it('returns non-admin transaction ID if admin parameter is false', () => {
			const result = channel.generateUnsignedProposal(request, mspId, certificate, false);
			expect(result.txId.isAdmin()).to.be.false;
		});
	});

	describe('#verifyProposalResponse', () => {
		it('throws if proposal_response is missing', () => {
			expect(() => channel.verifyProposalResponse(null)).to.throw('Missing proposal response');
		});

		it('throws if parameter is not a ProposalResponse', () => {
			expect(() => channel.verifyProposalResponse({})).to.throw('ProposalResponse');
		});

		it('throws for unknown MSP ID in proposal response', () => {
			channel.getMSPManager().getMSP.withArgs(mspId).returns(null);
			const proposalResponse = createProposalResponse('messsage');

			expect(() => channel.verifyProposalResponse(proposalResponse)).to.throw(mspId);
		});

		it('returns false if MSP unable to deserialize identity', () => {
			stubMsp.deserializeIdentity.returns(null);
			const proposalResponse = createProposalResponse('messsage');

			const result = channel.verifyProposalResponse(proposalResponse);

			expect(result).to.be.false;
		});

		it('returns false if identity not valid', () => {
			const proposalResponse = createProposalResponse('messsage');
			stubMspIdentity.isValid.returns(false);

			const result = channel.verifyProposalResponse(proposalResponse);

			expect(result).to.be.false;
		});

		it('returns false if signature not valid', () => {
			const proposalResponse = createProposalResponse('messsage');
			stubMspIdentity.verify.returns(false);

			const result = channel.verifyProposalResponse(proposalResponse);

			expect(result).to.be.false;
		});

		it('returns false if signature verification errors', () => {
			const proposalResponse = createProposalResponse('messsage');
			stubMspIdentity.verify.throws('VerifyError', 'test');

			const result = channel.verifyProposalResponse(proposalResponse);

			expect(result).to.be.false;
		});

		it('returns true for valid proposal response', () => {
			const proposalResponse = createProposalResponse('messsage');
			const result = channel.verifyProposalResponse(proposalResponse);
			expect(result).to.be.true;
		});
	});

	describe('#generateUnsignedTransaction', () => {
		let transactionRequest;

		beforeEach(() => {
			transactionRequest = {
				proposalResponses: [ createProposalResponse('message') ],
				proposal: new proposalProto.Proposal(),
				txId: sinon.createStubInstance(TransactionID)
			};
		});

		it('throws if request missing', () => {
			expect(() => channel.generateUnsignedTransaction(null)).to.throw('request');
		});

		it('throws if request.proposalResponses is not an array', () => {
			transactionRequest.proposalResponses = undefined;
			expect(() => channel.generateUnsignedTransaction(transactionRequest)).to.throw('"proposalResponses"');
		});

		it('throws if request.proposal missing', () => {
			delete transactionRequest.proposal;
			expect(() => channel.generateUnsignedTransaction(transactionRequest)).to.throw('"proposal"');
		});

		it('throws if no endorsed proposal responses', () => {
			transactionRequest.proposalResponses = [];
			expect(() => channel.generateUnsignedTransaction(transactionRequest)).to.throw('no valid endorsements');
		});

		it('throws if no endorsed proposal responses', () => {
			transactionRequest.proposalResponses[0].response.status = 418;
			expect(() => channel.generateUnsignedTransaction(transactionRequest)).to.throw('no valid endorsements');
		});

		it('returns a transaction payload containing first input proposal response payload', () => {
			const payload = channel.generateUnsignedTransaction(transactionRequest);
			const transaction = transactionProto.Transaction.decode(payload.getData());
			const transactionAction = transaction.getActions()[0];
			const actionPayload = transactionProto.ChaincodeActionPayload.decode(transactionAction.getPayload());
			const endorsedAction = actionPayload.getAction();
			const proposalResponsePayload = responseProto.ProposalResponsePayload.decode(endorsedAction.getProposalResponsePayload());

			const expectedPayload = responseProto.ProposalResponsePayload.decode(transactionRequest.proposalResponses[0].getPayload());

			expect(proposalResponsePayload.toBuffer().equals(expectedPayload.toBuffer())).to.be.true;
		});
	});

	describe('#sendSignedProposal', () => {
		it('returns results of calling sendProposal() on peers as an array', async () => {
			const proposalResult1 = { _fake: 'peer1' };
			const proposalResult2 = { _fake: 'peer2' };
			sinon.stub(peer1, 'sendProposal').resolves(proposalResult1);
			sinon.stub(peer2, 'sendProposal').resolves(proposalResult2);

			const signedProposal = {
				targets: [ peer1, peer2 ],
				signedProposal: Buffer.from('signedProposal')
			};
			const results = await channel.sendSignedProposal(signedProposal, 1000);

			expect(results).to.have.members([ proposalResult1, proposalResult2 ]);
		});
	});

	describe('#initialize', () => {
		it('throws if no request parameter and no peer added', () => {
			return expect(channel.initialize()).to.be.rejectedWith('target');
		});

		it('successful with peer added and no request parameter', () => {
			sinon.stub(peer1, 'sendProposal').resolves(createGetConfigBlockResponse());

			channel.addPeer(peer1, 'mspid');
			return expect(channel.initialize()).to.be.fulfilled;
		});

		it('successful with two peers added and peer name supplied as request target parameter', () => {
			sinon.stub(peer1, 'sendProposal').resolves('proposal sent to wrong peer');
			sinon.stub(peer2, 'sendProposal').resolves(createGetConfigBlockResponse());

			channel.addPeer(peer1, 'org1');
			channel.addPeer(peer2, 'org2');
			const request = {
				target: peer2.getName()
			};
			return expect(channel.initialize(request)).to.be.fulfilled;
		});

		it('successful with no peer added and a Peer supplied as request target parameter', () => {
			sinon.stub(peer1, 'sendProposal').resolves(createGetConfigBlockResponse());

			const request = {
				target: peer1
			};
			return expect(channel.initialize(request)).to.be.fulfilled;
		});

		it('successful with no peer added and a ChannelPeer supplied as request target parameter', () => {
			sinon.stub(peer1, 'sendProposal').resolves(createGetConfigBlockResponse());
			channel.addPeer(peer1, 'mspid');
			const channelPeer = channel.getChannelPeer(peer1.getName());
			channel.removePeer(peer1);

			const request = {
				target: channelPeer
			};
			return expect(channel.initialize(request)).to.be.fulfilled;
		});

		it('throws if specified target peer name does not exist', () => {
			const request = {
				target: 'NON_EXISTENT_PEER_NAME'
			};
			return expect(channel.initialize(request)).to.be.rejectedWith(request.target);
		});

		it('throws if specified target peer is not a Peer or ChannelPeer', () => {
			const request = {
				target: {}
			};
			return expect(channel.initialize(request)).to.be.rejectedWith('Target peer is not a valid peer object instance');
		});

		it('specified endorsement handler is initialized', async () => {
			sinon.stub(peer1, 'sendProposal').resolves(createGetConfigBlockResponse());
			const initializeSpy = sinon.spy(fakeHandler, 'initialize');

			const request = {
				target: peer1,
				endorsementHandler: fakeHandlerModulePath
			};
			await channel.initialize(request);

			sinon.assert.called(initializeSpy);
		});

		it('specified commit handler is initialized', async () => {
			sinon.stub(peer1, 'sendProposal').resolves(createGetConfigBlockResponse());
			const initializeSpy = sinon.spy(fakeHandler, 'initialize');

			const request = {
				target: peer1,
				commitHandler: fakeHandlerModulePath
			};
			await channel.initialize(request);

			sinon.assert.called(initializeSpy);
		});

		it('successful with no commit handler specified and no commit handler configuration', () => {
			sinon.stub(peer1, 'sendProposal').resolves(createGetConfigBlockResponse());
			const getConfigSettingStub = sinon.stub(sdk_utils, 'getConfigSetting');
			getConfigSettingStub.withArgs('commit-handler').returns(null);
			getConfigSettingStub.callThrough();

			const request = {
				target: peer1,
			};
			return expect(channel.initialize(request)).to.be.fulfilled;
		});

		it('configuration update', () => {
			const configUpdate = createConfigUpdate();
			const request = {
				configUpdate: configUpdate.toBuffer()
			};
			return expect(channel.initialize(request)).to.be.fulfilled;
		});
	});

	describe('#_initialize', () => {});

	describe('_buildDiscoveryMSPs', () => {});

	describe('#_buildDiscoveryOrderers', () => {});

	describe('#_buildDiscoveryPeers', () => {});

	describe('#_buildDiscoveryEndorsementPlan', () => {});

	describe('#getDiscoveryResults', () => {});

	describe('#getEndorsementPlan', () => {});

	describe('#refresh', () => {
		it('should call initialize and return the result', async () => {
			sinon.stub(channel, '_initialize').resolves('initialize-result');
			const result = await channel.refresh();
			sinon.assert.calledWith(channel._initialize, channel._last_refresh_request);
			result.should.equal('initialize-result');
		});

		it('should log if Channel._initialize throws an error', async () => {
			sinon.stub(channel, '_initialize').rejects(new Error('initialize-failed'));
			try {
				await channel.refresh();
			} catch (err) {
				err.message.should.equal('initialize-failed');
			}
		});
	});

	describe('#getOrganizations', () => {});

	describe('#setMSPManager', () => {});

	describe('#getMSPManager', () => {});

	describe('#addPeer', () => {});

	describe('#remoePeer', () => {});

	describe('#gePeer', () => {});

	describe('#getChannelPeers', () => {});

	describe('#addOrderer', () => {});

	describe('#removeOrderer', () => {});

	describe('#getOrderer', () => {});

	describe('#getOrderers', () => {});

	describe('#newChannelEventHub', () => {});

	describe('#getChannelEventHub', () => {});

	describe('#getChannelEventHubsForOrg', () => {});

	describe('#getPeersForOrg', () => {});

	describe('#getGenesisBlock', () => {});

	describe('#_discover', () => {});

	describe('#_processDiscoveryChaincodeResults', () => {});

	describe('#_processDiscoveryResults', () => {});

	describe('#_processDiscoveryMembershipResults', () => {});

	describe('#_processPeers', () => {});

	describe('#_processPeers', () => {});

	describe('#_buildOrdererName', () => {});

	describe('#_buildPeerName', () => {});

	describe('#_buildUrl', () => {});

	describe('#_buildOptions', () => {});

	describe('#_buildTlsChaincodeCerts', () => {});

	describe('#_buildProtoChaincodeInterest', () => {});

	describe('#_merge_hints', () => {});

	describe('#buildDiscoveryInterest', () => {});

	describe('#_buildDiscoveryChaincodeCall', () => {});

	describe('#joinChannel', () => {});

	describe('#getChannelConfig', () => {});

	describe('#getChannelConfigFromOrderer', () => {});

	describe('#loadConfigUpdate', () => {});

	describe('#loadConfigEnvelope', () => {});

	describe('#queryInfo', () => {});

	describe('#queryByBlockId', () => {});

	describe('#queryBlockByHash', () => {});

	describe('#queryBlock', () => {});

	describe('#queryTransaction', () => {});

	describe('#queryInstantiatedChaincodes', () => {});

	describe('#queryCollectionsConfig', () => {});

	describe('#sendInstantiateProposal', () => {
		it('should call _sendChaincodeProposal', () => {
			sinon.stub(channel, '_sendChaincodeProposal');
			channel.sendInstantiateProposal('request', 10);
			sinon.assert.calledWith(channel._sendChaincodeProposal, 'request', 'deploy', 10);
		});
	});

	describe('#sendUpgradeProposal', () => {
		it('should call _sendChaincodeProposal', () => {
			sinon.stub(channel, '_sendChaincodeProposal');
			channel.sendUpgradeProposal('request', 10);
			sinon.assert.calledWith(channel._sendChaincodeProposal, 'request', 'upgrade', 10);
		});
	});

	describe('#_sendChaincodeProposal', () => {});

	describe('#sendTransactionProposal', () => {});

	describe('sendTransactionProposal', () => {});

	describe('#sendTransaction', () => {});

	describe('#sendSignedTransation', () => {});

	describe('#buildEnvelope', () => {});

	describe('#queryByChaincode', () => {});

	describe('#_getTargetForQuery', () => {});

	describe('#_getTargetForDiscovery', () => {});

	describe('#_getTargets', () => {});

	describe('#_getOrderer', () => {});

	describe('#_buildEndorsementPolicy', () => {});

	describe('#_getProposalResponseResults', () => {});

	describe('#loadConfigGroup', () => {});

	describe('#loadConfigValue', () => {});
});

describe('ChannelPeer', () => {
	let ChannelPeer;
	let peer;
	let channel;
	let eventHub;
	let instance;
	beforeEach(() => {
		ChannelPeer = ChannelRewire.__get__('ChannelPeer');
		peer = sinon.createStubInstance(Peer);
		peer.getName.returns('peerName');
		peer.getUrl.returns('http://someurl');
		channel = sinon.createStubInstance(Channel);
		eventHub = sinon.createStubInstance(ChannelEventHub);
		instance = new ChannelPeer('mspId', channel, peer);
		instance._channel_event_hub = eventHub;
	});

	describe('#constructor', () => {
		it('should throw an error if the channel parameter is missing', () => {
			(() => {
				new ChannelPeer('mspid');
			}).should.throw(Error, 'Missing Channel parameter');
		});

		it('should throw an error if the peer parameter is missing', () => {
			(() => {
				new ChannelPeer('mspid', sinon.createStubInstance(Channel));
			}).should.throw(Error, 'Missing Peer parameter');
		});

		it('should set the correct class properties', () => {
			const channelStub = sinon.createStubInstance(Channel);
			const peerStub = sinon.createStubInstance(Peer);
			peerStub.getName.returns('peerName');
			const channelPeer = new ChannelPeer('mspId', channelStub, peerStub);
			channelPeer._mspid.should.equal('mspId');
			channelPeer._name.should.equal('peerName');
			channelPeer._channel.should.equal(channelStub);
			channelPeer._peer.should.equal(peerStub);
			channelPeer._roles.should.deep.equal({});
		});

		it('should set the correct roles', () => {
			const channelStub = sinon.createStubInstance(Channel);
			const peerStub = sinon.createStubInstance(Peer);
			peerStub.getName.returns('peerName');
			const channelPeer = new ChannelPeer('mspId', channelStub, peerStub, {'role1': 'role1'});
			channelPeer._roles.should.deep.equal({role1: 'role1'});
		});
	});

	describe('#close' , () => {
		it('should close the peer connection', () => {
			instance._channel_event_hub = null;
			instance.close();
			sinon.assert.called(peer.close);
		});

		it('should close the connection to the event hub', () => {
			instance.close();
			sinon.assert.called(instance._channel_event_hub.close);
		});
	});

	describe('#getMspId', () => {
		it('should return the mspid', () => {
			instance.getMspid().should.equal('mspId');
		});
	});

	describe('#getName', () => {
		it('should return the name', () => {
			instance.getName().should.equal('peerName');
		});
	});

	describe('#getUrl', () => {
		it('should return the peer url', () => {
			instance.getUrl().should.equal('http://someurl');
		});
	});

	describe('#setRole', () => {
		it('should set a role', () => {
			instance.setRole('aSetRole', 'theRole');
			instance._roles.should.deep.equal({aSetRole: 'theRole'});
		});
	});

	describe('#isInRole', () => {
		it('should throw an error if no role is given', () => {
			(() => {
				instance.isInRole();
			}).should.throw(Error, 'Missing "role" parameter');
		});

		it('should return true if role not found', () => {
			instance.isInRole('someRole').should.be.true;
		});

		it('should return the role if found', () => {
			instance._roles = {someRole: 'theRole'};
			instance.isInRole('someRole').should.equal('theRole');
		});
	});

	describe('#isInOrg', () => {
		it('should return true if no mspId is given', () => {
			instance._mspid = null;
			instance.isInOrg().should.be.true;
		});

		it('should check if the mspid matches', () => {
			instance.isInOrg('mspId').should.be.true;
		});
	});

	describe('#getChannelEventHub', () => {
		it('should return the event hub if it is set', () => {
			instance.getChannelEventHub().should.equal(eventHub);
		});

		it('should create a new event hub if one is not set', () => {
			instance._channel_event_hub = null;
			const newEventHub = instance.getChannelEventHub();
			newEventHub.should.be.instanceof(ChannelEventHub);
			newEventHub._channel.should.equal(channel);
			newEventHub._peer.should.equal(peer);
		});
	});

	describe('#getPeer', () => {
		it('should return the peer', () => {
			instance.getPeer().should.equal(peer);
		});
	});

	describe('#sendProposal', () => {
		it('should return the proposal request', () => {
			peer.sendProposal.returns('proposal');
			instance.sendProposal('proposal', 'request').should.equal('proposal');
			sinon.assert.calledWith(peer.sendProposal, 'proposal', 'request');
		});
	});

	describe('#sendDiscovery', () => {
		it('should return the discovery request', () => {
			peer.sendDiscovery.returns('discovery');
			instance.sendDiscovery('request', 'timeout').should.equal('discovery');
			sinon.assert.calledWith(peer.sendDiscovery, 'request', 'timeout');
		});
	});

	describe('#toString', () => {
		it('should call peer.toString', () => {
			instance.toString();
			sinon.assert.called(peer.toString);
		});
	});
});
