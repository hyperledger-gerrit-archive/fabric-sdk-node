/**
 * Copyright 2017 IBM All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an 'AS IS' BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */
'use strict';

/*
 *   This test case requires that the 'configtxlator' tool be running locally and on port 7059
 *   see:
 *   https://github.com/jyellick/fabric-gerrit/tree/configtxlator/examples/configtxupdate
 *
 */
var utils = require('fabric-client/lib/utils.js');
var logger = utils.getLogger('config-update');

var tape = require('tape');
var _test = require('tape-promise');
var test = _test(tape);

var Client = require('fabric-client');
var util = require('util');
var fs = require('fs');
var path = require('path');

var grpc = require('grpc');

var rewire = require('rewire');
var ConfigUpdate = rewire('fabric-client/lib/ConfigUpdate.js');

test('\n\n***** api call  *****\n\n', function(t) {

	let channel_name = 'mychannelator';
	let channel = null;

	let config_json_1 = null;
	let config_json_2 = null;
	let config_proto = null;
	//
	// Create and configure the test channel
	//
	let client = new Client();
	// use the config update created by the configtx tool
	let genesis_block = fs.readFileSync(path.join(__dirname, '../fixtures/channel/twoorgs.genesis.block'));
	let config1 = client.extractConfigFromBlock(genesis_block);
	let config2 = client.extractConfigFromBlock(genesis_block);
	t.pass('Successfully read the current channel configuration');

	t.throws(
		() => {
			client.computeChannelGroupUpdate(config1,config2);
		},
		/No differences detected between original and updated config/,
		'Check for error - No differences detected between original and updated config'
	);

	config2.channel_group.mod_policy = 'SomethingElse';
	let config_update = client.computeChannelGroupUpdate(config1,config2);
	let updated_policy = config_update.write_set.mod_policy;
	t.equals(updated_policy, 'SomethingElse', 'Checking that the mod policy was updated');
	let updated_version = config_update.write_set.version.low;
	t.equals(updated_version,1,'Checking that the version was updated');

	t.pass('Successfully got to the end');
	t.end();
});

test('\n\n***** low level calls *****\n\n', function(t) {
	let _policesProto = grpc.load(__dirname + '/../../fabric-client/lib/protos/common/policies.proto').common;
	let _configtxProto = grpc.load(__dirname + '/../../fabric-client/lib/protos/common/configtx.proto').common;

	let original_values_group = new _configtxProto.ConfigGroup();
	let original_values = original_values_group.getValues();
	let original_value1 = new _configtxProto.ConfigValue();
	original_value1.mod_policy = 'admins';
	original_value1.version = 0;
	original_value1.setValue( Buffer.from('ABC'));
	original_values.set('value1', original_value1);
	let original_value2 = new _configtxProto.ConfigValue();
	original_value2.mod_policy = 'admins';
	original_value2.version = 0;
	original_value2.setValue( Buffer.from('ABC'));
	original_values.set('value2', original_value2);
	let original_value3 = new _configtxProto.ConfigValue();
	original_value3.mod_policy = 'admins';
	original_value3.version = 0;
	original_value3.setValue( Buffer.from('ABC'));
	original_values.set('value3', original_value3);
	let original_value4 = new _configtxProto.ConfigValue();
	original_value4.mod_policy = 'admins';
	original_value4.version = 0;
	original_value4.setValue( Buffer.from('ABC'));
	original_values.set('value4', original_value4);

	let updated_values_group = new _configtxProto.ConfigGroup();
	let updated_values = updated_values_group.getValues();
	let updated_value1 = new _configtxProto.ConfigValue();
	updated_value1.mod_policy = 'changed';
	updated_value1.version = 0;
	updated_value1.setValue( Buffer.from('ABC'));
	updated_values.set('value1', updated_value1);
	let updated_value2 = new _configtxProto.ConfigValue();
	updated_value2.mod_policy = 'admins';
	updated_value2.version = 0;
	updated_value2.setValue( Buffer.from('DEF'));
	updated_values.set('value2', updated_value2);
	let updated_value3 = new _configtxProto.ConfigValue();
	updated_value3.mod_policy = 'admins';
	updated_value3.version = 0;
	updated_value3.setValue( Buffer.from('ABC'));
	updated_values.set('value3', updated_value3);
	let updated_value5 = new _configtxProto.ConfigValue();
	updated_value5.mod_policy = 'admins';
	updated_value5.version = 0;
	updated_value5.setValue( Buffer.from('ABC'));
	updated_values.set('value5', updated_value5);

	let computeValuesUpdate = ConfigUpdate.__get__('computeValuesUpdate');
	t.throws(
		() => {
			computeValuesUpdate(null,null);
		},
		/Missing original ConfigValues/,
		'Check for error - Missing original ConfigValues'
	);
	t.throws(
		() => {
			computeValuesUpdate({},null);
		},
		/Missing updated ConfigValues/,
		'Check for error - Missing updated ConfigValues'
	);
	let results_json = computeValuesUpdate(original_values, updated_values);
	t.equals(results_json.updatedMembers,true,'Checking that updatedMembers is true');
	t.equals(results_json.readSet.size,4,'Checking for correct number of readset entries');
	t.equals(results_json.writeSet.size,4,'Checking for correct number of writeset entries');
	t.equals(results_json.readSet.get('value1').version.low,0,'Checking that value1 readset version is correct');
	t.equals(results_json.readSet.get('value2').version.low,0,'Checking that value2 readset version is correct');
	t.equals(results_json.readSet.get('value3').version.low,0,'Checking that value3 readset version is correct');
	t.equals(results_json.readSet.get('value4').version.low,0,'Checking that value4 readset version is correct');
	t.equals(results_json.writeSet.get('value1').version.low,1,'Checking that value1 writeset version is correct');
	t.equals(results_json.writeSet.get('value2').version.low,1,'Checking that value2 writeset version is correct');
	t.equals(results_json.writeSet.get('value3').version.low,0,'Checking that value3 writeset version is correct');
	t.equals(results_json.writeSet.get('value5').version.low,0,'Checking that value5 writeset version is correct');

	// policies

	let original_policies_group = new _configtxProto.ConfigGroup();
	let original_policies = original_policies_group.getPolicies();
	let original_policy1 = new _configtxProto.ConfigPolicy();
	original_policy1.mod_policy = 'admins';
	original_policy1.version = 0;
	original_policy1.policy = new _policesProto.Policy();
	original_policy1.policy.setValue( Buffer.from('ABC'));
	original_policy1.policy.type = 2;
	original_policies.set('policy1', original_policy1);

	let original_policy2 = new _configtxProto.ConfigPolicy();
	original_policy2.mod_policy = 'admins';
	original_policy2.version = 0;
	original_policy2.policy = new _policesProto.Policy();
	original_policy2.policy.setValue( Buffer.from('ABC'));
	original_policy2.policy.type = 2;
	original_policies.set('policy2', original_policy2);

	let original_policy3 = new _configtxProto.ConfigPolicy();
	original_policy3.mod_policy = 'admins';
	original_policy3.version = 0;
	original_policy3.policy = new _policesProto.Policy();
	original_policy3.policy.setValue( Buffer.from('ABC'));
	original_policy3.policy.type = 2;
	original_policies.set('policy3', original_policy3);

	let original_policy4 = new _configtxProto.ConfigPolicy();
	original_policy4.mod_policy = 'admins';
	original_policy4.version = 0;
	original_policy4.policy = new _policesProto.Policy();
	original_policy4.policy.setValue( Buffer.from('ABC'));
	original_policy4.policy.type = 2;
	original_policies.set('policy4', original_policy4);

	let updated_policies_group = new _configtxProto.ConfigGroup();
	let updated_policies = updated_policies_group.getPolicies();
	let updated_policy1 = new _configtxProto.ConfigPolicy();
	updated_policy1.mod_policy = 'changed';
	updated_policy1.version = 0;
	updated_policy1.policy = new _policesProto.Policy();
	updated_policy1.policy.setValue( Buffer.from('ABC'));
	updated_policy1.policy.type = 2;
	updated_policies.set('policy1', updated_policy1);

	let updated_policy2 = new _configtxProto.ConfigPolicy();
	updated_policy2.mod_policy = 'admins';
	updated_policy2.version = 0;
	updated_policy2.policy = new _policesProto.Policy();
	updated_policy2.policy.setValue( Buffer.from('DEF'));
	updated_policy2.policy.type = 2;
	updated_policies.set('policy2', updated_policy2);

	let updated_policy3 = new _configtxProto.ConfigPolicy();
	updated_policy3.mod_policy = 'admins';
	updated_policy3.version = 0;
	updated_policy3.policy = new _policesProto.Policy();
	updated_policy3.policy.setValue( Buffer.from('ABC'));
	updated_policy3.policy.type = 2;
	updated_policies.set('policy3', updated_policy3);

	let updated_policy5 = new _configtxProto.ConfigPolicy();
	updated_policy5.mod_policy = 'admins';
	updated_policy5.version = 0;
	updated_policy5.policy = new _policesProto.Policy();
	updated_policy5.policy.setValue( Buffer.from('ABC'));
	updated_policy5.policy.type = 2;
	updated_policies.set('policy5', updated_policy5);

	let computePoliciesUpdate = ConfigUpdate.__get__('computePoliciesUpdate');
	t.throws(
		() => {
			computePoliciesUpdate(null,null);
		},
		/Missing original ConfigPolicies/,
		'Check for error - Missing original ConfigPolicies'
	);
	t.throws(
		() => {
			computePoliciesUpdate({},null);
		},
		/Missing updated ConfigPolicies/,
		'Check for error - Missing updated ConfigPolicies'
	);
	results_json = computePoliciesUpdate(original_policies, updated_policies);
	t.equals(results_json.updatedMembers,true,'Checking that updatedMembers is true');
	t.equals(results_json.readSet.size,4,'Checking for correct number of readset entries');
	t.equals(results_json.writeSet.size,4,'Checking for correct number of writeset entries');
	t.equals(results_json.readSet.get('policy1').version.low,0,'Checking that policy1 readset version is correct');
	t.equals(results_json.readSet.get('policy2').version.low,0,'Checking that policy2 readset version is correct');
	t.equals(results_json.readSet.get('policy3').version.low,0,'Checking that policy3 readset version is correct');
	t.equals(results_json.readSet.get('policy4').version.low,0,'Checking that policy4 readset version is correct');
	t.equals(results_json.writeSet.get('policy1').version.low,1,'Checking that policy1 writeset version is correct');
	t.equals(results_json.writeSet.get('policy2').version.low,1,'Checking that policy2 writeset version is correct');
	t.equals(results_json.writeSet.get('policy3').version.low,0,'Checking that policy3 writeset version is correct');
	t.equals(results_json.writeSet.get('policy5').version.low,0,'Checking that policy5 writeset version is correct');

	// groups

	let original_group = new _configtxProto.ConfigGroup();
	let original_groups = original_group.getGroups();
	let original_group1 = new _configtxProto.ConfigGroup();
	original_group1.mod_policy = 'admins';
	original_group1.versions = 0;
	original_groups.set('group1', original_group1);

	let original_group2 = new _configtxProto.ConfigGroup();
	original_group2.mod_policy = 'admins';
	original_group2.versions = 0;
	original_groups.set('group2', original_group2);

	let original_group3 = new _configtxProto.ConfigGroup();
	original_group3.mod_policy = 'admins';
	original_group3.versions = 0;
	original_groups.set('group3', original_group3);

	let updated_group = new _configtxProto.ConfigGroup();
	let updated_groups = updated_group.getGroups();
	let updated_group1 = new _configtxProto.ConfigGroup();
	updated_group1.mod_policy = 'admins';
	updated_group1.versions = 0;
	updated_groups.set('group1', updated_group1);

	let updated_group2 = new _configtxProto.ConfigGroup();
	updated_group2.mod_policy = 'other';
	updated_group2.versions = 0;
	updated_groups.set('group2', updated_group2);

	let updated_group4 = new _configtxProto.ConfigGroup();
	updated_group4.mod_policy = 'other';
	updated_group4.versions = 1;
	updated_groups.set('group4', updated_group4);

	let computeGroupsUpdate = ConfigUpdate.__get__('computeGroupsUpdate');
	t.throws(
		() => {
			computeGroupsUpdate(null,null);
		},
		/Missing original ConfigGroups/,
		'Check for error - Missing original ConfigGroups'
	);
	t.throws(
		() => {
			computeGroupsUpdate({},null);
		},
		/Missing updated ConfigGroups/,
		'Check for error - Missing updated ConfigGroups'
	);
	results_json = computeGroupsUpdate(original_groups, updated_groups);
	t.equals(results_json.readSet.get('group1').version.low,0,'Checking that group1 readset version is correct');
	t.equals(results_json.writeSet.get('group1').version.low,0,'Checking that group1 writeSet version is correct');
	t.equals(results_json.readSet.get('group2').version.low,0,'Checking that group2 readset version is correct');
	t.equals(results_json.writeSet.get('group2').version.low,1,'Checking that group2 writeSet version is correct');
	t.equals(results_json.writeSet.get('group4').version.low,0,'Checking that group4 writeSet version is correct');

	// group
	original_group.setModPolicy('top');
	original_group1.setPolicies(original_policies);
	original_group1.setValues(original_values);
	updated_group.setModPolicy('top');
	updated_group1.setPolicies(updated_policies);
	updated_group1.setValues(updated_values);

	let computeGroupUpdate = ConfigUpdate.__get__('computeGroupUpdate');
	t.throws(
		() => {
			computeGroupUpdate(null,null);
		},
		/Missing original ConfigGroup/,
		'Check for error - Missing original ConfigGroup'
	);
	t.throws(
		() => {
			computeGroupUpdate({},null);
		},
		/Missing updated ConfigGroup/,
		'Check for error - Missing updated ConfigGroup'
	);

	results_json = computeGroupUpdate(original_group, updated_group);

	t.equals(results_json.readGroup.groups.map.get('group1').version.low,0,'Checking that group1 readGroup version is correct');
	t.equals(results_json.writeGroup.groups.map.get('group1').version.low,1,'Checking that group1 writeGroup version is correct');
	t.equals(results_json.readGroup.groups.map.get('group2').version.low,0,'Checking that group2 readGroup version is correct');
	t.equals(results_json.writeGroup.groups.map.get('group2').version.low,1,'Checking that group2 writeGroup version is correct');
	t.equals(results_json.writeGroup.groups.map.get('group4').version.low,0,'Checking that group4 writeGroup version is correct');

	t.equals(results_json.readGroup.groups.map.get('group1').policies.map.size,4,'Checking for correct number of readset entries');
	t.equals(results_json.readGroup.groups.map.get('group1').policies.map.size,4,'Checking for correct number of writeset entries');
	t.equals(results_json.readGroup.groups.map.get('group1').policies.map.get('policy1').version.low,0,'Checking that policy1 readset version is correct');
	t.equals(results_json.readGroup.groups.map.get('group1').policies.map.get('policy2').version.low,0,'Checking that policy2 readset version is correct');
	t.equals(results_json.readGroup.groups.map.get('group1').policies.map.get('policy3').version.low,0,'Checking that policy3 readset version is correct');
	t.equals(results_json.readGroup.groups.map.get('group1').policies.map.get('policy4').version.low,0,'Checking that policy4 readset version is correct');
	t.equals(results_json.writeGroup.groups.map.get('group1').policies.map.get('policy1').version.low,1,'Checking that policy1 writeset version is correct');
	t.equals(results_json.writeGroup.groups.map.get('group1').policies.map.get('policy2').version.low,1,'Checking that policy2 writeset version is correct');
	t.equals(results_json.writeGroup.groups.map.get('group1').policies.map.get('policy3').version.low,0,'Checking that policy3 writeset version is correct');
	t.equals(results_json.writeGroup.groups.map.get('group1').policies.map.get('policy5').version.low,0,'Checking that policy5 writeset version is correct');

	t.equals(results_json.readGroup.groups.map.get('group1').values.map.size,4,'Checking for correct number of readset entries');
	t.equals(results_json.writeGroup.groups.map.get('group1').values.map.size,4,'Checking for correct number of writeset entries');
	t.equals(results_json.readGroup.groups.map.get('group1').values.map.get('value1').version.low,0,'Checking that value1 readset version is correct');
	t.equals(results_json.readGroup.groups.map.get('group1').values.map.get('value2').version.low,0,'Checking that value2 readset version is correct');
	t.equals(results_json.readGroup.groups.map.get('group1').values.map.get('value3').version.low,0,'Checking that value3 readset version is correct');
	t.equals(results_json.readGroup.groups.map.get('group1').values.map.get('value4').version.low,0,'Checking that value4 readset version is correct');
	t.equals(results_json.writeGroup.groups.map.get('group1').values.map.get('value1').version.low,1,'Checking that value1 writeset version is correct');
	t.equals(results_json.writeGroup.groups.map.get('group1').values.map.get('value2').version.low,1,'Checking that value2 writeset version is correct');
	t.equals(results_json.writeGroup.groups.map.get('group1').values.map.get('value3').version.low,0,'Checking that value3 writeset version is correct');
	t.equals(results_json.writeGroup.groups.map.get('group1').values.map.get('value5').version.low,0,'Checking that value5 writeset version is correct');

	t.pass('Successfully got to the end');
	t.end();
});
