/**
 *
 * node.js
 * =======
 *
 * © 2014, TNG Technology Consulting GmbH  
 * Licensed under the Apache License, Version 2.0
 *
 * This file implements one node of the voting structure tree.
 *
 */

'use strict';


/**
 * The Node constructor creates a single node, which can be part of a voting structure tree.
 * @classdesc The Node class implements nodes for voting structure trees and methods on them.
 * 
 * @param {object} options - json object, containing  
 *     `thresholds` - array of the form [readThreshold, writeThreshold]. If only a number _n_
 * is provided, thresholds will be set to [_n_, _n_]. If thresholds is omitted completely, it
 * defaults to [0, 0]  
 *     `process` - process associated with this node. Left empty on a virtual node  
 *     `vote` - number of votes this node has
 * @param {number} id - id of the node, necessary for restructuring the tree. Must be unique for the children of it's parent
 * @param {string} type - type of the node, must be either 'virtual' or 'physical'.
 */
function Node ( options, id, type ) {
    if ( !( type === 'virtual' || type === 'physical' )) {
        throw new Error( 'Node type "' + type + '" not supported.' );
    }

    if ( !options.thresholds ) {
        options.thresholds = [0, 0];
    } else if ( typeof options.thresholds === 'number' ) {
        options.thresholds = [options.thresholds, options.thresholds];
    }

    this.id = id;
    this.type = type;
    this.process = options.process;
    this.vote = options.vote || 1;
    this.writeThreshold = options.thresholds.pop();
    this.readThreshold = options.thresholds.pop();

    this.childrenEdges = [];
    this.parent = undefined;
}


/**
 * ##addChild
 * deletes the associated parent from every node in the tree
 * necessary to allow conversion to a json string, as parents introduce
 * cyclic dependencies
 *
 * param {Node} target - target node the edge leads to
 * param {number} readPriority - priority of this edge for creating a quorum for a read operation
 * param {number} writePriority - priority of this edge for creating a quorum for a write operation
 */
Node.prototype.addChild = function ( target, readPriority, writePriority ) {
    this.childrenEdges.push( {
        target: target,
        readPriority: readPriority || Number.POSITIVE_INFINITY,
        writePriority: writePriority || Number.POSITIVE_INFINITY
    } );
};


/**
 * ##deleteParentEdges
 * deletes the associated parent from every node in the tree
 * necessary to allow conversion to a json string, as parents introduce
 * cyclic dependencies
 *
 * @param {Node} root - root node of the tree to be converted
 * @return {Node} The node with its parents removed
 */
Node.deleteParentEdges = function ( root ) {
    root.parent = undefined;
    var childEdge;
    for ( var i = 0; i < root.childrenEdges.length; i++ ) {
        childEdge = root.childrenEdges[i];
        Node.deleteParentEdges ( childEdge.target );
    }
    return root;
};


/**
 * ##addParentEdges
 * converts the tree such root it can be traversed in both directions
 *
 * @param {Node} root - root node of the tree to be converted
 * @return {Node} The node with its parents added
 */
Node.addParentEdges = function ( root ) {
    var childEdge;
    for ( var i = 0; i < root.childrenEdges.length; i++ ) {
        childEdge = root.childrenEdges[i];
        childEdge.target.parent = root;
        Node.addParentEdges( childEdge.target );
    }
    return root;
};


/**
 * ##fusionNode
 * creates and returns a new virtual node with edges to the supplied nodes.
 * Gets one vote and a writeThreshold of 2
 *
 * @param {Node} node1 - the first node
 * @param {Node} node2 - the second node
 * @return {Node} The fusion node
 */
Node.fusionNode = function ( node1, node2 ) {
    if ( node2.id !== 0 ) {
        node1.id = 0;
    } else {
        node1.id = 1;
    }
    var node = new Node( {}, 3, 'virtual' );

    node.vote = 1;
    node.writeThreshold = 2;
    node.childrenEdges = [];
    node.addChild( node1 );
    node.addChild( node2 );
    node1.parent = node;
    node2.parent = node;
    return node;
};


module.exports = Node;
