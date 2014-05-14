/**
 *
 * render.js
 * =========
 *
 * © 2014, TNG Technology Consulting GmbH  
 * Licensed under the Apache License, Version 2.0
 *
 * This file is utility class for the renderers.
 *
 */

'use strict';

//
var renderer = {};

//##numberToPrintObject
//input parameters
//
// * `number:` number to convert, currently supported: integers from 0 to 99
//
// * `highlight:` boolean whether this object shall be highlighted or not
//
// this function converts a number to an object, which is understood by the internal renderers
renderer.numberToPrintObject = function ( number, type ) {
    var numberStr = number < 10 ? '0' + number : number.toString();
    var borderCharacter;

    switch ( type ) {
        case 'highlight':
            borderCharacter = '▓';
            break;
        case 'ignored':
            borderCharacter = '░';
            break;
        case 'forcedOk':
            borderCharacter = '█';
            break;
        case 'failed':
            borderCharacter = 'X';
            break;
        default:
            borderCharacter = '▒';
    }

    return {
        line1: repeatChar( borderCharacter, 6 ),
        line2: borderCharacter + ' ' + numberStr + ' ' + borderCharacter,
        line3: repeatChar( borderCharacter, 6 )
    };

    function repeatChar ( char, times ) {
        var str = '';
        for ( var i = 0; i < times; i++ ) {
            str = str + char;
        }
        return str;
    }
};

//##makeLine
//input parameter
//
// * `objectsToPrint:` array of printable objects
//
// concatenates the printable objects into a print line
renderer.makeLine = function ( objectsToPrint ) {
    var currentObject;
    var spacing = '   ';
    var line1 = '';
    var line2 = '';
    var line3 = '';

    for ( var i = 0; i < objectsToPrint.length; i++ ) {
        currentObject = objectsToPrint[i];
        line1 = line1 + spacing + currentObject.line1;
        line2 = line2 + spacing + currentObject.line2;
        line3 = line3 + spacing + currentObject.line3;
    }
    return line1 + '\n' + line2 + '\n' + line3;
};


//##makeGrid
//input parameter
//
// * `lines:` array of print lines
//
// just concatenates the print lines into a printable grid
renderer.makeGrid = function ( lines ) {
    var res = '';
    var line;
    for ( var i = 0; i < lines.length; i++ ) {
        line = lines[i];
        res = res + renderer.makeLine( line );
        if ( i < lines.length - 1 ) {
            res = res + '\n\n';
        }
    }
    return res;
};

//##getIdType
//input parameters:
//
// * `id:` id to examine
//
// * `highlightedIds:` array of all highlighted ids
//
// * `forcedIds:` array of all forced ids
//
// * `ignoredIds:` array of all ignored ids
//
// this method determines the type of the id based on the provided arrays
renderer.getIdType = function ( id, highlightedIds, forcedIds, ignoredIds ) {
    var isHighlighted = (highlightedIds.indexOf( id ) !== -1);
    var isForced = (forcedIds.indexOf( id ) !== -1);
    var isIgnored = (ignoredIds.indexOf( id ) !== -1);

    if ( isHighlighted && isIgnored ) {
        return 'failed';
    }
    if ( isHighlighted && !isIgnored && isForced ) {
        return 'forcedOk';
    }
    if ( isHighlighted && !isIgnored && !isForced ) {
        return 'highlight';
    }
    if ( !isHighlighted && !isForced && isIgnored ) {
        return 'ignored';
    }

    return 'default';
};

module.exports = renderer;
