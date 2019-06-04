/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */


'use strict';

const Long = require('long');
const fabprotos = require('fabric-protos');

/*
 * Used on a method's parameter to throw an error when
 * the value is missing.
 */
module.exports.checkParameter = (name) => {
	throw Error(`Missing ${name} parameter`);
};

/*
 * Converts to a Long number
 * Returns a null if the incoming value is not a string that represents a
 * number or an actual javascript number. Also allows for a Long object to be
 * passed in as the value to convert
 */
module.exports.convertToLong = (value, throwError = true) => {
	let result = null;
	if (Long.isLong(value)) {
		result = value; // already a long
	} else if (typeof value !== 'undefined' && value !== null) {
		result = Long.fromValue(value);
		// Long will return a zero for invalid strings so make sure we did
		// not get a real zero as the incoming value
		if (result.equals(Long.ZERO)) {
			if (Number.isInteger(value) || value === '0') {
				// all good
			} else {
				// anything else must be a string that is not a valid number
				throw new Error(`value:${value} is not a valid number `);
			}
		}
	} else {
		if (throwError) {
			module.exports.checkParameter('value');
		}
	}

	return result;
};

/*
 * This function will build the common header
 */
module.exports.buildHeader = (nonce, channelHeader) => {
	const signatureHeader = new fabprotos.common.SignatureHeader();
	signatureHeader.setCreator(txContext.serializeIdentity());
	signatureHeader.setNonce(nonce);

	const header = new fabprotos.common.Header();
	header.setSignatureHeader(signatureHeader.toBuffer());
	header.setChannelHeader(channelHeader.toBuffer());

	return header;
};

/*
 * randomizes the input array
 */
module.exports.randomize = (items) => {
	for (let i = items.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[items[i], items[j]] = [items[j], items[i]];
	}
};