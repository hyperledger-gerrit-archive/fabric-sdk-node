/**
 * Copyright 2017 Kapil Sachdeva All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/* tslint:disable:max-classes-per-file */

import FabricCAServices = require('fabric-ca-client');
import { BaseClient } from '../../fabric-common/types/base';




export = Common;

declare namespace Common { // tslint:disable-line:no-namespace

	export interface ICryptoKey {
		getSKI(): string;
		isSymmetric(): boolean;
		isPrivate(): boolean;
		getPublicKey(): ICryptoKey;
		toBytes(): string;
	}

	export interface ICryptoKeyStore {
		getKey(ski: string): Promise<string>;
		putKey(key: ICryptoKey): Promise<ICryptoKey>;
	}

	export interface ICryptoSuite {
		decrypt(key: ICryptoKey, cipherText: Buffer, opts: any): Buffer;
		deriveKey(key: ICryptoKey, opts?: KeyOpts): ICryptoKey;
		encrypt(key: ICryptoKey, plainText: Buffer, opts: any): Buffer;
		getKey(ski: string): Promise<ICryptoKey>;
		generateKey(opts?: KeyOpts): Promise<ICryptoKey>;
		hash(msg: string, opts: any): string;
		importKey(pem: string, opts?: KeyOpts): ICryptoKey | Promise<ICryptoKey>;
		setCryptoKeyStore(cryptoKeyStore: ICryptoKeyStore): void;
		sign(key: ICryptoKey, digest: Buffer): Buffer;
		verify(key: ICryptoKey, signature: Buffer, digest: Buffer): boolean;
	}

	export interface CryptoSetting {
		algorithm: string;
		hash: string;
		keysize: number;
		software: boolean;
	}

	export interface UserConfig {
		affiliation?: string;
		enrollmentID: string;
		name: string;
		roles?: string[];
	}

	export class User {
		public static isInstance(object: any): boolean;

		constructor(cfg: string | UserConfig);
		public getName(): string;
		public getRoles(): string[];
		public setRoles(roles: string[]): void;
		public getAffiliation(): string;
		public setAffiliation(affiliation: string): void;
		public getIdentity(): IIdentity;
		public getSigningIdentity(): ISigningIdentity;
		public getCryptoSuite(): ICryptoSuite;
		public setCryptoSuite(suite: ICryptoSuite): void;
		public setEnrollment(privateKey: ICryptoKey, certificate: string, mspId: string): Promise<void>;
		public isEnrolled(): boolean;
		public fromString(): Promise<User>;
	}

	export interface IKeyValueStore {
		getValue(name: string): Promise<string>;
		setValue(name: string, value: string): Promise<string>;
	}



	export interface BroadcastResponse {
		status: string;
		info?: string;
	}


	export type ProposalResponseObject = [Array<Common.ProposalResponse | Common.ProposalErrorResponse>, Common.Proposal];

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

	export class ChannelEventHub {
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
	export interface ChaincodeChannelEventHandle { // tslint:disable-line:no-empty-interface
	}

	export interface SignedRequest {
		payload: Buffer;
		signature: Buffer;
	}

	export interface PeerSignedProposal {
		proposal_bytes: Buffer;
		signature: Buffer;
	}



	export interface MSPConstructorConfig {
		rootCerts: IIdentity[];
		intermediateCerts: IIdentity[];
		admins: IIdentity[];
		signer: ISigningIdentity;
		id: string;
		orgs: string[];
		cryptoSuite: Common.ICryptoSuite;
	}

	export class MSP {
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

	export interface KeyOpts {
		ephemeral: boolean;
	}

	export interface CryptoContent {
		privateKey?: string;
		privateKeyPEM?: string;
		privateKeyObj?: Common.ICryptoKey;
		signedCert?: string;
		signedCertPEM?: string;
	}

	export interface UserContext {
		username: string;
		password?: string;
	}

	export interface UserOpts {
		username: string;
		mspid: string;
		cryptoContent: CryptoContent;
		skipPersistence: boolean;
	}

	export interface IIdentity {
		serialize(): Buffer;
		getMSPId(): string;
		isValid(): boolean;
		getOrganizationUnits(): string;
		verify(msg: Buffer, signature: Buffer, opts: any): boolean;
	}

	export interface ISigningIdentity {
		sign(msg: Buffer, opts: any): Buffer;
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
}
