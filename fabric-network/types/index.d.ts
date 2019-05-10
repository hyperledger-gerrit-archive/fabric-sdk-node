/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
	Block,
	Channel,
	ChannelEventHub,
	ChannelPeer,
	Peer,
	ProposalErrorResponse,
	TransactionId,
	TransientMap,
} from 'fabric-client';
import {Client} from 'fabric-client/types/client';

import {User} from 'fabric-common';

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
	checkpointer?: CheckpointerOptions;
}

export interface CheckpointerOptions {
	factory: CheckpointerFactory;
	options: object;
}

export interface EventListenerOptions {
	checkpointer?: CheckpointerOptions;
	replay?: boolean;
	filtered?: boolean;
}

export interface DiscoveryOptions {
	asLocalhost?: boolean;
	enabled?: boolean;
}

export interface DefaultEventHandlerOptions {
	commitTimeout?: number;
	strategy?: TxEventHandlerFactory | null;
}

export declare class DefaultEventHandlerStrategies {
	public static MSPID_SCOPE_ALLFORTX: TxEventHandlerFactory;
	public static MSPID_SCOPE_ANYFORTX: TxEventHandlerFactory;
	public static NETWORK_SCOPE_ALLFORTX: TxEventHandlerFactory;
	public static NETWORK_SCOPE_ANYFORTX: TxEventHandlerFactory;
}

export type TxEventHandlerFactory = (transaction: Transaction, options: object) => TxEventHandler;

export interface TxEventHandler {
	startListening(): Promise<void>;

	waitForEvents(): Promise<void>;

	cancelListening(): void;
}

export interface DefaultQueryHandlerOptions {
	strategy?: QueryHandlerFactory;
}

export declare class DefaultQueryHandlerStrategies {
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
	[peerName: string]: Buffer | ProposalErrorResponse;
}

export declare class Gateway {
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

	addBlockListener(listenerName: string, callback: (error: Error, block?: Block) => Promise<any>, options?: object): Promise<BlockEventListener>;

	addCommitListener(listenerName: string, callback: (error: Error, transactionId?: string, status?: string, blockNumber?: string) => Promise<any>, options?: object): Promise<CommitEventListener>;
}

export interface Contract {
	createTransaction(name: string): Transaction;

	evaluateTransaction(name: string, ...args: string[]): Promise<Buffer>;

	submitTransaction(name: string, ...args: string[]): Promise<Buffer>;

	addContractListener(listenerName: string, eventName: string, callback: (error: Error, event?: { [key: string]: any }, blockNumber?: string, transactionId?: string, status?: string) => Promise<any>, options?: object): Promise<ContractEventListener>;
}

export interface Transaction {
	evaluate(...args: string[]): Promise<Buffer>;

	getName(): string;

	getTransactionID(): TransactionId;

	getNetwork(): Network;

	setTransient(transientMap: TransientMap): this;

	submit(...args: string[]): Promise<Buffer>;

	addCommitListener(callback: (error: Error, transactionId?: string, status?: string, blockNumber?: string) => Promise<any>, options?: object, eventHub?: ChannelEventHub): Promise<CommitEventListener>;
}

export interface FabricError extends Error {
	cause?: Error;
	transactionId?: string;
}

export interface TimeoutError extends FabricError {
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

export interface Wallet {
	delete(label: string): Promise<void>;

	exists(label: string): Promise<boolean>;

	export(label: string): Promise<Identity>;

	import(label: string, identity: Identity): Promise<void>;

	list(): Promise<IdentityInfo[]>;
}

export declare class InMemoryWallet implements Wallet {
	constructor(mixin?: WalletMixin);

	public delete(label: string): Promise<void>;

	public exists(label: string): Promise<boolean>;

	public export(label: string): Promise<Identity>;

	public import(label: string, identity: Identity): Promise<void>;

	public list(): Promise<IdentityInfo[]>;
}

export declare class FileSystemWallet implements Wallet {
	constructor(path: string, mixin?: WalletMixin);

	public delete(label: string): Promise<void>;

	public exists(label: string): Promise<boolean>;

	public export(label: string): Promise<Identity>;

	public import(label: string, identity: Identity): Promise<void>;

	public list(): Promise<IdentityInfo[]>;
}

export declare class CouchDBWallet implements Wallet {
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

export interface WalletMixin {
}

export declare class X509WalletMixin implements WalletMixin {
	public static createIdentity(mspId: string, certificate: string, privateKey: string): Identity;

	constructor();
}

export declare class HSMWalletMixin implements WalletMixin {
	public static createIdentity(mspId: string, certificate: string): Identity;

	constructor();
}

export interface Checkpoint {
	blockNumber: number;
	transactionIds: string[];
}

export declare class BaseCheckpointer {
	public setChaincodeId(chaincodeId: string): void;

	public loadStartingCheckpoint(): Promise<Checkpoint>;
}

export declare class FileSystemCheckpointer extends BaseCheckpointer {
	constructor(channelName: string, listenerName: string, options: any);

	public initialize(): Promise<void>;

	public save(transactionId: string, blockNumber: string): Promise<void>;

	public load(): Promise<Checkpoint | { [blockNumber: string]: Checkpoint }>;
}

export type CheckpointerFactory = (channelName: string, listenerName: string, options: object) => BaseCheckpointer;

export declare class EventHubManager {
	constructor();

	public getEventHub(peer: Peer): ChannelEventHub;

	public getEventHubs(peers: Peer[]): ChannelEventHub[];

	public getReplayEventHub(peer: Peer): ChannelEventHub;

	public getReplayEventHubs(peers: Peer[]): ChannelEventHub[];
}

export declare class CommitEventListener {
	public register(): void;

	public setEventHub(eventHub: ChannelEventHub, isFixed?: boolean): void;

	public unregister(): void;
}

export declare class ContractEventListener {
	public register(): void;

	public unregister(): void;
}

export declare class BlockEventListener {
	public register(): void;

	public unregister(): void;
}

export interface BaseEventHubSelectionStrategy {
	getNextPeer(): Peer;

	updateEventHubAvailability(deadPeer: Peer): void;
}

export declare class DefaultEventHubSelectionStrategies {
	public static MSPID_SCOPE_ROUND_ROBIN: BaseEventHubSelectionStrategy;
}
