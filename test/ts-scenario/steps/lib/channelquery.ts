/**
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';
import * as fs from 'fs';

import { Client, Endorser, Endpoint, User } from 'fabric-common';
import * as Admins from 'fabric-admin';

import * as ClientUtils from './utility/clientUtils';
import * as BaseUtils from './utility/baseUtils';

import { CommonConnectionProfileHelper } from './utility/commonConnectionProfileHelper';

export async function queryChannels(clientName: string, peerName: string): Promise<void> {

	const clientObject: any = ClientUtils.retrieveClientObject(clientName);
	const client: Client = clientObject.client;
	const user: User = clientObject.user;
	const ccp: CommonConnectionProfileHelper = clientObject.ccp;
	const peerInfo: any = ccp.getPeer(peerName);
	const endpoint: Endpoint = client.newEndpoint({
		'url': peerInfo.url,
		'pem': fs.readFileSync(peerInfo.tlsCACerts.path).toString(),
		'ssl-target-name-override': peerInfo.grpcOptions['ssl-target-name-override'],
	});
	const peer: Endorser = client.newEndorser(peerName);
	await peer.connect(endpoint, {});

	const fabricAdmin: Admins.FabricAdmin = new Admins.FabricAdmin(client, user);

	const options: Admins.QueryChannelsOptions = {
		target: peer,
		requestTimeout: 3000
	}
	const results: Admins.QueryChannelsResponse = await fabricAdmin.queryChannels(options);
	for (const channelId of results.channels) {
		BaseUtils.logMsg('Found channel id of ' + channelId, null);
	}
}
