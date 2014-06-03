/**
 *
 * gridQuorumRender.js
 * ===================
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


/**
 * ##renderGridQuorum
 * Returns a string representation of the processes.
 *
 * @param {Process[]} quorum - array of processes participating in the quorum
 * @param {Process[]} processes - array of all processes
 * @param {Process[]} priorityProcesses - array of processes to prioritise
 * @param {Process[]} ignoredProcesses - array of ignored processes
 * @return {string}
 */
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

/**
 * ##gridQuorumRender
 * Converts the id's to print objects and concatenates them.
 * 
 * @param {number[]} highlightIds - array of ids to highlight
 * @param {number[]} allIds - array of all ids
 * @param {number[]} priorityIds - array of ids to prioritise
 * @param {number[]} ignoredIds - array of ignored ids
 * @return {string}
 */
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

    /**
     * ###makePrintObjForRow
     * Makes a printable version of line _i_.
     *
     * @param {number} i - index of the regarded line
     * @return {object[]}
     */
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

module.exports = renderGridQuorum;
