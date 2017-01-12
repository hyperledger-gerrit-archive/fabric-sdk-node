('./bccsp_pkcs11.js');

var crypto = require('crypto');
var util = require('util');
var utils = require('../utils.js');

var cryptoSuite = require(utils.getConfigSetting('crypto-suite'));
/*
 * Crypto card.
 */
var cryptoUtils = new cryptoSuite(256,
				  { lib: '/usr/lib/libacsp-pkcs11.so',
				    slot: 2,
				    pin: '98765432' });
/*
 * SoftHSMv2
 */
/*
  var cryptoUtils = new cryptoSuite(256,
  { lib: '/usr/local/lib/softhsm/libsofthsm2.so',
  slot: 0,
  pin: '654321' });
*/

/*
 * Test generate AES key, encrypt, and decrypt.
 */
cryptoUtils.generateKey({ algorithm: 'AES', ephemeral: true })
	.then(function(key) {
		console.log(' #1 --- AES generated key: ' +
			    util.inspect(key, { depth: null }));
		var ski = key.getSKI();
		console.log(' #1 --- AES ski[' + ski.length + ']: ' + ski.toString('hex'));
		console.log(' #1 --- AES looked up key: ' +
			    util.inspect(cryptoUtils.getKey(ski), { depth:null }));
		/*
		 * Encrypt a message.
		 */
		var cipherText = cryptoUtils.encrypt(key, Buffer.from('Hello World!!'), {});
		console.log(' #1 --- AES cipher text[' + cipherText.length + ']: ' +
			    cipherText.toString('hex'));
		return { key, cipherText };
	})
	.then(function(param) {
		/*
		 * Decrypt a message.
		 */
		var plainText = cryptoUtils.decrypt(param.key, param.cipherText, {});
		console.log(' #1 --- AES plain text[' + plainText.length + ']: '+
			    plainText.toString());
	})
	.catch(function(e) {
		console.log(e);
	});

/*
 *  Test encrypt and decrypt with non-ephemeral AES key in the crypto card.
 */
cryptoUtils.getKey(Buffer.from('7acff94187a4bbdf89b670c366bbfe2e0522856e0e86d0890daac3f8e3b96182', 'hex'))
	.then(function(key) {
		console.log(' #2 --- AES looked up key: ' +
			    util.inspect(key, { depth: null }));
		/*
		 * Encrypt a message.
		 */
		var cipherText = cryptoUtils.encrypt(key, Buffer.from('Hello World!!'), {});
		console.log(' #2 --- AES cipher text[' + cipherText.length + ']: ' +
			    cipherText.toString('hex'));
		return { key, cipherText };
	})
	.then(function(param) {
		/*
		 * Decrypt a message.
		 */
		var plainText = cryptoUtils.decrypt(param.key, param.cipherText, {});
		console.log(' #2 --- AES plain text[' + plainText.length + ']: '+
			    plainText.toString());
	})
	.catch(function(e) {
		console.log(e);
	});

/*
 * Test import an AES key into the crypto card. Note this needs some policy to be
 * enabled. SoftHSMv2 default configuration doesn't allow this.
 */
cryptoUtils.importKey(Buffer.from('7430b92d84e1e3da82c06aff0801aa45f4a429e73f59bfc5141e205617a30387', 'hex'), { algorithm: 'AES' })
	.then(function(key) {
		/*
		 * Note cipher text has 16-byte IV prepended.
		 */
		var cipherText = cryptoUtils.encrypt(key, Buffer.from('Hello World!!'), {});
		console.log(' #3 --- PKCS11 cipher text[' + cipherText.length + ']: ' +
			    cipherText.toString('hex'));
		return { key, cipherText };
	})
	.then(function(param) {
		/*
		 * Encrypt with software crypto, should get back same bytes
		 * (minus 16-byte IV).
		 */
		var cipher = crypto.createCipheriv(
			'aes256', Buffer.from('7430b92d84e1e3da82c06aff0801aa45f4a429e73f59bfc5141e205617a30387', 'hex'), param.cipherText.slice(0,16));
		var cipherText = cipher.update(Buffer.from('Hello World!!'));
		cipherText = Buffer.concat([cipherText, cipher.final()]);
		console.log(' #3 --- CRYPTO cipher text[' + cipherText.length + ']: ' +
			    cipherText.toString('hex'));
		/*
		 * Decrypt with software crypto, should get back same plaintext.
		 */
		var decipher = crypto.createDecipheriv(
			'aes256', Buffer.from('7430b92d84e1e3da82c06aff0801aa45f4a429e73f59bfc5141e205617a30387', 'hex'), param.cipherText.slice(0,16));
		var plainText = decipher.update(
			param.cipherText.slice(16, param.cipherText.length));
		plainText = Buffer.concat([plainText, decipher.final()]);
		console.log(' #3 --- CRYPTO plain text[' + plainText.length + ']: ' +
			    plainText.toString());
	})
	.catch(function(e) {
		console.log(e);
	});

/*
 * Test generate ECDSA key pair, sign, and verify.
 */
cryptoUtils.generateKey({ algorithm: 'ECDSA', ephemeral: true })
	.then(function(key) {
		console.log(' #4 --- ECDSA generated key: ' +
			    util.inspect(key, { depth: null }));
		var ski = key.getSKI();
		console.log(' #4 --- ECDSA ski[' + ski.length + ']: ' +
			    ski.toString('hex'));
		console.log(' #4 --- ECDSA looked up key: ' +
			    util.inspect(cryptoUtils.getKey(ski), { depth:null }));
		/*
		 * Sign a message.
		 */
		var sig = cryptoUtils.sign(key, Buffer.from('Hello World!'), null);
		console.log(' #4 --- ECDSA signature[' + sig.length + ']: ' +
			    sig.toString('hex'));
		return { key, sig };
	})
	.then(function(param) {
		/*
		 * Verify signature.
		 */
		var v = cryptoUtils.verify(param.key, param.sig,
					   Buffer.from('Hello World!'));
		console.log(' #4 --- ECDSA signature verify: ' + v);
	})
	.catch(function(e) {
		console.log(e);
	});

/*
 * Test sign and verify with non-ephemeral ECDSA key pair in the crypto card.
 */
cryptoUtils.getKey(Buffer.from('88ee070ac9f2dec7f77ccb64ecf3d58754e05b297ceb7814569f585ef5fa252d', 'hex'))
	.then(function(key) {
		console.log(' #5 --- ECDSA looked up key: '+
			    util.inspect(key, { depth: null }));
		/*
		 * Sign a message.
		 */
		var sig = cryptoUtils.sign(key, Buffer.from('Hello World!'), null);
		console.log(' #5 --- ECDSA signature[' + sig.length + ']: ' +
			    sig.toString('hex'));
		return { key, sig };
	})
	.then(function(param) {
		/*
		 * Verify signature.
		 */
		var v = cryptoUtils.verify(param.key, param.sig,
					   Buffer.from('Hello World!'));
		console.log(' #5 --- ECDSA signature verify: ' + v);
	})
	.catch(function(e) {
		console.log(e);
	});
