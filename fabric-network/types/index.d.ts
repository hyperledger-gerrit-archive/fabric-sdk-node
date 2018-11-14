/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/* tslint:disable:max-classes-per-file */

import { Channel, ChannelPeer, TransactionId, User } from 'fabric-client';

import Client = require('fabric-client');

//-------------------------------------------
// Main fabric network classes
//-------------------------------------------
export interface GatewayOptions {
	wallet: Wallet;
	identity: string;
	clientTlsIdentity?: string;
	eventHandlerOptions?: DefaultEventHandlerOptions;
}

export interface DefaultEventHandlerOptions {
	commitTimeout?: number;
	strategy?: TxEventHandlerFactory | null;
}

export class DefaultEventHandlerStrategies {
	public static MSPID_SCOPE_ALLFORTX: TxEventHandlerFactory;
	public static MSPID_SCOPE_ANYFORTX: TxEventHandlerFactory;
	public static NETWORK_SCOPE_ALLFORTX: TxEventHandlerFactory;
	public static NETWORK_SCOPE_ANYFORTX: TxEventHandlerFactory;
}

export type TxEventHandlerFactory = (transactionId: TransactionId, network: Network, options: object) => TxEventHandler;

export interface TxEventHandler {
	startListening(): Promise<void>;
	waitForEvents(): Promise<void>;
	cancelListening(): void;
}

export class Gateway {
	constructor();
	public connect(config: Client | string | object, options: GatewayOptions): Promise<void>;
	public disconnect(): void;
	public getClient(): Client;
	public getCurrentIdentity(): User;
	public getNetwork(channelName: string): Promise<Network>;
	public getOptions(): GatewayOptions;
}

export class Network {
	public getChannel(): Channel;
	public getContract(chaincodeId: string, namespace?: string): Contract;
}

export class Contract {
	public createTransaction(name: string): Transaction;
	public evaluateTransaction(name: string, ...args: string[]): Promise<Buffer>;
	public submitTransaction(name: string, ...args: string[]): Promise<Buffer>;
}

export interface TransientMap {
	[key: string]: Buffer;
}
export class Transaction {
	public evaluate(...args: string[]): Promise<Buffer>;
	public getName(): string;
	public getTransactionID(): TransactionId;
	public setTransient(transientMap: TransientMap): this;
	public submit(...args: string[]): Promise<Buffer>;
}

//-------------------------------------------
// Wallet Management
//-------------------------------------------
export interface Identity {
	type: string;
}

export interface IdentityInfo {
	label: string;
	identifier?: string;
	mspId?: string;
}

interface Wallet {
	delete(label: string): Promise<void>;
	exists(label: string): Promise<boolean>;
	export(label: string): Promise<Identity>;
	import(label: string, identity: Identity): Promise<void>;
	list(): Promise<IdentityInfo[]>;
}

export class InMemoryWallet implements Wallet {
	constructor(mixin?: WalletMixin);
	public delete(label: string): Promise<void>;
	public exists(label: string): Promise<boolean>;
	public export(label: string): Promise<Identity>;
	public import(label: string, identity: Identity): Promise<void>;
	public list(): Promise<IdentityInfo[]>;
}

export class FileSystemWallet implements Wallet {
	constructor(path: string, mixin?: WalletMixin);
	public delete(label: string): Promise<void>;
	public exists(label: string): Promise<boolean>;
	public export(label: string): Promise<Identity>;
	public import(label: string, identity: Identity): Promise<void>;
	public list(): Promise<IdentityInfo[]>;
}

export class CouchDBWallet implements Wallet {
	constructor(options: CouchDBWalletOptions, mixin: WalletMixin)
	public delete(label: string): Promise<void>;
	public exists(label: string): Promise<boolean>;
	public export(label: string): Promise<Identity>;
	public import(label: string, identity: Identity): Promise<void>;
	public list(): Promise<IdentityInfo[]>;
}

export interface CouchDBWalletOptions {
	url: string;
}

export interface WalletMixin {} // tslint:disable-line:no-empty-interface

export class X509WalletMixin implements WalletMixin {
	public static createIdentity(mspId: string, certificate: string, privateKey: string): Identity;
	constructor();
}

export class HSMWalletMixin implements WalletMixin {
	public static createIdentity(mspId: string, certificate: string): Identity;
	constructor();
}
