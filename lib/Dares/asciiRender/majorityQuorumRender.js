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

//##renderMajorityQuorum
// input parameters
//
// * `quorum:` array of processes participating in the quorum
//
// * `processes:` array of all processes
//
// * `priorityProcesses:` array of processes to prioritise
//
// * `ignoredProcesses:` array of ignored processes
//
// prints the majorityQuorum to the console
var renderMajorityQuorum = function ( quorum, processes, priorityProcesses, ignoredProcesses ) {
    quorum = typeof quorum !== 'undefined' ? quorum : [];
    processes = typeof processes !== 'undefined' ? processes : [];
    ignoredProcesses = typeof ignoredProcesses !== 'undefined' ? ignoredProcesses : [];
    priorityProcesses = typeof priorityProcesses !== 'undefined' ? priorityProcesses : [];

    var highlightIds = extractId( quorum );
    var allIds = extractId( processes );
    var priorityIds = extractId( priorityProcesses );
    var ignoredIds = extractId( ignoredProcesses );
    console.log( majorityQuorumRender( highlightIds, allIds, priorityIds, ignoredIds ));
};


//##majorityQuorumRender
// input parameters
//
// * `highlightIds:` array of ids to highlight
//
// * `allIds:` array of all ids
//
// * `priorityIds:` array of ids to prioritise
//
// * `ignoredIds:` array of ignored ids
//
// converts the id's to print objects and concatenates them
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

    //###idIsValid
    //input parameters
    //
    // * `id:` id to check
    //
    //checks if the id is still valid. As all id's should be positive, the comparison is
    //true for all ids. When our index exceeds the array, id is undefined and idIsValid
    //returns false
    function idIsValid ( id ) {
        return id > -1;
    }

}

module.exports = renderMajorityQuorum;
