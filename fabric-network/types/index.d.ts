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
	discovery?: DiscoveryOptions;
	eventHandlerOptions?: DefaultEventHandlerOptions;
	queryHandlerOptions?: DefaultQueryHandlerOptions;
}

export interface DiscoveryOptions {
	asLocalhost?: boolean;
	enabled?: boolean;
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

export interface DefaultQueryHandlerOptions {
	strategy?: QueryHandlerFactory;
}

export class DefaultQueryHandlerStrategies {
	public static MSPID_SCOPE_ROUND_ROBIN: QueryHandlerFactory;
	public static MSPID_SCOPE_SINGLE: QueryHandlerFactory;
}

export type QueryHandlerFactory = (network: Network, options: object) => QueryHandler;

export interface QueryHandler {
	evaluate(query: Query): Promise<Buffer>;
}

export interface Query {
	evaluate(peers: ChannelPeer[]): Promise<QueryResults>;
}

export interface QueryResults {
	[peerName: string]: Buffer | Error;
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

export interface Network {
	getChannel(): Channel;
	getContract(chaincodeId: string, name?: string): Contract;
	addBlockListener(listenerName: string, callback: (block: Client.Block) => void, options: any): BlockEventListener;
	addCommitListener(listenerName: string, callback: (error: Error, transactionId: string, status: string, blockNumber: string) => void, options: any): TransactionEventListener;
}

export interface Contract {
	createTransaction(name: string): Transaction;
	evaluateTransaction(name: string, ...args: string[]): Promise<Buffer>;
	submitTransaction(name: string, ...args: string[]): Promise<Buffer>;
	addContractListener(listenerName: string, eventName: string, callback: (error: Error, event: {[key: string]: any}, blockNumber: string, transactionId: string, status: string) => void, options: any): ContractEventListener;
}

export interface TransientMap {
	[key: string]: Buffer;
}
export interface Transaction {
	evaluate(...args: string[]): Promise<Buffer>;
	getName(): string;
	getTransactionID(): TransactionId;
	setTransient(transientMap: TransientMap): this;
	submit(...args: string[]): Promise<Buffer>;
	addCommitListener(callback: (error: Error, transactionId: string, status: string, blockNumber: string) => void, options: any, eventHub?: Client.ChannelEventHub): void;
}

export interface FabricError extends Error {
	cause?: Error;
	transactionId?: string;
}

export interface TimeoutError extends FabricError {} // tslint:disable-line:no-empty-interface

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

export interface Wallet {
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
	constructor(options: CouchDBWalletOptions, mixin?: WalletMixin)
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

export interface Checkpoint {
	blockNumber: number;
	transactionIds: string[];
}

export interface BaseCheckpointer {} // tslint:disable-line:no-empty-interface

export class FileSystemCheckpointer implements BaseCheckpointer {
	constructor();
	public initialize(chaincodeId: string, listenerName: string): void;
	public save(chaincodeId: string, listenerName: string, transactionId: string, blockNumber: string): void;
	public load(chaincodeId: string, listenerName: string): Checkpoint;
}

export class EventHubManager {
	constructor();
	public getEventHub(peer: Client.Peer): Client.ChannelEventHub;
	public getEventHubs(peers: Client.Peer[]): Client.ChannelEventHub[];
	public getReplayEventHub(peer: Client.Peer): Client.ChannelEventHub;
	public getReplayEventHubs(peers: Client.Peer[]): Client.ChannelEventHub[];
}

export class TransactionEventListener {
	public register(): void;
	public setEventHub(eventHub: Client.ChannelEventHub): void;
	public unregister(): void;
}

export class ContractEventListener {
	public register(): void;
	public unregister(): void;
}

export class BlockEventListener {
	public register(): void;
	public unregister(): void;
}

export interface BaseEventHubSelectionStrategy {
	getNextPeer(): Client.Peer;
	updateEventHubAvailability(deadPeer: Client.Peer): void;
}

export class DefaultEventHubSelectionStrategies {
	public static MSPID_SCOPE_ROUND_ROBIN: BaseEventHubSelectionStrategy;
}
