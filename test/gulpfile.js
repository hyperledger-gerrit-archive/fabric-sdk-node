const gulp = require('gulp');
const gutil = require('gulp-util');
const exec = require('child_process').exec;

gulp.task('remove_keystore', function(cb) {
	gutil.log('Removing keystores');
	exec('node ./unit/removeKeystores.js', function(err, stdout, stderr) {
		console.log(stdout);
		console.log(stderr);
		cb(err);
	});
});

gulp.task('fabricStop', ['remove_keystore'], function(cb) {
	gutil.log('Stopping Fabric');
	exec('node ./unit/stopFabric.js', function(err, stdout, stderr) {
		console.log(stdout);
		console.log(stderr);
		cb(err);
	});
});

gulp.task('cleanup', ['remove_keystore', 'fabricStop']);

gulp.task('fabricStart', ['cleanup'], function(cb) {
	gutil.log('Starting Fabric');
	exec('node ./unit/startFabric.js', function(err, stdout, stderr) {
		console.log(stdout);
		console.log(stderr);
		cb(err);
	});
});

gulp.task('unit_tests', ['fabricStart'], function(cb) {
	gutil.log('Executing tests');
	exec('node index.js', function(err, stdout, stderr) {
		console.log(stdout);
		console.log(stderr);
		cb(err);
	});
});

gulp.task('default', ['unit_tests']);