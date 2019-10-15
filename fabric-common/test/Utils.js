/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
'use strict';

const {Utils} = require('..');
const path = require('path');
const CryptoSuite_ECDSA_AES = require('../lib/impl/CryptoSuite_ECDSA_AES');
const testUtils = require('./TestUtils');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinonChai = require('sinon-chai');
const tmp = require('tmp');
const fs = require('fs-extra');
const winston = require('winston');

const should = chai.should();
chai.use(chaiAsPromised);
chai.use(sinonChai);

describe('Utils', () => {

	describe('#newCryptoSuite', () => {

		beforeEach(() => {
			testUtils.setCryptoConfigSettings();
		});

		it('should return a default instance of CryptoSuite_ECDSA_AES with the correct properties', () => {
			const defaultCryptoSuite = Utils.newCryptoSuite();
			defaultCryptoSuite.should.be.an.instanceOf(CryptoSuite_ECDSA_AES);
			defaultCryptoSuite._keySize.should.equal(256);
			should.exist(defaultCryptoSuite._ecdsaCurve);
			should.exist(defaultCryptoSuite._ecdsa);
		});

		it('should return an instance of CryptoSuite_ECDSA_AES with the correct keysize', () => {
			const cryptoSuite = Utils.newCryptoSuite({keysize: 384, algorithm: 'EC'});
			cryptoSuite.should.be.an.instanceOf(CryptoSuite_ECDSA_AES);
			cryptoSuite._keySize.should.equal(384);
		});

		it('should return an instance of CryptoSuite_ECDSA_AES with the correct keysize', () => {
			const cryptoSuite = Utils.newCryptoSuite({keysize: 384});
			cryptoSuite.should.be.an.instanceOf(CryptoSuite_ECDSA_AES);
			cryptoSuite._keySize.should.equal(384);
		});

		it('should return an instance of CryptoSuite_ECDSA_AES with the default keysize', () => {
			const cryptoSuite = Utils.newCryptoSuite({algorithm: 'EC'});
			cryptoSuite.should.be.an.instanceOf(CryptoSuite_ECDSA_AES);
			cryptoSuite._keySize.should.equal(256);
		});

		it('should throw an error when an illegal key size is given', () => {
			(() => {
				Utils.newCryptoSuite({keysize: 123});
			}).should.throw(/Illegal key size/);
		});

		it('should throw an error when using HSM and a fake library path', () => {
			Utils.setConfigSetting('crypto-hsm', true);
			Utils.setConfigSetting('crypto-suite-hsm', {'EC': 'fabric-common/lib/impl/bccsp_pkcs11.js'});
			const fakePath = path.join('some', 'fake', 'path');
			(() => {
				Utils.newCryptoSuite({lib: fakePath, slot: 0, pin: '1234'});
			}).should.throw(fakePath);
		});
		it('should throw an error when using HSM and no library path is given', () => {
			Utils.setConfigSetting('crypto-hsm', true);
			Utils.setConfigSetting('crypto-suite-hsm', {'EC': 'fabric-common/lib/impl/bccsp_pkcs11.js'});
			(() => {
				Utils.newCryptoSuite({keysize: 384, algorithm: 'EC'});
			}).should.throw(/PKCS11 library path must be specified/);
		});

		it('should throw an error when an illegal hashing algorithm has been set', () => {
			Utils.setConfigSetting('crypto-hash-algo', 19745);
			(() => {
				Utils.newCryptoSuite({});
			}).should.throw(/Unsupported hash algorithm/);
		});

		it('should throw an error when an unsupported hashing algorithm has been set', () => {
			Utils.setConfigSetting('crypto-hash-algo', '12345');
			(() => {
				Utils.newCryptoSuite({});
			}).should.throw(/Unsupported hash algorithm and key size pair/);
		});

		it('should throw an error when an incorrect hashing algorithm is specified', () => {
			(() => {
				Utils.newCryptoSuite({algorithm: 'cake'});
			}).should.throw(/Desired CryptoSuite module not found supporting algorithm/);
		});

	});

	describe('getLogger', () => {

		it('should return a default winston logger', () => {
			const logger = Utils.getLogger('testLogger');

			logger.transports.should.be.an.instanceOf(Object);
			logger.transports.console.should.be.an.instanceOf(winston.transports.Console);
			logger.transports.console.exceptionsLevel.should.equal('error');
			logger.level.should.equal('info');
		});

		it('should return a default logger if the settings are defined incorrectly', () => {
			testUtils.setHFCLogging("{'debug': 'console'}"); // eslint-disable-line quotes

			const logger = Utils.getLogger('testLogger');
			logger.transports.console.should.be.an.instanceOf(winston.transports.Console);
			logger.transports.console.exceptionsLevel.should.equal('error');
			logger.level.should.equal('info');
		});

		it('should return a default logger if the settings are defined illegally', () => {
			testUtils.setHFCLogging(5435453);

			const logger = Utils.getLogger('testLogger');
			logger.transports.console.should.be.an.instanceOf(winston.transports.Console);
			logger.transports.console.exceptionsLevel.should.equal('error');
			logger.level.should.equal('info');
		});

		describe('log to a file', async () => {
			let debugFilePath;
			let errorFilePath;
			let dir;

			before(async () => {
				// create a temp file
				dir = tmp.dirSync();
				debugFilePath  = path.join(dir.name, 'debug.log');
				errorFilePath = path.join(dir.name, 'error.log');
				await fs.ensureFile(debugFilePath);
				await fs.ensureFile(errorFilePath);
			});

			it('should write to a log file with the correct logging level', async () => {
				testUtils.setHFCLogging(`{"debug": "${debugFilePath}", "error": "${errorFilePath}"}`);

				const loggerName = 'fileLogger';
				const logger = Utils.getLogger(loggerName);
				logger.transports.should.be.an.instanceOf(Object);
				logger.transports.debugfile.should.be.an.instanceOf(winston.transports.File);
				logger.transports.debugfile.dirname.should.equal(dir.name);
				logger.transports.errorfile.should.be.an.instanceOf(winston.transports.File);
				logger.transports.errorfile.dirname.should.equal(dir.name);

				// Log to the file
				logger.error('Test logger - error');
				logger.warn('Test logger - warn');
				logger.info('Test logger - info');
				logger.debug('Test logger - debug');

				// read the debug file
				const debugData = await fs.readFile(debugFilePath);
				// debug file should contain all logging
				debugData.indexOf(`error: [${loggerName}]: Test logger - error`).should.be.greaterThan(0);
				debugData.indexOf(`warn: [${loggerName}]: Test logger - warn`).should.be.greaterThan(0);
				debugData.indexOf(`info: [${loggerName}]: Test logger - info`).should.be.greaterThan(0);
				debugData.indexOf(`debug: [${loggerName}]: Test logger - debug`).should.be.greaterThan(0);
				debugData.indexOf('Successfully constructed a winston logger with configurations').should.be.greaterThan(0);

				// read the error file
				const errorData = await fs.readFile(errorFilePath);
				// error file should only contain errors
				errorData.indexOf(`error: [${loggerName}]: Test logger - error`).should.be.greaterThan(0);
				errorData.indexOf('Test logger - warn').should.equal(-1);
				errorData.indexOf('Test logger - info').should.equal(-1);
				errorData.indexOf('Test logger - debug').should.equal(-1);
			});

			after(async () => {
				// Remove tmp dir
				await fs.remove(dir.name);
			});

		});
	});
});
