/**
 *
 * majority.js
 * ===========
 *
 * © 2014, TNG Technology Consulting GmbH  
 * Licensed under the Apache License, Version 2.0
 *
 * This file implements a generator for a voting tree for the majority consensus voting.
 *
 */

'use strict';

//
var Node = require( './../logic/node.js' );

/**
 * ##majorityConsensus
 * Refer to Storm 2012, Specification and Analytical Evaluation of
 * Heterogeneous Dynamic Quorum-Based Data Replication Schemes, Fig.
 * 3.14: Majority Consensus Voting Tree-Shaped Voting Structures [...]
 *
 * @param {Process[]} allProcesses - list of processes which can participate in the voting
 * @return {Node}
 */
var majorityConsensus = function ( allProcesses ) {
    var n = allProcesses.length;
    var idCounter = 1;
    var half = n / 2;
    //thresholds for write is > n/2
    var write = Math.floor( Math.ceil(( n + 1 ) / 2 ));
    //thresholds for read is >= n/2
    var read = Math.floor( half ) === Math.ceil( half ) ? half : write;
    //There's one virtual Node ...
    var root = new Node( { thresholds: [read, write] }, idCounter, 'virtual' );
    idCounter++;

    for ( var i = 0; i < n; i++ ) {
        // ... for which every process is added as a child node with one vote
        root.addChild( new Node( { process: allProcesses[i] }, idCounter, 'physical' ) );
        idCounter++;
    }

    return Node.addParentEdges( root );
};

module.exports = majorityConsensus;
