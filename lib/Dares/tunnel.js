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

var consLog = false;

var Tunnel = function ( process ) {
    if ( !(this instanceof Tunnel) ) {
        throw new Error( 'Constructor called as a function' );
    }

    var linkedProcess = process;
    var that = this;
    var queue = [];
    var currentlySending = false;
    var server;
    var options = process.options;


    //#sending
    /*
     */

    //##send
    //input parameters:
    //
    // * `json:` message to send
    //
    // * `ip:` recipients ip address
    //
    // * `port:` recipients listening port
    //
    // bundles the input parameters to a sending object and pushes it to the sending queue.
    // If the sending recursion is not already running, it's going to be started.
    this.send = function ( json, ip, port ) {
        queue.push( [
            {
                message: JSON.stringify( json ),
                ip: ip,
                port: port
            }
        ] );
        if ( !currentlySending ) {
            currentlySending = true;
            sendRecursion();
        }
    };

    //##sendRecursion
    //this function continuously pops a message bundle from the sending queue and sends it
    //in parallel. If the queue is empty at the time all messages are send, it quits. Otherwise
    //it calls itself again
    var sendRecursion = function () {

        //un-queues an array of messages
        var nextBatch = queue.shift();

        //this mapping converts the messages-array into an array of functions of
        // which each sends one of the messages
        var functionArray = nextBatch.map( function ( elem ) {
            var message = elem.message;
            var ip = elem.ip;
            var port = elem.port;

            return function ( callback ) {
                var client = net.createConnection( port, ip );
                if ( consLog ) {
                    console.log( 'Sending ' +  message  + ' to ' + ip + ':' + port );
                }

                client.addListener( 'connect', function () {
                    client.write(  message, callback );
                    client.end();
                } );
                client.addListener( 'error', function ( err ) {
                    callback( err );
                } );
            };
        } );

        //`async.parallel` will call all functions in order but without waiting
        // for their callbacks.
        // When every callback returned, the second function is called ...
        async.parallel( functionArray, callbackForRecursion );

        //... which checks the recursion condition and as necessary calls _sendRecursion_
        //again
        function callbackForRecursion () {
            if ( queue.length === 0 ) {
                currentlySending = false;
            } else {
                //#!console.log( 'whow, recursion!' );
                sendRecursion();
            }
        }
    };

    //##createBatchAndSend
    //input parameters:
    //
    // * `processes:` processes to send the message to
    //
    // * `json:` json message to send
    //
    // creates a batch message and forwards it to the sendBatch function
    this.createBatchAndSend = function ( processes, json ) {
        var array = processes.map( function ( process ) {
            return {
                message: json,
                ip: process.address,
                port: process.port};
        } );
        that.sendBatch( array );
    };

    //##sendBatch
    //input parameters:
    //
    // * `batchMessage:` bundle of Messages to send
    //
    // enqueues the messages and kicks of the sendRecursion
    this.sendBatch = function ( batchMessage ) {
        batchMessage = batchMessage.map( function ( msg ) {
            return {
                message: JSON.stringify( msg.message ),
                ip: msg.ip,
                port: msg.port
            };
        });
        queue.push( batchMessage );
        if ( !currentlySending ) {
            currentlySending = true;
            sendRecursion();
        }

    };
    //#receiving
    /*
     */

    //##listenToPort
    //input parameters:
    //
    // * `port:` port to listen to
    //
    // * `reaction:` function to be called with received data
    //
    // starts a net server and listens to a given port. Only one server per tunnel
    // possible
    this.listenToPort = function ( port, reaction ) {

        server = net.createServer( function ( socket ) {
            var received = '';
            var connectedAddress = socket.remoteAddress;
            var connectedPort = socket.remotePort;
            socket.on( 'error', function ( err ) {
                console.log( err );
            } );
            socket.on( 'data', function ( data ) {
                received = received + data;
            } );
            socket.on( 'end', function () {
                if ( consLog ) {
                    console.log( 'Received ' + received + ' from ' + connectedAddress + ':' + connectedPort );
                }
                //try {
                    var input = JSON.parse( received );

                    reaction( input, connectedAddress );
                //} catch ( e ) {
                //    console.log( e );
                //}
            } );
        } );
        server.listen( port );
    };

    //##stopListening
    //stops the server from listening. Currently active connections won't be shut down,
    //but new ones are rejected.
    this.stopListening = function (callback) {
        server.unref();
        server.close( function () {
            console.log('stop process ' + linkedProcess.id + ' complete');
            if (callback){
                callback();
            }
        });
    };

    //#miscellaneous
    /*
     */


    //##connectionTest
    //input parameters
    //
    // `process:` process to be tested
    //
    // `online:` function to be called when test was successful
    //
    // `offline:` function to be called when test failed
    //
    // tries to open a connection to given process and calls `online` respectively `offline`
    // when the connection could be established or was rejected
    this.connectionTest = function ( process, online, offline ) {
        net.createConnection( process.port, process.address )
            .on( 'connect', online )
            .on( 'error', offline );
    };

    //##getNetworkAddress
    //retrieves and return the node instances network address
    this.getNetworkAddress = function () {
        var ad = options.networkInterface.adapter;
        var fam = options.networkInterface.family;
        var networkInterfaces = os.networkInterfaces();
        var temp = networkInterfaces[ad];
        temp = temp.filter( function ( elem ) {
            return elem.family === fam;
        } );
        return temp[0].address;
    };
};

module.exports = Tunnel;
