/*
 Copyright 2017 IBM All Rights Reserved.

 Licensed under the Apache License, Version 2.0 (the 'License');
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

	  http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an 'AS IS' BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

'use strict';

var grpc = require('grpc');
var util = require('util');
var path = require('path');
var utils = require('./utils.js');
var logger = utils.getLogger('Block.js');

var _ccProto = grpc.load(__dirname + '/protos/peer/chaincode.proto').protos;
var _transProto = grpc.load(__dirname + '/protos/peer/transaction.proto').protos;
var _proposalProto = grpc.load(__dirname + '/protos/peer/proposal.proto').protos;
var _responseProto = grpc.load(__dirname + '/protos/peer/proposal_response.proto').protos;
var _queryProto = grpc.load(__dirname + '/protos/peer/query.proto').protos;
var _peerConfigurationProto = grpc.load(__dirname + '/protos/peer/configuration.proto').protos;
var _mspPrProto = grpc.load(__dirname + '/protos/common/msp_principal.proto').common;
var _commonProto = grpc.load(__dirname + '/protos/common/common.proto').common;
var _configtxProto = grpc.load(__dirname + '/protos/common/configtx.proto').common;
var _policiesProto = grpc.load(__dirname + '/protos/common/policies.proto').common;
var _ledgerProto = grpc.load(__dirname + '/protos/common/ledger.proto').common;
var _commonConfigurationProto = grpc.load(__dirname + '/protos/common/configuration.proto').common;
var _ordererConfigurationProto = grpc.load(__dirname + '/protos/orderer/configuration.proto').orderer;
var _abProto = grpc.load(__dirname + '/protos/orderer/ab.proto').orderer;
var _mspConfigProto = grpc.load(__dirname + '/protos/msp/mspconfig.proto').msp;
var _timestampProto = grpc.load(__dirname + '/protos/google/protobuf/timestamp.proto').google.protobuf;
var _identityProto = grpc.load(path.join(__dirname, '/protos/identity.proto')).msp;



/**
 * Utility class to convert a grpc protobuf encoded byte array into a pure JSON object representing
 * a hyperledger fabric `Block`.
 * @class
 */
var Block = class {
	/**
	 * Constructs a JSON object containing all decoded values from the grpc encoded bytes
	 *
	 * @param {byte[]} block_bytes - The encode bytes of a hyperledger fabric message Block
	 * @see /protos/common/common.proto
	 */
	constructor(block_data) {
		if(!block_data && !(block_data instanceof Buffer)) {
			throw new Error('Block input data is not a byte buffer');
		}
		// TODO some quick pointers
		this.msp_list = [];
		this.orgs_list = [];

		this.decodeBlock(block_data);
	}

	decodeBlock(block_bytes) {
		//TODO maybe we want to save away the raw bytes so
		//users will be able to do their own decode if they
		// do not like this decoding
		//this.block_bytes = block_bytes;
		var proto_block = _commonProto.Block.decode(block_bytes);
		this.header = this.decodeBlockHeader(proto_block.getHeader());
		this.data = this.decodeBlockData(proto_block.getData());
		this.metadata = this.decodeBlockMetaData(proto_block.getMetadata());
	};

	decodeBlockHeader(proto_block_header) {
		var block_header = {};
		block_header.number = proto_block_header.getNumber();
		block_header.previous_hash = proto_block_header.getPreviousHash().toBuffer();
		block_header.data_hash = proto_block_header.getDataHash().toBuffer();

		return block_header;
	};

	decodeBlockData(proto_block_data) {
		var data = {};
		data.data = [];
		for(var i in proto_block_data.data) {
			var proto_envelope = _commonProto.Envelope.decode(proto_block_data.data[i].toBuffer());
			var envelope = this.decodeBlockDataEnvelope(proto_envelope);
			data.data.push(envelope);
		}

		return data;
	};

	decodeBlockMetaData(proto_block_metadata) {
		var metadata = {};
		metadata.metadata = [];
		for(var i in proto_block_metadata.metadata) {
			let proto_block_metadata_metadata = proto_block_metadata.metadata[i];
			metadata.metadata.push(proto_block_metadata_metadata.toBuffer());
		}
		return metadata;
	};

	decodeBlockDataEnvelope(proto_envelope) {
		var envelope = {};
		envelope.signature = proto_envelope.getSignature().toBuffer(); //leave as bytes

		envelope.payload = {};
		var proto_payload = _commonProto.Payload.decode(proto_envelope.getPayload().toBuffer());
		envelope.payload.header = this.decodeHeader(proto_payload.getHeader());

		if(envelope.payload.header.channel_header.type == 1) { // CONFIG
			envelope.payload.data = this.decodeConfigEnvelope(proto_payload.getData().toBuffer());
		}
//		else if(envelope.payload.header.channel_header.type == 2) { // CONFIG_UPDATE
//			envelope.payload.data = this.decodeConfigUpdateEnvelope(proto_payload.getData().toBuffer());
//		}
		else if(envelope.payload.header.channel_header.type == 3) { //ENDORSER_TRANSACTION
			envelope.payload.data = this.decodeEndorserTransaction(proto_payload.getData().toBuffer());
		}
		else {
			throw new Error('Only able to decode ENDORSER_TRANSACTION and CONFIG type blocks');
		}

		return envelope;
	};

	decodeEndorserTransaction(trans_bytes) {
		var data = {};
		var transaction = _transProto.Transaction.decode(trans_bytes);
		data.actions = [];
		if(transaction && transaction.actions) for(let i in transaction.actions) {
			var action = {};
			action.header = this.decodeSignatureHeader(transaction.actions[i].header);
			action.payload = this.decodeChaincodeActionPayload(transaction.actions[i].payload);
			data.actions.push(action);
		}

		return data;
	};

	decodeConfigEnvelope(config_envelope_bytes) {
		var config_envelope = {};
		var proto_config_envelope = _configtxProto.ConfigEnvelope.decode(config_envelope_bytes);
		config_envelope.config = this.decodeConfig(proto_config_envelope.getConfig());

		logger.debug('decodeConfigEnvelope - decode complete for config envelope - start config update');
		config_envelope.last_update = {};
		var proto_last_update = proto_config_envelope.getLastUpdate();//this is a common.Envelope
		config_envelope.last_update.payload = {};
		var proto_payload = _commonProto.Payload.decode(proto_last_update.getPayload().toBuffer());
		config_envelope.last_update.payload.header = this.decodeHeader(proto_payload.getHeader());
		config_envelope.last_update.payload.data = this.decodeConfigUpdateEnvelope(proto_payload.getData().toBuffer());
		config_envelope.last_update.signature = proto_last_update.getSignature().toBuffer();//leave as bytes

		return config_envelope;
	};

	decodeConfig(proto_config) {
		var config = {};
		config.sequence = proto_config.getSequence();
		config.channel_group = this.decodeConfigGroup(proto_config.getChannelGroup());

		return config;
	};

	decodeConfigUpdateEnvelope(config_update_envelope_bytes) {
		var config_update_envelope = {};
		var proto_config_update_envelope = _configtxProto.ConfigUpdateEnvelope.decode(config_update_envelope_bytes);
		config_update_envelope.config_update = this.decodeConfigUpdate(proto_config_update_envelope.getConfigUpdate().toBuffer());
		var signatures = [];
		for(var i in proto_config_update_envelope.signatures) {
			let proto_configSignature = proto_config_update_envelope.signatures[i];
			var config_signature = this.decodeConfigSignature(proto_configSignature);
			signatures.push(config_signature);
		}
		config_update_envelope.signatures = signatures;

		return config_update_envelope;
	};

	decodeConfigUpdate(config_update_bytes) {
		var config_update = {};
		var proto_config_update = _configtxProto.ConfigUpdate.decode(config_update_bytes);
		config_update.channel_id = proto_config_update.getChannelId();
		config_update.read_set = this.decodeConfigGroup(proto_config_update.getReadSet());
		config_update.write_set = this.decodeConfigGroup(proto_config_update.getWriteSet());

		return config_update;
	};

	decodeConfigGroups(config_group_map) {
		var config_groups = {};
		var keys = Object.keys(config_group_map.map);
		for(let i =0; i < keys.length; i++) {
			let key = keys[i];
			config_groups[key] = this.decodeConfigGroup(config_group_map.map[key].value);
		}

		return config_groups;
	};

	decodeConfigGroup(proto_config_group) {
		if(!proto_config_group) return null;
		var config_group = {};
		config_group.version = proto_config_group.getVersion();
		config_group.groups = this.decodeConfigGroups(proto_config_group.getGroups());
		config_group.values = this.decodeConfigValues(proto_config_group.getValues());
		config_group.policies = this.decodeConfigPolicies(proto_config_group.getPolicies());
		config_group.mod_policy = proto_config_group.getModPolicy();
		return config_group;
	};

	decodeConfigValues(config_value_map) {
		var config_values = {};
		var keys = Object.keys(config_value_map.map);
		for(let i =0; i < keys.length; i++) {
			let key = keys[i];
			config_values[key] = this.decodeConfigValue(config_value_map.map[key]);
		}

		return config_values;
	};

	decodeConfigValue(proto_config_value) {
		var config_value = {};
		logger.debug(' ======> Config item ::%s', proto_config_value.key);
		switch(proto_config_value.key) {
		case 'AnchorPeers':
			var anchor_peers = [];
			var proto_anchor_peers = _peerConfigurationProto.AnchorPeers.decode(proto_config_value.value.value);
			if(proto_anchor_peers && proto_anchor_peers.anchor_peers) for(var i in proto_anchor_peers.anchor_peers) {
				var anchor_peer = {
					host : proto_anchor_peers.anchor_peers[i].host,
					port : proto_anchor_peers.anchor_peers[i].port
				};
				anchor_peers.push(anchor_peer);
			}
			config_value.anchor_peers = anchor_peers;
			break;
		case 'MSP':
			var msp_config = {};
			var proto_msp_config = _mspConfigProto.MSPConfig.decode(proto_config_value.value.value);
			if(proto_msp_config.getType() == 0) {
				msp_config = this.decodeFabricMSPConfig(proto_msp_config.getConfig());
			}
			config_value.type = proto_msp_config.type;
			config_value.config = msp_config;
			break;
		case 'ConsensusType':
			var proto_consensus_type = _ordererConfigurationProto.ConsensusType.decode(proto_config_value.value.value);
			config_value.type = proto_consensus_type.getType(); // string
			break;
		case 'BatchSize':
			var proto_batch_size = _ordererConfigurationProto.BatchSize.decode(proto_config_value.value.value);
			config_value.maxMessageCount = proto_batch_size.getMaxMessageCount(); //uint32
			config_value.absoluteMaxBytes = proto_batch_size.getAbsoluteMaxBytes(); //uint32
			config_value.preferredMaxBytes = proto_batch_size.getPreferredMaxBytes(); //uint32
			break;
		case 'BatchTimeout':
			var proto_batch_timeout = _ordererConfigurationProto.BatchTimeout.decode(proto_config_value.value.value);
			config_value.timeout = proto_batch_timeout.getTimeout(); //string
			break;
		case 'ChannelRestrictions':
			var proto_channel_restrictions = _ordererConfigurationProto.ChannelRestrictions.decode(proto_config_value.value.value);
			config_value.max_count = proto_channel_restrictions.getMaxCount(); //unit64
			break;
		case 'CreationPolicy':
			var proto_creation_policy = _ordererConfigurationProto.CreationPolicy.decode(proto_config_value.value.value);
			config_value.policy = proto_creation_policy.getPolicy(); //string
			break;
		case 'ChainCreationPolicyNames':
			var proto_chain_creation_policy_names = _ordererConfigurationProto.ChainCreationPolicyNames.decode(proto_config_value.value.value);
			var names = [];
			var proto_names = proto_chain_creation_policy_names.getNames();
			if(proto_names) for(var i in proto_names) {
				names.push(proto_names[i]); //string
			}
			config_value.names = names;
			break;
		case 'HashingAlgorithm':
			var proto_hashing_algorithm = _commonConfigurationProto.HashingAlgorithm.decode(proto_config_value.value.value);
			config_value.name = proto_hashing_algorithm.getName();
			break;
		case 'BlockDataHashingStructure':
			var proto_blockdata_hashing_structure = _commonConfigurationProto.BlockDataHashingStructure.decode(proto_config_value.value.value);
			config_value.width = proto_blockdata_hashing_structure.getWidth(); //
			break;
		case 'OrdererAddresses':
			var orderer_addresses = _commonConfigurationProto.OrdererAddresses.decode(proto_config_value.value.value);
			var addresses = [];
			var proto_addresses = orderer_addresses.getAddresses();
			if(proto_addresses) for(var i in proto_addresses) {
				addresses.push(proto_addresses[i]); //string
			}
			config_value.addresses = addresses;
			break;
		default:
//			logger.debug('loadConfigValue - %s   - value: %s', group_name, config_value.value.value);
		}
		return config_value;
	};

	decodeConfigPolicies(config_policy_map) {
		var config_policies = {};
		var keys = Object.keys(config_policy_map.map);
		for(let i =0; i < keys.length; i++) {
			let key = keys[i];
			config_policies[key] = this.decodeConfigPolicy(config_policy_map.map[key]);
		}

		return config_policies;
	};

	decodeConfigPolicy(proto_config_policy) {
		var config_policy = {};
		config_policy.policy = proto_config_policy.type;
		logger.debug('decodeConfigPolicy ======> Policy item ::%s', proto_config_policy.key);
		switch(proto_config_policy.value.policy.type) {
		case _policiesProto.Policy.PolicyType.SIGNATURE:
			config_policy.policy = this.decodeSignaturePolicyEnvelope(proto_config_policy.value.policy.policy);
			break;
		case _policiesProto.Policy.PolicyType.MSP:
			var proto_msp = _policiesProto.Policy.decode(proto_config_policy.value.policy.policy);
			break;
		case _policiesProto.Policy.PolicyType.IMPLICIT_META:
			var proto_implicit = _policiesProto.ImplicitMetaPolicy.decode(proto_config_policy.value.policy.policy);
			break;
		default:
			throw new Error('Unknown Policy type');
		}

		return config_policy;
	};

	decodeSignaturePolicyEnvelope(signature_policy_envelope_bytes) {
		var signature_policy_envelope = {};
		var porto_signature_policy_envelope = _policiesProto.SignaturePolicyEnvelope.decode(signature_policy_envelope_bytes);
		signature_policy_envelope.version = porto_signature_policy_envelope.getVersion();
		signature_policy_envelope.policy = this.decodeSignaturePolicy(porto_signature_policy_envelope.getPolicy());
		var identities = [];
		var proto_identities = porto_signature_policy_envelope.getIdentities();
		if(proto_identities) for(var i in proto_identities) {
			var msp_principal = this.decodeMSPPrincipal(proto_identities[i]);
			identities.push(msp_principal); //string
		}
		signature_policy_envelope.identities = identities;

		return signature_policy_envelope;
	};

	decodeSignaturePolicy(proto_signature_policy) {
		var signature_policy = {};
		signature_policy.Type = proto_signature_policy.Type;
		if(signature_policy.Type == 'n_out_of') {
			signature_policy.n_out_of = {};
			signature_policy.n_out_of.N = proto_signature_policy.n_out_of.getN();
			signature_policy.n_out_of.policies = [];
			for(var i in proto_signature_policy.n_out_of.policies){
				var proto_policy = proto_signature_policy.n_out_of.policies[i];
				var policy = this.decodeSignaturePolicy(proto_policy);
				signature_policy.n_out_of.policies.push(policy);
			}
		}
		else if(signature_policy.Type == 'signed_by') {
			signature_policy.signed_by = proto_signature_policy.getSignedBy();
		}
		else {
			throw new Error('unknown signature policy type');
		}

		return signature_policy;
	};

	decodeMSPPrincipal(proto_msp_principal) {
		var msp_principal = {};
		msp_principal.principal_classification = proto_msp_principal.getPrincipalClassification();
		var proto_principal = null;
		switch(msp_principal.principal_classification) {
		case _mspPrProto.MSPPrincipal.Classification.ROLE:
			proto_principal = _mspPrProto.MSPRole.decode(proto_msp_principal.getPrincipal());
			msp_principal.msp_identifier = proto_principal.getMspIdentifier();
			if(proto_principal.getRole() === 0) {
				msp_principal.Role = 'MEMBER';
			}
			else if(proto_principal.getRole() === 1){
				msp_principal.Role = 'ADMIN';
			}
			break;
		case _mspPrProto.MSPPrincipal.Classification.ORGANIZATION_UNIT:
			proto_principal = _mspPrProto.OrganizationUnit.decode(proto_msp_principal.getPrincipal());
			msp_principal.msp_identifier = proto_principal.getMspIdendifier();//string
			msp_principal.organizational_unit_identifier = proto_principal.getOrganizationalUnitIdentifier(); //string
			msp_principal.certifiers_identifier = proto_principal.getCertifiersIdentifier().toBuffer(); //bytes
			break;
		case _mspPrProto.MSPPrincipal.Classification.IDENTITY:
			msp_principal = this.decodeIdentity(proto_msp_principal.getPrincipal());
			break;
		}

		return msp_principal;
	};

	decodeConfigSignature(proto_configSignature) {
		var config_signature = {};
		config_signature.signature_header = this.decodeSignatureHeader(proto_configSignature.getSignatureHeader().toBuffer());
		config_signature.sigature = proto_configSignature.getSignature().toBuffer();

		return config_signature;
	};

	decodeSignatureHeader(signature_header_bytes) {
		logger.debug('decodeSignatureHeader - %s',signature_header_bytes);
		var signature_header = {};
		var proto_signature_header = _commonProto.SignatureHeader.decode(signature_header_bytes);
		signature_header.creator = this.decodeIdentity(proto_signature_header.getCreator().toBuffer());
		signature_header.nonce = proto_signature_header.getNonce().toBuffer();;

		return signature_header;
	};

	decodeIdentity(id_bytes) {
		logger.debug('decodeIdentity - %s',id_bytes);
		var identity = {};
		try {
			var proto_identity = _identityProto.SerializedIdentity.decode(id_bytes);
			identity.Mspid = proto_identity.getMspid();
			identity.IdBytes = proto_identity.getIdBytes().toBuffer();
		}
		catch(err) {
			logger.error('Failed to decode the identity: %s', err.stack ? err.stack : err);
		}

		return identity;
	};

	decodeFabricMSPConfig(msp_config_bytes) {
		var msp_config = {};
		var proto_msp_config = _mspConfigProto.FabricMSPConfig.decode(msp_config_bytes);
		// get the application org names
		var orgs = [];
		let org_units = proto_msp_config.getOrganizationalUnitIdentifiers();
		if(org_units) for(let i = 0; i < org_units.length; i++) {
			let org_unit = org_units[i];
			let org_id = org_unit.organizational_unit_identifier;
			orgs.push(org_id);
		}
		msp_config.name = proto_msp_config.getName();
		msp_config.root_certs = this.actualBuffers(proto_msp_config.getRootCerts());
		msp_config.intermediate_certs = this.actualBuffers(proto_msp_config.getIntermediateCerts());
		msp_config.admins = this.actualBuffers(proto_msp_config.getAdmins());
		msp_config.revocation_list = this.actualBuffers(proto_msp_config.getRevocationList());
		msp_config.signing_identity = proto_msp_config.getSigningIdentity();
		msp_config.organizational_unit_identifiers = orgs;

		return msp_config;
	};

	actualBuffers(buffer_array_in) {
		var buffer_array_out = [];
		for(var i in buffer_array_in) {
			buffer_array_out.push(buffer_array_in[i].toBuffer());
		}
		return buffer_array_out;
	};

	decodeHeader(proto_header) {
		var header = {};
		header.channel_header = this.decodeChannelHeader(proto_header.getChannelHeader().toBuffer());
		header.signature_header = this.decodeSignatureHeader(proto_header.getSignatureHeader().toBuffer());
		return header;
	};

	decodeChannelHeader(header_bytes){
		var channel_header = {};
		var proto_channel_header = _commonProto.ChannelHeader.decode(header_bytes);
		channel_header.type = proto_channel_header.getType();
		channel_header.version = proto_channel_header.getType();
		channel_header.timestamp = proto_channel_header.getTimestamp();
		channel_header.channel_id = proto_channel_header.getChannelId();
		channel_header.tx_id = proto_channel_header.getTxId();
		channel_header.epoch = proto_channel_header.getEpoch();
		//TODO need to decode this
		channel_header.extension = proto_channel_header.getExtension().toBuffer();;

		return channel_header;
	};

	decodeChaincodeActionPayload(payload_bytes) {
		var payload = {};
		var proto_chaincode_action_payload = _transProto.ChaincodeActionPayload.decode(payload_bytes);
		payload.chaincode_proposal_payload = proto_chaincode_action_payload.getChaincodeProposalPayload();//TODO more decode needed
		payload.action = this.decodeChaincodeEndorsedAction(proto_chaincode_action_payload.getAction());

		return payload;
	};

	decodeChaincodeEndorsedAction(proto_chaincode_endorsed_action) {
		var action = {};
		action.proposal_response_payload = this.decodeProposalResponsePayload(proto_chaincode_endorsed_action.getProposalResponsePayload());
		action.endorsements = [];
		for(var i in proto_chaincode_endorsed_action.endorsements) {
			var endorsement = this.decodeEndorsement(proto_chaincode_endorsed_action.endorsements[i]);
			action.endorsements.push(endorsement);
		}
		action.proposal_response_payload = this.decodeProposalResponsePayload(proto_chaincode_endorsed_action.getProposalResponsePayload());

		return action;
	};

	decodeEndorsement(proto_endorsement) {
		var endorsement = {};
		endorsement.endorser = this.decodeIdentity(proto_endorsement.getEndorser());
		endorsement.signature = proto_endorsement.getSignature();

		return endorsement;
	};

	decodeProposalResponsePayload(proposal_response_payload_bytes) {
		var proposal_response_payload = {};
		var proto_proposal_response_payload = _responseProto.ProposalResponsePayload.decode(proposal_response_payload_bytes);
		proposal_response_payload.proposal_hash = proto_proposal_response_payload.getProposalHash();
		proposal_response_payload.extension = this.decodeChaincodeAction(proto_proposal_response_payload.getExtension());

		return proposal_response_payload;
	};

	decodeChaincodeAction(action_bytes) {
		var chaincode_action = {};
		var proto_chaincode_action = _proposalProto.ChaincodeAction.decode(action_bytes);
		chaincode_action.results = proto_chaincode_action.getResults(); //TODO is there a way to decode the read/write sets
		chaincode_action.events = proto_chaincode_action.getEvents(); //TODO should we decode these
		chaincode_action.response = this.decodeResponse(proto_chaincode_action.getResponse());

		return chaincode_action;
	};

	decodeResponse(proto_response) {
		if(!proto_response) return null;
		var response = {};
		response.status = proto_response.getStatus();
		response.message = proto_response.getMessage();
		response.payload = proto_response.getPayload();

		return response;
	};
};

module.exports = Block;