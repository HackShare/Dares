/**
 *
 * majorityQuorumRender.js
 * =======================
 *
 * © 2014, TNG Technology Consulting GmbH  
 * Licensed under the Apache License, Version 2.0
 *
 * This file provides methods that are used to visualize a quorum returned from a majority consensus voting.
 *
 */

'use strict';

//
var numberToPrintObject = require( './render.js' ).numberToPrintObject;
var makeStrGrid = require( './render.js' ).makeGrid;
var extractId = require( '../utility.js' ).extractIds;

/**
 * ##renderMajorityQuorum
 * Returns a string representation of the processes
 *
 * @param {Process[]} quorum - array of processes participating in the quorum
 * @param {Process[]} processes - array of all processes
 * @param {Process[]} priorityProcesses - array of processes to prioritise
 * @param {Process[]} ignoredProcesses - array of ignored processes
 * @return {string}
 */
var renderMajorityQuorum = function ( quorum, processes, priorityProcesses, ignoredProcesses ) {
    quorum = typeof quorum !== 'undefined' ? quorum : [];
    processes = typeof processes !== 'undefined' ? processes : [];
    ignoredProcesses = typeof ignoredProcesses !== 'undefined' ? ignoredProcesses : [];
    priorityProcesses = typeof priorityProcesses !== 'undefined' ? priorityProcesses : [];

    var highlightIds = extractId( quorum );
    var allIds = extractId( processes );
    var priorityIds = extractId( priorityProcesses );
    var ignoredIds = extractId( ignoredProcesses );
    return majorityQuorumRender( highlightIds, allIds, priorityIds, ignoredIds );
};


/**
 * ##majorityQuorumRender
 * Converts the id's to print objects and concatenates them.
 *
 * @param {number[]} highlightIds - array of ids to highlight
 * @param {number[]} allIds - array of all ids
 * @param {number[]} priorityIds - array of ids to prioritise
 * @param {number[]} ignoredIds - array of ignored ids
 * @return {string}
 */
function majorityQuorumRender ( highlightIds, allIds, priorityIds, ignoredIds ) {
    var getIdType = require( './render.js' ).getIdType;
    var linebreak = Number.POSITIVE_INFINITY;

    var count = 0;
    var elementsToProcess = true;
    var i;
    var line;
    var currId;
    var type;
    var printObj = [];

    //cycle through all processes
    while ( elementsToProcess ) {
        line = [];
        //but insert linebreaks
        for ( i = 0; i < linebreak; i++ ) {
            currId = allIds[count];
            count++;

            if ( idIsValid( currId )) {
                //in the valid case, we determine the type of the id ...
                type = getIdType( currId, highlightIds, priorityIds, ignoredIds );
                // and push the created printable object to the line
                line.push( numberToPrintObject( currId, type ));
            } else {
                //when we exceeded our array length, we're done
                elementsToProcess = false;
                break;
            }
        }
        printObj.push( line );
    }

    return makeStrGrid( printObj );

    /**
     * ###idIsValid
     * checks if the id is still valid. As all id's should be positive, the comparison is
     * true for all ids. When our index exceeds the array, id is undefined and idIsValid
     * returns false
     *
     * @param {number} id - id to check
     * @return {boolean}
     */
    function idIsValid ( id ) {
        return id > -1;
    }
}

module.exports = renderMajorityQuorum;
