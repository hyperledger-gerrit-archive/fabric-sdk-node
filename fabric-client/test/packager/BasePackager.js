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



const rewire = require('rewire');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
const sinon = require('sinon');
const should = chai.should();

describe('BasePackager', () => {
	const BasePackager = rewire('../../lib/packager/BasePackager');

	let revert;
	let sandbox;
	let FakeLogger;
	let ValidChild;

	beforeEach(() => {
		revert = [];
		sandbox = sinon.createSandbox();
		ValidChild = class extends BasePackager {
			// no implementations
		};
		FakeLogger = {
			error: () => {},
			debug: () => {}
		};
		sinon.stub(FakeLogger);
		revert.push(BasePackager.__set__('logger', FakeLogger));
	});

	afterEach(() => {
		if (revert.length) {
			revert.forEach(Function.prototype.call, Function.prototype.call);
		}
		sandbox.restore();
	});

	describe('#constructor', () => {
		it('should throw if instance created', () => {
			(() => {
				new BasePackager();
			}).should.throw(TypeError, 'Can not construct abstract class.');
		});

		// it ('should throw an error if package is not overridden', () => {
		// 	Child.prototype.constructor = function() {};
		// 	(() => {
		// 		new Child();
		// 	}).should.throw(TypeError, 'Please implement method package from child class');
		// });
	});

	describe('#package', () => {
		it('should throw an implement Error', async () => {
			const packager = new ValidChild();

			try {
				await packager.package();
			} catch (err) {
				err.message.should.equal('Please implement method package from child class');
			}
		});

		it('should throw an implement Error', async () => {
			const packager = new ValidChild();

			try {
				await packager.package('some parm');
			} catch (err) {
				err.message.should.equal('Please implement method package from child class');
			}
		});
	});

	describe('#finalPackage', () => {
		it('should throw an implement Error', async () => {
			const packager = new ValidChild();

			try {
				await packager.finalPackage();
			} catch (err) {
				err.message.should.equal('Please implement method finalPackage from child class');
			}
		});

		it('should throw an implement Error', async () => {
			const packager = new ValidChild();

			try {
				await packager.finalPackage('some parm');
			} catch (err) {
				err.message.should.equal('Please implement method finalPackage from child class');
			}
		});
	});

	describe('#findSource', () => {
		it('should throw an error', () => {
			const packager = new ValidChild();
			(() => {
				packager.findSource();
			}).should.throw(Error, 'abstract function called');
		});

		it('should throw an error', () => {
			const packager = new ValidChild();
			(() => {
				packager.findSource('filepath');
			}).should.throw(Error, 'abstract function called');
		});
	});

	describe('#findMetadataDescriptors', () => {
		let onStub;
		let klawStub;
		let isMetadataStub;
		let isFileStub;
		let packager;
		beforeEach(() => {
			isMetadataStub = sandbox.stub();
			isFileStub = sandbox.stub();
			onStub = sandbox.stub();
			onStub.returns({on: onStub});
			klawStub = sandbox.stub().returns({on: onStub});
			revert.push(BasePackager.__set__('klaw', klawStub));
			packager = new ValidChild();
			packager.isMetadata = isMetadataStub;
		});

		it('should throw an error and log', async() => {
			onStub.withArgs('error').yields(new Error(), {item: 'item'});
			try {
				await packager.findMetadataDescriptors('path');
				should.fail();
			} catch (err) {
				err.should.be.instanceof(Error);
				sinon.assert.calledWith(FakeLogger.error, 'error while packaging item %j :: %s');
			}
		});

		it('should resolve after recieving data and end being called when entry is a file and contains metadata', async() => {
			isFileStub.returns(true);
			isMetadataStub.returns(true);
			onStub.withArgs('data').yields({stats: {isFile: isFileStub}, path: 'path'}).returns({on: onStub});
			onStub.withArgs('end').yields();
			const descriptors = await packager.findMetadataDescriptors('path');
			sinon.assert.called(isFileStub);
			sinon.assert.calledWith(isMetadataStub, 'path');
			sinon.assert.calledWith(FakeLogger.debug, ' findMetadataDescriptors  :: %j', {name: 'META-INF', fqp: 'path'});
			descriptors.should.deep.equal([{name: 'META-INF', fqp: 'path'}]);
		});

		it('should resolve after recieving data that isnt a file', async() => {
			isFileStub.returns();
			isMetadataStub.returns(true);
			onStub.withArgs('data').yields({stats: {isFile: isFileStub}, path: 'path'}).returns({on: onStub});
			onStub.withArgs('end').yields();
			const descriptors = await packager.findMetadataDescriptors('path');
			sinon.assert.called(isFileStub);
			descriptors.should.deep.equal([]);
		});
	});

	describe('#isMetadata', () => {
		it('should return true if the file is a json file', () => {
			const packager = new ValidChild();
			packager.isMetadata('file.json').should.be.true;
		});

		it('should return false if the file is not a json file', () => {
			const packager = new ValidChild();
			packager.isMetadata('file.yaml').should.be.false;
		});
	});

	describe('#isSource', () => {

		it('should return true if the file format is in keep', () => {
			const packager = new ValidChild();
			packager.keep = ['.json', '.yaml'];
			packager.isSource('file.json').should.be.true;
			packager.isSource('file.yaml').should.be.true;
		});

		it('should return false if the file format is in keep', () => {
			const packager = new ValidChild();
			packager.keep = ['.json', '.yaml'];
			packager.isMetadata('file.js').should.be.false;
			packager.isMetadata('file.py').should.be.false;
		});
	});

	describe('#packFileEntry', () => {
		let packager;
		let readFileSyncStub;
		let entryStub;
		beforeEach(() => {
			entryStub = sandbox.stub();
			readFileSyncStub = sandbox.stub();
			revert.push(BasePackager.__set__('fs.readFileSync', readFileSyncStub));

			packager = new ValidChild();
		});

		it('should throw an error if fs reads nothing', async() => {
			readFileSyncStub.returns(null);
			try {
				await packager.packFileEntry({}, {fqp: 'file-name'});
				should.fail();
			} catch (err) {
				err.should.be.instanceof(Error);
				err.message.should.equal('failed to read file-name');
			}
		});

		it('should reject with error if pack.entry callback has an error', async() => {
			readFileSyncStub.returns({length: 10});
			entryStub.yields(new Error('Entry error'));
			try {
				await packager.packFileEntry({entry: entryStub}, {fqp: 'file-name'});
				should.fail();
			} catch (err) {
				err.should.be.instanceof(Error);
				err.message.should.equal('Entry error');
			}
		});

		it('should resolve with true if pack.entry callback does not have an error', async() => {
			readFileSyncStub.returns({length: 10});
			entryStub.yields();
			const result = await packager.packFileEntry({entry: entryStub}, {fqp: 'file-name', name: 'name'});
			const header = {
				name: 'name',
				size: 10,
				mode: 0o100644,
				atime: new Date(0),
				mtime: new Date(0),
				ctime: new Date(0),
			};
			sinon.assert.calledWithMatch(entryStub, header, {length: 10}, Function);
			result.should.be.true;
		});
	});

	describe('#packMemoryEntry', () => {
		let packager;
		let entryStub;
		beforeEach(() => {
			entryStub = sandbox.stub();
			packager = new ValidChild();
		});

		it('should throw an error if bytes are null', async() => {
			try {
				await packager.packMemoryEntry({}, {bytes: null});
				should.fail();
			} catch (err) {
				err.should.be.instanceof(Error);
				err.message.should.equal('Missing content');
			}
		});

		it('should resolve with true if pack.entry callback does not have an error', async() => {
			entryStub.yields();
			const result = await packager.packMemoryEntry({entry: entryStub}, {bytes: Buffer.from('abc'), name: 'name'});
			const header = {
				name: 'name',
				size: 3,
				mode: 0o100644,
				atime: new Date(0),
				mtime: new Date(0),
				ctime: new Date(0),
			};
			sinon.assert.calledWithMatch(entryStub, header, {length: 3}, Function);
			result.should.be.true;
		});
	});

	describe('#generateTarGz', () => {
		let tarStub;
		let zlibStub;

		let onStub;
		let pipeStub;
		let createGzipStub;
		let packStub;
		let packFileEntryStub;
		let packMemoryEntryStub;
		let finalizeStub;

		let packager;
		beforeEach(() => {
			onStub = sandbox.stub();
			onStub.returns({on: onStub});
			pipeStub = sandbox.stub();
			pipeStub.returns({on: onStub, pipe: pipeStub});
			createGzipStub = sandbox.stub();
			finalizeStub = sandbox.stub();
			packStub = sandbox.stub().returns({pipe: pipeStub, finalize: finalizeStub});
			tarStub = {pack: packStub};
			revert.push(BasePackager.__set__('tar', tarStub));
			zlibStub = {createGzip: createGzipStub};
			revert.push(BasePackager.__set__('zlib', zlibStub));
			packFileEntryStub = sandbox.stub();
			packMemoryEntryStub = sandbox.stub();
			packager = new ValidChild();
			packager.packFileEntry = packFileEntryStub;
			packager.packMemoryEntry = packMemoryEntryStub;
		});

		it('should reject with error if on error is called', async() => {
			onStub.withArgs('error').yields(new Error());
			createGzipStub.returns('create-gzip');
			try {
				await packager.generateTarGz([], 'dest');
				should.fail();
			} catch (e) {
				e.should.be.instanceof(Error);
			}
			sinon.assert.calledWith(pipeStub, 'dest');
			sinon.assert.calledWith(pipeStub, 'create-gzip');
		});

		it('should resolve with true', async() => {
			onStub.withArgs('finish').yields();
			const result = await packager.generateTarGz();
			result.should.be.true;
		});

		it('should throw an error if a task promise is rejected', async() => {
			packFileEntryStub.onCall(0).resolves();
			packFileEntryStub.onCall(1).rejects();
			try {
				await packager.generateTarGz(['desc1', 'desc2'], 'dest');
				should.fail();
			} catch (e) {
				e.should.be.instanceof(Error);
			}
		});

		it('should resolve all pack file promises and call finalize', (done) => {
			finalizeStub.callsFake(done);
			packFileEntryStub.resolves();
			packager.generateTarGz(['desc1'], 'dest')
				.then(() => {
					sinon.assert.called(finalizeStub);
				});
		});

		it('should resolve all pack memory promises and call finalize', (done) => {
			finalizeStub.callsFake(done);
			packMemoryEntryStub.resolves();
			packager.generateTarGz([{bytes:'desc1'}], 'dest')
				.then(() => {
					sinon.assert.called(finalizeStub);
				});
		});
	});
});
