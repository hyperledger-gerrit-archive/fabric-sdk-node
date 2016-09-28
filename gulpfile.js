/*eslint-env node */
var requireDir = require('require-dir');
var gulp = require('gulp'),
    eslint = require('gulp-eslint');

// Require all tasks in gulp/tasks, including subfolders
requireDir('./build/tasks', { recurse: true });

gulp.task('lint', function () {
    return gulp.src(['*.js'])
		.pipe(eslint())
		.pipe(eslint.format())
		.pipe(eslint.failAfterError());
});

gulp.task('default', ['lint'], function () {
		// This will only run if the lint task is successful...
});
