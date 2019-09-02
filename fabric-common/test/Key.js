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



const Key = require('../lib/Key');

const chai = require('chai');
const should = chai.should();

describe('Key', () => {
	let key;

	beforeEach(() => {
		key = new Key();
	});

	describe('#getSKI', () => {
		it('should return undefined', () => {
			should.equal(key.getSKI(), undefined);
		});
	});

	describe('#isSymmetric', () => {
		it('should return undefined', () => {
			should.equal(key.isSymmetric(), undefined);
		});
	});

	describe('#isPrivate', () => {
		it('should return undefined', () => {
			should.equal(key.isPrivate(), undefined);
		});
	});

	describe('#getPublicKey', () => {
		it('should return undefined', () => {
			should.equal(key.getPublicKey(), undefined);
		});
	});

	describe('#toBytes', () => {
		it('should return undefined', () => {
			should.equal(key.toBytes(), undefined);
		});
	});
});
