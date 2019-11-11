/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const sinon = require('sinon');
const rewire = require('rewire');
const chai = require('chai');
const should = chai.should();
chai.use(require('chai-as-promised'));

import { Client, User } from 'fabric-common';
import { FabricAdmin } from '../lib/fabricadmin';

describe('FabricAdmin', () => {
	let mockClient: Client;
	let mockUser: User;

	beforeEach(async () => {
		mockClient = sinon.createStubInstance(Client);
		mockUser = sinon.createStubInstance(User);
	});

	afterEach(() => {
		sinon.restore();
	});

	describe('#constructor', () => {
		it('should create', () => {
			const fabricAdmin: FabricAdmin = new FabricAdmin(mockClient, mockUser);
		});
	});

});
