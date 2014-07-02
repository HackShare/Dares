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
var EventEmitter = require( 'events' ).EventEmitter;
var nodeUtil = require( 'util' );
var winston = require( 'winston' );


var Process = function ( Dares, setupComplete ) {
    var reactTo;
    var timeoutForRegistration;

    this.options = Dares.options;

    //make a new data replication coordinator, bound to this process
    this.dataReplicationCoordinator = new Coordination( this );
    this.storage = new Storage( this );
    this.tunnel = new Tunnel( this );

    this.allProcesses = [];
    this.port = this.options.port;

    this.id = this.options.id;
    this.address = undefined;

    if ( this.options.logging ) {
        var transports = [];
        for ( var transport in this.options.logging ) {
            /* istanbul ignore else */
            if ( this.options.logging.hasOwnProperty( transport )) {
                if ( transport === 'console' ) {
                    transports.push( new ( winston.transports.Console )( {
                        level: this.options.logging[transport]
                    } ));
                } else {
                    transports.push( new ( winston.transports.File )( {
                        filename: transport,
                        level: this.options.logging[transport]
                    } ));
                }
            }
        }
        this.logger = new ( winston.Logger )( {
            transports: transports
        } );
    } else {
        this.logger = {
            silly: function () {},
            debug: function () {},
            verbose: function () {},
            info: function () {},
            warn: function () {},
            error: function () {}
        };
    }

    //##getMeAsJson
    //returns a json representation of this process
    this.getMeAsJson = function () {
        return {
            id: this.id,
            address: this.address,
            port: this.port
        };
    };

    //##stop
    //closes the listening server and therefore shutting down this instance.
    this.stop = function ( callback ) {
        this.tunnel.stopListening( callback );
    };

    //make a new reactions object, bound to this process
    reactTo = ( new Reactions( this )).reactTo;
    //start server and listen
    this.tunnel.listenToPort( this.port, reactTo );
    this.logger.info( 'Process ' + this.id + ' server started.' );
    /*
     */

    //initializing the processes variables
    this.address = this.tunnel.getNetworkAddress();

    //if there's no known process provided, the distributed system is initialized 
    // as only this process and the provided _setupComplete_ function to call after the system is
    //initialized is immediately called
    if ( !this.options.alreadyRegisteredProcess ) {
        this.allProcesses = [this.getMeAsJson()];
        this.dataReplicationCoordinator.root = this.options.voting.StructureGenerator( 0 )( [this.getMeAsJson()] );

        //Delay until next tick to allow the constructor to finish properly before the callback is called
        process.nextTick( function () {
            setupComplete( null );
        } );
    } else {
        //otherwise we have to send a register command to a known process  
        // This will trigger an epoch change which force includes this process  
        // After the epoch change is complete, the _setupComplete_ function can be called
        var split = this.options.alreadyRegisteredProcess.split( ':' );
        this.dataReplicationCoordinator.gotAnEpochChange = function ( error ) {
            this.dataReplicationCoordinator.gotAnEpochChange = function () {
            };
            clearTimeout( timeoutForRegistration );
            if ( error ) {
                this.tunnel.stopListening();
            }
            //Delay until next tick to allow the constructor to finish properly before the callback is called
            process.nextTick( function () {
                setupComplete( error );
            } );
        }.bind( this );

        this.tunnel.send( {
            action: 'register',
            data: this.getMeAsJson(),
            port: this.port
        }, split[0], split[1] );

        //set a timeout for registration, should be long enough to prevent false negatives
        timeoutForRegistration = setTimeout( function () {
            this.tunnel.stopListening();
            setupComplete( {
                error: 'timeout for registration exceeded'
            } );
        }.bind( this ), this.options.registration.timeout );
    }
};

nodeUtil.inherits( Process, EventEmitter );

module.exports = Process;
