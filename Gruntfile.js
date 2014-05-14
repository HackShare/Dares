/**
 *
 * Gruntfile.js
 * ============
 *
 * © 2014, TNG Technology Consulting GmbH  
 * Licensed under the Apache License, Version 2.0
 *
 * This file contains all the build tasks for Dares
 * Run
 *    grunt help
 * to get a list of available grunt tasks.
 *
 */

module.exports = function (grunt) {
    'use strict';

    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.loadNpmTasks('grunt-docker');
    grunt.loadNpmTasks('grunt-jscs-checker');
    grunt.loadNpmTasks('grunt-mocha-istanbul');

    grunt.registerTask('help', function () {
        grunt.log.header('Dares');

        grunt.log.writeln('This is the help for the grunt tasks in Dares v' + grunt.file.readJSON('package.json').version + '.');
        grunt.log.writeln('If you are looking for the documentation to Dares.js itself, run ');
        grunt.log.writeln('\tgrunt docker');
        grunt.log.writeln('and open the docs/lib/Dares/Dares.js.html file.');

        grunt.log.subhead('Committing');
        grunt.log.writeln('grunt push\t\t\tgit push the repository');
        grunt.log.writeln('grunt precommit\t\t\tRun this task before committing something. ');

        grunt.log.subhead('Tests');
        grunt.log.writeln('grunt test\t\t\tRuns the tests');

        grunt.log.subhead('Documentation');
        grunt.log.writeln('grunt docker\t\t\tGenerates the documentation files');

        grunt.log.subhead('Code quality checks');
        grunt.log.writeln('grunt jshint\t\t\tRuns the JSHint Linter (Possible arguments: Dares, test, grunt)');
        grunt.log.writeln('grunt jscs\t\t\tRuns the JavaScript Code Style checker (Possible arguments: Dares, test, grunt)');
    });

    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),

        watch: {
            Dares: {
                files: ['lib/*.js', 'lib/Dares/*.js', 'lib/Dares/**/*.js'],
                tasks: ['docker', 'jshint:Dares', 'jscs:Dares']
            },
            test: {
                files: ['test/*.js'],
                tasks: ['jshint:test', 'jscs:test']
            },
            grunt: {
                files: ['Gruntfile.js'],
                tasks: ['jshint:grunt', 'jscs:grunt']
            }
        },

        jshint: {
            options: {
                jshintrc: true
            },
            Dares: ['lib/*.js', 'lib/Dares/*.js', 'lib/Dares/**/*.js'],
            test: {
                src: ['test/*.js'],
                options: {
                    expr: true
                }
            },
            grunt: ['Gruntfile.js']
        },

        jscs: {
            Dares: ['lib/*.js', 'lib/Dares/*.js', 'lib/Dares/**/*.js'],
            test: ['test/*.js'],
            grunt: ['Gruntfile.js']
        },

        mocha_istanbul: {
            coverage: {
                src: 'test'
            },
            coveralls: {
                src: 'test',
                options: {
                    coverage: true,
                    check: {
                        branches: 60,
                        functions: 85,
                        lines: 85,
                        statements: 85
                    },
                    root: './lib',
                    reportFormats: ['lcov']
                }
            }
        },

        docker: {
            options: {
                colourScheme: 'monokai'
            },
            Dares: {
                src: ['lib/*.js', 'lib/**/*.js'],
                dest: 'docs'
            }
        },


        shell: {
            push: {
                options: {
                    stderr: false
                },
                command: 'git push --all origin'
            }
        }
    });

    grunt.registerTask('test', ['mocha_istanbul']);
    grunt.registerTask('push', ['shell:push']);
    grunt.registerTask('precommit', ['mocha_istanbul', 'jshint', 'jscs', 'docker']);
    grunt.registerTask('default', ['help']);
};
