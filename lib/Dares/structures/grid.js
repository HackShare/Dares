/**
 *
 * grid.js
 * =======
 *
 * © 2014, TNG Technology Consulting GmbH  
 * Licensed under the Apache License, Version 2.0
 *
 * This file implements a generator for a voting tree for the grid protocol.
 *
 */

'use strict';

//
var Node = require( './../logic/node.js' );

/**
 * ##makeGrid
 *
 * @param {number} n - number of processes to generate the grid for
 * @param {boolean} [favorColumns=false] - boolean to decide over the orientation of the grid
 * @return {object}
 * @todo verify...
 */
function makeGrid ( n, favorColumns ) {
    if ( n < 3 ) {
        return { rows: n, columns: 1, diff: 0 };
    }

    var sqrt = Math.sqrt( n );
    var columns = Math.floor( sqrt );
    var rows = Math.ceil( sqrt );

    if ( rows * columns < n ) {
        columns = rows;
    }

    var diff = rows * columns - n;

    if ( favorColumns ) {
        return { rows: columns, columns: rows, diff: diff };
    } else {
        return { rows: rows, columns: columns, diff: diff };
    }
}


/**
 * ##gridProtocol
 * Refer to Storm 2012, Specification and Analytical Evaluation of
 * Heterogeneous Dynamic Quorum-Based Data Replication Schemes, Fig.
 * 3.19(a): Voting Structure Shapes for the Grid Protocol Favoring Rows
 * over Columns
 *
 * @param {Process[]} allProcesses - list of processes which can participate in the voting
 * @param {boolean} favorColumns - boolean to decide over the orientation of the grid
 * @return {Node}
 */
function gridProtocol ( allProcesses, favorColumns ) {
    var n = allProcesses.length;
    var idCounter = 1;
    var grid = makeGrid( n, favorColumns );

    var column;
    var columnNode;
    var row;
    var linearIndexedPosition;

    var root = new Node( { thresholds: [1, 2] }, idCounter, 'virtual' );
    idCounter++;

    var completeColumnCover = new Node( { thresholds: 1 }, idCounter, 'virtual' );
    idCounter++;

    // Populate completeColumnCover (left branch in 3.19(a))
    createSubTree( completeColumnCover, grid.rows );

    var columnCover = new Node( { thresholds: grid.columns }, idCounter, 'virtual' );
    idCounter++;

    // Populate columnCover (right branch in 3.19(a))
    createSubTree( columnCover, 1 );

    /**
     * ###createSubTree
     * Creates the complete column cover and column cover subtrees.
     * 
     * @param {Node} node - complete column cover or column cover node
     * @param {number} thresholds - the thresholds for the virtual child nodes
     */
    function createSubTree ( node, thresholds ) {
        root.addChild( node );
        for ( column = 0; column < grid.columns; column++ ) {
            columnNode = new Node( { thresholds: thresholds }, idCounter, 'virtual' );
            idCounter++;
            node.addChild( columnNode );
            for ( row = 0; row < grid.rows; row++ ) {
                linearIndexedPosition = column + row * grid.columns;
                if ( linearIndexedPosition < n ) {
                    columnNode.addChild( new Node( { process: allProcesses[linearIndexedPosition] }, idCounter, 'physical' ) );
                    idCounter++;
                }
            }
        }
    }

    return Node.addParentEdges( root );
}
gridProtocol.makeGrid = makeGrid;
module.exports = gridProtocol;
