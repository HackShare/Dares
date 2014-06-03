/**
 *
 * tunnel.js
 * =========
 *
 * © 2014, TNG Technology Consulting GmbH  
 * Licensed under the Apache License, Version 2.0
 *
 * This file defines various methods to send and receive data in the distributed system.
 *
 */

'use strict';

//
var net = require( 'net' );
var async = require( 'async' );
var os = require( 'os' );

var Tunnel = function ( process ) {
    this.process = process;
    this.queue = [];
    this.currentlySending = false;
    this.options = process.options;
};

//#sending
/*
 */

/**
 * ##send
 * Bundles the input parameters to a sending object and pushes it to the sending queue.
 * If the sending recursion is not already running, it's going to be started.
 *
 * @param {object} json - message to send
 * @param {string} ip - recipients ip address
 * @param {number} port - recipients listening port
 */
Tunnel.prototype.send = function ( json, ip, port ) {
    this.queue.push( [
        {
            message: JSON.stringify( json ),
            ip: ip,
            port: port
        }
    ] );
    if ( !this.currentlySending ) {
        this.currentlySending = true;
        this.sendRecursion();
    }
};

/***
 * ##sendRecursion
 * This function continuously pops a message bundle from the sending queue and sends it
 * in parallel. If the queue is empty at the time all messages are send, it quits. Otherwise
 * it calls itself again.
 */
Tunnel.prototype.sendRecursion = function () {

    //un-queues an array of messages
    var nextBatch = this.queue.shift();

    //this mapping converts the messages-array into an array of functions of
    // which each sends one of the messages
    var functionArray = nextBatch.map( function ( elem ) {
        var message = elem.message;
        var ip = elem.ip;
        var port = elem.port;

        return function ( callback ) {
            var client = net.createConnection( port, ip );
            this.process.logger.debug( 'Sending ' +  message  + ' to ' + ip + ':' + port );

            client.addListener( 'connect', function () {
                client.write(  message, callback );
                client.end();
            } );
            client.addListener( 'error', function ( err ) {
                callback( err );
            } );
        }.bind( this );
    }.bind( this ) );

    //`async.parallel` will call all functions in order but without waiting
    // for their callbacks.
    // When every callback returned, the second function is called 
    // which checks the recursion condition and as necessary calls _sendRecursion_ again
    async.parallel( functionArray, function () {
        if ( this.queue.length === 0 ) {
            this.currentlySending = false;
        } else {
            this.sendRecursion();
        }
    }.bind( this ));
};

/**
 * ##createBatchAndSend
 * Creates a batch message and forwards it to the sendBatch function.
 * 
 * @param {Process[]} processes - processes to send the message to
 * @param {json} json - json message to send
 */
Tunnel.prototype.createBatchAndSend = function ( processes, json ) {
    var array = processes.map( function ( process ) {
        return {
            message: json,
            ip: process.address,
            port: process.port};
    } );
    this.sendBatch( array );
};

/**
 * ##sendBatch
 * Enqueues the messages and kicks of the sendRecursion
 * 
 * @param {object[]} batchMessage - bundle of Messages to send
 */
Tunnel.prototype.sendBatch = function ( batchMessage ) {
    batchMessage = batchMessage.map( function ( msg ) {
        return {
            message: JSON.stringify( msg.message ),
            ip: msg.ip,
            port: msg.port
        };
    });
    this.queue.push( batchMessage );
    if ( !this.currentlySending ) {
        this.currentlySending = true;
        this.sendRecursion();
    }

};
//#receiving
/*
 */


/**
 * ##listenToPort
 * starts a net server and listens to a given port. Only one server per tunnel
 * possible
 *
 * @param {number} port - port to listen to
 * @param {function} reaction - function to be called with received data
 */
Tunnel.prototype.listenToPort = function ( port, reaction ) {

    this.server = net.createServer( function ( socket ) {
        var received = '';
        var connectedAddress = socket.remoteAddress;
        var connectedPort = socket.remotePort;
        socket.on( 'error', function ( err ) {
            this.process.logger.error( err );
        }.bind( this ) );
        socket.on( 'data', function ( data ) {
            received = received + data;
        } );
        socket.on( 'end', function () {
            this.process.logger.debug( 'Received ' + received + ' from ' + connectedAddress + ':' + connectedPort );

            var input = JSON.parse( received );

            reaction( input, connectedAddress );
        }.bind( this ) );
    }.bind( this ) );
    this.server.listen( port );
};

/**
 * ##stopListening
 * stops the server from listening. Currently active connections won't be shut down,
 * but new ones are rejected.
 *
 * @param {function} callback - function to be called after we stopped listening
 */
Tunnel.prototype.stopListening = function ( callback ) {
    this.server.unref();
    this.server.close();

    this.process.logger.info( 'stop process ' + this.process.id + ' complete' );
    if ( callback ){
        callback();
    }
};

//#miscellaneous
/*
 */


/**
 * ##connectionTest
 * tries to open a connection to given process and calls `online` respectively `offline`
 * when the connection could be established or was rejected
 *
 * @param {Process} process - process to be tested
 * @param {function} online - function to be called when test was successful
 * @param {function} offline - function to be called when test failed
 */
Tunnel.prototype.connectionTest = function ( process, online, offline ) {
    net.createConnection( process.port, process.address )
        .on( 'connect', online )
        .on( 'error', offline );
};

/**
 * ##getNetworkAddress
 * Retrieves and returns the node instances network address.
 *
 * @return {string} The network address
 */
Tunnel.prototype.getNetworkAddress = function () {
    var ad = this.options.networkInterface.adapter;
    var fam = this.options.networkInterface.family;
    var networkInterfaces = os.networkInterfaces();
    var temp = networkInterfaces[ad];
    temp = temp.filter( function ( elem ) {
        return elem.family === fam;
    } );
    return temp[0].address;
};

module.exports = Tunnel;
