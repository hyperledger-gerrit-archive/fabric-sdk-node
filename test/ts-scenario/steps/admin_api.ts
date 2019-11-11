/**
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

import * as ChannelUtil from './lib/channelQuery';
import { Constants } from './constants';

import { Then } from 'cucumber';

Then(/I should be able to query peer (.+?) to see the channels for client (.+?)$/, { timeout: Constants.HUGE_TIME as number }, async (peerName: string, clientName: string) => {
		await ChannelUtil.queryChannels(clientName, peerName);
});
