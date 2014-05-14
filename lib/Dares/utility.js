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

//##getIndexForId
//input parameters:
//
// * `allP:` list of processes
//
// * `id:` id to find
//
// returns the first index of a process with id `id` or -1 when not found
Utility.getIndexForId = function ( allP, id ) {
    for ( var i = 0; i < allP.length; i++ ) {
        if ( allP[i].id === id ) {
            return i;
        }
    }
    return -1;
};


//##mapIdToProcess
//input parameters:
//
// * `id:` id to be mapped
//
// * `processes:` process list to search through
//
// searches a list of processes for a process with the specified id and returns it
Utility.mapIdToProcess = function ( id, processes ) {
    return processes[Utility.getIndexForId( processes, id )];
};


//##getEdgeIndexForProcessId
//input parameters:
//
// * `allEdges:` list of edges
//
// * `id:` id to find
//
// returns the first index of an edge with target id `id` or -1 when not found
Utility.getEdgeIndexForProcessId = function ( allEdges, id ) {
    for ( var i = 0; i < allEdges.length; i++ ) {
        if ( allEdges[i].target.id === id ) {
            return i;
        }
    }
    return -1;
};


//##mapIdToChildNode
//input parameters:
//
// * `id:` id to be mapped
//
// * `edges:` edge list to search through
//
// searches a list of edges for an edge with target with the
// specified id and returns it
Utility.mapIdToChildNodeEdge = function ( id, edges ) {
    return edges[Utility.getEdgeIndexForProcessId( edges, id )];
};


//##reduceById
//input parameters:
//
// * `processes:` processes to reduce
//
//returns a duplicate free copy of the input list
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

//##deleteById
//input parameters:
//
// * `id:` id to delete
//
// * `processes:` list of processes
//
//returns a copy of the array with no processes with id `id`
Utility.deleteById = function ( id, processes ) {
    return processes.filter( function ( process ) {
        return process.id !== id;
    } );
};

//##deleteByIds
//input parameters:
//
// * `ids:` ids to delete
//
// * `processes:` list of processes
//
//returns a copy of the array with no processes with id `id`
Utility.deleteByIds = function ( ids, processes ) {
    return processes.filter( function ( process ) {
        return ids.indexOf( process.id ) === -1;
    } );
};

//##deleteEdgeById
//input parameters:
//
// * `id:` id to delete
//
// * `processes:` list of processes
//
//returns a copy of the array with no processes with id `id`
Utility.deleteEdgeById = function ( id, edges ) {
    return edges.filter( function ( edge ) {
        return edge.target.id !== id;
    } );
};

//##jsonToPrettyString
//input parameters:
//
// * `json:` json object to convert
//
// shortcut for `JSON.stringify( json, undefined, 2 )`
Utility.jsonToPrettyString = function ( json ) {
    return JSON.stringify( json, undefined, 2 );
};

//##extractIds
//input parameters:
//
// * `processes:` list of processes
//
// returns an array of the processes ids
Utility.extractIds = function ( processes ) {
    var res = [];
    for ( var i = 0; i < processes.length; i++ ) {
        res.push( processes[i].id );
    }
    return res;
};

//##shuffle
//input parameters:
//
// * `array:` the array to be shuffled
//
// shuffles the array in place using the Fisher–Yates shuffle.
Utility.shuffle = function ( array ) {
    var index;
    var temp;
    var counter = array.length;

    // While there are elements in the array
    while ( counter > 0 ) {
        // Pick a random index
        index = Math.floor( Math.random() * counter );

        // Decrease counter by 1
        counter--;

        // And swap the last element with it
        temp = array[counter];
        array[counter] = array[index];
        array[index] = temp;
    }

    return array;
};

//##extend
//input parameters:
//
// * `defaults:` the object to extend
// * `extension:` the object which extends the defaults
//
// Returns a new object created by overwriting exiting values in the first object by values in the second one.
Utility.extend = function ( defaults, extension ) {
    var key;
    var returnObject = {};

    for ( key in defaults ) {
        if ( defaults.hasOwnProperty( key ) ) {
            if ( extension.hasOwnProperty( key ) ) {
                if ( typeof defaults[key] === 'object' && typeof extension[key] === 'object' ) {
                    returnObject[key] = Utility.extend( defaults[key], extension[key] );
                } else {
                    returnObject[key] = extension[key];
                }
            } else {
                returnObject[key] = defaults[key];
            }
        }
    }
    return returnObject;
};

//##cloneObject
//input parameters:
//
// * `obj:` the object to clone
//
// Clones the object
Utility.cloneObject = function ( obj ) {
    if ( obj == null || typeof obj !== 'object' ) {
        return obj;
    }

    var copy = obj.constructor();

    for ( var attr in obj ) {
        if ( obj.hasOwnProperty( attr )) {
            copy[attr] = obj[attr];
        }
    }
    return copy;
};

module.exports = Utility;
