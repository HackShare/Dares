'use strict';

var expect = require( 'chai' ).expect;
var Dares = require( '../lib/Dares.js' );

describe( 'API Tests', function () {

    var known = 'localhost:9001';
    var instance1;
    var instance2;
    var instance3;
    var instance4;

    var options1 = {};
    var options2 = {};
    var options3 = {};
    var options4 = {};

    options1.logging = {
        console: 'error'
    };

    options2.alreadyRegisteredProcess = known;
    options2.logging = {
        console: 'error'
    };

    options3.alreadyRegisteredProcess = known;
    options3.logging = {
        console: 'error'
    };

    options4.alreadyRegisteredProcess = known;
    options4.logging = {
        console: 'error'
    };

    before( function ( done ) {
        instance1 = new Dares( 1, 9001, options1);
        instance2 = new Dares( 2, 9002, options2);
        instance3 = new Dares( 3, 9003, options3);
        instance4 = new Dares( 4, 9004, options4);
        instance1.start( function () {
            done();
        } );

    } );

    describe( 'normal read and write', function () {
        before( function ( done ) {
            instance2.start( function () {
                instance3.start( function () {
                    instance4.start( function () {
                        done();
                    } );
                } );
            } );
        } );


        it( 'should write without error', function ( done ) {
            instance2.write( 'key1', 15,
                function ( error ) {
                    expect( error ).to.be.falsy;
                    done();
                } );
        } );


        it( 'should read the provided key', function ( done ) {
            instance2.write( 'readThis', 42,
                function ( error ) {
                    expect( error ).to.be.falsy;
                    instance2.read( 'readThis', function ( error, returnObj ) {
                        expect( error ).to.be.falsy;
                        expect( returnObj.value ).to.be.equal( 42 );
                        done();
                    } );
                } );
        } );


        it( 'should be possible to use hasOwnProperty as a key', function ( done ) {
            instance2.write( 'hasOwnProperty', 42,
                function ( error ) {
                    expect( error ).to.be.falsy;
                    instance2.read( 'hasOwnProperty', function ( error, returnObj ) {
                        expect( error ).to.be.falsy;
                        expect( returnObj.value ).to.be.equal( 42 );
                        done();
                    } );
                } );
        } );


        it( 'getStoredValue', function ( done ) {
            instance2.write( 'stored', 1337, function ( error ) {
                expect( error ).to.be.null;
                var counter = 0;
                instance1.getStoredValue( 'stored', function ( error, val ) {
                    expect( error ).to.be.null;
                    if ( val && val.value === 1337 ) {
                        counter++;
                    }

                    instance2.getStoredValue( 'stored', function ( error, val ) {
                        expect( error ).to.be.null;
                        if ( val && val.value === 1337 ) {
                            counter++;
                        }

                        instance3.getStoredValue( 'stored', function ( error, val ) {
                            expect( error ).to.be.null;
                            if ( val && val.value === 1337 ) {
                                counter++;
                            }

                            instance4.getStoredValue( 'stored', function ( error, val ) {
                                expect( error ).to.be.null;
                                if ( val && val.value === 1337 ) {
                                    counter++;
                                }
                                expect( counter ).to.be.equal( 3 );

                                done();
                            } );
                        } );
                    } );
                } );
            } );
        } );


        it( 'should register onNewKey listeners and remove specific listeners', function ( done ) {
            var counter1 = 0;
            var counter2 = 0;
            var inc1 = function () {
                    counter1++;
                };
            var inc2 = function () {
                    counter2++;
                };

            instance1.onNewKey( inc1 );
            instance2.onNewKey( inc1 );
            instance3.onNewKey( inc1 );
            instance4.onNewKey( inc1 );

            instance1.onNewKey( inc2 );
            instance2.onNewKey( inc2 );
            instance3.onNewKey( inc2 );
            instance4.onNewKey( inc2 );

            instance2.write( 'newKey', 'onNewKeyTest',
                function ( error ) {
                    expect( error ).to.be.falsy;
                    expect( counter1 ).to.be.equal( 3 );
                    expect( counter2 ).to.be.equal( 3 );

                    instance1.offNewKey( inc1 );
                    instance2.offNewKey( inc1 );
                    instance3.offNewKey( inc1 );
                    instance4.offNewKey( inc1 );

                    instance2.write( 'newKey1', 'onNewKeyTest',
                        function ( error ) {
                            expect( error ).to.be.falsy;
                            expect( counter1 ).to.be.equal( 3 );
                            expect( counter2 ).to.be.equal( 6 );
                            done();
                        } );
                } );
        } );


        it( 'should register onNewKey listeners and remove all listeners', function ( done ) {
            var counter = 0;
            var inc = function () {
                    counter++;
                };

            instance1.onNewKey( inc );
            instance2.onNewKey( inc );
            instance3.onNewKey( inc );
            instance4.onNewKey( inc );

            instance2.write( 'newKey2', 'onNewKeyTest',
                function ( error ) {
                    expect( error ).to.be.falsy;
                    expect( counter ).to.be.equal( 3 );

                    instance1.offNewKey();
                    instance2.offNewKey();
                    instance3.offNewKey();
                    instance4.offNewKey();

                    instance2.write( 'newKey3', 'onNewKeyTest',
                        function ( error ) {
                            expect( error ).to.be.falsy;
                            expect( counter ).to.be.equal( 3 );
                            done();
                        } );
                } );
        } );


        it( 'should register onChange listeners and remove specific listeners', function ( done ) {
            var counter1 = 0;
            var counter2 = 0;
            var inc1 = function () {
                    counter1++;
                };
            var inc2 = function () {
                    counter2++;
                };

            instance1.onChange( inc1 );
            instance2.onChange( inc1 );
            instance3.onChange( inc1 );
            instance4.onChange( inc1 );

            instance1.onChange( inc2 );
            instance2.onChange( inc2 );
            instance3.onChange( inc2 );
            instance4.onChange( inc2 );


            instance2.write( 'newKey', 'onChangeTest', function ( error ) {
                expect( error ).to.be.falsy;
                expect( counter1 ).to.be.equal( 3 );
                expect( counter2 ).to.be.equal( 3 );

                instance1.offChange( inc1 );
                instance2.offChange( inc1 );
                instance3.offChange( inc1 );
                instance4.offChange( inc1 );

                instance2.write( 'newKey', 'onChangeTest', function ( error ) {
                    expect( error ).to.be.falsy;
                    expect( counter1 ).to.be.equal( 3 );
                    expect( counter2 ).to.be.equal( 6 );
                    done();
                } );
            } );
        } );


        it( 'should register onChange listeners and remove all listeners', function ( done ) {
            var counter = 0;
            var inc = function () {
                    counter++;
                };

            instance1.onChange( inc );
            instance2.onChange( inc );
            instance3.onChange( inc );
            instance4.onChange( inc );

            instance2.write( 'newKey', 'onChangeTest', function ( error ) {
                expect( error ).to.be.falsy;
                expect( counter ).to.be.equal( 3 );

                instance1.offChange();
                instance2.offChange();
                instance3.offChange();
                instance4.offChange();

                instance2.write( 'newKey', 'onChangeTest', function ( error ) {
                        expect( error ).to.be.falsy;
                        expect( counter ).to.be.equal( 3 );
                        done();
                    } );
            } );
        } );


        after( function ( done ) {
            instance2.stop( function () {
                instance3.stop( function () {
                    instance4.stop( done );
                } );
            } );
        } );
    } );


    after( function ( done ) {
        instance1.stop( done );
    } );

} );
