'use strict';

var expect = require( 'chai' ).expect;
var Process = require( '../lib/Dares/process.js' );
var options = require( '../lib/Dares/defaults.js' );
var util = require( '../lib/Dares/utility.js' );


describe( 'Integration Tests', function () {

    var known = 'localhost:8001';
    var process1;
    var process2;
    var process3;
    var process4;

    var options1 = util.cloneObject( options );
    var options2 = util.cloneObject( options );
    var options3 = util.cloneObject( options );
    var options4 = util.cloneObject( options );

    options1.id = 1;
    options1.port = 8001;

    options2.id = 2;
    options2.port = 8002;
    options2.alreadyRegisteredProcess = known;

    options3.id = 3;
    options3.port = 8003;
    options3.alreadyRegisteredProcess = known;

    options4.id = 4;
    options4.port = 8004;
    options4.alreadyRegisteredProcess = known;

    before( function ( done ) {
        process1 = new Process( {options: options1}, function () {
            done();
        } );
    } );

    describe( 'normal read and write', function () {
        before( function ( done ) {
            process2 = new Process( {options: options2}, function () {

                process3 = new Process( {options: options3}, function () {

                    process4 = new Process( {options: options4}, function () {
                        done();
                    } );
                } );
            } );
        } );

        it( 'p1 knows all processes', function () {
            expect( process1.allProcesses ).to.have.length( 4 );
        } );


        it( 'should write without error', function ( done ) {
            process2.dataReplicationCoordinator.write( 'key1', 15,
                function ( success ) {
                    expect( success ).to.be.true;
                    done();
                } );
        } );

        it( 'should read the provided key', function ( done ) {
            process2.dataReplicationCoordinator.write( 'readThis', 42,
                function ( success ) {
                    expect( success ).to.be.true;
                    process2.dataReplicationCoordinator.read( 'readThis', function ( success, val ) {
                        expect( success ).to.be.true;
                        expect( val ).to.be.equal( 42 );
                        done();
                    } );
                } );

        } );

        after( function (done) {
            process2.stop(function () {
                process3.stop(function () {
                    process4.stop(done);
                });
            });
        } );
    } );

    after( function (done) {
        process1.stop(done);
    } );

} );