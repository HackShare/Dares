/**
 *
 * defaults.js
 * ===========
 *
 * © 2014, TNG Technology Consulting GmbH  
 * Licensed under the Apache License, Version 2.0
 *
 * This file defines all the default options for Dares.
 *
 */

'use strict';

var majority = require( './structures/majority.js' );
var grid = require( './structures/grid.js' );
var majorityRender = require( './asciiRender/majorityQuorumRender.js' );
var gridRender = require( './asciiRender/gridQuorumRender.js' );

var settings = {};

var availableInterfaces = require( 'os' ).networkInterfaces();
settings.networkInterface = {
    // list of all available interfaces: require( 'os' ).networkInterfaces();
    adapter: availableInterfaces.lo0 ? 'lo0' : availableInterfaces.lo ? 'lo' : Object.keys( availableInterfaces )[0],
    family: 'IPv4'
};

settings.alreadyRegisteredProcess = null;

settings.logging = {
    console: 'info'
};

var generators = [majority, majority, majority, majority,
    majority, majority, majority, majority,
    grid, majority, majority, majority,
    majority, majority, majority, grid];
var defaultGenerator = majority;

var generatorRenderer = [majorityRender, majorityRender, majorityRender, majorityRender,
    majorityRender, majorityRender, majorityRender, majorityRender,
    gridRender, majorityRender, majorityRender, majorityRender,
    majorityRender, majorityRender, majorityRender, gridRender ];

var defaultRenderer = majorityRender;
settings.voting = {};
settings.voting.StructureGenerator = function ( n ) {
    var generator = generators[n - 1];
    return generator ? generator : defaultGenerator;
};
settings.voting.StructureGeneratorRender = function ( n ) {
    var generator = generatorRenderer[n - 1];
    return generator ? generator : defaultRenderer;
};

settings.voting.rootKey = '_root';

var standardTimeout = 150;
settings.coordination = {};
settings.coordination.write = {};
settings.coordination.write.timeout = standardTimeout;
settings.coordination.write.vote = {};
settings.coordination.write.vote.timeout = standardTimeout;
settings.coordination.write.waitForCommit = {};
settings.coordination.write.waitForCommit.timeout = standardTimeout * 2;
settings.coordination.voting = {};
settings.coordination.voting.timeToRollback = standardTimeout * 5;

settings.coordination.epochChange = {};
settings.coordination.epochChange.lock = {};
settings.coordination.epochChange.lock.timeout = standardTimeout;
settings.coordination.epochChange.preCommit = {};
settings.coordination.epochChange.preCommit.timeout = standardTimeout * 2;

settings.coordination.write.voteForWrite = {};
settings.coordination.write.voteForWrite.timeout = standardTimeout;

settings.coordination.read = {};
settings.coordination.read.lock = {};
settings.coordination.read.lock.timeout = standardTimeout;
settings.coordination.read.read = {};
settings.coordination.read.read.timeout = standardTimeout;

settings.registration = {};
settings.registration.timeout = standardTimeout * 5;

module.exports = settings;
