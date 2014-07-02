'use strict';

var Process = require( '../lib/Dares/process.js' );
var expect = require( 'chai' ).expect;
var util = require( '../lib/Dares/utility.js' );
var options = require( '../lib/Dares/defaults.js' );
var fs = require( 'fs' );
var async = require( 'async' );


describe( 'Process', function () {
    var processBase;
    var processFileLogging;
    var processFalseStartup;
    var processDefaultLogging;
    var processCustomConsoleLogging;


    before( function () {
        var optionsBase = util.cloneObject( options );
        optionsBase.id = 1;
        optionsBase.port = 9501;
        optionsBase.logging = false;
        processBase = new Process( { options: optionsBase }, function () {} );

        var optionsFileLogging = util.cloneObject( options );
        optionsFileLogging.id = 2;
        optionsFileLogging.port = 9502;
        optionsFileLogging.logging = {
            'Dares.log': 'info'
        };
        processFileLogging = new Process( { options: optionsFileLogging }, function () {} );



        var optionsDefaultLogging = util.cloneObject( options );
        optionsDefaultLogging.id = 6;
        optionsDefaultLogging.port = 9506;
        processDefaultLogging = new Process( { options: optionsDefaultLogging }, function () {} );

        var optionsCustomConsoleLogging = util.cloneObject( options );
        optionsCustomConsoleLogging.id = 7;
        optionsCustomConsoleLogging.port = 9507;
        optionsCustomConsoleLogging.logging = {
            console: 'silly'
        };
        processCustomConsoleLogging = new Process( { options: optionsCustomConsoleLogging }, function () {} );
    } );

    describe( 'normal start', function () {
        var processGoodStart;
        before( function ( done ) {
            var optionsGoodStart = util.cloneObject( options );
            optionsGoodStart.id = 8;
            optionsGoodStart.port = 9508;
            optionsGoodStart.logging = false;
            optionsGoodStart.alreadyRegisteredProcess = 'localhost:9501';
            processGoodStart = new Process( { options: optionsGoodStart }, done );
        } );

        it( 'should have added the process to the process lists of 1 and 8', function () {
            expect( processGoodStart.allProcesses ).to.be.deep.equal( [
                { id: 1, address: '127.0.0.1', port: 9501 },
                { id: 8, address: '127.0.0.1', port: 9508 }
            ] );
            expect( processBase.allProcesses ).to.be.deep.equal( [
                { id: 1, address: '127.0.0.1', port: 9501 },
                { id: 8, address: '127.0.0.1', port: 9508 }
            ] );
        } );
    } );


    it( 'should only have some specific properties', function () {
        expect( Object.keys( processBase ) ).to.deep.equal( [
            'options', 'dataReplicationCoordinator', 'storage', 'tunnel',
            'allProcesses', 'port', 'id', 'address', 'logger', 'getMeAsJson', 'stop'
        ] ); 
    } );


    it( '.getMeAsJSON() should work', function () {
        expect( processBase.getMeAsJson() ).to.deep.equal( { id: 1, port: 9501, address: '127.0.0.1' } ); 
    } );


    it( 'should false startup', function ( done ) {
        var optionsFalseStartup = util.cloneObject( options );
        optionsFalseStartup.id = 3;
        optionsFalseStartup.port = 9503;
        optionsFalseStartup.logging = false;
        optionsFalseStartup.alreadyRegisteredProcess = '127.0.0.1:9876';
        processFalseStartup = new Process( { options: optionsFalseStartup }, function ( error ) {
            expect( error.error ).to.be.equal( 'timeout for registration exceeded' );
            done();
        } );
    } );


    it( 'todo name', function ( done ) {
        var optionsNotAdded = util.cloneObject( options );
        optionsNotAdded.id = 4;
        optionsNotAdded.port = 9504;
        optionsNotAdded.logging = false;
        var processNotAdded = new Process( {
                options: optionsNotAdded
            }, function () {
                processNotAdded.dataReplicationCoordinator._changeEpoch = function () {
                    var json = {
                        action: 'notAdded'
                    };
                    processNotAdded.tunnel.send( json, '127.0.0.1', 9505 );
                };

                var options5 = util.cloneObject( options );
                options5.id = 5;
                options5.port = 9505;
                options5.logging = false;
                options5.alreadyRegisteredProcess = '127.0.0.1:9504';
                var process5 = new Process( {
                    options: options5
                }, function () {
                    expect( function () {
                        process5.stop( function ( err ) {
                            expect( err ).to.be.instanceof( Error );
                        } );
                    } ).to.not.throw( Error );

                    done();
                } );
            } );
    } );


    it( 'should not throw an error even if logging is set to false', function () {
        expect( processBase.logger.silly() ).to.be.undefined;
        expect( processBase.logger.debug() ).to.be.undefined;
        expect( processBase.logger.verbose() ).to.be.undefined;
        expect( processBase.logger.info() ).to.be.undefined;
        expect( processBase.logger.warn() ).to.be.undefined;
        expect( processBase.logger.error() ).to.be.undefined;
    } );


    it( 'should set the console loggers correctly', function () {
        expect( Object.keys( processDefaultLogging.logger.transports )).to.be.deep.equal( ['console'] );
        expect( Object.keys( processCustomConsoleLogging.logger.transports )).to.be.deep.equal( ['console'] );
        expect( processDefaultLogging.logger.transports.console.level ).to.be.equal( 'info' );
        expect( processCustomConsoleLogging.logger.transports.console.level ).to.be.equal( 'silly' );
    } );


    it( 'should log messages to a log file', function ( done ) {
        this.timeout( 500 );

        async.parallel( [
            function ( callback ) {
                expect( processFileLogging.logger.silly( 'silly', {}, function () {
                    callback( null );
                } )).to.be.undefined;
            },
            function ( callback ) {
                expect( processFileLogging.logger.debug( 'debug', {}, function () {
                    callback( null );
                } )).to.be.undefined;
            },
            function ( callback ) {
                expect( processFileLogging.logger.verbose( 'verbose', {}, function () {
                    callback( null );
                } )).to.be.undefined;
            },
            function ( callback ) {
                expect( processFileLogging.logger.info( 'info', {}, function () {
                    callback( null );
                } )).to.be.undefined;
            },
            function ( callback ) {
                expect( processFileLogging.logger.warn( 'warn', {}, function () {
                    callback( null );
                } )).to.be.undefined;
            },
            function ( callback ) {
                expect( processFileLogging.logger.error( 'error', {}, function () {
                    callback( null );
                } )).to.be.undefined;
            }
        ],
        function () {
            fs.readFile( 'Dares.log', { encoding: 'utf8' }, function ( err, data ) {
                // Convert the log file to json
                data = '[' + data.replace( /\}\n/g, '},' ) + ']';
                data = data.replace( /,\]/, ']' );
                data = JSON.parse( data );

                // Check the timestamp property
                data.forEach( function ( log ) {
                    expect( Object.keys( log )).to.deep.equal( ['level', 'message', 'timestamp'] );
                    expect( log.timestamp.match( /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/ )).to.not.be.null;
                } );

                // Remove the timestamp property
                var mappedData = data.map ( function ( log ) {
                    return {
                        level: log.level,
                        message: log.message
                    };
                } );

                // Check wether exactly the expected messages are logged
                expect( mappedData ).to.deep.equal( [ {
                    level: 'info',
                    message: 'Process 2 server started.'
                }, {
                    level: 'info',
                    message: 'info'
                }, {
                    level: 'warn',
                    message: 'warn'
                }, {
                    level: 'error',
                    message: 'error'
                } ] );

                done();
            } );
        } );
    } );


    after( function () {
        // Delete the log file
        fs.unlink( 'Dares.log' );

        processBase.stop();
        processFileLogging.stop();
        processDefaultLogging.stop();
        processCustomConsoleLogging.stop();
    } );
} );
