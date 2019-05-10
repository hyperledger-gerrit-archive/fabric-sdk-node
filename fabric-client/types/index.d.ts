/**
 * Copyright 2017 Kapil Sachdeva All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {FabricCAServices} from 'fabric-ca-client';
import {ICryptoSuite, IIdentity, IKeyValueStore, ISigningIdentity, User, UserOpts} from 'fabric-common';
import {BaseClient} from 'fabric-common/types/base';

interface ProtoBufObject {
	toBuffer(): Buffer;
}

declare class Remote {
	constructor(url: string, opts?: ConnectionOpts);

	public getName(): string;

	public setName(name: string): void;

	public getUrl(): string;
}

export declare class Client extends BaseClient {
	public static loadFromConfig(config: any): Client;

	constructor();

	public loadFromConfig(config: any): void;

	public setTlsClientCertAndKey(clientCert: string, clientKey: string): void;

	public addTlsClientCertAndKey(opts: any): void;

	public isDevMode(): boolean;

	public setDevMode(mode: boolean): void;

	public newChannel(name: string): Channel;

	public getChannel(name?: string, throwError?: boolean): Channel;

	public newPeer(url: string, opts?: ConnectionOpts): Peer;

	public getPeer(name: string): Peer;

	public getPeersForOrg(mspid?: string): Peer[];

	public newOrderer(url: string, opts?: ConnectionOpts): Orderer;

	public getOrderer(name: string): Orderer;

	public getPeersForOrgOnChannel(channelNames: string | string[]): ChannelPeer[];

	public getCertificateAuthority(): FabricCAServices;

	public getClientConfig(): any;

	public getMspid(): string;

	public newTransactionID(admin?: boolean): TransactionId;

	public extractChannelConfig(configEnvelope: Buffer): Buffer;

	public signChannelConfig(config: Buffer): ConfigSignature;

	public createChannel(request: ChannelRequest): Promise<BroadcastResponse>;

	public updateChannel(request: ChannelRequest): Promise<BroadcastResponse>;

	public queryPeers(request: PeerQueryRequest): Promise<PeerQueryResponse>;

	public queryChannels(peer: Peer | string, useAdmin?: boolean): Promise<ChannelQueryResponse>;

	public queryInstalledChaincodes(peer: Peer | string, useAdmin?: boolean): Promise<ChaincodeQueryResponse>;

	public installChaincode(request: ChaincodeInstallRequest, timeout?: number): Promise<ProposalResponseObject>;

	public initCredentialStores(): Promise<boolean>;

	public setStateStore(store: IKeyValueStore): void;

	public setAdminSigningIdentity(privateKey: string, certificate: string, mspid: string): void;

	public saveUserToStateStore(): Promise<User>;

	public setUserContext(user: User | UserNamePasswordObject, skipPersistence?: boolean): Promise<User>;

	public getUserContext(name: string, checkPersistence?: boolean): Promise<User> | User;

	public loadUserFromStateStore(name: string): Promise<User>;

	public getStateStore(): IKeyValueStore;

	public createUser(opts: UserOpts): Promise<User>;

	public getTargetPeers(requestTargets: string | string[] | Peer | Peer[]): Peer[];

	public getTargetOrderer(requestOrderer?: string | Orderer, channelOrderers?: Orderer[], channelName?: string): Orderer;

	public getClientCertHash(create: boolean): Buffer;
}

export enum Status {
	UNKNOWN = 0,
	SUCCESS = 200,
	BAD_REQUEST = 400,
	FORBIDDEN = 403,
	NOT_FOUND = 404,
	REQUEST_ENTITY_TOO_LARGE = 413,
	INTERNAL_SERVER_ERROR = 500,
	SERVICE_UNAVAILABLE = 503,
}

export type ChaincodeType = 'golang' | 'car' | 'java' | 'node';

export interface ConnectionOpts {
	pem?: string;
	clientKey?: string;
	clientCert?: string;
	'request-timeout'?: number;
	'ssl-target-name-override'?: string;

	[propName: string]: any;
}

export interface InitializeRequest {
	target?: string | Peer | ChannelPeer;
	discover?: boolean;
	endorsementHandler?: string;
	commitHandler?: string;
	asLocalhost?: boolean;
	configUpdate?: Buffer;
}

export declare class Channel {
	public static sendSignedProposal(request: SignedProposal, timeout?: number): Promise<ProposalResponseObject>;

	constructor(name: string, clientContext: Client);

	public close(): void;

	public initialize(request?: InitializeRequest): Promise<void>;

	public getName(): string;

	public getDiscoveryResults(endorsementHints?: DiscoveryChaincodeInterest[]): Promise<DiscoveryResults>;

	public getEndorsementPlan(endorsementHint?: DiscoveryChaincodeInterest): Promise<DiscoveryResultEndorsementPlan>;

	public refresh(): Promise<DiscoveryResults>;

	public getOrganizations(): string[];

	public setMSPManager(mspManager: MSPManager): void;

	public getMSPManager(): MSPManager;

	public addPeer(peer: Peer, mspid: string, roles?: ChannelPeerRoles, replace?: boolean): void;

	public removePeer(peer: Peer): void;

	public getPeer(name: string): ChannelPeer;

	public getChannelPeer(name: string): ChannelPeer;

	public getPeers(): ChannelPeer[];

	public getChannelPeers(): ChannelPeer[];

	public addOrderer(orderer: Orderer, replace?: boolean): void;

	public removeOrderer(orderer: Orderer): void;

	public getOrderer(name: string): Orderer;

	public getOrderers(): Orderer[];

	public newChannelEventHub(peer: Peer | string): ChannelEventHub;

	public getChannelEventHub(name: string): ChannelEventHub;

	public getChannelEventHubsForOrg(mspid?: string): ChannelEventHub[];

	public getPeersForOrg(mspid?: string): ChannelPeer[];

	public getGenesisBlock(request?: OrdererRequest): Promise<Block>;

	public joinChannel(request: JoinChannelRequest, timeout?: number): Promise<ProposalResponse[]>;

	public getChannelConfig(target?: string | Peer, timeout?: number): Promise<any>;

	public getChannelConfigFromOrderer(): Promise<any>;

	public loadConfigUpdate(configUpdateBytes: Buffer): any;

	public loadConfigEnvelope(configEnvelope: any): any;

	public queryInfo(target?: Peer | string, useAdmin?: boolean): Promise<BlockchainInfo>;

	public queryBlockByTxID(txId: string, target?: Peer | string, useAdmin?: boolean, skipDecode?: false): Promise<Block>;
	public queryBlockByTxID(txId: string, target?: Peer | string, useAdmin?: boolean, skipDecode?: true): Promise<Buffer>;

	public queryBlockByHash(block: Buffer, target?: Peer | string, useAdmin?: boolean, skipDecode?: false): Promise<Block>;
	public queryBlockByHash(block: Buffer, target?: Peer | string, useAdmin?: boolean, skipDecode?: true): Promise<Buffer>;

	public queryBlock(blockNumber: number, target?: Peer | string, useAdmin?: boolean, skipDecode?: false): Promise<Block>;
	public queryBlock(blockNumber: number, target?: Peer | string, useAdmin?: boolean, skipDecode?: true): Promise<Buffer>;

	public queryTransaction(txId: string, target?: Peer | string, useAdmin?: boolean, skipDecode?: false): Promise<any>;
	public queryTransaction(txId: string, target?: Peer | string, useAdmin?: boolean, skipDecode?: true): Promise<Buffer>;

	public queryInstantiatedChaincodes(target: Peer | string, useAdmin?: boolean): Promise<ChaincodeQueryResponse>;

	public queryCollectionsConfig(options: CollectionQueryOptions, useAdmin?: boolean): Promise<CollectionQueryResponse[]>;

	public sendInstantiateProposal(request: ChaincodeInstantiateUpgradeRequest, timeout?: number): Promise<ProposalResponseObject>;

	public sendUpgradeProposal(request: ChaincodeInstantiateUpgradeRequest, timeout?: number): Promise<ProposalResponseObject>;

	public sendTransactionProposal(request: ChaincodeInvokeRequest, timeout?: number): Promise<ProposalResponseObject>;

	public sendTransaction(request: TransactionRequest, timeout?: number): Promise<BroadcastResponse>;

	public generateUnsignedProposal(request: ProposalRequest, mspId: string, certificate: string, admin: boolean): Promise<Proposal>;

	public sendSignedProposal(request: SignedProposal, timeout?: number): Promise<ProposalResponseObject>;

	public generateUnsignedTransaction(request: TransactionRequest): Promise<any>;

	public sendSignedTransaction(request: SignedCommitProposal, timeout?: number): Promise<BroadcastResponse>;

	public queryByChaincode(request: ChaincodeQueryRequest, useAdmin?: boolean): Promise<Buffer[]>;

	public verifyProposalResponse(proposalResponse: ProposalResponse): boolean;

	public compareProposalResponseResults(proposalResponses: ProposalResponse[]): boolean;
}

export interface ChannelPeerRoles {
	endorsingPeer?: boolean;
	chaincodeQuery?: boolean;
	ledgerQuery?: boolean;
	eventSource?: boolean;
	discover?: boolean;
}

export declare class ChannelPeer {
	constructor(mspid: string, channel: Channel, peer: Peer, roles: ChannelPeerRoles);

	public close(): void;

	public getMspid(): string;

	public getName(): string;

	public getUrl(): string;

	public setRole(role: string, isIn: boolean): void;

	public isInRole(role: string): boolean;

	public isInOrg(mspid: string): boolean;

	public getChannelEventHub(): ChannelEventHub;

	public getPeer(): Peer;

	public sendProposal(proposal: Proposal, timeout?: number): Promise<ProposalResponse>;

	public sendDiscovery(request: SignedRequest, timeout?: number): Promise<DiscoveryResults>;
}

export interface ConfigSignature extends ProtoBufObject {
	signature_header: Buffer;
	signature: Buffer;
}

export declare class TransactionId {
	constructor(signerOrUserContext: IIdentity, admin: boolean);

	public getTransactionID(): string;

	public getNonce(): Buffer;

	public isAdmin(): boolean;
}

export interface ChannelRequest {
	name: string;
	orderer: Orderer | string;
	envelope?: Buffer;
	config?: Buffer;
	txId?: TransactionId;
	signatures: ConfigSignature[] | string[];
}

export interface TransactionRequest {
	proposalResponses: ProposalResponse[];
	proposal: Proposal;
	txId?: TransactionId;
	orderer?: string | Orderer;
}

export interface BroadcastResponse {
	status: string;
	info?: string;
}

export interface ProposalErrorResponse extends Error {
	isProposalResponse?: boolean;
}

export type ProposalResponseObject = [Array<ProposalResponse | ProposalErrorResponse>, Proposal];

export interface OrdererRequest {
	txId?: TransactionId;
	orderer?: string | Orderer;
}

export interface JoinChannelRequest {
	txId: TransactionId;
	targets?: Peer[] | string[];
	block: Block;
}

export interface BlockData {
	signature: Buffer;
	payload: { header: any, data: any };
}

export interface BlockchainInfo {
	height: any;
	currentBlockHash: Buffer;
	previousBlockHash: Buffer;
}

export interface Block {
	header: {
		number: number;
		previous_hash: Buffer;
		data_hash: Buffer;
	};
	data: { data: BlockData[] };
	metadata: { metadata: any };
}

export interface ProposalResponse {
	version: number;
	timestamp: Date;
	response: Response;
	payload: Buffer;
	endorsement: any;
	peer: RemoteCharacteristics;
}

export interface RemoteCharacteristics {
	url: string;
	name: string;
	options: object;
}

export interface SignedEvent {
	signature: Buffer;
	payload: Buffer;
}

export interface ConnectOptions {
	full_block?: boolean;
	signedEvent?: SignedEvent;
}

export interface EventHubRegistrationRequest {
	identity: IIdentity;
	TransactionID: TransactionId;
	certificate: string;
	mspId: string;
}

export declare class ChannelEventHub {
	constructor(channel: Channel, peer: Peer);

	public getName(): string;

	public getPeerAddr(): string;

	public lastBlockNumber(): number;

	public isconnected(): boolean;

	public connect(options?: ConnectOptions | boolean, connectCallback?: (err: Error, channelEventHub: ChannelEventHub) => void): void;

	public disconnect(): void;

	public close(): void;

	public generateUnsignedRegistration(options: EventHubRegistrationRequest): Buffer;

	public checkConnection(forceReconnect: boolean): string;

	public registerChaincodeEvent(ccid: string, eventname: string, onEvent: (event: ChaincodeEvent, blockNumber?: number, txId?: string, txStatus?: string) => void, onError?: (err: Error) => void, options?: RegistrationOpts): ChaincodeChannelEventHandle;

	public unregisterChaincodeEvent(handle: ChaincodeChannelEventHandle, throwError?: boolean): void;

	public registerBlockEvent(onEvent: (block: Block) => void, onError?: (err: Error) => void, options?: RegistrationOpts): number;

	public unregisterBlockEvent(blockRegistrationNumber: number, throwError: boolean): void;

	public registerTxEvent(txId: string, onEvent: (txId: string, code: string, blockNumber: number) => void, onError?: (err: Error) => void, options?: RegistrationOpts): string;

	public unregisterTxEvent(txId: string, throwError?: boolean): void;
}

// Dummy interface for opaque handles for registerChaincodeEvent's
export interface ChaincodeChannelEventHandle {
}

export interface SignedRequest {
	payload: Buffer;
	signature: Buffer;
}

export interface PeerSignedProposal {
	proposal_bytes: Buffer;
	signature: Buffer;
}

export declare class Peer extends Remote {
	constructor(url: string, opts?: ConnectionOpts);

	public close(): void;

	public sendProposal(proposal: PeerSignedProposal, timeout?: number): Promise<ProposalResponse>;

	public sendDiscovery(request: SignedRequest, timeout?: number): Promise<DiscoveryResults>;
}

export declare class Orderer extends Remote {
	constructor(url: string, opts?: ConnectionOpts);

	public close(): void;

	public sendBroadcast(envelope: Buffer): Promise<BroadcastResponse>;

	public sendDeliver(envelope: Buffer): Promise<any>;
}

export interface MSPConstructorConfig {
	rootCerts: IIdentity[];
	intermediateCerts: IIdentity[];
	admins: IIdentity[];
	signer: ISigningIdentity;
	id: string;
	orgs: string[];
	cryptoSuite: ICryptoSuite;
}

export declare class MSP {
	constructor(config: MSPConstructorConfig);

	public deserializeIdentity(serializedIdentity: Buffer, storeKey: boolean): IIdentity | Promise<IIdentity>;

	public getDefaultSigningIdentity(): ISigningIdentity;

	public getId(): string;

	public getOrganizationUnits(): string[];

	public getPolicy(): any;

	public getSigningIdentity(identifier: string): ISigningIdentity;

	public toProtoBuf(): any;

	public validate(id: IIdentity): boolean;
}

export class MSPManager {
	constructor();

	public addMSP(config: any): MSP;

	public deserializeIdentity(serializedIdentity: Buffer): IIdentity;

	public getMSP(): MSP;

	public getMSPs(): any;

	public loadMSPs(mspConfigs: any): void;
}

export interface MSPPrincipal {
	principal_classification: number;
	principal: Buffer;
}

export interface ChaincodePackageInstallRequest {
	targets?: Peer[] | string[];
	channelNames?: string[] | string;
	txId?: TransactionId;
	chaincodePackage: Buffer;
}

export interface ChaincodePathInstallRequest {
	targets?: Peer[] | string[];
	channelNames?: string[] | string;
	txId?: TransactionId;
	chaincodeId: string;
	chaincodeVersion: string;
	chaincodePath: string;
	chaincodeType?: ChaincodeType;
	metadataPath?: string;
}

export type ChaincodeInstallRequest = ChaincodePackageInstallRequest | ChaincodePathInstallRequest;

export interface ChaincodeInstantiateUpgradeRequest {
	targets?: Peer[] | string[];
	chaincodeType?: ChaincodeType;
	chaincodeId: string;
	chaincodeVersion: string;
	txId: TransactionId;
	'collections-config'?: string;
	transientMap?: TransientMap;
	fcn?: string;
	args?: string[];
	'endorsement-policy'?: any;
}

export interface ChaincodeInvokeRequest {
	targets?: Peer[] | string[];
	chaincodeId: string;
	endorsement_hint?: DiscoveryChaincodeInterest;
	txId: TransactionId;
	transientMap?: TransientMap;
	fcn?: string;
	args: string[];
	ignore?: string[];
	preferred?: string[];
}

export interface ChaincodeQueryRequest {
	targets?: Peer[] | string[];
	chaincodeId: string;
	transientMap?: TransientMap;
	fcn?: string;
	args: string[];
	txId?: TransactionId;
}

//for connection profile
export interface UserNamePasswordObject {
	username: string;
	password?: string;
}

export interface ChaincodeInfo {
	name: string;
	version: string;
	path: string;
	input: string;
	escc: string;
	vscc: string;
}

export interface ChannelInfo {
	channel_id: string;
}

export interface PeerQueryRequest {
	target: Peer | string;
	useAdmin?: boolean;
}

export interface PeerQueryResponse {
	peers_by_org: {
		[mspId: string]: {
			'peers': Array<{
				'mspid': string,
				'endpoint': string,
			}>;
		},
	};
}

export interface ChaincodeQueryResponse {
	chaincodes: ChaincodeInfo[];
}

export interface ChannelQueryResponse {
	channels: ChannelInfo[];
}

export interface CollectionQueryOptions {
	target?: Peer | string;
	chaincodeId: string;
}

export interface CollectionQueryResponse {
	type: string;
	name: string;
	policy: {
		identities: MSPPrincipal[];
		n_out_of: any;
	};
	required_peer_count: number;
	maximum_peer_count: number;
	block_to_live: number;
	member_only_read: boolean;
	member_only_write: boolean;
}

export interface Response {
	status: Status;
	message: string;
	payload: Buffer;
}

export interface Proposal {
	header: ByteBuffer;
	payload: ByteBuffer;
	extension: ByteBuffer;
}

export interface Header {
	channel_header: ByteBuffer;
	signature_header: ByteBuffer;
}

export interface TransientMap {
	[key: string]: Buffer;
}

export interface ProposalRequest {
	fcn: string;
	args: string[];
	chaincodeId: string;
	argbytes?: Buffer;
	transientMap?: TransientMap;
}

export interface SignedProposal {
	targets: Peer[];
	signedProposal: Buffer;
}

export interface SignedCommitProposal {
	request: TransactionRequest;
	signedTransaction: Buffer;
	orderer?: Orderer | string;
}

export interface RegistrationOpts {
	startBlock?: number;
	endBlock?: number | 'newest';
	unregister?: boolean;
	disconnect?: boolean;
}

export interface ChaincodeEvent {
	chaincode_id: string;
	tx_id: string;
	event_name: string;
	payload: Buffer;
}

export interface DiscoveryRequest {
	target?: string | Peer;
	chaincodes?: string[];
	endpoint_names?: boolean;
	initialize_msps?: boolean;
	config?: boolean;
	local?: boolean;
}

export interface DiscoveryResultMSPConfig {
	rootCerts: string;
	intermediateCerts: string;
	admins: string;
	id: string;
	orgs: string[];
	tls_root_certs: string;
	tls_intermediate_certs: string;
}

export interface DiscoveryResultEndpoint {
	host: string;
	port: number;
	name?: string;
}

export interface DiscoveryResultEndpoints {
	endpoints: DiscoveryResultEndpoint[];
}

export interface DiscoveryResultChaincode {
	name: string;
	version: string;
}

export interface DiscoveryResultPeer {
	mspid: string;
	endpoint: string;
	ledger_height: Long;
	name: string;
	chaincodes: DiscoveryResultChaincode[];
}

export interface DiscoveryResultPeers {
	peers: DiscoveryResultPeer[];
}

export interface DiscoveryResultEndorsementGroup {
	peers: DiscoveryResultPeer[];
}

export interface DiscoveryResultEndorsementLayout {
	[groupName: string]: number;
}

export interface DiscoveryResultEndorsementPlan {
	chaincode: string;
	plan_id: string;
	groups: {
		[groupName: string]: DiscoveryResultEndorsementGroup;
	};
	layouts: DiscoveryResultEndorsementLayout[];
}

export interface DiscoveryResults {
	msps?: { [mspid: string]: DiscoveryResultMSPConfig };
	orderers?: { [mspid: string]: DiscoveryResultEndpoints };

	peers_by_org?: { [name: string]: DiscoveryResultPeers };

	endorsement_plans: DiscoveryResultEndorsementPlan[];

	timestamp: number;
}

export interface DiscoveryChaincodeCall {
	name: string;
	collection_names?: string[];
}

export interface DiscoveryChaincodeInterest {
	chaincodes: DiscoveryChaincodeCall[];
}

export class Package {
	public static fromBuffer(buffer: Buffer): Promise<Package>;

	public static fromDirectory(options: { name: string, version: string, path: string, type: ChaincodeType, metadataPath?: string }): Promise<Package>;

	public getName(): string;

	public getVersion(): string;

	public getType(): ChaincodeType;

	public getFileNames(): string[];

	public toBuffer(): Promise<Buffer>;
}
