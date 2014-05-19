'use strict';

var Coordination = require( '../lib/Dares/coordination.js' );
var expect = require( 'chai' ).expect;
var util = require( '../lib/Dares/utility.js' );
var options = require( '../lib/Dares/defaults.js' );


describe( 'Coordination', function () {

    describe( '#_collectVotes', function () {

        var trueCoord;
        var falseCoord;
        var process1;
        var process2;
        var keyVersion1;
        var keyVersion2;

        before( function () {
            trueCoord = new Coordination( {options: util.cloneObject( options )} );
            falseCoord = new Coordination( {options: util.cloneObject( options )} );

            trueCoord.state = {
                keyVersions: {},
                receivedLocks: 0,
                lockedProcesses: [],
                deniedLocks: 0
            };
            trueCoord.busy = [];

            falseCoord.state =  {
                keyVersions: {},
                receivedLocks: 0,
                lockedProcesses: [],
                deniedLocks: 0
            };
            falseCoord.busy = [];

            process1 = {id: 1};
            process2 = {id: 2};
            keyVersion1 = {key1: 1};
            keyVersion2 = {key2: 2};
            trueCoord._collectVotes( true, process1, keyVersion1 );
            falseCoord._collectVotes( false, process2, keyVersion2 );
        } );

        it( 'positive vote: should have added the keyVersion object to the state, indexed with the processes id', function () {
            expect( trueCoord.state.keyVersions[process1.id] ).to.deep.equal( keyVersion1 );
        } );

        it( 'positive vote: should raised the counter for received locks', function () {
            expect( trueCoord.state.receivedLocks ).to.be.equal( 1 );
        } );

        it( 'positive vote: should have added the process to the locked processes list', function () {
            expect( util.getIndexForId( trueCoord.state.lockedProcesses, process1.id ) ).not.to.equal( -1 );
        } );


        it( 'negative vote: should raised the counter for denied locks', function () {
            expect( falseCoord.state.deniedLocks ).to.be.equal( 1 );
        } );

        it( 'negative vote: should have added the process to the busy processes list', function () {
            expect( util.getIndexForId( falseCoord.busy, process2.id ) ).not.to.equal( -1 );
        } );
    } );

    describe( '#_allLocksReceived', function () {
        var rightCoord;
        var wrongCoord;

        before( function () {
            rightCoord = new Coordination( {options: util.cloneObject( options )} );
            wrongCoord = new Coordination( {options: util.cloneObject( options )} );
            rightCoord.state = {
                receivedLocks: 4,
                deniedLocks: 5,
                quorum: {length: 9}
            };
            wrongCoord.state = {
                receivedLocks: 4,
                deniedLocks: 5,
                quorum: {length: 10}
            };
        } );

        it( 'should recognize a right state', function () {
            expect( rightCoord._allLocksReceived() ).to.be.true;
        } );

        it( 'should recognize a wrong state', function () {
            expect( wrongCoord._allLocksReceived() ).to.be.false;
        } );
    } );

    describe( '#_noDeniedLocks', function () {
        var rightCoord;
        var wrongCoord;

        before( function () {
            rightCoord = new Coordination( {options: util.cloneObject( options )} );
            wrongCoord = new Coordination( {options: util.cloneObject( options )} );
            rightCoord.state = {
                receivedLocks: 4,
                deniedLocks: 0
            };
            wrongCoord.state = {
                receivedLocks: 4,
                deniedLocks: 1
            };
        } );

        it( 'should recognize a right state', function () {
            expect( rightCoord._noDeniedLocks() ).to.be.true;
        } );

        it( 'should recognize a wrong state', function () {
            expect( wrongCoord._noDeniedLocks() ).to.be.false;
        } );
    } );

    describe( '#_updateItsReplicas._computeKeyMaxVersion', function () {
        var keyVersions;
        var keyVersionMax;
        var coord;
        before( function () {
            coord = new Coordination( {options: util.cloneObject( options )} );
            keyVersions = {
                1: {
                    key1: {version: 1},
                    key2: {version: 3}
                },
                2: {
                    key1: {version: 3},
                    key3: {version: 0}
                },
                3: {
                    key3: {version: -1},
                    key2: {version: 1}
                }

            };
            keyVersionMax = coord._updateItsReplicas._computeKeyMaxVersion( keyVersions );

        } );

        it( 'should only contain the provided keys', function () {
            var count = 0;
            for ( var key in keyVersionMax ) {
                if ( keyVersionMax.hasOwnProperty( key ) ) {
                    count++;
                }
            }
            expect( count ).to.be.equal( 3 );
            expect( keyVersionMax.key1 ).not.to.undefined;
            expect( keyVersionMax.key2 ).not.to.undefined;
            expect( keyVersionMax.key3 ).not.to.undefined;
        } );

        it( 'should contain the maximal versions for the keys', function () {
            expect( keyVersionMax.key1.version ).to.be.equal( 3 );
            expect( keyVersionMax.key1.id ).to.be.equal( '2' );


            expect( keyVersionMax.key2.version ).to.be.equal( 3 );
            expect( keyVersionMax.key2.id ).to.be.equal( '1' );


            expect( keyVersionMax.key3.version ).to.be.equal( 0 );
            expect( keyVersionMax.key3.id ).to.be.equal( '2' );
        } );
    } );

    describe( '#_updateItsReplicas._determineOutdatedKeys', function () {
        var keyVersionMax;
        var coord;
        var result;
        before( function () {
            coord = new Coordination( {options: util.cloneObject( options )} );
            coord.state = {
                keyVersions: {
                    1: {
                        currentKey: {version: 1},
                        outdatedKey: {version: 3}
                    }
                }
            };
            coord.process = {id: 1};


            keyVersionMax = {
                currentKey: {version: 1, id: '3'},
                outdatedKey: {version: 4, id: '4'},
                nonPresentKey: {version: 2, id: '2'}
            };

            result = coord._determineOutdatedKeys( keyVersionMax );
        } );

        it( 'should not include a current key', function () {
            expect( result.outdated.currentKey ).to.be.undefined;
        } );
        it( 'should include an outdated key', function () {
            expect( result.outdated.outdatedKey ).not.to.undefined;
        } );
        it( 'should include a key that is not present in the ', function () {
            expect( result.outdated.nonPresentKey ).not.be.undefined;
        } );

        describe( '#_processRead._allReadsReturned', function () {
            var rightCoord;
            var wrongCoord;

            before( function () {
                rightCoord = new Coordination( {options: util.cloneObject( options )} );
                wrongCoord = new Coordination( {options: util.cloneObject( options )} );
                rightCoord.state = {
                    receivedReads: 4,
                    quorum: {length: 4}
                };
                wrongCoord.state = {
                    receivedReads: 4,
                    quorum: {length: 2}
                };
            } );

            it( 'should recognize a right state', function () {
                expect( rightCoord._allReadsReturned() ).to.be.true;
            } );

            it( 'should recognize a wrong state', function () {
                expect( wrongCoord._allReadsReturned() ).to.be.false;
            } );
        } );


    } );
} );
