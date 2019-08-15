/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { CouchDBWalletStore } from './couchdbwalletstore';
import { FileSystemWalletStore } from './filesystemwalletstore';
import { InMemoryWalletStore } from './inmemorywalletstore';
import { Wallet } from './wallet';

import nano = require('nano');

const encoding = 'utf8';

export class Wallets {
	public static async newInMemoryWallet(): Promise<Wallet> {
		const store = new InMemoryWalletStore();
		return new Wallet(store);
	}

	public static async newFileSystemWallet(directory: string): Promise<Wallet> {
		const store = await FileSystemWalletStore.newInstance(directory);
		return new Wallet(store);
	}

	public static async newCouchDBWallet(config: string | nano.Configuration, dbName: string = 'wallet'): Promise<Wallet> {
		const store = await CouchDBWalletStore.newInstance(config, dbName);
		return new Wallet(store);
	}
}
