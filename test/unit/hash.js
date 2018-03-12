const tape = require('tape');
const _test = require('tape-promise');
const test = _test(tape);

const {hash_sha3_256,hash_sha3_384,hash_sha2_256} = require('../../fabric-client/lib/hash');
test('hash_sha3_256', function (t) {
	const sha3_256 = new hash_sha3_256();
	t.comment(sha3_256._hash);
	t.end();
});
test('hash_sha3_384', function (t) {
	const sha3_384 = new hash_sha3_384();
	t.comment(sha3_384._hash);
	t.end();
});
test('hash_sha2_256', function (t) {
	const sha2_256 = new hash_sha2_256();
	t.comment(sha2_256.finalize());
	t.end();
});