/**
 * Copyright 2016 IBM All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

var tape = require('tape');
var _test = require('tape-promise');
var test = _test(tape);


var hfc = require('fabric-client');

var X509 = require('jsrsasign').X509;

var util = require('util');
var fs = require('fs');
var path = require('path');
var testUtil = require('./util.js');
var utils = require('fabric-client/lib/utils.js');

var keyValStorePath = testUtil.KVS;


var FabricCAServices = require('fabric-ca-client/lib/FabricCAClientImpl');
var FabricCAClient = FabricCAServices.FabricCAClient;

var enrollmentID = 'testUser';
var enrollmentSecret = 'user1';
var csr = fs.readFileSync(path.resolve(__dirname, '../fixtures/fabriccop/enroll-csr.pem'));


test('FabricCAClient: Test enroll With Static CSR', function (t) {

	var client = new FabricCAClient({
		protocol: 'http',
		hostname: '127.0.0.1',
		port: 7054
	});

	//
	return client.enroll(enrollmentID, enrollmentSecret, csr.toString())
		.then(function (pem) {
			t.comment(pem);
			t.pass('Successfully invoked enroll API with enrollmentID \'' + enrollmentID + '\'');
			//check that we got back the expected certificate
			var cert = new X509();
			cert.readCertPEM(pem);
			t.comment(cert.getSubjectString());
			t.equal(cert.getSubjectString(), '/CN=' + enrollmentID, 'Subject should be /CN=' + enrollmentID);
		})
		.catch(function (err) {
			t.fail('Failed to enroll \'' + enrollmentID + '\'.  ' + err);
		});
});

/**
 * FabricCAServices class tests
 */

//run the enroll test

test('FabricCAServices: Test enroll() With Dynamic CSR', function (t) {

	// need to override the default key size 384 to match the member service backend
	// otherwise the client will not be able to decrypt the enrollment challenge
	utils.setConfigSetting('crypto-keysize', 256);

	var cop = new FabricCAServices('http://localhost:7054');

	var req = {
		enrollmentID: 'admin',
		enrollmentSecret: 'adminpw'
	};

	return cop.enroll(req)
		.then(
		function (enrollment) {

			t.pass('Successfully enrolled \'' + req.enrollmentID + '\'.');

			//check that we got back the expected certificate
			var cert = new X509();
			cert.readCertPEM(enrollment.certificate);
			t.comment(cert.getSubjectString());
			t.equal(cert.getSubjectString(), '/CN=' + req.enrollmentID, 'Subject should be /CN=' + req.enrollmentID);
		},
		function (err) {
			t.fail('Failed to enroll \'' + req.enrollmentID + '\'.  ' + err);
		}
		);

});

test('FabricCAClient: Test register', function (t) {

	var client = new FabricCAClient({
		protocol: 'http',
		hostname: '127.0.0.1',
		port: 7054
	});

	var enrollmentID = 'testRegisterUser';


	return client.register(enrollmentID, 'client', 'bank_a', [], 'admin')
		.then(function (secret) {
			t.comment(secret);
			t.pass('Successfully invoked register API with enrollmentID \'' + enrollmentID + '\'');

		})
		.catch(function (err) {
			t.fail('Failed to register \'' + enrollmentID + '\'.  ' + err);
		});
});
