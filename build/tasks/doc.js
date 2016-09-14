var gulp = require('gulp');
var jsdoc = require('gulp-jsdoc3');
 
gulp.task('doc', function () {
    gulp.src([
    	'README.md', 
    	'index.js',
    	'./lib/api.js', 
    	'./lib/FileKeyValueStore.js',
    	'./lib/Chain.js',
    	'./lib/Member.js'
    ], {read: false})
    .pipe(jsdoc())
    .pipe(gulp.dest('./docs/gen'));
});
