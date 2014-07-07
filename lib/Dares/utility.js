/**
 *
 * utility.js
 * ==========
 *
 * © 2014, TNG Technology Consulting GmbH  
 * Licensed under the Apache License, Version 2.0
 *
 * This file implements various operations on arrays.
 *
 */

'use strict';

//
var Utility = {};

/**
 * ##getIndexForId
 * Returns the first index of a process with id `id` or -1 when not found.
 * 
 * @param {Process[]} allP - list of processes
 * @param {number} id - id to find
 * @return {number}
 */
Utility.getIndexForId = function ( allP, id ) {
    for ( var i = 0; i < allP.length; i++ ) {
        if ( allP[i].id === id ) {
            return i;
        }
    }
    return -1;
};


/**
 * ##mapIdToProcess
 * Searches a list of processes for a process with the specified id and returns it.
 *
 * @param {number} id - id to be mapped
 * @param {Process[]} processes - process list to search through
 * @return {Process}
 */
Utility.mapIdToProcess = function ( id, processes ) {
    return processes[Utility.getIndexForId( processes, id )];
};


/**
 * ##getEdgeIndexForProcessId
 * Returns the first index of an edge with target id `id` or -1 when not found.
 * 
 * @param {array} allEdges - list of edges
 * @param {number} id - id to find
 * @return {number}
 */
Utility.getEdgeIndexForProcessId = function ( allEdges, id ) {
    for ( var i = 0; i < allEdges.length; i++ ) {
        if ( allEdges[i].target.id === id ) {
            return i;
        }
    }
    return -1;
};



/**
 * ##mapIdToChildNode
 * Searches a list of edges for an edge with target with the
 * specified id and returns it.
 * 
 * @param {number} id - id to be mapped
 * @param {Node[]} edges - edge list to search through
 * @return {Node}
 */
Utility.mapIdToChildNodeEdge = function ( id, edges ) {
    return edges[Utility.getEdgeIndexForProcessId( edges, id )];
};


/**
 * ##reduceById
 * Returns a duplicate free copy of the input list
 * 
 * @param {Process[]} processes - processes to reduce
 * @return {Process[]}
 */
Utility.reduceById = function ( processes ) {
    var res = [];

    processes.forEach( function ( process ) {
        var id = process.id;
        if ( Utility.getIndexForId( res, id ) === -1 ) {
            res.push( process );
        }
    } );
    return res;
};

/**
 * ##deleteById
 * Returns a copy of the array with no processes with id `id`.
 *
 * @param {number} id - id to delete
 * @param {Process[]} processes - list of processes
 * @return {Process[]}
 */
Utility.deleteById = function ( id, processes ) {
    return processes.filter( function ( process ) {
        return process.id !== id;
    } );
};


/**
 * ##deleteByIds
 * returns a copy of the array with no processes with id `id`
 * 
 * @param {number[]} ids - ids to delete
 * @param {Process[]} processes - list of processes
 * @return {Process[]}
 */
Utility.deleteByIds = function ( ids, processes ) {
    return processes.filter( function ( process ) {
        return ids.indexOf( process.id ) === -1;
    } );
};

/**
 * ##deleteEdgeById
 * Returns a copy of the array with no processes with id `id`.
 * 
 * @param {number} id - id to delete
 * @param {Process[]} processes - list of processes
 * @return {Process[]}
 */
Utility.deleteEdgeById = function ( id, processes ) {
    return processes.filter( function ( process ) {
        return process.target.id !== id;
    } );
};

/**
 * ##jsonToPrettyString
 * Shortcut for `JSON.stringify( json, undefined, 2 )`
 * 
 * @param {object} json - json object to convert
 * @return {string}
 */
Utility.jsonToPrettyString = function ( json ) {
    return JSON.stringify( json, undefined, 2 );
};

/**
 * ##extractIds
 * Returns an array of the processes ids
 * 
 * @param {Process[]} processes - list of processes
 * @return {number[]}
 */
Utility.extractIds = function ( processes ) {
    var res = [];
    for ( var i = 0; i < processes.length; i++ ) {
        res.push( processes[i].id );
    }
    return res;
};

module.exports = Utility;
