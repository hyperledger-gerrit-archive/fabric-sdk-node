/*
 Copyright 2018 IBM All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0

*/

import {fabricCommon} from 'fabric-common/types';
import {BaseClient} from 'fabric-common/types/base';
import User = fabricCommon.User;
import ICryptoSuite = fabricCommon.ICryptoSuite;

export declare class FabricCAServices extends BaseClient {
	constructor(url: string | IFabricCAService, tlsOptions?: TLSOptions, caName?: string, cryptoSuite?: ICryptoSuite);

	public getCaName(): string;

	public register(req: IRegisterRequest, registrar: User): Promise<string>;

	public enroll(req: IEnrollmentRequest): Promise<IEnrollResponse>;

	public reenroll(currentUser: User, attr_reqs: IAttributeRequest[]): Promise<IEnrollResponse>;

	public revoke(request: IRevokeRequest, registrar: User): Promise<any>;

	public generateCRL(request: IRestriction, registrar: User): Promise<any>;

	public newIdentityService(): IdentityService;

	public newAffiliationService(): AffiliationService;

	public toString(): string;
}

export interface TLSOptions {
	trustedRoots: Buffer;
	verify: boolean;
}

export interface IFabricCAService {
	url: string;
	tlsOptions?: TLSOptions;
	caName?: string;
	cryptoSuite?: ICryptoSuite;
}

export interface IKeyValueAttribute {
	name: string;
	value: string;
	ecert?: boolean;
}

export interface IRegisterRequest {
	enrollmentID: string;
	enrollmentSecret?: string;
	role?: string;
	affiliation: string;
	maxEnrollments?: number;
	attrs?: IKeyValueAttribute[];
}

export interface IAttributeRequest {
	name: string;
	optional: boolean;
}

export interface IEnrollmentRequest {
	enrollmentID: string;
	enrollmentSecret: string;
	profile?: string;
	attr_reqs?: IAttributeRequest[];
	csr?: string;
}

export interface IKey {
	getSKI(): string;

	/**
	 * Returns true if this key is a symmetric key, false is this key is asymmetric
	 *
	 * @returns {boolean} if this key is a symmetric key
	 */
	isSymmetric(): boolean;

	/**
	 * Returns true if this key is an asymmetric private key, false otherwise.
	 *
	 * @returns {boolean} if this key is an asymmetric private key
	 */
	isPrivate(): boolean;

	/**
	 * Returns the corresponding public key if this key is an asymmetric private key.
	 * If this key is already public, returns this key itself.
	 *
	 * @returns {module:api.Key} the corresponding public key if this key is an asymmetric private key.
	 * If this key is already public, returns this key itself.
	 */
	getPublicKey(): IKey;

	/**
	 * Converts this key to its PEM representation, if this operation is allowed.
	 *
	 * @returns {string} the PEM string representation of the key
	 */
	toBytes(): string;
}

export interface IEnrollResponse {
	key: IKey;
	certificate: string;
	rootCertificate: string;
}

export interface IRevokeRequest {
	enrollmentID: string;
	aki?: string;
	serial?: string;
	reason?: string;
}

export interface IRestriction {
	revokedBefore?: Date;
	revokedAfter?: Date;
	expireBefore?: Date;
	expireAfter?: Date;
}

export interface IIdentityRequest {
	enrollmentID: string;
	affiliation: string;
	attrs?: IKeyValueAttribute[];
	type?: string;
	enrollmentSecret?: string;
	maxEnrollments?: number;
	caname?: string;
}

export interface IServiceResponseMessage {
	code: number;
	message: string;
}

export interface IServiceResponse {
	Success: boolean;
	Result: any;
	Errors: IServiceResponseMessage[];
	Messages: IServiceResponseMessage[];
}

export interface IAffiliationRequest {
	name: string;
	caname?: string;
	force?: boolean;
}

export enum HFCAIdentityType {
	PEER = 'peer',
	ORDERER = 'orderer',
	CLIENT = 'client',
	USER = 'user',
}

export enum HFCAIdentityAttributes {
	HFREGISTRARROLES = 'hf.Registrar.Roles',
	HFREGISTRARDELEGATEROLES = 'hf.Registrar.DelegateRoles',
	HFREGISTRARATTRIBUTES = 'hf.Registrar.Attributes',
	HFINTERMEDIATECA = 'hf.IntermediateCA',
	HFREVOKER = 'hf.Revoker',
	HFAFFILIATIONMGR = 'hf.AffiliationMgr',
	HFGENCRL = 'hf.GenCRL',
}

export declare class AffiliationService {
	public create(req: IAffiliationRequest, registrar: User): Promise<IServiceResponse>;

	public getOne(affiliation: string, registrar: User): Promise<IServiceResponse>;

	public getAll(registrar: User): Promise<IServiceResponse>;

	public delete(req: IAffiliationRequest, registrar: User): Promise<IServiceResponse>;

	public update(affiliation: string, req: IAffiliationRequest, registrar: User): Promise<IServiceResponse>;
}

export declare class IdentityService {
	public create(req: IIdentityRequest, registrar: User): Promise<string>;

	public getOne(enrollmentID: string, registrar: User): Promise<IServiceResponse>;

	public getAll(registrar: User): Promise<IServiceResponse>;

	public delete(enrollmentID: string, registrar: User): Promise<IServiceResponse>;

	public update(enrollmentID: string, req: IIdentityRequest, registrar: User): Promise<IServiceResponse>;
}
