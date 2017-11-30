/*
# Copyright IBM Corp. All Rights Reserved.
#
# SPDX-License-Identifier: Apache-2.0
*/

'use strict';

var sdkUtils = require('./utils.js');
var logger = sdkUtils.getLogger('ConfigUpdate.js');
var grpc = require('grpc');
var _configtxProto = grpc.load(__dirname + '/protos/common/configtx.proto').common;

/**
 * This class builds a `ConfigUpdate' object based on the differences of two Config objects
 *
 * @class
 */
var ConfigUpdate = class {
	constructor() {
		logger.debug('constructor');
	}

	/**
	 * Computes a {@link ConfigUpdate} protobuf object from two {@link Config} objects
	 *
	 * @param {Config} original
	 * @param {Config} updated
	 * @returns {ConfigUpdate} Protobuf ConfigUpdate
	 */
	static computeChannelGroupUpdate(original_proto, updated_proto) {

		let results = computeGroupUpdate(original_proto.getChannelGroup(), updated_proto.getChannelGroup());
		if (!results.updatedGroup) {
			throw new Error("No differences detected between original and updated config");
		}

		let config_update = new _configtxProto.ConfigUpdate();
		config_update.setReadSet(results.readGroup);
		config_update.setWriteSet(results.writeGroup);
		return config_update;
	}

}

/*
 * @param {Map} original - map of {string : ConfigValue }
 * @param {Map} updated - map of {string : ConfigValue }
 * @returns {ConfigValueUpdateResults}
 */
function computeValuesUpdate(original, updated) {
	if(!original) {
		throw new Error('Missing original ConfigValues');
	}
	if(!updated) {
		throw new Error('Missing updated ConfigValues');
	}

	let readSet = new Map();
	let writeSet = new Map();
	let updatedMembers = false;

	for (let valueName in original.map) {
		let originalValue = original.map[valueName].value;
		let readValue = new _configtxProto.ConfigValue();
		readValue.setVersion(originalValue.getVersion());
		readSet.set(valueName, readValue);

		let updatedValue = updated.map[valueName];
		if (!updatedValue) {
			updatedMembers = true;
			continue;
		} else {
			updatedValue = updatedValue.value;
		}

		if (originalValue.getModPolicy() === updatedValue.getModPolicy() &&
			checkEqual(originalValue.getValue(), updatedValue.getValue())) {
			writeSet.set(valueName, readValue);
			continue
		}

		let writeValue = new _configtxProto.ConfigValue();
		writeValue.setVersion(originalValue.getVersion() + 1);
		writeValue.setModPolicy(updatedValue.getModPolicy());
		writeValue.setValue(updatedValue.getValue());
		writeSet.set(valueName, writeValue);
	}

	for (let valueName in updated.map) {
		let originalValue = original.map[valueName];

		// if in the original then already handled
		if (originalValue) {
			continue;
		}

		updatedMembers = true;

		let updatedValue = updated.map[valueName].value;
		let writeValue = new _configtxProto.ConfigValue();
		writeValue.setVersion(0);
		writeValue.setModPolicy(updatedValue.getModPolicy());
		writeValue.setValue(updatedValue.getValue());
		writeSet.set(valueName, writeValue);
	}

	let results = {readSet:readSet, writeSet:writeSet, updatedMembers:updatedMembers};
	return results;
}

/*
 * @param {Map} original - map of {string : ConfigPolicy }
 * @param {Map} updated - map of {string : ConfigPolicy }
 * @returns {ConfigPolicyUpdateResults}
 */
function computePoliciesUpdate(original, updated) {
	if(!original) {
		throw new Error('Missing original ConfigPolicies');
	}
	if(!updated) {
		throw new Error('Missing updated ConfigPolicies');
	}

	let readSet = new Map();
	let writeSet = new Map();
	let updatedMembers = false;

	for (let policyName in original.map) {
		let originalPolicy = original.map[policyName].value;
		let readPolicy = new _configtxProto.ConfigPolicy();
		readPolicy.setVersion(originalPolicy.getVersion());
		readSet.set(policyName, readPolicy);
		let updatedPolicy = updated.map[policyName];
		if (!updatedPolicy) {
			updatedMembers = true;
			continue;
		} else {
			updatedPolicy = updatedPolicy.value;
		}

		if (originalPolicy.getModPolicy() === updatedPolicy.getModPolicy() &&
			checkEqual(originalPolicy.getPolicy().value, updatedPolicy.getPolicy().value)) {
			writeSet.set(policyName, readPolicy);
			continue
		}

		let writePolicy = new _configtxProto.ConfigPolicy();
		writePolicy.setVersion(originalPolicy.getVersion() + 1);
		writePolicy.setModPolicy(updatedPolicy.getModPolicy());
		writePolicy.setPolicy(updatedPolicy.getPolicy());
		writeSet.set(policyName, writePolicy);
	}

	for (let policyName in updated.map) {
		let originalPolicy = original.map[policyName];

		// if in the original then already handled
		if (originalPolicy) {
			continue;
		}

		updatedMembers = true;

		let updatedPolicy = updated.map[policyName].value;
		let writePolicy = new _configtxProto.ConfigPolicy();
		writePolicy.setVersion(0);
		writePolicy.setModPolicy(updatedPolicy.getModPolicy());
		writePolicy.setPolicy(updatedPolicy.getPolicy());
		writeSet.set(policyName, writePolicy);
	}

	let results = {readSet:readSet, writeSet:writeSet, updatedMembers:updatedMembers};
	return results;
}


/*
 * @param {Map} original - map of {string : ConfigGroup }
 * @param {Map} updated - map of {string : ConfigGroup }
 * @returns {ConfigGroupUpdateResults}
 */
function computeGroupsUpdate(original, updated) {
	if(!original) {
		throw new Error('Missing original ConfigGroups');
	}
	if(!updated) {
		throw new Error('Missing updated ConfigGroups');
	}

	let readSet = new Map();
	let writeSet = new Map();
	let updatedMembers = false;

	for (let groupName in original.map) {
		let originalGroup = original.map[groupName].value;

		let updatedGroup = updated.map[groupName];
		if (!updatedGroup) {
			updatedMembers = true;
			continue;
		} else {
			updatedGroup = updatedGroup.value;
		}
		let groupUpdateResults = computeGroupUpdate(originalGroup, updatedGroup);
		if (!groupUpdateResults.updatedGroup) {
			readSet.set(groupName, groupUpdateResults.readGroup);
			writeSet.set(groupName, groupUpdateResults.readGroup);
			continue
		}

		readSet.set(groupName, groupUpdateResults.readGroup);
		writeSet.set(groupName, groupUpdateResults.writeGroup);
	}

	for (let groupName in updated.map) {
		let updatedGroup = updated.map[groupName].value;
		let originalGroup = original.map[groupName];

		// if in the original then already handled
		if (originalGroup) {
			continue;
		} else {
			originalGroup = new _configtxProto.ConfigGroup();
		}

		updatedMembers = true;

		let groupUpdateResults = computeGroupUpdate(originalGroup, updatedGroup);
		let writeGroup = new _configtxProto.ConfigGroup();
		writeGroup.setVersion(0);
		writeGroup.setModPolicy(updatedGroup.getModPolicy());
		writeGroup.setValues(groupUpdateResults.writeGroup.getValues());
		writeGroup.setPolicies(groupUpdateResults.writeGroup.getPolicies());
		writeGroup.setGroups(groupUpdateResults.writeGroup.getGroups());
		writeSet.set(groupName, writeGroup);
	}

	let results = {readSet:readSet, writeSet:writeSet, updatedMembers:updatedMembers};
	return results;
}

/*
 * @param {ConfigGroup} original
 * @param {ConfigGroup} updated
 * @returns {ConfigGroupResults}
 *    readSet {ConfigGroup}
 *    writeSet {ConfigGroup}
 *    updatedGroup {boolean}
 */
function computeGroupUpdate(original, updated) {
	if(!original) {
		throw new Error('Missing original ConfigGroup');
	}
	if(!updated) {
		throw new Error('Missing updated ConfigGroup');
	}
	let policiesUpdateResults = computePoliciesUpdate(original.getPolicies(), updated.getPolicies());
	let valuesUpdateResults = computeValuesUpdate(original.getValues(), updated.getValues());
	let groupsUpdateResults = computeGroupsUpdate(original.getGroups(), updated.getGroups());

	let readGroup = new _configtxProto.ConfigGroup();
	readGroup.setVersion(original.getVersion());
	readGroup.getPolicies().map = policiesUpdateResults.readSet;
	readGroup.getValues().map = valuesUpdateResults.readSet;
	readGroup.getGroups().map = groupsUpdateResults.readSet;
	let writeGroup = new _configtxProto.ConfigGroup();
	writeGroup.setVersion(original.getVersion());
	writeGroup.getPolicies().map = policiesUpdateResults.writeSet;
	writeGroup.getValues().map = valuesUpdateResults.writeSet;
	writeGroup.getGroups().map = groupsUpdateResults.writeSet;
	let updatedGroup = false;

	if (!(policiesUpdateResults.updatedMembers ||
		valuesUpdateResults.updatedMembers ||
		groupsUpdateResults.updatedMembers ||
		original.getModPolicy() !== updated.getModPolicy())) {

		// If there were no modified entries in any of the policies/values/groups maps
		if (policiesUpdateResults.readSet.size == 0 &&
			policiesUpdateResults.writeSet.size == 0 &&
			valuesUpdateResults.readSet.size == 0 &&
			valuesUpdateResults.writeSet.size == 0 &&
			groupsUpdateResults.readSet.size == 0 &&
			groupsUpdateResults.writeSet.size == 0) {
			// return clean objects
			readGroup = new _configtxProto.ConfigGroup();
			readGroup.setVersion(original.getVersion());
			writeGroup = new _configtxProto.ConfigGroup();
			writeGroup.setVersion(original.getVersion());
		}
	} else {
		// contains a change
		writeGroup.setVersion(original.getVersion() + 1);
		writeGroup.setModPolicy(updated.getModPolicy());
		updatedGroup = true;
	}

	let results = {readGroup:readGroup, writeGroup:writeGroup, updatedGroup:updatedGroup};
	return results;
}

function checkEqual(original, updated) {
	if(original && updated) {
		let result = original.toBuffer().equals(updated.toBuffer());
		return result;
	} else if (!original && !updated) {
		return true;
	} else {
		return false;
	}

}
module.exports = ConfigUpdate;
