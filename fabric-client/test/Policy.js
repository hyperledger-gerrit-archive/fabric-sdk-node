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

const rewire = require('rewire');
const { checkPolicy, buildSignaturePolicy, buildPrincipal } = require('../lib/Policy');

const grpc = require('grpc');
const MSPRole = grpc.load(__dirname + '/../lib/protos/msp/msp_principal.proto').common.MSPRole;

const chai = require('chai');
const should = chai.should();
const sinon = require('sinon');

describe('Policy', () => {

	describe('#EndorsementPolicy.buildPolicy', () => {

		let EP;
		const setVersionStub = sinon.stub();
		const setRuleStub = sinon.stub();
		const setIdentitiesStub = sinon.stub();
		const toBufferStub = sinon.stub().returns({test: 'response'});

		const MockSignaturePolicyEnvelope = sinon.stub();
		MockSignaturePolicyEnvelope.prototype.setVersion = setVersionStub;
		MockSignaturePolicyEnvelope.prototype.setRule = setRuleStub;
		MockSignaturePolicyEnvelope.prototype.setIdentities = setIdentitiesStub;
		MockSignaturePolicyEnvelope.prototype.toBuffer = toBufferStub;

		const policy = {
			identities: [{
				role: {
					name: 'member',
					mspId: 'Org1MSP'
				}
			}
			],
			policy: {
				'signed-by': 0
			}
		};

		beforeEach(() =>{
			EP = rewire('../lib/Policy');

			EP.__set__('SignaturePolicyEnvelope', MockSignaturePolicyEnvelope);
		});

		afterEach(() => {
			setVersionStub.resetHistory();
			setRuleStub.resetHistory();
			setIdentitiesStub.resetHistory();
			toBufferStub.resetHistory();
		});

		it('should throw if no policy provided and no valid msps', () => {
			(() => {
				EP.buildPolicy([], undefined);
			}).should.throw(/Verifying MSPs not found in the channel object/);
		});

		it('should create and set a one of any policy if no policy provided', () => {
			EP.buildPolicy(['geoff'], undefined);

			// Set version
			sinon.assert.calledOnce(setVersionStub);
			sinon.assert.calledWith(setVersionStub, 0);

			// Set rule
			sinon.assert.calledOnce(setRuleStub);
			let args = setRuleStub.getCall(0).args;
			args[0].Type.should.be.equal('n_out_of');
			args[0].signed_by.should.be.equal(0);
			args[0].n_out_of.n.should.be.equal(1);
			args[0].n_out_of.rules[0].Type.should.be.equal('signed_by');
			args[0].n_out_of.rules[0].signed_by.should.be.equal(0);
			should.not.exist(args[0].n_out_of.rules[0].n_out_of);

			// Set identities Array
			sinon.assert.calledOnce(setIdentitiesStub);
			args = setIdentitiesStub.getCall(0).args;
			args[0][0].principal_classification.should.be.equal(0);


			// Sent to buffer
			sinon.assert.calledOnce(toBufferStub);
		});

		it('should use the policy if provided', () => {
			EP.buildPolicy([], policy);

			// Set version
			sinon.assert.calledOnce(setVersionStub);
			sinon.assert.calledWith(setVersionStub, 0);

			// Set rule
			sinon.assert.calledOnce(setRuleStub);
			let args = setRuleStub.getCall(0).args;
			args[0].Type.should.be.equal('signed_by');
			args[0].signed_by.should.be.equal(0);
			should.not.exist(args[0].n_out_of);

			// Set identities Array
			sinon.assert.calledOnce(setIdentitiesStub);
			args = setIdentitiesStub.getCall(0).args;
			args[0][0].principal_classification.should.be.equal(0);


			// Sent to buffer
			sinon.assert.calledOnce(toBufferStub);
		});

	});

	describe('#buildPrincipal', () => {

		it('should throw if the identity type is unknown', () => {
			(() => {
				buildPrincipal({ 'role': 'penguin' });
			}).should.throw(/Invalid role name found/);
		});

		it('should throw if the identity type is unimplemented', () => {
			(() => {
				buildPrincipal({ 'organization-unit': 'my organization-unit' });
			}).should.throw(/NOT IMPLEMENTED/);
		});

		it('should throw if invalid role name passed', () => {
			(() => {
				buildPrincipal({ 'role': {name: 'penguin', mspId: 20 }});
			}).should.throw(/Invalid role name found/);
		});

		it('should throw if invalid mspid passed', () => {
			(() => {
				buildPrincipal({ 'role': {name: 'peer', mspId: 20 }});
			}).should.throw(/Invalid mspid found/);
		});

		it('should throw if no mspid passed', () => {
			(() => {
				buildPrincipal({ 'role': {name: 'peer', mspId: null }});
			}).should.throw(/Invalid mspid found/);
		});

		it('should set the role to peer if peer role', () =>{
			const RewirePolicy = rewire('../lib/Policy');
			const mySpy = sinon.spy(MSPRole);
			RewirePolicy.__set__('MSPRole', mySpy);

			const buildPrincipal = RewirePolicy.__get__('buildPrincipal');
			buildPrincipal({ 'role': {name: 'peer', mspId: 'my_mspId' }});

			const returnValues = mySpy.returnValues[0];
			returnValues.role.should.be.equal(3);
			returnValues.msp_identifier.should.be.equal('my_mspId');
		});

		it('should set the role to member if member role', () =>{
			const RewirePolicy = rewire('../lib/Policy');
			const mySpy = sinon.spy(MSPRole);
			RewirePolicy.__set__('MSPRole', mySpy);

			const buildPrincipal = RewirePolicy.__get__('buildPrincipal');
			buildPrincipal({ 'role': {name: 'member', mspId: 'my_mspId' }});

			const returnValues = mySpy.returnValues[0];
			returnValues.role.should.be.equal(0);
			returnValues.msp_identifier.should.be.equal('my_mspId');
		});

		it('should set the role to admin if admin role', () =>{
			const RewirePolicy = rewire('../lib/Policy');
			const mySpy = sinon.spy(MSPRole);
			RewirePolicy.__set__('MSPRole', mySpy);

			const buildPrincipal = RewirePolicy.__get__('buildPrincipal');
			buildPrincipal({ 'role': {name: 'admin', mspId: 'my_mspId' }});

			const returnValues = mySpy.returnValues[0];
			returnValues.role.should.be.equal(1);
			returnValues.msp_identifier.should.be.equal('my_mspId');
		});
	});

	describe('#getIdentityType', () => {
		const RewirePolicy = rewire('../lib/Policy');
		const getIdentityType = RewirePolicy.__get__('getIdentityType');

		it('should throw no identity type', () => {
			(() => {
				getIdentityType({});
			}).should.throw(/Invalid identity type found/);
		});

		it('should throw if an invalid identity type', () => {
			(() => {
				getIdentityType({ 'invalid': true });
			}).should.throw(/Invalid identity type found: must be one of role, organization-unit or identity, but found invalid/);
		});

		it('should return role type', () => {
			const result = getIdentityType({ 'role': 'my role' });
			result.should.equal('role');
		});

		it('should return organisation type', () => {
			const result = getIdentityType({ 'organization-unit': 'my organization-unit' });
			result.should.equal('organization-unit');
		});

		it('should return identity type', () => {
			const result = getIdentityType({ 'identity': 'my identity' });
			result.should.equal('identity');
		});
	});

	describe('#getPolicyType', () => {
		const RewirePolicy = rewire('../lib/Policy');
		const getPolicy = RewirePolicy.__get__('getPolicyType');

		it('should throw if invalid type found', () => {
			(() => {
				getPolicy({ 'two-of': true });
			}).should.throw(/Invalid policy type found/);
		});

		it('should throw if invalid type found', () => {
			(() => {
				getPolicy({ 'geoff': true });
			}).should.throw(/Invalid policy type found/);
		});

		it('should return "signed-by" if that is the policy type', () => {
			const myType = getPolicy({ 'signed-by': true });
			myType.should.be.equal('signed-by');
		});

		it('should return "n-of" if that is the policy type', () => {
			const myType = getPolicy({ '3-of': true });
			myType.should.be.equal('3-of');
		});
	});

	describe('#parsePolicy', () => {
		const RewirePolicy = rewire('../lib/Policy');
		const parsePolicy = RewirePolicy.__get__('parsePolicy');

		it('should return a signiture policy with the type "signedby" set if that policy type', () => {

			const policy = {
				'signed-by': 0
			};

			const result = parsePolicy(policy);

			result.Type.should.equal('signed_by');
			result.signed_by.should.equal(0);
			should.not.exist(result.n_out_of);
		});

		it('should return a signiture policy with the type "n_out_of" set if that policy type', () => {

			const policy = {
				'1-of': [
					{
						'signed-by': 0
					}
				]
			};

			const result = parsePolicy(policy);

			result.Type.should.equal('n_out_of');
			result.signed_by.should.equal(0);
			result.n_out_of.n.should.equal(1);
			result.n_out_of.rules[0].Type.should.equal('signed_by');
			result.n_out_of.rules[0].signed_by.should.equal(0);

		});

	});

	describe('#buildSignaturePolicy', () => {

		it('should return signed by if that policy type', () => {
			const policy = {
				'signed-by': 0
			};

			const result = buildSignaturePolicy(policy);
			result.should.deep.equal({ signed_by: 0 });
		});

		it('should recursively build if n-of detected', () => {
			const policy = {
				'1-of': [
					{
						'signed-by': 0
					}
				]
			};

			const expected = {
				n_out_of: {
					n: 1,
					rules: [
						{
							signed_by: 0
						}
					]
				}
			};

			const result = buildSignaturePolicy(policy);
			result.should.deep.equal(expected);
		});
	});

	describe('#checkPolicy', () => {

		it('should throw if missing a passed parameter', () => {
			(() => {
				checkPolicy();
			}).should.throw(/Missing Required Param "policy"/);
		});

		it('should throw if passed parameter is null', () => {
			(() => {
				checkPolicy(null);
			}).should.throw(/Missing Required Param "policy"/);
		});

		it('should throw if passed parameter is undefined', () => {
			(() => {
				checkPolicy(undefined);
			}).should.throw(/Missing Required Param "policy"/);
		});

		it('should throw if passed parameter policy.identities is missing', () => {
			(() => {
				checkPolicy({ name: 'nothing' });
			}).should.throw(/Invalid policy, missing the "identities" property/);
		});

		it('should throw if passed parameter policy.identities is null', () => {
			(() => {
				checkPolicy({ identities: null });
			}).should.throw(/Invalid policy, missing the "identities" property/);
		});

		it('should throw if passed parameter policy.identities is undefined', () => {
			(() => {
				checkPolicy({ identities: undefined });
			}).should.throw(/Invalid policy, missing the "identities" property/);
		});

		it('should throw if passed parameter policy.identities is an empty string', () => {
			(() => {
				checkPolicy({ identities: '' });
			}).should.throw(/Invalid policy, missing the "identities" property/);
		});

		it('should throw if passed parameter policy.identities is an empty object', () => {
			(() => {
				checkPolicy({ identities: {} });
			}).should.throw(/Invalid policy, missing the "identities" property/);
		});

		it('should throw if passed parameter policy.identities is not an array', () => {
			(() => {
				checkPolicy({ identities: { name: 'something' } });
			}).should.throw(/Invalid policy, the "identities" property must be an array/);
		});

		it('should throw if passed parameter policy.policy is missing', () => {
			(() => {
				checkPolicy({ identities: true });
			}).should.throw(/Invalid policy, missing the "identities" property/);
		});

		it('should throw if passed parameter policy.policy is null', () => {
			(() => {
				const identities = [{
					role: {
						name: 'member',
						mspId: 'Org1MSP'
					}
				}];
				checkPolicy({ identities: identities, policy: null });
			}).should.throw(/Invalid policy, missing the "policy" property/);
		});

		it('should throw if passed parameter policy.policy is undefined', () => {
			(() => {
				const identities = [{
					role: {
						name: 'member',
						mspId: 'Org1MSP'
					}
				}];
				checkPolicy({ identities: identities, policy: undefined });
			}).should.throw(/Invalid policy, missing the "policy" property/);
		});

		it('should throw if passed parameter policy.policy is an empty object', () => {
			(() => {
				const identities = [{
					role: {
						name: 'member',
						mspId: 'Org1MSP'
					}
				}];
				checkPolicy({ identities: identities, policy: {} });
			}).should.throw(/Invalid policy, missing the "policy" property/);
		});

		it('should not throw if passed a valid policy', () => {
			(() => {
				const policy = {
					identities: [{
						role: {
							name: 'member',
							mspId: 'Org1MSP'
						}
					}
					],
					policy: {
						'1-of': [
							{
								'signed-by': 0
							}
						]
					}
				};

				checkPolicy(policy);
			}).should.not.throw();
		});

	});

});