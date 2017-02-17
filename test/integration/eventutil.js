/*
 Copyright 2017 London Stock Exchange All Rights Reserved.

 Licensed under the Apache License, Version 2.0 (the 'License');
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

                http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an 'AS IS' BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

'use strict';

var utils = require('fabric-client/lib/utils.js');

module.exports.registerTxEvent = function(eh, txid, timeout) {
	return new Promise((resolve, reject) => {
		var handle = setTimeout(() => {
			eventhub.unregisterTxEvent(txid);
			reject('timeout');
		}, timeout);

		eh.registerTxEvent(txid, (txid, invalid) => {
			if (invalid) {
				reject('invalid');
			} else {
				resolve();
			}
			clearTimeout(handle);
			eh.unregisterTxEvent(txid);
		});
	});
};

module.exports.registerCCEvent = function(eh, ccid, enregex, timeout) {
	return new Promise((resolve, reject) => {
		var regid = null;
		var handle = setTimeout(() => {
			reject();
			if (regid) {
				eh.unregisterChaincodeEvent(regid);
			}
		}, timeout);

		regid = eh.registerChaincodeEvent(ccid, enregex, (event) => {
			resolve();
			clearTimeout(handle);
			eh.unregisterChaincodeEvent(regid);
		});
	});
};

module.exports.createRequest = function(chaincode_id, chain_id, fcn, args) {
	var tx_id = utils.buildTransactionID({
		length: 12
	});
	var nonce = utils.getNonce();
	var request = {
		chaincodeId: chaincode_id,
		fcn: fcn,
		args: args,
		chainId: chain_id,
		txId: tx_id.toString(),
		nonce: nonce
	};
	return request;
};

module.exports.sendTransaction = function(chain, results) {
	var proposalResponses = results[0];
	var proposal = results[1];
	var header = results[2];
	var all_good = true;

	for (var i in proposalResponses) {
		let one_good = false;

		if (proposalResponses &&
			proposalResponses[0].response &&
			proposalResponses[0].response.status === 200) {

			one_good = true;
		}
		all_good = all_good & one_good;
	}

	if (all_good) {
		var request = {
			proposalResponses: proposalResponses,
			proposal: proposal,
			header: header
		};
		return chain.sendTransaction(request);
	} else {
		return Promise.reject('bad result:' + results);
	}
};
