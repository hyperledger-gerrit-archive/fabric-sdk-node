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


const MSP = require('../../lib/msp/msp');
const {Config, CryptoAlgorithms, Identity, SigningIdentity} = require('fabric-common');
const utils = require('../../lib/utils');
const path = require('path');

const chai = require('chai');
const sinon = require('sinon');
const should = chai.should();

const rewire = require('rewire');
const MspRewire = rewire('../../lib/msp/msp');

describe('MSP', () => {

	describe('#constructor', () => {

		it('should throw if no config', () => {
			(() => {
				new MSP();
			}).should.throw(/Missing required parameter "config"/);
		});

		it('should throw if no [id] within the passed config', () => {
			(() => {
				new MSP({
					cryptoSuite: 'penguin'
				});
			}).should.throw(/Parameter "config" missing required field "id"/);
		});

		it('should throw if no [cryptoSuite] within the passed config', () => {
			(() => {
				new MSP({
					id: 'testMSP'
				});
			}).should.throw(/Parameter "config" missing required field "cryptoSuite"/);
		});

		it('should throw if passed "signer" is not an instance of SigningIdentity', () => {
			(() => {
				new MSP({
					id: 'testMSP',
					cryptoSuite: 'cryptoSuite',
					signer: 1
				});
			}).should.throw(/Parameter "signer" must be an instance of SigningIdentity/);
		});

		it('should not throw if passed "signer" is an instance of SigningIdentity', () => {
			(() => {
				const signer = new SigningIdentity('certificate', 'publicKey', 'mspId', 'cryptoSuite', 'signer');
				new MSP({
					id: 'testMSP',
					cryptoSuite: 'pecryptoSuitenguin',
					signer: signer
				});
			}).should.not.throw();
		});

		it('should set internal parameters from the passed config', () => {
			const signer = new SigningIdentity('certificate', 'publicKey', 'mspId', 'cryptoSuite', 'signer');
			const myMSP = new MSP({
				id: 'testMSP',
				cryptoSuite: 'cryptoSuite',
				signer: signer,
				rootCerts: 'rootCerts',
				intermediateCerts: 'intermediateCerts',
				admins: 'admins',
				orgs: 'orgs',
				tls_root_certs: 'tls_root_certs',
				tls_intermediate_certs: 'tls_intermediate_certs'
			});

			myMSP._rootCerts.should.equal('rootCerts');
			myMSP._intermediateCerts.should.equal('intermediateCerts');
			myMSP._signer.should.equal(signer);
			myMSP._admins.should.equal('admins');
			myMSP.cryptoSuite.should.equal('cryptoSuite');
			myMSP._id.should.equal('testMSP');
			myMSP._organization_units.should.equal('orgs');
			myMSP._tls_root_certs.should.equal('tls_root_certs');
			myMSP._tls_intermediate_certs.should.equal('tls_intermediate_certs');
		});
	});

	describe('#getId', () => {
		it('should return the id', () => {
			const signer = new SigningIdentity('certificate', 'publicKey', 'mspId', 'cryptoSuite', 'signer');
			const myMSP = new MSP({
				id: 'testMSP',
				cryptoSuite: 'pecryptoSuitenguin',
				signer: signer
			});

			myMSP.getId().should.equal('testMSP');
		});
	});

	describe('#getOrganizationUnits', () => {
		it('should return the organizational units', () => {
			const signer = new SigningIdentity('certificate', 'publicKey', 'mspId', 'cryptoSuite', 'signer');
			const myMSP = new MSP({
				id: 'testMSP',
				cryptoSuite: 'pecryptoSuitenguin',
				orgs: 'orgs',
				signer: signer
			});

			myMSP.getOrganizationUnits().should.equal('orgs');
		});
	});

	describe('#getPolicy', () => {
		it('should throw a "Not implemented yet" error', () => {
			(() => {
				const msp = new MSP({
					id: 'testMSP',
					cryptoSuite: 'cryptoSuite'
				});
				msp.getPolicy();
			}).should.throw(/Not implemented yet/);
		});
	});

	describe('#getSigningIdentity', () => {
		it('should throw a "Not implemented yet" error', () => {
			(() => {
				const msp = new MSP({
					id: 'testMSP',
					cryptoSuite: 'cryptoSuite'
				});
				msp.getSigningIdentity();
			}).should.throw(/Not implemented yet/);
		});
	});

	describe('#getDefaultSigningIdentity', () => {
		it('should return the signer', () => {
			const signer = new SigningIdentity('certificate', 'publicKey', 'mspId', 'cryptoSuite', 'signer');
			const msp = new MSP({
				id: 'testMSP',
				cryptoSuite: 'cryptoSuite',
				signer: signer,
				rootCerts: 'rootCerts'
			});
			msp.getDefaultSigningIdentity().should.equal(signer);
		});
	});

	describe('#toProtobuf', () => {

		// const setClientTlsCertHashStub = sinon.stub();
		// protosRewire.__set__('fabprotos.discovery.AuthInfo.prototype.setClientTlsCertHash', setClientTlsCertHashStub);

		it('should set all existing items in the config', () => {
			const setNameStub = sinon.stub();
			const setRootCertsStub = sinon.stub();
			const setIntermediateCertsStub = sinon.stub();
			const setAdminsStub = sinon.stub();
			const setOrganizationalUnitIdentifiersStub = sinon.stub();
			const setTlsRootCertsStub = sinon.stub();
			const getTlsIntermediateCertsStub = sinon.stub();
			const toBufferStub = sinon.stub().returns(new Buffer('test_buffer'));
			const protoStub = sinon.stub().returns({
				setName: setNameStub,
				setRootCerts: setRootCertsStub,
				setIntermediateCerts: setIntermediateCertsStub,
				setAdmins: setAdminsStub,
				setOrganizationalUnitIdentifiers: setOrganizationalUnitIdentifiersStub,
				setTlsRootCerts: setTlsRootCertsStub,
				getTlsIntermediateCerts: getTlsIntermediateCertsStub,
				toBuffer: toBufferStub
			});
			MspRewire.__set__('fabprotos.msp.FabricMSPConfig', protoStub);
			const signer = new SigningIdentity('certificate', 'publicKey', 'mspId', 'cryptoSuite', 'signer');
			const msp = new MspRewire({
				id: 'testMSP',
				cryptoSuite: 'cryptoSuite',
				signer: signer,
				rootCerts: 'rootCerts',
				intermediateCerts: 'intermediateCerts',
				admins: 'admins',
				orgs: 'orgs',
				tls_root_certs: 'tls_root_certs',
				tls_intermediate_certs: 'tls_intermediate_certs'
			});

			// Call function
			msp.toProtobuf();

			// Assert setters called
			sinon.assert.calledOnce(setNameStub);
			sinon.assert.calledWith(setNameStub, 'testMSP');

			sinon.assert.calledOnce(setRootCertsStub);
			sinon.assert.calledWith(setRootCertsStub, 'rootCerts');

			sinon.assert.calledOnce(setIntermediateCertsStub);
			sinon.assert.calledWith(setIntermediateCertsStub, 'intermediateCerts');

			sinon.assert.calledOnce(setAdminsStub);
			sinon.assert.calledWith(setAdminsStub, 'admins');

			sinon.assert.calledOnce(setOrganizationalUnitIdentifiersStub);
			sinon.assert.calledWith(setOrganizationalUnitIdentifiersStub, 'orgs');

			sinon.assert.calledOnce(setTlsRootCertsStub);
			sinon.assert.calledWith(setTlsRootCertsStub, 'tls_root_certs');
		});

		it('should set the type to 0 (Fabric)', () => {
			const setNameStub = sinon.stub();
			const setRootCertsStub = sinon.stub();
			const toBufferStub = sinon.stub().returns(new Buffer('test_buffer'));
			const protoStub = sinon.stub().returns({
				setName: setNameStub,
				setRootCerts: setRootCertsStub,
				toBuffer: toBufferStub
			});
			MspRewire.__set__('fabprotos.msp.FabricMSPConfig', protoStub);
			const signer = new SigningIdentity('certificate', 'publicKey', 'mspId', 'cryptoSuite', 'signer');
			const msp = new MspRewire({
				id: 'testMSP',
				cryptoSuite: 'cryptoSuite',
				signer: signer,
				rootCerts: 'ceert'
			});
			const pBuf = msp.toProtobuf();
			pBuf.getType().should.equal(0);
		});

		it('should set the config to the output of the FabricMSPConfig toBuffer call', () => {
			const setNameStub = sinon.stub();
			const setRootCertsStub = sinon.stub();
			const toBufferStub = sinon.stub().returns(new Buffer('test_buffer'));
			const protoStub = sinon.stub().returns({
				setName: setNameStub,
				setRootCerts: setRootCertsStub,
				toBuffer: toBufferStub
			});
			MspRewire.__set__('fabprotos.msp.FabricMSPConfig', protoStub);
			const signer = new SigningIdentity('certificate', 'publicKey', 'mspId', 'cryptoSuite', 'signer');
			const msp = new MspRewire({
				id: 'testMSP',
				cryptoSuite: 'cryptoSuite',
				signer: signer,
				rootCerts: 'cert'
			});

			// Call function
			const pBuf = msp.toProtobuf();

			// Should set the correct items
			sinon.assert.calledOnce(setNameStub);
			sinon.assert.calledWith(setNameStub, 'testMSP');

			sinon.assert.calledOnce(setRootCertsStub);
			sinon.assert.calledWith(setRootCertsStub, 'cert');

			// Config should exist
			pBuf.getConfig().toString('utf8').should.equal('test_buffer');
		});
	});

	describe('#deserializeIdentity', async () => {
		let revert;
		beforeEach(() => {
			revert = [];
		});

		afterEach(() => {
			if (revert.length) {
				revert.forEach(Function.prototype.call, Function.prototype.call);
			}
		});

		it('should call cryptoSuite.importKey with ephemeral: true if passed a false flag', () => {

			const importStub = sinon.stub();
			const cryptoStub = {
				importKey: importStub
			};

			const decoded = {
				getIdBytes: sinon.stub().returns(
					{
						toBinary: sinon.stub().returns('binary')
					}
				)
			};

			revert.push(MspRewire.__set__('fabprotos.msp.SerializedIdentity.decode', sinon.stub().returns(decoded)));

			const signer = new SigningIdentity('certificate', 'publicKey', 'mspId', cryptoStub, 'signer');
			const msp = new MspRewire({
				id: 'testMSP',
				cryptoSuite: cryptoStub,
				signer: signer,
				rootCerts: 'cert'
			});

			msp.deserializeIdentity('identity', false);

			sinon.assert.calledOnce(importStub);

			const args = importStub.getCall(0).args;
			args[0].should.equal('binary');
			args[1].algorithm.should.equal('X509Certificate');
			args[1].ephemeral.should.equal(true);
		});

		it('should not call cryptoSuite.importKey with ephemeral: true if not passed a false flag', async () => {
			const importStub = sinon.stub().resolves('key');
			const cryptoStub = {
				importKey: importStub
			};

			const decoded = {
				getIdBytes: sinon.stub().returns(
					{
						toBinary: sinon.stub().returns('binary')
					}
				)
			};

			revert.push(MspRewire.__set__('fabprotos.msp.SerializedIdentity.decode', sinon.stub().returns(decoded)));

			const signer = new SigningIdentity('certificate', 'publicKey', 'mspId', cryptoStub, 'signer');
			const msp = new MspRewire({
				id: 'testMSP',
				cryptoSuite: cryptoStub,
				signer: signer,
				rootCerts: 'cert'
			});

			await msp.deserializeIdentity('identity');

			sinon.assert.calledOnce(importStub);

			const args = importStub.getCall(0).args;
			args[0].should.equal('binary');
			args[1].algorithm.should.equal('X509Certificate');
			should.not.exist(args[1].ephemeral);
		});

		it('should deserialise a serialized identity', async () => {

			// Set base/default config
			const config = new Config();
			const default_config = path.resolve(__dirname, '../../config/default.json');
			config.file(default_config);

			// Creat an Identity
			const cryptoUtils = utils.newCryptoSuite();
			cryptoUtils.setCryptoKeyStore(utils.newCryptoKeyStore());

			const msp = new MSP({
				rootCerts: [],
				admins: [],
				id: 'testMSP',
				cryptoSuite: cryptoUtils
			});

			const TEST_CERT_PEM = '-----BEGIN CERTIFICATE-----' +
				'MIIDVDCCAvqgAwIBAgIBATAKBggqhkjOPQQDAjBOMRMwEQYDVQQKDArOoyBBY21l' +
				'IENvMRkwFwYDVQQDExB0ZXN0LmV4YW1wbGUuY29tMQ8wDQYDVQQqEwZHb3BoZXIx' +
				'CzAJBgNVBAYTAk5MMB4XDTE2MTIxNjIzMTAxM1oXDTE2MTIxNzAxMTAxM1owTjET' +
				'MBEGA1UECgwKzqMgQWNtZSBDbzEZMBcGA1UEAxMQdGVzdC5leGFtcGxlLmNvbTEP' +
				'MA0GA1UEKhMGR29waGVyMQswCQYDVQQGEwJOTDBZMBMGByqGSM49AgEGCCqGSM49' +
				'AwEHA0IABFKnXh7hBdp6s9OJ/aadigT1z2WzBbSc7Hzb3rkaWFz4e+9alqqWg9lr' +
				'ur/mDYzG9dudC8jFjVa7KIh+2BxgBayjggHHMIIBwzAOBgNVHQ8BAf8EBAMCAgQw' +
				'JgYDVR0lBB8wHQYIKwYBBQUHAwIGCCsGAQUFBwMBBgIqAwYDgQsBMA8GA1UdEwEB' +
				'/wQFMAMBAf8wDQYDVR0OBAYEBAECAwQwDwYDVR0jBAgwBoAEAQIDBDBiBggrBgEF' +
				'BQcBAQRWMFQwJgYIKwYBBQUHMAGGGmh0dHA6Ly9vY0JDQ1NQLmV4YW1wbGUuY29t' +
				'MCoGCCsGAQUFBzAChh5odHRwOi8vY3J0LmV4YW1wbGUuY29tL2NhMS5jcnQwRgYD' +
				'VR0RBD8wPYIQdGVzdC5leGFtcGxlLmNvbYERZ29waGVyQGdvbGFuZy5vcmeHBH8A' +
				'AAGHECABSGAAACABAAAAAAAAAGgwDwYDVR0gBAgwBjAEBgIqAzAqBgNVHR4EIzAh' +
				'oB8wDoIMLmV4YW1wbGUuY29tMA2CC2V4YW1wbGUuY29tMFcGA1UdHwRQME4wJaAj' +
				'oCGGH2h0dHA6Ly9jcmwxLmV4YW1wbGUuY29tL2NhMS5jcmwwJaAjoCGGH2h0dHA6' +
				'Ly9jcmwyLmV4YW1wbGUuY29tL2NhMS5jcmwwFgYDKgMEBA9leHRyYSBleHRlbnNp' +
				'b24wCgYIKoZIzj0EAwIDSAAwRQIgcguBb6FUxO+X8DbY17gpqSGuNC4NT4BddPg1' +
				'UWUxIC0CIQDNyHQAwzhw+512meXRwG92GfpzSBssDKLdwlrqiHOu5A==' +
				'-----END CERTIFICATE-----';

			const pubKey = cryptoUtils.importKey(TEST_CERT_PEM, {algorithm: CryptoAlgorithms.X509Certificate, ephemeral: true});
			const identity = new Identity(TEST_CERT_PEM, pubKey, msp.getId(), cryptoUtils);
			const serializedID = identity.serialize();

			// Verify non-promise based route
			let deserializedID = msp.deserializeIdentity(serializedID, false);
			deserializedID.getMSPId().should.equal('testMSP');

			deserializedID = await msp.deserializeIdentity(serializedID);
			deserializedID.getMSPId().should.equal('testMSP');
			deserializedID._publicKey.isPrivate().should.equal(false);
			deserializedID._certificate.should.equal(TEST_CERT_PEM);

		});
	});

	describe('#validate', () => {
		it('should return true, because it is not actually implemented', () => {
			const msp = new MSP({
				id: 'testMSP',
				cryptoSuite: 'cryptoSuite'
			});
			msp.validate().should.be.true;
		});
	});

});
