/**
 *
 * quorum.js
 * =========
 *
 * © 2014, TNG Technology Consulting GmbH  
 * Licensed under the Apache License, Version 2.0
 *
 * This file provides the utility to assemble a quorum.
 *
 */

'use strict';

//
var reduceById = require( '../utility.js' ).reduceById;
var mapIdToEdge = require( '../utility.js' ).mapIdToChildNodeEdge;
var deleteEdgeById = require( '../utility.js' ).deleteEdgeById;
var getIndexForId = require( '../utility.js' ).getIndexForId;
var shuffle = require( '../utility.js' ).shuffle;

//##build
//input parameters are
//
// * `rootNode:` root Node with attached voting tree
//
// * `operation:` operation for which the quorum shall be assembled, either 'read' or 'write'
//
// * `ignore:` ids that are not allowed in this quorum
//
// * `processesToPrioritize:` array of processes which _should_ be in the quorum. Ascending priority
//
//this method starts the recursion to traverse the voting tree
function build ( rootNode, operation, ignore, processesToPrioritize ) {
    processesToPrioritize = typeof processesToPrioritize !== 'undefined' ? processesToPrioritize : [];
    ignore = typeof ignore !== 'undefined' ? ignore : [];
    //console.log('-begin!');
    sortTree( rootNode, operation );
    //console.log('-sorted!');
    prioritySearch( rootNode, processesToPrioritize );
    //console.log('-searched!');
    var quorum = buildQuorumHelper( rootNode, operation, ignore ).quorum;
    return reduceById( quorum.map( function ( node ) {
        return node.process;
    } ) );
}

//##sortTree
// input parameters:
//
// * `localRoot:` current entry point for recursive traversal
//
// * `operation:` operation for which the quorum shall be assembled, either 'read' or 'write'
//
// sorts all nodes by operation priority.
function sortTree ( localRoot, operation ) {
    var sortField = operation + 'Priority';
    //first shuffle
    localRoot.childrenEdges = shuffle( localRoot.childrenEdges );
    //then sort, to implement a completely unstable sorting
    localRoot.childrenEdges = localRoot.childrenEdges.sort( function ( e1, e2 ) {
        //ascending sorting of the children
        return e1[sortField] - e2[sortField];
    } );
    if ( localRoot.type === 'virtual' ) {
        var child;
        for ( var i = 0; i < localRoot.childrenEdges.length; i++ ) {
            child = localRoot.childrenEdges[i].target;
            sortTree( child, operation );
        }
    }
}


//##prioritySearch
// input parameters:
//
// * `localRoot:` current entry point for recursive traversal
//
// * `processIdsToPrioritize:` array of process ids which shall be prioritized
//
// this function traverses the tree and puts nodes with a matching process at the beginning of the
//childrenEdges array
function prioritySearch ( localRoot, processIdsToPrioritize ) {
    if ( localRoot.type === 'virtual' ) {
        var childEdge;
        //console.log('going down');
        for ( var i = 0; i < localRoot.childrenEdges.length; i++ ) {
            //console.log('child');
            childEdge = localRoot.childrenEdges[i];
            prioritySearch( childEdge.target, processIdsToPrioritize );
        }
    } else if ( localRoot.type === 'physical' ) {
        //console.log('physical!');
        if ( getIndexForId( processIdsToPrioritize, localRoot.process.id ) !== -1 ) {
            //console.log('prioritize!');
            prioritize( localRoot.parent, localRoot.id );
        }
    } else {
        throw new Error( 'Node type not supported' );
    }
}

//##prioritize
//input parameters:
//
// * `currentNode:` the current position in the tree
//
// * `prioritizeId:` nodeId to prioritize
//
// traverses the tree upwards, delete the marked child
// and inserted back again at the beginning of the array
function prioritize ( currentNode, prioritizeId ) {
    //get the prioritized child
    var priorityChild = mapIdToEdge( prioritizeId, currentNode.childrenEdges );
    currentNode.childrenEdges = deleteEdgeById( priorityChild.target.id, currentNode.childrenEdges );
    //and insert it at the beginning of the array
    currentNode.childrenEdges.unshift( priorityChild );

    //if there exists a parent to this node, we step up recursively, prioritizing this node
    if ( currentNode.parent ) {
        prioritize( currentNode.parent, currentNode.id );
    }
}


//##buildQuorumHelper
//input parameters are
//
// * `rootNode:` root Node with attached voting tree
//
// * `operation:` operation for which the quorum shall be assembled, either 'read' or 'write'
//
// * `ignore:` ids that are not allowed in this quorum
//
//recursive function to traverse the voting tree and assemble the quorum
function buildQuorumHelper ( rootNode, operation, ignore ) {
    var quorum = [];

    //Physical nodes may only be leaves.
    if ( rootNode.type === 'physical' ) {
        //Therefore our quorum is empty if the leaf is on the blacklist
        if ( getIndexForId( ignore, rootNode.process.id ) !== -1 ) {
            return { quorum: [] };
        } else {
            //or otherwise just the node.
            return { vote: rootNode.vote, quorum: [rootNode] };
        }
        //Virtual nodes on the other hand are the inner nodes of the voting tree
    } else if ( rootNode.type === 'virtual' ) {
        var have = 0;
        var required;

        if ( operation === 'read' ) {
            required = rootNode.readThreshold;
        } else if ( operation === 'write' ) {
            required = rootNode.writeThreshold;
        }
        // recursion time
        // traverse the tree and collect the sub-quorums from every node.
        // The traversal path will be like shown below. Edges are sorted with higher
        //priority on the left side, processes to be prioritized are on the left.
        // Also the Binary Tree is just an example,
        // most of the times there will be more child nodes
        // &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;7
        // &nbsp;&nbsp;&nbsp;3&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;6
        // 1&nbsp;&nbsp;&nbsp;2&nbsp;&nbsp;&nbsp;&nbsp;4&nbsp;&nbsp;&nbsp;5
        for ( var i = 0; have < required && i < rootNode.childrenEdges.length; i++ ) {
            var subQuorum = buildQuorumHelper( rootNode.childrenEdges[i].target, operation, ignore );
            if ( subQuorum.vote ) {
                have += subQuorum.vote;
                quorum = quorum.concat( subQuorum.quorum );
            }
        }
        //if we couldn't get enough votes, this arm of the tree can't represent a valid voting structure,
        //return an empty quorum
        if ( have < required ) {
            return { quorum: [] };
        } else {
            return { vote: rootNode.vote, quorum: quorum };
        }
    } else {
        throw new Error( 'Node type not supported' );
    }
}

exports.build = build;
