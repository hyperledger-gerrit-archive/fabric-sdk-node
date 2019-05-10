/**
 * Copyright 2017 Kapil Sachdeva All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {FabricCAServices} from 'fabric-ca-client';
import {IKeyValueStore, User, UserOpts} from 'fabric-common';
import {BaseClient} from 'fabric-common/types/base';
import {
	BroadcastResponse, ChaincodeInstallRequestv1,
	ChaincodeQueryResponse,
	Channel,
	ChannelPeer,
	ChannelQueryResponse,
	ChannelRequest,
	ConfigSignature,
	ConnectionOpts,
	Orderer,
	Peer, PeerQueryRequest, PeerQueryResponse, ProposalResponseObject,
	TransactionId,
} from '.';

interface UserNamePasswordObject {
	username: string;
	password?: string;
	caName?: string;
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

	public installChaincode(request: ChaincodeInstallRequestv1, timeout?: number): Promise<ProposalResponseObject>;

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
