'use strict';

var utility = require( '../lib/Dares/utility.js' );
var expect = require( 'chai' ).expect;

describe( 'Utility', function () {
    var sampleList;
    var sampleEdges;

    beforeEach( function ( done ) {
        sampleList = [
            { address: '127.0.0.1', port: 9000, id: 0 },
            { address: 'localhost', port: 9005, id: 4 },
            { address: '127.0.0.1', port: 9001, id: 3 },
            { address: '127.0.0.1', port: 9002, id: 2 },
            { address: '127.0.0.1', port: 9003, id: 1 },
            { address: '127.0.0.1', port: 9004, id: 5 }
        ];
        sampleEdges = sampleList.map( function ( process ) {
            return { target: process };
        } );
        done();
    } );

    describe( '#getIndexForId', function () {
        it( 'should recognize ids correct', function () {
            expect( utility.getIndexForId( sampleList, 0 ) ).to.be.equal( 0 );
            expect( utility.getIndexForId( sampleList, 3 ) ).to.be.equal( 2 );
            expect( utility.getIndexForId( sampleList, 1 ) ).to.be.equal( 4 );
        } );

        it( 'should return -1 for a nonexistent id', function () {
            expect( utility.getIndexForId( sampleList, 10 ) ).to.be.equal( -1 );
        } );
    } );

    describe( '#mapIdToProcess', function () {
        it( 'should return a process with the right id', function () {
            var process;

            process = utility.mapIdToProcess( 0, sampleList );
            expect( process.id ).to.be.equal( 0 );

            process = utility.mapIdToProcess( 4, sampleList );
            expect( process.id ).to.be.equal( 4 );

            process = utility.mapIdToProcess( 1, sampleList );
            expect( process.id ).to.be.equal( 1 );

            process = utility.mapIdToProcess( 5, sampleList );
            expect( process.id ).to.be.equal( 5 );
        } );

        it( 'should return undefined if index is not present', function () {
            var process = utility.mapIdToProcess( sampleList, 10 );
            expect( process ).to.be.equal( undefined );
        } );
    } );

    describe( '#getEdgeIndexForProcessId', function () {
        it( 'should return the right edge index for a given process id', function ( ) {
            expect( sampleEdges[utility.getEdgeIndexForProcessId( sampleEdges, 0 )].target.id ).to.be.equal( 0 );
            expect( sampleEdges[utility.getEdgeIndexForProcessId( sampleEdges, 3 )].target.id ).to.be.equal( 3 );
            expect( sampleEdges[utility.getEdgeIndexForProcessId( sampleEdges, 1 )].target.id ).to.be.equal( 1 );
        } );

        it( 'should return -1 if there is no edge with right target', function () {
            expect( utility.getEdgeIndexForProcessId( sampleEdges, 10 ) ).to.be.equal( -1 );
        } );
    } );


    describe( '#mapIdToChildNodeEdge', function () {
        it( 'should return an edge with the right process attached', function () {
            var edge;

            edge = utility.mapIdToChildNodeEdge( 0, sampleEdges );
            expect( edge.target.id ).to.be.equal( 0 );

            edge = utility.mapIdToChildNodeEdge( 4, sampleEdges );
            expect( edge.target.id ).to.be.equal( 4 );

            edge = utility.mapIdToChildNodeEdge( 1, sampleEdges );
            expect( edge.target.id ).to.be.equal( 1 );

            edge = utility.mapIdToChildNodeEdge( 5, sampleEdges );
            expect( edge.target.id ).to.be.equal( 5 );
        } );

        it( 'should return undefined if such an edge does not exist', function () {
            var edge = utility.mapIdToProcess( sampleEdges, 10 );
            expect( edge ).to.be.equal( undefined );
        } );
    } );

    describe( '#reduceById', function () {
        it( 'should not alter the list if no duplicates are present', function () {
            var list2 = utility.reduceById( sampleList );

            expect( list2 ).to.be.deep.equal( sampleList );
        } );
        it( 'should delete a duplicate', function () {
            var sampleList2 = sampleList.concat( [
                { address: '127.0.0.1', port: 9001, id: 3 }
            ] );
            var list2 = utility.reduceById( sampleList2 );

            expect( list2 ).to.be.deep.equal( sampleList );

            var sampleList3 = sampleList.concat( sampleList );
            var list3 = utility.reduceById( sampleList3 );

            expect( list3 ).to.be.deep.equal( sampleList );
        } );
    } );

    describe( '#deleteById', function () {
        it( 'should not contain a deleted id', function () {
            var list2 = utility.deleteById( 1, sampleList );
            var process = utility.mapIdToProcess( 1, sampleList );
            var process2 = utility.mapIdToProcess( 1, list2 );

            expect( process.id ).to.be.equal( 1 );
            expect( process2 ).to.be.equal( undefined );


            list2 = utility.deleteById( 5, sampleList );
            process = utility.mapIdToProcess( 5, sampleList );
            process2 = utility.mapIdToProcess( 5, list2 );

            expect( process.id ).to.be.equal( 5 );
            expect( process2 ).to.be.equal( undefined );
        } );
        it( 'should not alter the list otherwise', function () {
            var list2 = utility.deleteById( 10, sampleList );

            expect( list2 ).to.be.deep.equal( sampleList );
        } );
    } );


    describe( '#deleteByIds', function () {
        it( 'should not contain any deleted id', function () {
            var list2 = utility.deleteByIds( [1, 2, 3], sampleList );
            var process1 = utility.mapIdToProcess( 1, list2 );
            var process2 = utility.mapIdToProcess( 2, list2 );
            var process3 = utility.mapIdToProcess( 3, list2 );

            expect( process1 ).to.be.equal( undefined );
            expect( process2 ).to.be.equal( undefined );
            expect( process3 ).to.be.equal( undefined );
        } );
        it( 'should not alter the list otherwise', function () {
            var list2 = utility.deleteById( [ 10, 11, 12 ], sampleList );

            expect( list2 ).to.be.deep.equal( sampleList );
        } );
    } );

    describe( '#deleteEdgeById', function () {
        it( 'should not contain an edge for a deleted id', function () {
            var list2 = utility.deleteEdgeById( 1, sampleEdges );
            var edge = utility.mapIdToChildNodeEdge( 1, sampleEdges );
            var edge2 = utility.mapIdToChildNodeEdge( 1, list2 );

            expect( edge.target.id ).to.be.equal( 1 );
            expect( edge2 ).to.be.equal( undefined );

            list2 = utility.deleteEdgeById( 5, sampleEdges );
            edge = utility.mapIdToChildNodeEdge( 5, sampleEdges );
            edge2 = utility.mapIdToChildNodeEdge( 5, list2 );

            expect( edge.target.id ).to.be.equal( 5 );
            expect( edge2 ).to.be.equal( undefined );
        } );

        it( 'should not alter the list otherwise', function () {
            var list2 = utility.deleteEdgeById( 10, sampleEdges );

            expect( list2 ).to.be.deep.equal( sampleEdges );
        } );
    } );

    describe( '#jsonToPrettyString', function () {
        it( 'should behave exactly like  JSON.stringify( -input-, undefined, 2 )', function () {
            expect( utility.jsonToPrettyString( sampleEdges ) ).to.be.deep.equal( JSON.stringify( sampleEdges, undefined, 2 ));
            expect( utility.jsonToPrettyString( sampleList ) ).to.be.deep.equal( JSON.stringify( sampleList, undefined, 2 ));
            expect( utility.jsonToPrettyString( sampleEdges[ 2 ] )).to.be.deep.equal( JSON.stringify( sampleEdges[ 2 ], undefined, 2 ));
            expect( utility.jsonToPrettyString( sampleList[ 2 ] )).to.be.deep.equal( JSON.stringify( sampleList[ 2 ], undefined, 2 ));
        } );
    } );

    describe( '#extractIds', function () {
        it( 'should have the same length', function () {
            var idList = utility.extractIds( sampleList );

            expect( idList.length ).to.be.equal( sampleList.length );
        } );

        it( 'should contain ids that were present before', function () {
            var idList = utility.extractIds( sampleList );
            var process = utility.mapIdToProcess( 1, sampleList );
            var idOfProcess = idList.indexOf( 1 );

            expect( process.id ).to.be.equal( 1 );
            expect( idOfProcess ).not.to.equal( -1 );


            process = utility.mapIdToProcess( 5, sampleList );
            idOfProcess = idList.indexOf( 5 );

            expect( process.id ).to.be.equal( 5 );
            expect( idOfProcess ).not.to.equal( -1 );
        } );
    } );
} );
