/**
 *
 * process.js
 * ==========
 *
 * © 2014, TNG Technology Consulting GmbH
 * Licensed under the Apache License, Version 2.0
 *
 * This file is more or less the 'main class' for Dares.  
 * It process holds references to a dataReplicationCoordinator and a json storage unit.  
 * Further, it listens to a provided port and delegates the received messages.
 *
 */

'use strict';

//
var Reactions = require( './reactions.js' );
var Coordination = require( './coordination.js' );
var Storage = require( './storage.js' );
var Tunnel = require( './tunnel.js' );
var EventEmitter = require('events').EventEmitter;
var nodeUtil = require('util');


var Process = function ( Dares, setupComplete ) {
    setupComplete = setupComplete || function () {
    };
    var options = Dares.options;

    if ( !(this instanceof Process) ) {
        throw new Error( 'Constructor called as a function' );
    }

    if ( typeof options === 'string' ) {
        options = JSON.parse( options );
    }

    if ( isNaN( parseFloat( options.port ) ) || !isFinite( options.port ) ) {
        throw new Error( 'A port has to be provided' );
    }

    var that = this;
    var reactTo;
    var timeoutForRegistration;

    this.options = options;
    //make a new data replication coordinator, bound to this process
    this.dataReplicationCoordinator = new Coordination( this );
    this.storage = new Storage( this );
    this.tunnel = new Tunnel( this );

    this.allProcesses = [];
    this.port = options.port;

    this.id = options.id;
    this.address = undefined;

    //##getMeAsJson
    //returns a json representation of this process
    this.getMeAsJson = function () {
        return {id: that.id,
            address: that.address,
            port: that.port
        };
    };

    //##stop
    //closes the listening server and therefore shutting down this instance.
    this.stop = function (callback) {
        that.tunnel.stopListening(callback);
        console.log('Proccess ' + that.id + ' is shutting down.' );
    };

    //make a new reactions object, bound to this process
    reactTo = (new Reactions( that )).reactTo;
    //start server and listen
    this.tunnel.listenToPort( that.port, reactTo );
    console.log('Process ' + that.id + ' server started.' );
    /*
     */

    //initializing the processes variables
    this.address = that.tunnel.getNetworkAddress();

    //if there's no known process provided, the distributed system is initialized 
    // as only this process and the provided _setupComplete_ function to call after the system is
    //initialized is immediately called
    if ( !options.alreadyRegisteredProcess) {
        that.allProcesses = [this.getMeAsJson()];
        that.dataReplicationCoordinator.root = options.voting.StructureGenerator( 0 )( [this.getMeAsJson()] );

        //Delay until next tick to allow the constructor to finish properly before the callback is called
        process.nextTick(function () {setupComplete( true );});
    } else {
        //otherwise we have to send a register command to a known process  
        // This will trigger an epoch change which force includes this process  
        // After the epoch change is complete, the _setupComplete_ function can be called
        var split = options.alreadyRegisteredProcess.split( ':' );
        that.dataReplicationCoordinator.gotAnEpochChange = function ( success, error ) {
            that.dataReplicationCoordinator.gotAnEpochChange = function () {
            };
            clearTimeout( timeoutForRegistration );
            if ( !success ) {
                that.tunnel.stopListening();
            }
            //Delay until next tick to allow the constructor to finish properly before the callback is called
            process.nextTick(function () {setupComplete( success, error );});
        };
        that.tunnel.send( { action: 'register',
                data: that.getMeAsJson(),
                port: that.port},
            split[0], split[1] );

        //set a timeout for registration, should be long enough to prevent false negatives
        timeoutForRegistration = setTimeout( function () {
            that.tunnel.stopListening();
            setupComplete( false, {error: 'timeout for registration exceeded'} );
        }, options.registration.timeout );
    }
};

nodeUtil.inherits( Process, EventEmitter );

module.exports = Process;
