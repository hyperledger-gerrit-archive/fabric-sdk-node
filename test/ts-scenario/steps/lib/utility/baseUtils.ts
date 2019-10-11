/**
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

// High level constants for timeouts
const TIMEOUTS: any = {
	HUGE_TIME: 20 * 60 * 1000,
	INC_LONG: 30 * 1000,
	INC_MED: 10 * 1000,
	INC_SHORT: 5 * 1000,
	STEP_LONG: 240 * 1000,
	STEP_MED: 120 * 1000,
	STEP_SHORT: 60 * 1000,
};

/**
 * Perform a sleep
 * @param ms the time in milliseconds to sleep for
 */
export function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retrieve a timeout from the Timeouts constants
 * @param type the string type to retrieve
 */
export function getTimeoutDuration(type: string) {
	if (TIMEOUTS.hasOwnProperty(type)) {
		return TIMEOUTS[type];
	} else {
		throw new Error(`TIMEOUTS constant does not contain type ${type}, must be one of [${Object.keys(TIMEOUTS)}]`);
	}
}

export function logMsg(msg: string, obj: any) {
	if (obj) {
		// tslint:disable-next-line:no-console
		console.log(msg, obj);
	} else {
		// tslint:disable-next-line:no-console
		console.log(msg);
	}
}

export function logError(msg: string, obj: any) {
	if (obj) {
		// tslint:disable-next-line:no-console
		console.error(msg, obj);
	} else {
		// tslint:disable-next-line:no-console
		console.error(msg);
	}
}

export function logAndThrow(msg: any) {
	logError(msg, undefined);
	if (msg instanceof Error) {
		throw msg;
	} else {
		throw new Error(msg);
	}
}
