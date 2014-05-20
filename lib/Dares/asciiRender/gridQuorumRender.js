/**
 *
 * gridQuorumRender.js
 * =======================
 *
 * © 2014, TNG Technology Consulting GmbH  
 * Licensed under the Apache License, Version 2.0
 *
 * This file provides methods are used to visualize a quorum returned from a majority consensus voting.
 */

'use strict';

//
var extractId = require( '../utility.js' ).extractIds;
var makeGrid = require( '../structures/grid.js' ).makeGrid;
//##renderGridQuorum
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
// returns a string representation of the processes
var renderGridQuorum = function ( quorum, processes, priorityProcesses, ignoredProcesses ) {
    quorum = typeof quorum !== 'undefined' ? quorum : [];
    processes = typeof processes !== 'undefined' ? processes : [];
    ignoredProcesses = typeof ignoredProcesses !== 'undefined' ? ignoredProcesses : [];
    priorityProcesses = typeof priorityProcesses !== 'undefined' ? priorityProcesses : [];

    var highlightIds = extractId( quorum );
    var allIds = extractId( processes );
    var priorityIds = extractId( priorityProcesses );
    var ignoredIds = extractId( ignoredProcesses );
    return gridQuorumRender( highlightIds, allIds, priorityIds, ignoredIds );
};

//##gridQuorumRender
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
function gridQuorumRender ( highlightIds, allIds, priorityIds, ignoredIds ) {
    var numberToPrintObject = require( './render.js' ).numberToPrintObject;
    var makeStrGrid = require( './render.js' ).makeGrid;
    var getIdType = require( './render.js' ).getIdType;

    //collect the infos for the grid
    var grid = makeGrid( allIds.length );
    var rows = grid.rows;
    var columns = grid.columns;
    var currId;
    var type;
    var completeGrid = [];

    //cycle through the lines of the grid and collect their printable versions
    for ( var i = 0; i < rows; i++ ) {
        completeGrid.push( makePrintObjForRow( i ));
    }

    return makeStrGrid( completeGrid );

    //###makePrintObjForRow
    //input parameters
    //
    // `i:` index of the regarded line
    //
    //makes a printable version of line _i_
    function makePrintObjForRow ( i ) {
        var printObj = [];
        //cycle through all columns, ...
        for ( var j = 0; j < columns; j++ ) {
            // ... get the value of the grid in this point, ...
            currId = allIds[j + i * columns];
            // ... and check if it's valid.
            if ( idIsValid( currId )) {
                //in the valid case, we determine the type of the id ...
                type = getIdType( currId, highlightIds, priorityIds, ignoredIds );
                // ...and push the created printable object to the line
                printObj.push( numberToPrintObject( currId, type ));
            } else {
                //otherwise we fill up the grid with '--'
                printObj.push( numberToPrintObject( '--', false ));
            }
        }
        return printObj;
    }

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

module.exports = renderGridQuorum;
