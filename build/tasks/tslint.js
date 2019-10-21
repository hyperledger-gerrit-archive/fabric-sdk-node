/*
# Copyright IBM Corp. All Rights Reserved.
#
# SPDX-License-Identifier: Apache-2.0
*/
const gulp = require('gulp');
const tslint = require('gulp-tslint');

gulp.task('tslint', () => {
	return gulp.src([
		'fabric-client/**/*.ts',
		'fabric-network/**/*.ts',
		'test/**/*.ts',
		'!fabric-network/coverage/**',
		'!fabric-network/lib/**',
		'!fabric-network/node_modules/**',
		'!fabric-client/coverage/**',
		'!fabric-client/node_modules/**',
	]).pipe(tslint({
		formatter: 'prose'
	})).pipe(tslint.report({
		summarizeFailureOutput: true
	}));
});
