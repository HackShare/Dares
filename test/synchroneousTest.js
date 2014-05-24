'use strict';

var expect = require( 'chai' ).expect;
var Dares = require( '../lib/Dares' );

describe( 'Integration Tests', function () {

    it( 'should be able to randomly read and write under varying conditions', function ( done ) {
        this.timeout( 50000 );
        var upperBoundForPool = 20;
        var lowerBoundForPool = 8;
        var iterations = 10;
        var maxStopPerIteration = 1;
        var maxAddPerIteration = 2;

        var keyPool = ['key1', 'key2', 'key3', 'key4'];
        var allActions;

        var rwPerIteration = 40;

        var currentLastId = 1;
        var newInstanceData;
        var daresInstances = [];


        var getInstanceData = function ( n ) {
            var res = [];

            for ( var i = currentLastId + n ; i > currentLastId ; i-- ) {
                res.push( {
                    port: 9000 + i,
                    id: i
                } );
            }
            currentLastId = currentLastId + n;
            return res;
        };


        var initiateAllActions = function ( keys ) {
            var res = {};
            for ( var key in keys ) {
                if ( keys.hasOwnProperty( key ) ) {
                    res[keys[key]] = {value: null, continuous: [], separate: []};
                }
            }
            return res;
        };


        var addInstancesAndRW = function () {
            if ( daresInstances.length < upperBoundForPool ) {
                newInstanceData = getInstanceData( getRandomInt( 1, Math.min( upperBoundForPool - daresInstances.length, maxAddPerIteration ) ) );
            }
            insertSeparatorToRes();
            startInstances( function () {
                    beginRandomReadsAndWrites( rwPerIteration, function () {
                        if ( iterations ) {
                            iterations--;
                            shutInstanceDownAndRW();
                        } else {
                            setTimeout( function () {
                                endIt();
                            }, 100 );
                        }
                    }, true );
                }
            );
        };


        var shutInstanceDownAndRW = function () {
            var continueWith = function () {
                insertSeparatorToRes();
                beginRandomReadsAndWrites( rwPerIteration, function () {
                    if ( iterations ) {
                        iterations--;
                        addInstancesAndRW();
                    } else {
                        setTimeout( function () {
                            endIt();
                        }, 100 );
                    }
                }, true );
            };
            var count = 0;

            if ( daresInstances.length > lowerBoundForPool ) {
                count = getRandomInt( 1, Math.min( daresInstances.length - lowerBoundForPool, maxStopPerIteration ) );
            }
            shutRandomInstanceDown( count, continueWith );
        };

        var shutRandomInstanceDown = function ( count, continueWith ) {
            if ( count > 0 ) {
                var i = getRandomInt( 0, daresInstances.length - 1 );
                var instance = daresInstances.splice( i, 1 )[0];

                instance.stop( function () {
                    shutRandomInstanceDown( count - 1, continueWith );
                } );
            } else {
                continueWith();
            }
        };

        var startInstances = function ( continueWith ) {
            if ( newInstanceData.length === 0 ) {
                continueWith();
            } else {
                var nextData = newInstanceData.pop();
                var someKnownInstance = daresInstances[0];
                var alreadyRegisteredProcess = {
                    alreadyRegisteredProcess: 'localhost:' + someKnownInstance.options.port,
                    logSettings: {
                        console: 'error'
                    }
                };
                
                var newInstance = new Dares( nextData.id, nextData.port, alreadyRegisteredProcess);

                daresInstances.push(newInstance);
                newInstance.start(function (success) {
                    if (!success){
                        daresInstances.pop();
                        newInstanceData.push(nextData);
                    }
                    startInstances( continueWith );
                });
            }
        };


        var insertSeparatorToRes = function () {
            for ( var key in allActions ) {
                if ( allActions.hasOwnProperty( key ) ) {
                    allActions[key].continuous.push( 'changed process pool' );
                }
            }
        };


        var beginRandomReadsAndWrites = function ( n, afterwards, read ) {

            var randomInstance = getRandomInstance();
            if ( n > 0 ) {
                var key = getRandomKey();
                var value = getRandomIntPredefined();
                if ( !read && getRandomInt( 0, 1 ) ) {

                    randomInstance.write( key, value,
                        function ( success ) {
                            if ( success ) {
                                allActions[key].value = value;
                                allActions[key].lastRead = 'no recent reads';
                                allActions[key].continuous.push( 'wrote ' + value );
                                allActions[key].separate.push( [value] );
                            } else {
                                allActions[key].continuous.push( 'failed to write ' + value );
                            }
                            setTimeout( function () {
                                beginRandomReadsAndWrites( n - 1, afterwards, false );
                            }, 0 );
                        }
                    );
                } else {
                    randomInstance.read( key,
                        function ( success, val ) {
                            if ( success ) {
                                allActions[key].lastRead = val;
                                allActions[key].continuous.push( 'read ' + val );
                                if ( val !== null ) {
                                    var length = allActions[key].separate.length;
                                    allActions[key].separate[(length - 1)].push( val );
                                }
                                if ( val !== allActions[key].value ) {
                                    console.log( 'wrong read!' );
                                    console.log( 'read: ' +  val + ', actual value: ' + allActions[key].value );
                                }

                            } else {
                                allActions[key].continuous.push( 'failed to read ' );
                                console.log( 'Reading ' + key + ' was not successful' );
                            }
                            setTimeout( function () {
                                beginRandomReadsAndWrites( n - 1, afterwards, false );
                            }, 0 );
                        }
                    );
                }
            } else {
                afterwards();
            }
        };


        var endIt = function () {
            testAll();

            shutRandomInstanceDown( daresInstances.length, done );
        };

        var testAll = function () {
            var key;

            var separate;
            for ( var j = 0; j < keyPool.length; j++ ) {
                key = keyPool[j];
                separate = checkSeparate( allActions[key].separate );
                expect( separate ).to.be.true;
                if ( !separate ) {
                    console.log( 'key "' + key + '" violates continuous integrity.' );
                }
            }
        };

        var checkSeparate = function ( sepArr ) {

            var partialArrIsHomogen = function ( smallArr ) {
                if ( smallArr.length > 0 ) {
                    for ( var i = 1; i < smallArr.length; i++ ) {
                        if ( smallArr[i] !== smallArr[0] ) {
                            return false;
                        }
                    }
                }
                return true;
            };


            for ( var i = 0; i < sepArr.length; i++ ) {
                if ( !partialArrIsHomogen( sepArr[i] ) ) {
                    return false;
                }
            }
            return true;
        };


        var getRandomInstance = function () {
            var randInt = getRandomInt( 0, daresInstances.length - 1 );
            return daresInstances[randInt];
        };

        var getRandomInt = function ( min, max ) {
            return Math.floor( Math.random() * (max - min + 1) ) + min;
        };

        var getRandomKey = function () {
            return keyPool[getRandomInt( 0, keyPool.length - 1 )];
        };

        var getRandomIntPredefined = function () {
            return getRandomInt( 0, 42 );
        };

        var start = function () {
            newInstanceData = getInstanceData( 8 );
            startInstances( function () {
                beginRandomReadsAndWrites( rwPerIteration, shutInstanceDownAndRW );
            } );

        };

        //actual code


        allActions = initiateAllActions( keyPool );
        
        
        var firstInstance = new Dares( currentLastId, 9001, {
            logSettings: {
                console: 'error'
            }
        } );

        daresInstances.push( firstInstance );
        firstInstance.start( start );
    } );
} );
