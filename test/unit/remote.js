/**
 * Copyright 2016-2017 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

var tape = require('tape');
var _test = require('tape-promise').default;
var crypto = require('crypto');
var test = _test(tape);

var testutil = require('./util.js');
var hash = require('fabric-client/lib/hash.js');

var Client = require('fabric-client');
var Remote = require('fabric-client/lib/Remote.js');
var Peer = require('fabric-client/lib/Peer.js');
var Orderer = require('fabric-client/lib/Orderer.js');
var utils = require('fabric-client/lib/utils.js');

var aPem = '-----BEGIN CERTIFICATE-----' +
	'MIIBwTCCAUegAwIBAgIBATAKBggqhkjOPQQDAzApMQswCQYDVQQGEwJVUzEMMAoG' +
	'A1UEChMDSUJNMQwwCgYDVQQDEwNPQkMwHhcNMTYwMTIxMjI0OTUxWhcNMTYwNDIw' +
	'MjI0OTUxWjApMQswCQYDVQQGEwJVUzEMMAoGA1UEChMDSUJNMQwwCgYDVQQDEwNP' +
	'QkMwdjAQBgcqhkjOPQIBBgUrgQQAIgNiAAR6YAoPOwMzIVi+P83V79I6BeIyJeaM' +
	'meqWbmwQsTRlKD6g0L0YvczQO2vp+DbxRN11okGq3O/ctcPzvPXvm7Mcbb3whgXW' +
	'RjbsX6wn25tF2/hU6fQsyQLPiJuNj/yxknSjQzBBMA4GA1UdDwEB/wQEAwIChDAP' +
	'BgNVHRMBAf8EBTADAQH/MA0GA1UdDgQGBAQBAgMEMA8GA1UdIwQIMAaABAECAwQw' +
	'CgYIKoZIzj0EAwMDaAAwZQIxAITGmq+x5N7Q1jrLt3QFRtTKsuNIosnlV4LR54l3' +
	'yyDo17Ts0YLyC0pZQFd+GURSOQIwP/XAwoMcbJJtOVeW/UL2EOqmKA2ygmWX5kte' +
	'9Lngf550S6gPEWuDQOcY95B+x3eH' +
	'-----END CERTIFICATE-----';
var defaultCiphers = 'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-SHA256' +
	':ECDHE-RSA-AES256-SHA384:ECDHE-RSA-AES256-GCM-SHA384' +
	':ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES128-SHA256' +
	':ECDHE-ECDSA-AES256-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384';

var aHostname = 'atesthostname';
var aHostnameOverride = 'atesthostnameoverride';

test('\n\n ** Remote node tests **\n\n', function (t) {
	testutil.resetDefaults();

	console.log('\n * REMOTE *');
	//Peer: secure grpcs, requires opts.pem
	var url = 'grpcs://' + aHostname + ':aport';
	var opts = { pem: aPem };
	var remote = null;
	t.throws(
		function () {
			remote = new Remote(url);
		},
		/^Error: PEM encoded certificate is required./,
		'GRPCS Options tests: new Remote should throw PEM encoded certificate is required.'
	);

	t.doesNotThrow(
		function () {
			remote = new Remote(url, {pem: aPem});
		},
		null,
		'Check not passing any GRPC options.'
	);

	t.throws(
		function () {
			remote = new Remote(url, {pem: aPem, clientKey: aPem});
		},
		/^Error: clientKey and clientCert are both required./,
		'GRPCS Options tests: new Remote should throw clientKey and clientCert are both required.'
	);

	t.throws(
		function () {
			url = 'grpcs://' + aHostname + ':aport';
			remote = new Remote(url, {pem: aPem, clientCert: aPem});
		},
		/^Error: clientKey and clientCert are both required./,
		'GRPCS Options tests: new Remote should throw clientKey and clientCert are both required.'
	);

	t.doesNotThrow(
		function () {
			remote = new Remote(url, {pem: aPem, clientKey: aPem, clientCert: aPem});
		},
		null,
		'Pass valid client certificate options.'
	);

	t.throws(
		function () {
			remote = new Remote(url, {pem: aPem, anyStringKey: Buffer.alloc(1)});
		},
		/invalid grpc option value/,
		'GRPC Options tests: invalid grpc option value.'
	);

	t.doesNotThrow(
		function () {
			remote = new Remote(url, {pem: aPem, [Symbol(1)]: ''});
		},
		null,
		'GRPC Options tests: non-string option key is allowed but ignored'
	);

	opts = {pem: aPem, 'grpc-wait-for-ready-timeout': '1000'};
	t.throws(
		function () {
			url = 'grpcs://' + aHostname + ':aport';
			remote = new Remote(url, opts);
		},
		/^Error: Expect an integer value of grpc-wait-for-ready-timeout, found string/,
		'Should throw error if timeout is not an integer'
	);

	opts = { pem: aPem, 'ssl-target-name-override': aHostnameOverride };
	remote = new Remote(url, opts);
	t.equal(aHostname, remote._endpoint.addr, 'GRPC Options tests: new Remote grpcs with opts created');
	t.equal(remote.toString(), ' Remote : {url:grpcs://' + aHostname + ':aport}', 'Checking that peer.toString() reports correctly');
	t.equal(remote._grpc_wait_for_ready_timeout, 3000, 'Remote should have grpc waitForReady timeout default to 3000');

	url = 'grpc://' + aHostname + ':aport';
	opts = null;
	remote = new Remote(url, opts);
	t.equal(aHostname, remote._endpoint.addr, 'GRPC Options tests: new Remote grpc with opts = null _endpoint.addr created');
	t.ok(remote._endpoint.creds, 'GRPC Options tests: new Remote grpc with opts = null _endpoint.creds created');

	opts = {
		pem: aPem,
		'grpc.dummy_property': 'some_value',
		'ssl-target-name-override': aHostnameOverride,
		'grpc-wait-for-ready-timeout': 500
	};
	remote = new Remote(url, opts);
	t.equal(aHostnameOverride, remote._options['grpc.ssl_target_name_override'], 'GRPC Options tests: new Remote grpc with opts ssl-target-name-override created');
	t.ok(remote._endpoint.creds, 'GRPC Options tests: new Remote grpc with opts _endpoint.creds created');
	t.equal('some_value', remote._options['grpc.dummy_property'], 'GRPC options tests: pass-through option properties');
	t.equal(remote.getUrl(), url, 'checking that getURL works');
	t.equal(remote._grpc_wait_for_ready_timeout, 500, 'Remote should have grpc waitForReady timeout equals 500');

	console.log('\n * PEER *');
	//Peer: secure grpcs, requires opts.pem
	url = 'grpcs://' + aHostname + ':aport';
	opts = { pem: aPem };
	var peer = null;
	t.doesNotThrow(
		function () {
			peer = new Peer(url, opts);
		},
		null,
		'Check not passing any GRPC options.'
	);

	opts = { pem: aPem, 'ssl-target-name-override': aHostnameOverride };
	peer = new Peer(url, opts);
	t.equal(aHostname, peer._endpoint.addr, 'GRPC Options tests: new Peer grpcs with opts created');
	t.equal(peer.toString(), 'Peer:{url:grpcs://' + aHostname + ':aport}', 'Checking that peer.toString() reports correctly');
	//Peer: insecure grpc, opts.pem optional
	url = 'grpc://' + aHostname + ':aport';
	opts = null;
	peer = new Peer(url, opts);
	t.equal(aHostname, peer._endpoint.addr, 'GRPC Options tests: new Peer grpc with opts = null _endpoint.addr created');
	t.equal(peer._grpc_wait_for_ready_timeout, 3000, 'Peer should have _grpc_wait_for_ready_timeout equals 3000');
	t.ok(peer._endpoint.creds, 'GRPC Options tests: new Peer grpc with opts = null _endpoint.creds created');

	opts = { pem: aPem, 'ssl-target-name-override': aHostnameOverride };
	peer = new Peer(url, opts);
	t.equal(aHostname, peer._endpoint.addr, 'GRPC Options tests: new Peer grpc with opts _endpoint.addr created');
	t.ok(peer._endpoint.creds, 'GRPC Options tests: new Peer grpc with opts _endpoint.creds created');
	t.equal(peer.getUrl(), url, 'checking that getURL works');

	t.throws(
		function () {
			url = 'http://' + aHostname + ':aport';
			peer = new Peer(url, opts);
		},
		/^InvalidProtocol: Invalid protocol: http./,
		'GRPC Options tests: new Peer http should throw ' +
		'InvalidProtocol: Invalid protocol: http. URLs must begin with grpc:// or grpcs://.'
	);

	opts = {};
	t.throws(
		function () {
			url = 'grpcs://' + aHostname + ':aport';
			peer = new Peer(url, opts);
		},
		/^Error: PEM encoded certificate is required./,
		'GRPCS Options tests: new Peer http should throw ' +
		'PEM encoded certificate is required.'
	);

	t.throws(
		function () {
			url = 'grpcs://' + aHostname + ':aport';
			peer = new Peer(url);
		},
		/^Error: PEM encoded certificate is required./,
		'GRPCS Options tests: new Peer http should throw ' +
		'PEM encoded certificate is required.'
	);

	opts = {pem: aPem, clientKey: aPem, clientCert: aPem};
	t.doesNotThrow(
		function () {
			url = 'grpcs://' + aHostname + ':aport';
			peer = new Peer(url, opts);
		},
		null,
		'Pass valid client certificate options.'
	);

	opts = {pem: aPem, clientKey: aPem};
	t.throws(
		function () {
			url = 'grpcs://' + aHostname + ':aport';
			peer = new Peer(url, opts);
		},
		/^Error: clientKey and clientCert are both required./,
		'GRPCS Options tests: new Peer should throw ' +
		'clientKey and clientCert are both required.'
	);

	opts = {pem: aPem, clientCert: aPem};
	t.throws(
		function () {
			url = 'grpcs://' + aHostname + ':aport';
			peer = new Peer(url, opts);
		},
		/^Error: clientKey and clientCert are both required./,
		'GRPCS Options tests: new Peer should throw ' +
		'clientKey and clientCert are both required.'
	);

	console.log('\n * ORDERER *');
	//Peer: secure grpcs, requires opts.pem
	var url = 'grpcs://' + aHostname + ':aport';
	var opts = { pem: aPem };
	var orderer = null;
	t.doesNotThrow(
		function () {
			orderer = new Orderer(url, opts);
		},
		null,
		'Check not passing any GRPC options.'
	);

	opts = { pem: aPem, 'ssl-target-name-override': aHostnameOverride };
	orderer = new Orderer(url, opts);
	t.equal(aHostname, orderer._endpoint.addr, 'GRPC Options tests: new Orderer grpcs with opts created');
	t.equal(orderer.toString(), 'Orderer:{url:grpcs://' + aHostname + ':aport}', 'Checking that orderer.toString() reports correctly');
	t.equal(orderer._grpc_wait_for_ready_timeout, 3000, 'orderer should have _grpc_wait_for_ready_timeout equals 3000');

	//Orderer: insecure grpc, opts.pem optional
	url = 'grpc://' + aHostname + ':aport';
	opts = null;
	orderer = new Orderer(url, opts);
	t.equal(aHostname, orderer._endpoint.addr, 'GRPC Options tests: new Orederer grpc with opts = null _endpoint.addr created');
	t.ok(orderer._endpoint.creds, 'GRPC Options tests: new Orderer grpc with opts = null _endpoint.creds created');

	opts = { pem: aPem, 'ssl-target-name-override': aHostnameOverride };
	orderer = new Orderer(url, opts);
	t.equal(aHostname, orderer._endpoint.addr, 'GRPC Options tests: new Orederer grpc with opts _endpoint.addr created');
	t.ok(orderer._endpoint.creds, 'GRPC Options tests: new Orderer grpc with opts _endpoint.creds created');

	opts = { pem: aPem, 'request-timeout': 2000 };
	orderer = new Orderer(url, opts);
	t.equals(orderer._request_timeout, 2000, 'checking that the request timeout was set using the passed in value');

	t.throws(
		function () {
			url = 'http://' + aHostname + ':aport';
			orderer = new Orderer(url, opts);
		},
		/^InvalidProtocol: Invalid protocol: http./,
		'GRPC Options tests: new Orderer should throw ' +
		'InvalidProtocol: Invalid protocol: http. URLs must begin with grpc:// or grpcs://.'
	);

	opts = {};
	t.throws(
		function () {
			url = 'grpcs://' + aHostname + ':aport';
			orderer = new Orderer(url, opts);
		},
		/^Error: PEM encoded certificate is required./,
		'GRPCS Options tests: new Orderer should throw ' +
		'PEM encoded certificate is required.'
	);

	t.throws(
		function () {
			url = 'grpcs://' + aHostname + ':aport';
			orderer = new Orderer(url);
		},
		/^Error: PEM encoded certificate is required./,
		'GRPCS Options tests: new Orderer should throw ' +
		'PEM encoded certificate is required.'
	);

	opts = {pem: aPem, clientKey: aPem, clientCert: aPem};
	t.doesNotThrow(
		function () {
			url = 'grpcs://' + aHostname + ':aport';
			orderer = new Orderer(url, opts);
		},
		null,
		'Pass valid client certificate options.'
	);

	opts = {pem: aPem, clientKey: aPem};
	t.throws(
		function () {
			url = 'grpcs://' + aHostname + ':aport';
			orderer = new Orderer(url, opts);
		},
		/^Error: clientKey and clientCert are both required./,
		'GRPCS Options tests: new Orderer should throw ' +
		'clientKey and clientCert are both required.'
	);

	opts = {pem: aPem, clientCert: aPem};
	t.throws(
		function () {
			url = 'grpcs://' + aHostname + ':aport';
			orderer = new Orderer(url, opts);
		},
		/^Error: clientKey and clientCert are both required./,
		'GRPCS Options tests: new Orderer should throw ' +
		'clientKey and clientCert are both required.'
	);

	require('fabric-client/lib/Client.js');
	t.equal(process.env.GRPC_SSL_CIPHER_SUITES, defaultCiphers, 'Test default ssl cipher suites are properly set');

	utils.setConfigSetting('grpc-ssl-cipher-suites', 'HIGH+ECDSA');
	delete require.cache[require.resolve('fabric-client/lib/Client.js')];
	require('fabric-client/lib/Client.js');
	t.equal(process.env.GRPC_SSL_CIPHER_SUITES, 'HIGH+ECDSA', 'Test overriden cipher suites');

	t.end();
});

test('Orderer clientCert test', function(t) {
	var orderer = new Orderer('grpc://127.0.0.1:5005', {clientCert: aPem});

	t.equals(orderer.getClientCertHash().toString('hex'), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'checking the default client certificate hash');

	t.end();
});
