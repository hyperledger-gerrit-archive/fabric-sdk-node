/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-as-promised'));

const BaseCheckpointer = require('./../../../lib/impl/event/basecheckpointer');

describe('BaseCheckpointer', () => {
	describe('#constructor', () => {
		it('options should be undefined', () => {
			const checkpointer = new BaseCheckpointer();
			expect(checkpointer._options).to.be.undefined;
		});

		it('options should be set to an object', () => {
			const checkpointer = new BaseCheckpointer({options: 'anoption'});
			expect(checkpointer._options).to.deep.equal({options: 'anoption'});
		});
	});

	describe('#save', () => {
		it('should throw an exception', () => {
			const checkpointer = new BaseCheckpointer();
			expect(checkpointer.save()).to.be.rejectedWith('Method has not been implemented');
		});
	});

	describe('#load', () => {
		it('should throw an exception', () => {
			const checkpointer = new BaseCheckpointer();
			expect(checkpointer.load()).to.be.rejectedWith('Method has not been implemented');
		});
	});
});
