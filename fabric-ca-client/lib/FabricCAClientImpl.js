/*
 Copyright 2016 IBM All Rights Reserved.

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

	  http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

'use strict';

var api = require('./api.js');
var utils = require('./utils.js');
var util = require('util');
var jsrsa = require('jsrsasign');
var asn1 = jsrsa.asn1;
var path = require('path');
var http = require('http');
var https = require('https');
var urlParser = require('url');


var logger = utils.getLogger('FabricCAClientImpl.js');

/**
 * @typedef {Object} TLSOptions
 * @property {string[]} trustedRoots Array of PEM-encoded trusted root certificates
 * @property {boolean} [verify=true] Determines whether or not to verify the server certificate when using TLS
 */

/**
 * This is an implementation of the member service client which communicates with the Fabric CA server.
 * @class
 */
var FabricCAServices = class {

	/**
	 * constructor
	 *
	 * @param {string} url The endpoint URL for Fabric CA services of the form: "http://host:port" or "https://host:port"
	 * @param {TLSOptions} tlsOptions The TLS settings to use when the Fabric CA services endpoint uses "https"
	 * @param {object} cryptoSetting This optional parameter is an object with the following optional properties:
	 * - software {boolean}: Whether to load a software-based implementation (true) or HSM implementation (false)
	 *	default is true (for software based implementation), specific implementation module is specified
	 *	in the setting 'crypto-suite-software'
	 * - keysize {number}: The key size to use for the crypto suite instance. default is value of the setting 'crypto-keysize'
	 * - algorithm {string}: Digital signature algorithm, currently supporting ECDSA only with value "EC"
	 *
	 * @param {function} KVSImplClass Optional. The built-in key store saves private keys. The key store may be backed by different
	 * {@link KeyValueStore} implementations. If specified, the value of the argument must point to a module implementing the
	 * KeyValueStore interface.
	 * @param {object} opts Implementation-specific options object for the {@link KeyValueStore} class to instantiate an instance
	 */
	constructor(url, tlsOptions, cryptoSettings, KVSImplClass, opts) {

		var endpoint = FabricCAServices._parseURL(url);

		this.cryptoPrimitives = utils.newCryptoSuite(cryptoSettings, KVSImplClass, opts);

		this._fabricCAClient = new FabricCAClient({
			protocol: endpoint.protocol,
			hostname: endpoint.hostname,
			port: endpoint.port,
			tlsOptions: tlsOptions
		}, this.cryptoPrimitives);

		logger.info('Successfully constructed Fabric CA service client: endpoint - %j', endpoint);

	}

	getCrypto() {
		return this.cryptoPrimitives;
	}

	/**
	 * Register the member and return an enrollment secret.
	 * @param {Object} req Registration request with the following fields:
	 * <br> - enrollmentID {string}. ID which will be used for enrollment
	 * <br> - role {string}. An arbitrary string representing a role value for the user
	 * <br> - affiliation {string}. Affiliation with which this user will be associated, like a company or an organization
	 * <br> - maxEnrollments {number}. The maximum number of times this user will be permitted to enroll
	 * <br> - attrs {{@link KeyValueAttribute}[]}. Array of key/value attributes to assign to the user.
	 * @param registrar {User}. The identity of the registrar (i.e. who is performing the registration)
	 * @returns {Promise} The enrollment secret to use when this user enrolls
	 */
	register(req, registrar) {
		if (typeof req === 'undefined' || req === null) {
			throw new Error('Missing required argument "request"');
		}

		if (typeof req.enrollmentID === 'undefined' || req.enrollmentID === null) {
			throw new Error('Missing required argument "request.enrollmentID"');
		}

		if (typeof req.maxEnrollments === 'undefined' || req.maxEnrollments === null) {
			// set maxEnrollments to 1
			req.maxEnrollments = 1;
		}

		checkRegistrar(registrar);

		return this._fabricCAClient.register(req.enrollmentID, req.role, req.affiliation, req.maxEnrollments, req.attrs,
			registrar.getSigningIdentity());
	}

	/**
	 * Enroll the member and return an opaque member object.
	 * @param req Enrollment request
	 * @param {string} req.enrollmentID The registered ID to use for enrollment
	 * @param {string} req.enrollmentSecret The secret associated with the enrollment ID
	 * @returns Promise for an object with "key" for private key and "certificate" for the signed certificate
	 */
	enroll(req) {
		var self = this;

		return new Promise(function (resolve, reject) {
			if (!req.enrollmentID) {
				logger.error('Invalid enroll request, missing enrollmentID');
				return reject(new Error('req.enrollmentID is not set'));
			}

			if (!req.enrollmentSecret) {
				logger.error('Invalid enroll request, missing enrollmentSecret');
				return reject(new Error('req.enrollmentSecret is not set'));
			}

			var enrollmentID = req.enrollmentID;
			var enrollmentSecret = req.enrollmentSecret;

			//generate enrollment certificate pair for signing
			self.cryptoPrimitives.generateKey()
				.then(
				function (privateKey) {
					//generate CSR using enrollmentID for the subject
					try {
						var csr = privateKey.generateCSR('CN=' + req.enrollmentID);
						self._fabricCAClient.enroll(req.enrollmentID, req.enrollmentSecret, csr)
							.then(
							function (enrollResponse) {
								return resolve({
									key: privateKey,
									certificate: enrollResponse.enrollmentCert,
									rootCertificate: enrollResponse.caCertChain
								});
							},
							function (err) {
								return reject(err);
							}
							);

					} catch (err) {
						return reject(new Error(util.format('Failed to generate CSR for enrollmemnt due to error [%s]', err)));
					}
				},
				function (err) {
					return reject(new Error(util.format('Failed to generate key for enrollment due to error [%s]', err)));
				}
				);

		});
	}

	/**
	 * Revoke an existing certificate (enrollment certificate or transaction certificate), or revoke
	 * all certificates issued to an enrollment id. If revoking a particular certificate, then both
	 * the Authority Key Identifier and serial number are required. If revoking by enrollment id,
	 * then all future requests to enroll this id will be rejected.
	 * @param {Object} request Request object with the following fields:
	 * <br> - enrollmentID {string}. ID to revoke
	 * <br> - aki {string}. Authority Key Identifier string, hex encoded, for the specific certificate to revoke
	 * <br> - serial {string}. Serial number string, hex encoded, for the specific certificate to revoke
	 * <br> - reason {string}. The reason for revocation. See https://godoc.org/golang.org/x/crypto/ocsp
	 *  for valid values. The default value is 0 (ocsp.Unspecified).
	 * @param {User} registrar The identity of the registrar (i.e. who is performing the revocation)
	 * @returns {Promise} The revocation results
	 */
	revoke(request, registrar) {
		if (typeof request === 'undefined' || request === null) {
			throw new Error('Missing required argument "request"');
		}

		if (request.enrollmentID === null || request.enrollmentID === '') {
			if (request.aki === null || request.aki === '' || request.serial === null || request.serial === '') {
				throw new Error('Enrollment ID is empty, thus both "aki" and "serial" must have non-empty values');
			}
		}

		checkRegistrar(registrar);

		return this._fabricCAClient.revoke(
			request.enrollmentID,
			request.aki,
			request.serial,
			(request.reason) ? request.reason : 0,
			registrar.getSigningIdentity());
	}

	/**
	 * Send a request for a new batch of TCerts.
	 * @param {Object} req Tcert request with the following fields:
	 * <br> - @param {number} count The number of transaction certificates to return."
	 * <br> - @param {string[]} attr_names An array of: The name of an attribute whose name and value to put in each transaction certificate.
	 * <br> - @param {bool} encrypt_attrs If true, encrypt the attribute(s) in each transaction certificate.
	 * <br> - @param {number} validity_period The number of nanoseconds each transaction certificate will be valid before expiration.
	 * @param {User} user The identity of the user (i.e. who is requesting the new TCerts)
	 * @returns {Promise} batch of new TCerts
	 */
	getTCerts(req, user) {

		if (typeof req === 'undefined' || req === null) {
			throw new Error('Missing required argument "request"');
		}

		if (typeof req.count === 'undefined' || req.count === null) {
			throw new Error('Missing required argument "request.count"');
		}

		if (typeof req.attr_names === 'undefined' || req.attr_names === null) {
			throw new Error('Missing required argument "request.attr_names"');
		}

		if (typeof req.encrypt_attrs === 'undefined' || req.encrypt_attrs === null) {
			throw new Error('Missing required argument "request.encrypt_attrs"');
		}

		if (typeof req.validity_period === 'undefined' || req.validity_period === null) {
			throw new Error('Missing required argument "request.validity_period"');
		}

		if (user === undefined || user === null) {
			throw new Error('Missing required argument "user"');
		}

		if (typeof user.getSigningIdentity !== 'function') {
			throw new Error('Argument "user" must be an instance of the class "User", but is found to be missing a method "getSigningIdentity()"');
		}

		return this._fabricCAClient.getTCerts(req.count, req.attr_names, req.encrypt_attrs, req.validity_period, user.getSigningIdentity());
	}

	derivePrivateKey() {

		logger.info('Derive private key');

		var ecertPEM = '-----BEGIN CERTIFICATE-----'+
		'MIICYjCCAgmgAwIBAgIUB3CTDOU47sUC5K4kn/Caqnh114YwCgYIKoZIzj0EAwIw'+
		'fzELMAkGA1UEBhMCVVMxEzARBgNVBAgTCkNhbGlmb3JuaWExFjAUBgNVBAcTDVNh'+
		'biBGcmFuY2lzY28xHzAdBgNVBAoTFkludGVybmV0IFdpZGdldHMsIEluYy4xDDAK'+
		'BgNVBAsTA1dXVzEUMBIGA1UEAxMLZXhhbXBsZS5jb20wHhcNMTYxMDEyMTkzMTAw'+
		'WhcNMjExMDExMTkzMTAwWjB/MQswCQYDVQQGEwJVUzETMBEGA1UECBMKQ2FsaWZv'+
		'cm5pYTEWMBQGA1UEBxMNU2FuIEZyYW5jaXNjbzEfMB0GA1UEChMWSW50ZXJuZXQg'+
		'V2lkZ2V0cywgSW5jLjEMMAoGA1UECxMDV1dXMRQwEgYDVQQDEwtleGFtcGxlLmNv'+
		'bTBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABKIH5b2JaSmqiQXHyqC+cmknICcF'+
		'i5AddVjsQizDV6uZ4v6s+PWiJyzfA/rTtMvYAPq/yeEHpBUB1j053mxnpMujYzBh'+
		'MA4GA1UdDwEB/wQEAwIBBjAPBgNVHRMBAf8EBTADAQH/MB0GA1UdDgQWBBQXZ0I9'+
		'qp6CP8TFHZ9bw5nRtZxIEDAfBgNVHSMEGDAWgBQXZ0I9qp6CP8TFHZ9bw5nRtZxI'+
		'EDAKBggqhkjOPQQDAgNHADBEAiAHp5Rbp9Em1G/UmKn8WsCbqDfWecVbZPQj3RK4'+
		'oG5kQQIgQAe4OOKYhJdh3f7URaKfGTf492/nmRmtK+ySKjpHSrU='+
		'-----END CERTIFICATE-----';

		var tcertPEM = '-----BEGIN CERTIFICATE-----'+
		'MIICdjCCAhygAwIBAgIRAKiCjdZT4UfHryhb11k0jdkwCgYIKoZIzj0EAwIwfzEL'+
		'MAkGA1UEBhMCVVMxEzARBgNVBAgTCkNhbGlmb3JuaWExFjAUBgNVBAcTDVNhbiBG'+
		'cmFuY2lzY28xHzAdBgNVBAoTFkludGVybmV0IFdpZGdldHMsIEluYy4xDDAKBgNV'+
		'BAsTA1dXVzEUMBIGA1UEAxMLZXhhbXBsZS5jb20wHhcNMTcwMzE1MTg1MDAzWhcN'+
		'MTgwMzE1MTg1MDAzWjApMScwJQYDVQQDEx5GYWJyaWMgVHJhbnNhY3Rpb24gQ2Vy'+
		'dGlmaWNhdGUwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAARb5elijXHkKpwCIlFE'+
		'9pEmHSR/0rv8efXwlrr0iJgdS9sKTl0wFoRGxW8zf2UDKMkccjettx4Hog95J7p6'+
		'xWSNo4HOMIHLMA4GA1UdDwEB/wQEAwIHgDANBgNVHQ4EBgQEAQIDBDAfBgNVHSME'+
		'GDAWgBQXZ0I9qp6CP8TFHZ9bw5nRtZxIEDBNBgYqAwQFBgcBAf8EQNxGJCN/BVMq'+
		'WVVoKaxArfUg0TAi/iPrbYzDGCCnqZCLZqIYDFKe/R6o71E3dbmSNNfzLBeSKKmt'+
		'mrMGvXXiwrcwOgYGKgMEBQYIBDB+J+9Ti8GMdc2lN0C5Q1GH4v0W/8Lq7qek3k0d'+
		'uDPSJs+kG/yoakizoveA1UV8UhkwCgYIKoZIzj0EAwIDSAAwRQIhANxpPoVA1vbF'+
		'5JJhfNBYIbO+ZIuv459fHNwbId1fCTvtAiAtOJcaTQIQPzroJDLIGvKvXtU0ZLpQ'+
		'2LiK4IKK4KOe/Q=='+
		'-----END CERTIFICATE-----';

		var ecertPrivateKeyPEM = '-----BEGIN PRIVATE KEY-----'+
		'MHcCAQEEINs5XopZVBEWTsUCCF8mU4H14/UN1alo+j5BzBQZ0PKtoAoGCCqGSM49'+
		'AwEHoUQDQgAEogflvYlpKaqJBcfKoL5yaScgJwWLkB11WOxCLMNXq5ni/qz49aIn'+
		'LN8D+tO0y9gA+r/J4QekFQHWPTnebGekyw=='+
		'-----END PRIVATE KEY-----';

		//var tcertDerivationKey = require('fs').readFileSync('/Users/pnovotny/code/tcert_derivationkey.dat');
		var tcertDerivationKey = require('fs').readFileSync('./test/unit/tcert_derivationkey.dat');
		logger.info('tcertDerivationKey: ', tcertDerivationKey);

		// test cert and private key from test files elsewhere in this project
		var TEST_KEY_PRIVATE_PEM = '-----BEGIN PRIVATE KEY-----' +
		'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgZYMvf3w5VkzzsTQY' +
		'I8Z8IXuGFZmmfjIX2YSScqCvAkihRANCAAS6BhFgW/q0PzrkwT5RlWTt41VgXLgu' +
		'Pv6QKvGsW7SqK6TkcCfxsWoSjy6/r1SzzTMni3J8iQRoJ3roPmoxPLK4' +
		'-----END PRIVATE KEY-----';

		var TEST_KEY_PRIVATE_CERT_PEM = '-----BEGIN CERTIFICATE-----' +
		'MIICEDCCAbagAwIBAgIUXoY6X7jIpHAAgL267xHEpVr6NSgwCgYIKoZIzj0EAwIw' +
		'fzELMAkGA1UEBhMCVVMxEzARBgNVBAgTCkNhbGlmb3JuaWExFjAUBgNVBAcTDVNh' +
		'biBGcmFuY2lzY28xHzAdBgNVBAoTFkludGVybmV0IFdpZGdldHMsIEluYy4xDDAK' +
		'BgNVBAsTA1dXVzEUMBIGA1UEAxMLZXhhbXBsZS5jb20wHhcNMTcwMTAzMDEyNDAw' +
		'WhcNMTgwMTAzMDEyNDAwWjAQMQ4wDAYDVQQDEwVhZG1pbjBZMBMGByqGSM49AgEG' +
		'CCqGSM49AwEHA0IABLoGEWBb+rQ/OuTBPlGVZO3jVWBcuC4+/pAq8axbtKorpORw' +
		'J/GxahKPLr+vVLPNMyeLcnyJBGgneug+ajE8srijfzB9MA4GA1UdDwEB/wQEAwIF' +
		'oDAdBgNVHSUEFjAUBggrBgEFBQcDAQYIKwYBBQUHAwIwDAYDVR0TAQH/BAIwADAd' +
		'BgNVHQ4EFgQU9BUt7QfgDXx9g6zpzCyJGxXsNM0wHwYDVR0jBBgwFoAUF2dCPaqe' +
		'gj/ExR2fW8OZ0bWcSBAwCgYIKoZIzj0EAwIDSAAwRQIgcWQbMzluyZsmvQCvGzPg' +
		'f5B7ECxK0kdmXPXIEBiizYACIQD2x39Q4oVwO5uL6m3AVNI98C2LZWa0g2iea8wk' +
		'BAHpeA==' +
		'-----END CERTIFICATE-----';

		// in first 3 steps is verified whether method which tests the result of derivation works
		// given the data available, its hard to say

		// 1 - tests whether verifyKeysHex works correctly - based on generating ec key pair and invoking verifyKeysHex
		// if this one passes we know how to verify result of derivation
		this.verifyKeysHex_Test_GenerateKeys();

		// 2 - tests whether extracted public/private keys from x509 and private key PEM encoding are matching
		// - here it is tested on the testing cert and private key used elsewhere in the tests and hence data which should work
		// if 1 passes and this one not - there is a problem with input or loading of input - either way the rest is unlikely to work
		this.verifyKeysHex_Test_FromPEM(TEST_KEY_PRIVATE_CERT_PEM, TEST_KEY_PRIVATE_PEM);

		// 3 - tests whether extracted public/private keys from x509 and private key PEM encoding are matching
		// - here is used ecert and its private key extracted from GO code of fabric-ca
		// if 1 passes and this one not - 5 cant pass
		this.verifyKeysHex_Test_FromPEM(ecertPEM, ecertPrivateKeyPEM);

		// in remaining 2 steps is invoked key derivation and the result is verified

		// 4 - invokes derivePrivateKey_Impl and tests whether the returned private key and public key extracted
		// -- from the private key object are matching
		// this one generally passes, however, not sure how the public key is internally derived and hence it does
		// -- not say much about correctness of the derivation
		this.derivePrivateKey_Impl_Test_DerivedPrivateAndPublicKeys(ecertPEM, tcertDerivationKey, tcertPEM);

		// 5 - invokes derivePrivateKey_Impl and tests whether the returned private key and public key from tcert are matching
		this.derivePrivateKey_Impl_Test_DerivedPrivateKeyAndTcertPublicKey(ecertPEM, tcertDerivationKey, tcertPEM);
	}

	// invokes derivePrivateKey_Impl and tests whether the returned private key and public key from tcert are matching
	derivePrivateKey_Impl_Test_DerivedPrivateKeyAndTcertPublicKey(ecertPrivateKeyPEMBuffer, derivationKeyBuffer, tcertPEMBuffer) {
		logger.info('derivePrivateKey_Impl_Test_DerivedPrivateKeyAndTcertPublicKey');
		//logger.info('ecertPrivateKeyPEMBuffer: ', ecertPrivateKeyPEMBuffer);
		//logger.info('derivationKeyBuffer: ', derivationKeyBuffer);
		//logger.info('tcertPEMBuffer: ', tcertPEMBuffer);

		var tcertPrivateKey = this.derivePrivateKey_Impl(ecertPrivateKeyPEMBuffer, derivationKeyBuffer, tcertPEMBuffer);

		// extract public key from x509 tcert PEM
		var publicKey = KEYUTIL.getKey(tcertPEMBuffer);
		var publicKeyXY = publicKey.getPublicKeyXYHex();
		var publicKeyHex = '04' + (JSON.stringify(publicKeyXY.x) + JSON.stringify(publicKeyXY.y)).replace(/"/g, '');

		// extract private key
		var privateKeyHex = tcertPrivateKey.getPrivate('hex');

		this.verifyKeysHex(publicKeyHex, privateKeyHex);
	}

	// invokes derivePrivateKey_Impl and tests whether the returned private key and public key extracted from the private key object are matching
	derivePrivateKey_Impl_Test_DerivedPrivateAndPublicKeys(ecertPrivateKeyPEMBuffer, derivationKeyBuffer, tcertPEMBuffer) {
		logger.info('derivePrivateKey_Impl_Test_DerivedPrivateAndPublicKeys');
		//logger.info('ecertPrivateKeyPEMBuffer: ', ecertPrivateKeyPEMBuffer);
		//logger.info('derivationKeyBuffer: ', derivationKeyBuffer);
		//logger.info('tcertPEMBuffer: ', tcertPEMBuffer);

		var tcertPrivateKey = this.derivePrivateKey_Impl(ecertPrivateKeyPEMBuffer, derivationKeyBuffer, tcertPEMBuffer);

		// extract private and public keys from returned tcert's private key
		var privateKeyHex = tcertPrivateKey.getPrivate('hex');
		var publicKeyHex = tcertPrivateKey.getPublic('hex');

		this.verifyKeysHex(publicKeyHex, privateKeyHex);
	}

	// tests whether extracted public/private keys from x509 and private key PEM encoding are matching
	verifyKeysHex_Test_FromPEM(x509PEM, privateKeyPEM) {
		logger.info('verifyKeysHex_Test_FromPEM');

		// extract public key from x509 cert PEM
		var publicKey = KEYUTIL.getKey(x509PEM);
		var publicKeyXY = publicKey.getPublicKeyXYHex();
		var publicKeyHex = '04' + (JSON.stringify(publicKeyXY.x) + JSON.stringify(publicKeyXY.y)).replace(/"/g, '');

		// extract private key from private key PEM
		var privateKey = this.ecdsaKeyFromPrivate(privateKeyPEM, 'hex');
		var privateKeyHex = privateKey.getPrivate('hex');

		this.verifyKeysHex(publicKeyHex, privateKeyHex);
	}

	// tests whether verifyKeysHex works correctly - based on generating ec key pair and invoking verifyKeysHex
	verifyKeysHex_Test_GenerateKeys() {
		logger.info('verifyKeysHex_Test_GenerateKeys');

		var key = new EC(elliptic.curves['p256']).genKeyPair();
		var puplicKeyHex = key.getPublic(true, 'hex');
		var privateKeyHex = key.getPrivate('hex');

		this.verifyKeysHex(puplicKeyHex, privateKeyHex);
	}

	// verifies whether pair of public and private keys are matching by signing message and verifying the signature
	verifyKeysHex(publicKeyHex, privateKeyHex) {
		logger.info('verifyKeysHex');
		logger.info('public: ', publicKeyHex);
		logger.info('private: ', privateKeyHex);

		var publicKey = this.ecdsaKeyFromPublic(publicKeyHex, 'hex');
		var privateKey = this.ecdsaKeyFromPrivate(privateKeyHex, 'hex');


		// Sign message (must be an array, or it'll be treated as a hex sequence)
		var msg = [ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 ];
		//var signature = privateKey.sign(msg);
		var signature = privateKey.sign(msg);

		// Export DER encoded signature in Array
		var derSign = signature.toDER();

		// Verify signature with private key
		logger.info('Verify signature - private key: ', privateKey.verify(msg, derSign));

		// Verify signature with public key
		logger.info('Verify signature - public key: ', publicKey.verify(msg, derSign));

		return publicKey.verify(msg, derSign);
	}

	// private key derivation - based on code from v0.6
	derivePrivateKey_Impl(ecertPrivateKeyPEMBuffer, derivationKeyBuffer, tcertPEMBuffer) {
		logger.info('derivePrivateKey_Impl');

		let byte1 = new Buffer(1);
		byte1.writeUInt8(0x1, 0);
		let byte2 = new Buffer(1);
		byte2.writeUInt8(0x2, 0);

		let tCertOwnerEncryptKey = this.hmac(derivationKeyBuffer, byte1).slice(0, 32);
		let expansionKey = this.hmac(derivationKeyBuffer, byte2);

		// extract the encrypted bytes from extension attribute
		const TCertEncTCertIndex = '1.2.3.4.5.6.7';
		var hCert = X509.pemToHex(tcertPEMBuffer);
		var tCertIndexCT = X509.getHexOfV_V3ExtValue(hCert, TCertEncTCertIndex);
		//logger.info('TCertEncTCertIndex: ', tCertIndexCT);
		let tCertIndex = this.aesCBCPKCS7Decrypt(tCertOwnerEncryptKey, tCertIndexCT);
		//logger.info('tCertIndex: ',JSON.stringify(tCertIndex));

		let expansionValue = this.hmac(expansionKey, tCertIndex);
		//logger.info('expansionValue: ',expansionValue);

        // compute the private key
		let one = new BN(1);
		let k = new BN(expansionValue);
		let n = this.ecdsaKeyFromPrivate(ecertPrivateKeyPEMBuffer, 'hex').ec.curve.n.sub(one);
		//logger.info('n: ', n);
		k = k.mod(n).add(one);
		//logger.info('k: ', k);
		let D = this.ecdsaKeyFromPrivate(ecertPrivateKeyPEMBuffer, 'hex').getPrivate().add(k);
		//logger.info('D: ', D);
		let pubHex = this.ecdsaKeyFromPrivate(ecertPrivateKeyPEMBuffer, 'hex').getPublic('hex');
		//logger.info('pubHex: ', pubHex);
		D = D.mod(this.ecdsaKeyFromPublic(pubHex, 'hex').ec.curve.n);
		//logger.info('D: ', D);

		var tcertPrivateKey = this.ecdsaKeyFromPrivate(D, 'hex');
		//logger.info('derived private key: ', JSON.stringify(tcertPrivateKey));
		logger.info('derived private key: ', JSON.stringify(tcertPrivateKey.getPrivate('hex')));

		return tcertPrivateKey;
	}

	ecdsaKeyFromPrivate(key, encoding) {
     // select curve and hash algo based on level
		var privateKey = new EC(elliptic.curves['p256']).keyFromPrivate(key, encoding);
		//logger.info('ecdsaKeyFromPrivate: ', privateKey);
		return privateKey;
	};

	ecdsaKeyFromPublic(key, encoding) {
		var publicKey = new EC(elliptic.curves['p256']).keyFromPublic(key, encoding);
		//logger.info('ecdsaKeyFromPublic: ', publicKey);
		return publicKey;
	};

	hmac(key, bytes) {
		//logger.info('key: ', JSON.stringify(key));
		//logger.info('bytes: ', JSON.stringify(bytes));
		var hmac = new sjcl.misc.hmac(bytesToBits(key), this.hashFunctionKeyDerivation);
		hmac.update(bytesToBits(bytes));
		var result = hmac.digest();
		//logger.info('result: ', bitsToBytes(result));
		return bitsToBytes(result);
	}

	aesCBCPKCS7Decrypt(key, bytes) {
		var decryptedBytes, unpaddedBytes;

		decryptedBytes = this.CBCDecrypt(key, bytes);
		unpaddedBytes = this.PKCS7UnPadding(decryptedBytes);

		return unpaddedBytes;
	}

	CBCDecrypt(key, bytes) {
		const BlockSize = 16;
		//logger.info('key length: ', key.length);
		//logger.info('bytes length: ', bytes.length);
		var iv = bytes.slice(0, BlockSize);
		//logger.info('iv length: ', iv.length);
		var encryptedBytes = bytes.slice(BlockSize);
		//logger.info('encrypted bytes length: ', encryptedBytes.length);

		var decryptedBlocks = [];
		var decryptedBytes;

		// CBC only works with 16 bytes blocks
		if (encryptedBytes.length > BlockSize) {
			//CBC only support cipertext with length Blocksize
			var start = 0;
			var end = BlockSize;
			while (end <= encryptedBytes.length) {
				var aesCbc = new aesjs.ModeOfOperation.cbc(key, iv);
				//logger.info('start|end', start, end);
				var encryptedBlock = encryptedBytes.slice(start, end);
				var textBytes = aesjs.util.convertStringToBytes(encryptedBlock);
				//logger.info('encryptedBlock: ', encryptedBlock);
				//var decryptedBlock = aesCbc.decrypt(encryptedBlock);
				var decryptedBlock = aesCbc.decrypt(textBytes);
				//logger.info('decryptedBlock: ', decryptedBlock);
				decryptedBlocks.push(decryptedBlock);
				//iv for next round equals previous block
				iv = encryptedBlock;
				start += BlockSize;
				end += BlockSize;
			}
			decryptedBytes = Buffer.concat(decryptedBlocks);
		}
		else {
			var aesCbc = new aesjs.ModeOfOperation.cbc(key, iv);
			decryptedBytes = aesCbc.decrypt(encryptedBytes);
		}

		//logger.info('decrypted bytes: ', JSON.stringify(decryptedBytes));

		return decryptedBytes;
	}

	PKCS7UnPadding(bytes) {
		//last byte is the number of padded bytes
		var padding = bytes.readUInt8(bytes.length - 1);
		//logger.info('padding: ', padding);
		//should check padded bytes, but just going to extract
		var unpadded = bytes.slice(0, bytes.length - padding);
		//logger.info('unpadded bytes: ', JSON.stringify(unpadded));
		return unpadded;
	}

	/**
	 * @typedef {Object} HTTPEndpoint
	 * @property {string} hostname
	 * @property {number} port
	 * @property {string} protocol
	 */

	/**
	 * Utility function which parses an HTTP URL into its component parts
	 * @param {string} url HTTP or HTTPS url including protocol, host and port
	 * @returns {HTTPEndpoint}
	 * @throws InvalidURL for malformed URLs
	 * @ignore
	 */
	static _parseURL(url) {

		var endpoint = {};

		var purl = urlParser.parse(url, true);

		if (purl.protocol && purl.protocol.startsWith('http')) {
			if (purl.protocol.slice(0, -1) != 'https') {
				if (purl.protocol.slice(0, -1) != 'http') {
					throw new Error('InvalidURL: url must start with http or https.');
				}
			}
			endpoint.protocol = purl.protocol.slice(0, -1);
			if (purl.hostname) {
				endpoint.hostname = purl.hostname;

				if (purl.port) {
					endpoint.port = parseInt(purl.port);
				}

			} else {
				throw new Error('InvalidURL: missing hostname.');
			}

		} else {
			throw new Error('InvalidURL: url must start with http or https.');
		}

		return endpoint;
	}

	/**
	* return a printable representation of this object
	*/
	toString() {
		return ' FabricCAServices : {' +
			'hostname: ' + this._fabricCAClient._hostname +
			', port: ' + this._fabricCAClient._port +
			'}';
	}
};

/**
 * Client for communciating with the Fabric CA APIs
 *
 * @class
 */
var FabricCAClient = class {

	/**
	 * constructor
	 *
	 * @param {object} connect_opts Connection options for communciating with the Fabric CA server
	 * @param {string} connect_opts.protocol The protocol to use (either HTTP or HTTPS)
	 * @param {string} connect_opts.hostname The hostname of the Fabric CA server endpoint
	 * @param {number} connect_opts.port The port of the Fabric CA server endpoint
	 * @param {TLSOptions} connect_opts.tlsOptions The TLS settings to use when the Fabric CA endpoint uses "https"
	 * @throws Will throw an error if connection options are missing or invalid
	 *
	 */
	constructor(connect_opts, cryptoPrimitives) {

		//check connect_opts
		try {
			this._validateConnectionOpts(connect_opts);
		} catch (err) {
			throw new Error('Invalid connection options.  ' + err.message);
		}


		this._httpClient = (connect_opts.protocol === 'http') ? http : https;
		this._hostname = connect_opts.hostname;
		if (connect_opts.port) {
			this._port = connect_opts.port;
		} else {
			this._port = 7054;
		}
		if (typeof connect_opts.tlsOptions==='undefined' || connect_opts.tlsOptions===null){
			this._tlsOptions = {
				trustedRoots: [],
				verify: false
			};
		} else {
			this._tlsOptions = connect_opts.tlsOptions;
			if (this._tlsOptions.verify==='undefined'){
				this._tlsOptions.verify = true;
			}
			if (this._tlsOptions.trustedRoots==='undefined'){
				this._tlsOptions.trustedRoots = [];
			}
		}
		this._baseAPI = '/api/v1/cfssl/';

		this._cryptoPrimitives = cryptoPrimitives;

		logger.info('Successfully constructed Fabric CA client from options - %j', connect_opts);
	}

	/**
	 * @typedef {Object} KeyValueAttribute
	 * @property {string} name The key used to reference the attribute
	 * @property {string} value The value of the attribute
	 */

	/**
	 * Register a new user and return the enrollment secret
	 * @param {string} enrollmentID ID which will be used for enrollment
	 * @param {string} role Type of role for this user
	 * @param {string} affiliation Affiliation with which this user will be associated
	 * @param {number} maxEnrollments The maximum number of times the user is permitted to enroll
	 * @param {KeyValueAttribute[]} attrs Array of key/value attributes to assign to the user
	 * @param {SigningIdentity} signingIdentity The instance of a SigningIdentity encapsulating the
	 * signing certificate, hash algorithm and signature algorithm
	 * @returns {Promise} The enrollment secret to use when this user enrolls
	 */
	register(enrollmentID, role, affiliation, maxEnrollments, attrs, signingIdentity) {

		var self = this;
		var numArgs = arguments.length;
		//all arguments are required
		if (numArgs < 5) {
			throw new Error('Missing required parameters.  \'enrollmentID\', \'role\', \'affiliation\', \'attrs\', \
				and \'signingIdentity\' are all required.');
		}

		return new Promise(function (resolve, reject) {
			var regRequest = {
				'id': enrollmentID,
				'type': role ? role : 'client',
				'affiliation': affiliation,
				'max_enrollments': maxEnrollments,
				'attrs': attrs
			};

			return self.post('register', regRequest, signingIdentity)
			.then(function (response) {
				return resolve(response.result.secret);
			}).catch(function (err) {
				return reject(err);
			});
		});
	}

	/**
	 * Revoke an existing certificate (enrollment certificate or transaction certificate), or revoke
	 * all certificates issued to an enrollment id. If revoking a particular certificate, then both
	 * the Authority Key Identifier and serial number are required. If revoking by enrollment id,
	 * then all future requests to enroll this id will be rejected.
	 * @param {string} enrollmentID ID to revoke
	 * @param {string} aki Authority Key Identifier string, hex encoded, for the specific certificate to revoke
	 * @param {string} serial Serial number string, hex encoded, for the specific certificate to revoke
	 * @param {string} reason The reason for revocation. See https://godoc.org/golang.org/x/crypto/ocsp
	 *  for valid values
	 * @param {SigningIdentity} signingIdentity The instance of a SigningIdentity encapsulating the
	 * signing certificate, hash algorithm and signature algorithm
	 * @returns {Promise} The revocation results
	 */
	revoke(enrollmentID, aki, serial, reason, signingIdentity) {

		var self = this;
		var numArgs = arguments.length;

		//all arguments are required
		if (numArgs < 5) {
			throw new Error('Missing required parameters.  \'enrollmentID\', \'aki\', \'serial\', \'reason\', \
				\'callerID\' and \'signingIdentity\' are all required.');
		}

		return new Promise(function (resolve, reject) {

			var serialToSend;
			if (serial!=null){
				if (serial.length < 80){
					serialToSend = '0' + serial;
				}
				else {
					serialToSend = serial;
				}
			}
			var regRequest = {
				'id': enrollmentID,
				'aki': aki,
				'serial': serialToSend,
				'reason': reason
			};

			return self.post('revoke', regRequest, signingIdentity)
			.then(function (response) {
				return resolve(response);
			}).catch(function (err) {
				return reject(err);
			});
		});
	}

	post(api_method, requestObj, signingIdentity) {
		var self = this;
		return new Promise(function (resolve, reject) {
			var requestOptions = {
				hostname: self._hostname,
				port: self._port,
				path: self._baseAPI + api_method,
				method: 'POST',
				headers: {
					Authorization: self.generateAuthToken(requestObj, signingIdentity)
				},
				ca: self._tlsOptions.trustedRoots,
				rejectUnauthorized: self._tlsOptions.verify
			};

			var request = self._httpClient.request(requestOptions, function (response) {

				const responseBody = [];
				response.on('data', function (chunk) {
					responseBody.push(chunk);
				});

				response.on('end', function () {

					var payload = responseBody.join('');

					if (!payload) {
						reject(new Error(
							util.format('fabric-ca request %s failed with HTTP status code %s', api_method, response.statusCode)));
					}
					//response should be JSON
					try {
						var responseObj = JSON.parse(payload);
						if (responseObj.success) {
							return resolve(responseObj);
						} else {
							return reject(new Error(
								util.format('fabric-ca request %s failed with errors [%s]', api_method, JSON.stringify(responseObj.errors))));
						}

					} catch (err) {
						reject(new Error(
							util.format('Could not parse %s response [%s] as JSON due to error [%s]', api_method, payload, err)));
					}
				});

			});

			request.on('error', function (err) {
				reject(new Error(util.format('Calling %s endpoint failed with error [%s]', api_method, err)));
			});

			request.write(JSON.stringify(requestObj));
			request.end();
		});
	}

	/*
	 * Generate authorization token required for accessing fabric-ca APIs
	 */
	generateAuthToken(reqBody, signingIdentity) {
		// specific signing procedure is according to:
		// https://github.com/hyperledger/fabric-ca/blob/master/util/util.go#L213
		var cert = Buffer.from(signingIdentity._certificate).toString('base64');
		var body = Buffer.from(JSON.stringify(reqBody)).toString('base64');

		var bodyAndcert = body + '.' + cert;
		var sig = signingIdentity.sign(bodyAndcert, { hashFunction: this._cryptoPrimitives.hash.bind(this._cryptoPrimitives) });
		logger.debug(util.format('bodyAndcert: %s', bodyAndcert));

		var b64Sign = Buffer.from(sig, 'hex').toString('base64');
		return cert + '.' + b64Sign;
	}

	/**
	 * Send a request for a new batch of TCerts.
	 * @param {number} count The number of transaction certificates to return."
	 * @param {string[]} attr_names An array of: The name of an attribute whose name and value to put in each transaction certificate.
	 * @param {bool} encrypt_attrs If true, encrypt the attribute(s) in each transaction certificate.
	 * @param {number} validity_period The number of nanoseconds each transaction certificate will be valid before expiration.
	 * @param {SigningIdentity} signingIdentity The instance of a SigningIdentity encapsulating the signing certificate,
	 * hash algorithm and signature algorithm
	 * @returns {Promise} batch of new TCerts
	 * @throws Will throw an error if all parameters are not provided
	 * @throws Will throw an error if calling the tcert API fails for any reason
	 */
	getTCerts(count, attr_names, encrypt_attrs, validity_period, signingIdentity) {

		var self = this;
		var numArgs = arguments.length;

		return new Promise(function (resolve, reject) {
			//check for required args
			if (numArgs < 5) {
				reject(new Error('Missing required parameters.  \'count\', \'attr_names\', \'encrypt_attrs\', \'validity_period\', \'signingIdentity.'));
			}

			//https://github.com/hyperledger/fabric-ca/blob/master/swagger/swagger-fabric-ca.json
			var requestBody = {
				count: count,
	            attr_names: attr_names,
	            encrypt_attrs: encrypt_attrs,
	            validity_period: validity_period
			};
			/*
			 var regRequest = {
				'id': enrollmentID,
				'type': role,
				'group': group,
				'attrs': attrs,
				'callerID': callerID
			};
			 */

			var authToken = FabricCAClient.generateAuthToken(requestBody, signingIdentity);

			var requestOptions = {
				hostname: self._hostname,
				port: self._port,
				path: self._baseAPI + 'tcert',
				method: 'POST',
				headers: {
					Authorization: authToken
				}
			};

			var request = self._httpClient.request(requestOptions, function (response) {

				const responseBody = [];
				response.on('data', function (chunk) {
					responseBody.push(chunk);
				});

				response.on('end', function () {

					var payload = responseBody.join('');

					if (!payload) {
						reject(new Error(
							util.format('Tcert failed with HTTP status code ', response.statusCode)));
					}
					//response should be JSON
					try {
						var enrollResponse = JSON.parse(payload);
						if (enrollResponse.success) {
							//we want the result field which is Base64-encoded PEM
							return resolve(new Buffer.from(enrollResponse.result, 'base64').toString());
						} else {
							return reject(new Error(
								util.format('Tcert failed with errors [%s]', JSON.stringify(enrollResponse.errors))));
						}

					} catch (err) {
						reject(new Error(
							util.format('Could not parse tcert response [%s] as JSON due to error [%s]', payload, err)));
					}
				});

			});

			request.on('error', function (err) {
				reject(new Error(util.format('Calling tcert endpoint failed with error [%s]', err)));
			});

			request.write(JSON.stringify(requestBody));
			request.end();
		});

	}

	/**
	 * @typedef {Object} EnrollmentResponse
	 * @property {string} enrollmentCert PEM-encoded X509 enrollment certificate
	 * @property {string} caCertChain PEM-encoded X509 certificate chain for the issuing
	 * certificate authority
	 */

	/**
	 * Enroll a registered user in order to receive a signed X509 certificate
	 * @param {string} enrollmentID The registered ID to use for enrollment
	 * @param {string} enrollmentSecret The secret associated with the enrollment ID
	 * @param {string} csr PEM-encoded PKCS#10 certificate signing request
	 * @returns {Promise} {@link EnrollmentResponse}
	 * @throws Will throw an error if all parameters are not provided
	 * @throws Will throw an error if calling the enroll API fails for any reason
	 */
	enroll(enrollmentID, enrollmentSecret, csr) {

		var self = this;
		var numArgs = arguments.length;

		return new Promise(function (resolve, reject) {
			//check for required args
			if (numArgs < 3) {
				return reject(new Error('Missing required parameters.  \'enrollmentID\', \'enrollmentSecret\' and \'csr\' are all required.'));
			}

			var requestOptions = {
				hostname: self._hostname,
				port: self._port,
				path: self._baseAPI + 'enroll',
				method: 'POST',
				auth: enrollmentID + ':' + enrollmentSecret,
				ca: self._tlsOptions.trustedRoots,
				rejectUnauthorized: self._tlsOptions.verify
			};

			var enrollRequest = {
				certificate_request: csr
			};

			var request = self._httpClient.request(requestOptions, function (response) {

				const responseBody = [];
				response.on('data', function (chunk) {
					responseBody.push(chunk);
				});

				response.on('end', function () {

					var payload = responseBody.join('');

					if (!payload) {
						reject(new Error(
							util.format('Enrollment failed with HTTP status code ', response.statusCode)));
					}
					//response should be JSON
					try {
						var res = JSON.parse(payload);
						if (res.success) {
							//we want the result field which is Base64-encoded PEM
							var enrollResponse = new Object();
							// Cert field is Base64-encoded PEM
							enrollResponse.enrollmentCert = new Buffer.from(res.result.Cert, 'base64').toString();
							enrollResponse.caCertChain = new Buffer.from(res.result.ServerInfo.CAChain, 'base64').toString();
							return resolve(enrollResponse);
						} else {
							return reject(new Error(
								util.format('Enrollment failed with errors [%s]', JSON.stringify(enrollResponse.errors))));
						}

					} catch (err) {
						reject(new Error(
							util.format('Could not parse enrollment response [%s] as JSON due to error [%s]', payload, err)));
					}
				});

			});

			request.on('error', function (err) {
				reject(new Error(util.format('Calling enrollment endpoint failed with error [%s]', err)));
			});

			request.write(JSON.stringify(enrollRequest));
			request.end();

		});

	}

	/**
	 * Convert a PEM encoded certificate to DER format
	 * @param {string) pem PEM encoded public or private key
	 * @returns {string} hex Hex-encoded DER bytes
	 * @throws Will throw an error if the conversation fails
	 */
	static pemToDER(pem) {

		//PEM format is essentially a nicely formatted base64 representation of DER encoding
		//So we need to strip "BEGIN" / "END" header/footer and string line breaks
		//Then we simply base64 decode it and convert to hex string
		var contents = pem.toString().trim().split(/\r?\n/);
		//check for BEGIN and END tags
		if (!(contents[0].match(/\-\-\-\-\-\s*BEGIN ?([^-]+)?\-\-\-\-\-/) &&
			contents[contents.length - 1].match(/\-\-\-\-\-\s*END ?([^-]+)?\-\-\-\-\-/))) {
			throw new Error('Input parameter does not appear to be PEM-encoded.');
		};
		contents.shift(); //remove BEGIN
		contents.pop(); //remove END
		//base64 decode and encode as hex string
		var hex = Buffer.from(contents.join(''), 'base64').toString('hex');
		return hex;
	}

	/**
	 * Validate the connection options
	 * @throws Will throw an error if any of the required connection options are missing or invalid
	 * @ignore
	 */
	_validateConnectionOpts(connect_opts) {
		//check for protocol
		if (!connect_opts.protocol) {
			throw new Error('Protocol must be set to \'http\' or \'https\'');
		};

		if (connect_opts.protocol != 'http') {
			if (connect_opts.protocol != 'https') {
				throw new Error('Protocol must be set to \'http\' or \'https\'');
			}
		};

		if (!connect_opts.hostname) {
			throw new Error('Hostname must be set');
		};

		if (connect_opts.port) {
			if (!Number.isInteger(connect_opts.port)) {
				throw new Error('Port must be an integer');
			}
		}

	}
};

function checkRegistrar(registrar) {
	if (typeof registrar === 'undefined' || registrar === null) {
		throw new Error('Missing required argument "registrar"');
	}

	if (typeof registrar.getSigningIdentity !== 'function') {
		throw new Error('Argument "registrar" must be an instance of the class "User", but is found to be missing a method "getSigningIdentity()"');
	}
}

module.exports = FabricCAServices;
module.exports.FabricCAClient = FabricCAClient;
