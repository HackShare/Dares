'use strict';

var expect = require( 'chai' ).expect;
var options = require( '../lib/Dares/defaults.js' );
var util = require( '../lib/Dares/utility.js' );

describe( 'Integration Tests', function () {

    it( 'should be able to randomly read and write under varying conditions', function ( done ) {
        this.timeout( 500000 );
        var Process = require( '../lib/Dares/process.js' );
        var jsonToPrettyString = require( '../lib/Dares/utility.js' ).jsonToPrettyString;


        var ProcessPool = [];
        var currentLastId = 1;
        var iterations = 50;
        var rwPerIteration = 20;
        var maxPool = 20;
        var minPool = 8;

        var options1 = util.cloneObject( options );
        options1.port = 9001;
        options1.id = 1;

        ProcessPool.push( new Process( {options: options1} ) );

        var processData = getProcessData( 16 );
        startProcesses( function () {
            beginRandomReadsAndWrites( 10, shutProcessDownAndRW );
        } );


        function startProcesses ( continueWith ) {
            if ( processData.length === 0 ) {
                continueWith();
            } else {
                var next = processData.pop();
                var someKnownProcess = ProcessPool[0];
                next.options.alreadyRegisteredProcess = someKnownProcess.address + ':' + someKnownProcess.port;
                ProcessPool.push( new Process( next, function () {
                    startProcesses( continueWith );
                } ) );
            }
        }


        function shutProcessDownAndRW () {
            if ( ProcessPool.length > minPool ) {
                var count = getRandomInt( 1, 3 );
                for ( count; count > 0; count-- ) {
                    shutRandomProcessDown();
                }
            }
            insertSeparatorToRes();
            beginRandomReadsAndWrites( rwPerIteration, addProcessesAndRW, true );
        }

        function addProcessesAndRW () {
            if ( ProcessPool.length < maxPool ) {
                processData = getProcessData( getRandomInt( 1, 3 ) );
            }
            insertSeparatorToRes();
            startProcesses( function () {
                    beginRandomReadsAndWrites( rwPerIteration, function () {
                        if ( iterations ) {
                            console.log( '-------------\n Iterations left: ' + iterations + '\n-------------' );
                            iterations--;
                            shutProcessDownAndRW();
                        } else {
                            setTimeout( function () {
                                endIt();
                            }, 100 );
                        }
                    }, true );
                }
            );
        }


// random reads and writes
        var keyPool = ['key1', 'key2', 'key3', 'key4'];
        var allActions = initiateAllActions( keyPool );

        function beginRandomReadsAndWrites ( n, afterwards, read ) {
            var randomProcess = getRandomProcess();
            var itsDRC = randomProcess.dataReplicationCoordinator;
            if ( n > 0 ) {
                var key = getRandomKey();
                var value = getRandomIntPredefined();
                if ( !read && getRandomInt( 0, 1 ) ) {

                    itsDRC.write( key, value,
                        function ( success ) {
                            if ( success ) {
                                allActions[key].value = value;
                                allActions[key].lastRead = 'no recent reads';
                                allActions[key].continuous.push( 'wrote ' + value );
                                allActions[key].separate.push( [value] );
                            } else {
                                allActions[key].continuous.push( 'failed to write ' + value );
                                console.log( 'Writing ' + key + ' with value ' + value + ' was not successful' );
                            }
                            console.log( '-----new Operation with n=' + (n - 1) + '-----' );
                            setTimeout( function () {
                                beginRandomReadsAndWrites( n - 1, afterwards, false );
                            }, 0 );
                        }
                    );
                } else {
                    itsDRC.read( key,
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
                                }

                            } else {
                                allActions[key].continuous.push( 'failed to read ' );
                                console.log( 'Reading ' + key + ' was not successful' );
                            }
                            console.log( '-----new Operation with n=' + (n - 1) + '-----' );
                            setTimeout( function () {
                                beginRandomReadsAndWrites( n - 1, afterwards, false );
                            }, 0 );
                        }
                    );
                }
            } else {
                afterwards();
            }
        }


        function getProcessData ( n ) {
            var options2;
            var res = [];

            for ( var i = currentLastId + 1; i < currentLastId + n + 1; i++ ) {
                options2 = util.cloneObject( options );
                options2.port = 9000 + i;
                options2.id = i;
                res.push( {options: options2} );
            }
            currentLastId = currentLastId + n;
            return res;
        }

        function getRandomInt ( min, max ) {
            return Math.floor( Math.random() * (max - min + 1) ) + min;
        }

        function getRandomIntPredefined () {
            return getRandomInt( 0, 30 );
        }

        function getRandomProcess () {
            return ProcessPool[getRandomInt( 0, ProcessPool.length - 1 )];
        }

        function getRandomKey () {
            return keyPool[getRandomInt( 0, keyPool.length - 1 )];
        }

        function initiateAllActions ( keys ) {
            var res = {};
            for ( var key in keys ) {
                if ( keys.hasOwnProperty( key ) ) {
                    res[keys[key]] = {continuous: [], separate: []};
                }
            }
            return res;
        }

        function shutRandomProcessDown () {
            var i = getRandomInt( 0, ProcessPool.length - 1 );
            var process = ProcessPool[i];
            ProcessPool.splice( i, 1 );
            process.stop();
        }
        function insertSeparatorToRes () {
            for ( var key in allActions ) {
                if ( allActions.hasOwnProperty( key ) ) {
                    allActions[key].continuous.push( 'changed process pool' );
                }
            }
        }


        var stripSeparate = function ( allActions ) {
            //probably not the most efficient way, but does the job...
            var copy = JSON.parse( JSON.stringify( allActions ) );

            for ( var key in copy ) {
                if ( copy.hasOwnProperty( key ) ) {
                    delete copy[key].separate;
                }
            }
            return copy;
        };

        function printAll () {
            console.log( '------------------' );
            var curr;
            var key;

            for ( var i = 0; i < ProcessPool.length; i++ ) {
                curr = ProcessPool[i];
                console.log( 'Process ' + curr.id + ' on epoch ' + curr.dataReplicationCoordinator.epoch + ' with ' + curr.allProcesses.length + ' known Processes' );

                console.log( 'stored: \n' + storeToString( curr.storage.getAll() ) );

            }

            console.log( '------------------' );
            console.log( 'results' );
            console.log( jsonToPrettyString( stripSeparate( allActions ) ) );
            var separate;
            for ( var j = 0; j < keyPool.length; j++ ) {
                key = keyPool[j];
                separate = checkSeparate( allActions[key].separate );
                expect( separate ).to.be.true;
                if ( separate ) {
                    console.log( 'key "' + key + '" is clean.' );
                } else {
                    console.log( 'key "' + key + '" violates continuous integrity.' );

                }

            }


            console.log( '------------------' );
            function storeToString ( store ) {
                var str = '';

                for ( var key in store ) {
                    if ( store.hasOwnProperty( key ) ) {
                        str = str + 'key: ' + key + ', value: ' + store[key].value + ', version: ' + store[key].version + '\n';
                    }
                }
                return str;
            }

        }

        function checkSeparate ( sepArr ) {
            for ( var i = 0; i < sepArr.length; i++ ) {
                if ( !partialArrIsHomogen( sepArr[i] ) ) {
                    return false;
                }
            }
            return true;

            function partialArrIsHomogen ( smallArr ) {
                if ( smallArr.length > 0 ) {
                    for ( var i = 1; i < smallArr.length; i++ ) {
                        if ( smallArr[i] !== smallArr[0] ) {
                            return false;
                        }
                    }
                }
                return true;

            }
        }

        function endIt () {
            printAll();
            while ( ProcessPool.length > 0 ) {
                shutRandomProcessDown();
            }
            done();
        }

    });

} );
