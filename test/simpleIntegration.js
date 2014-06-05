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
    options1.logging = {
        console: 'error'
    };

    options2.id = 2;
    options2.port = 8002;
    options2.alreadyRegisteredProcess = known;
    options2.logging = {
        console: 'error'
    };

    options3.id = 3;
    options3.port = 8003;
    options3.alreadyRegisteredProcess = known;
    options3.logging = {
        console: 'error'
    };

    options4.id = 4;
    options4.port = 8004;
    options4.alreadyRegisteredProcess = known;
    options4.logging = {
        console: 'error'
    };

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

        after( function ( done ) {
            process2.stop( function () {
                process3.stop( function () {
                    process4.stop( done );
                } );
            } );
        } );
    } );

    after( function ( done ) {
        process1.stop( done );
    } );

} );
