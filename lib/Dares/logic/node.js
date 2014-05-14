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


//##Node
//to instantiate, the following parameters have to be supplied:
//
// * `options:` json object, containing
//
//    * `thresholds:` array of the form [readThreshold, writeThreshold]. If only a number _n_
//is provided, thresholds will be set to [_n_, _n_]. If thresholds is omitted completely, it
//defaults to [0, 0]
//
//    * `process:` process associated with this node. Left empty on a virtual node
//
//    * `vote:` number of votes this node has
//
// * `id:` id of the node, necessary for restructuring the tree. Must be unique for the children of it's parent
//
// * `type:` type of the node, must be either 'virtual' or 'physical'.
function Node ( options, id, type ) {
    if ( !(this instanceof Node) ) {
        throw new Error( 'Constructor called as a function' );
    }

    if ( !(type === 'virtual' || type === 'physical') ) {
        throw new Error( 'Node type "' + type + '" not supported.' );
    }

    if ( !options.thresholds ) {
        options.thresholds = [0, 0];
    } else if ( typeof options.thresholds === 'number' ) {
        options.thresholds = [options.thresholds, options.thresholds];
    }

    var that = this;

    that.id = id;
    that.type = type;
    that.process = options.process;
    that.vote = options.vote || 1;
    that.writeThreshold = options.thresholds.pop();
    that.readThreshold = options.thresholds.pop();

    that.childrenEdges = [];
    that.parent = undefined;

    //###addChild
    //input parameters:
    //
    // * `target:` target node the edge leads to
    //
    // * `readPriority:` priority of this edge for creating a quorum for a read operation
    //
    // * `writePriority:` priority of this edge for creating a quorum for a write operation
    //
    this.addChild = function ( target, readPriority, writePriority ) {
        that.childrenEdges.push( {
            target: target,
            readPriority: readPriority || Number.POSITIVE_INFINITY,
            writePriority: writePriority || Number.POSITIVE_INFINITY
        } );
    };
}


//##deleteParentEdges
//input parameter:
//
// * `that:` root node of the tree to be converted
//
//deletes the associated parent from every node in the tree
//necessary to allow conversion to a json string, as parents introduce
//cyclic dependencies
Node.deleteParentEdges = function ( that ) {
    that.parent = undefined;
    var childEdge;
    for ( var i = 0; i < that.childrenEdges.length; i++ ) {
        childEdge = that.childrenEdges[i];
        Node.deleteParentEdges ( childEdge.target );
    }
    return that;
};

//##addParentEdges
//input parameter:
//
// * `that:` root node of the tree to be converted
//
//converts the tree such that it can be traversed in both directions
Node.addParentEdges = function ( that ) {
    var childEdge;
    for ( var i = 0; i < that.childrenEdges.length; i++ ) {
        childEdge = that.childrenEdges[i];
        childEdge.target.parent = that;
        Node.addParentEdges( childEdge.target );
    }
    return that;
};



//##fusionNode
//input parameters
//
// * `node1:` first node
//
// * `node2:` second node
//
// creates and returns a new virtual node with edges to the supplied nodes.
// Gets one vote and a writeThreshold of 2
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
