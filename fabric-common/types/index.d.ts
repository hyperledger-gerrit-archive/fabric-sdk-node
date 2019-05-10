/**
 * Copyright 2019 Mediconcen All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

interface ICryptoKey {
	getSKI(): string;

	isSymmetric(): boolean;

	isPrivate(): boolean;

	getPublicKey(): ICryptoKey;

	toBytes(): string;
}

interface ICryptoKeyStore {
	getKey(ski: string): Promise<string>;

	putKey(key: ICryptoKey): Promise<ICryptoKey>;
}

interface ICryptoSuite {
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

interface CryptoSetting {
	algorithm: string;
	hash: string;
	keysize: number;
	software: boolean;
}

interface UserConfig {
	affiliation?: string;
	enrollmentID: string;
	name: string;
	roles?: string[];
}

interface IKeyValueStore {
	getValue(name: string): Promise<string>;

	setValue(name: string, value: string): Promise<string>;
}

export interface KeyOpts {
	ephemeral: boolean;
}

interface CryptoContent {
	privateKey?: string;
	privateKeyPEM?: string;
	privateKeyObj?: ICryptoKey;
	signedCert?: string;
	signedCertPEM?: string;
}

interface UserOpts {
	username: string;
	mspid: string;
	cryptoContent: CryptoContent;
	skipPersistence: boolean;
}

interface IIdentity {
	serialize(): Buffer;

	getMSPId(): string;

	isValid(): boolean;

	getOrganizationUnits(): string;

	verify(msg: Buffer, signature: Buffer, opts: any): boolean;
}

interface ISigningIdentity {
	sign(msg: Buffer, opts: any): Buffer;
}

declare class User {
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
