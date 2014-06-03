/**
 *
 * readOneWriteAll.js
 * ==================
 *
 * © 2014, TNG Technology Consulting GmbH  
 * Licensed under the Apache License, Version 2.0
 *
 * This file implements a generator for a voting tree for the read one, write all protocol
 *
 */

'use strict';

//
var Node = require( './../logic/node.js' );


/**
 * ## ReadOneWriteAll
 * 
 * @param {Process[]} allProcesses - list of processes which can participate in the voting
 * @return {Node}
 */
var ReadOneWriteAll = function ( allProcesses ) {
    var n = allProcesses.length;
    var idCounter = 1;
    // thresholds for write is = n
    var write = n;
    // thresholds for read is = 1
    var read = 1;
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

module.exports = ReadOneWriteAll;
