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
const chai = require('chai');
chai.use(require('chai-as-promised'));

const Wallet = require('../../lib/api/wallet');


describe('Wallet', () => {
	const wallet = new Wallet();

	it('throws exception calling setUserContext()', () => {
		return wallet.setUserContext(null, null).should.be.rejectedWith('Not implemented');
	});

	it('throws exception calling configureClientStores()', () => {
		return wallet.configureClientStores(null, null).should.be.rejectedWith('Not implemented');
	});

	it('throws exception calling import()', () => {
		return wallet.import(null, null).should.be.rejectedWith('Not implemented');
	});

	it('throws exception calling export()', () => {
		return wallet.export(null).should.be.rejectedWith('Not implemented');
	});

	it('throws exception calling list()', () => {
		return wallet.list().should.be.rejectedWith('Not implemented');
	});

	it('throws exception calling delete()', () => {
		return wallet.delete(null).should.be.rejectedWith('Not implemented');
	});

	it('throws exception calling exists()', () => {
		return wallet.exists(null).should.be.rejectedWith('Not implemented');
	});


});