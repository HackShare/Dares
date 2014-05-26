Dares
========

[![Build Status](https://travis-ci.org/TNG/Dares.svg?branch=master)](https://travis-ci.org/TNG/Dares) [![Dependency Status](https://david-dm.org/TNG/Dares.svg)](https://david-dm.org/TNG/Dares) [![devDependency Status](https://david-dm.org/TNG/Dares/dev-status.svg)](https://david-dm.org/TNG/Dares#info=devDependencies)

#### Distributed Heterogeneous Dynamic Quorum-based Data Replication

Dares is a proof-of-concept implementation of a distributed heterogeneous dynamic quorum-based data replication scheme. The theoretical foundations are described in
  [Storm 2012](http://link.springer.com/book/10.1007%2F978-3-8348-2381-6 "Specification and Analytical Evaluation of Heterogeneous Dynamic Quorum-Based Data Replication Schemes").
 
We presented Dares at the 13th MNUG meet-up. A video of the talk can be found [here](http://www.youtube.com/watch?v=Avq9nY_XXH8 "2014.05.14 MNUG - Dares a distributed heterogeneous data replication system").

Getting started
---------------
### Install
List Dares in your package.json:

	"dares": "~0.0.1",

and run

	npm install

to install it as a dependency.


### Initialization
After installing you will be able to use Dares.js by 

      var Dares = require( 'dares' );
      var instance = new Dares( id, port, options );
      instance.start( callback )
      
with the following parameters: 

 * `id` an integer id which has to be unique in the system
 * `port` port to receive messages from other nodes
 * `options` an object setting the options for Dares. See the defaults.js file for possible options.
 * `callback` a function to be called when the setup is complete
leave empty to start a new distributed system

After `callback` was called, the new node is ready to be used.


### Writing
    instance.write( key, value, callback );

 * `key` valid json-key to write to
 * `value` value to write for this key
 * `callback` function which gets called when the write is completed. 

Writes the key value pair to the distributed system.  
`callback` gets called either with `callback( true )` when the write 
was successful and `callback( false, error )` in case of an unsuccessful write.


### Reading
 
     instance.read( key, callback );

 * `key` valid json-key to read
 * `callback` function which gets called when the read is completed. 

Reads a key from the distributed system.  
`callback` gets called either with `callback( true, value )` with `value` being the
read value when the write was successful or `callback( false, error )` in 
case of an unsuccessful write.



Contributing
------------

To contribute, clone the repository 

	git clone ssh://github.com/TNG/Dares.git

install the dependencies

	npm install

and run

	grunt

to see a list of all available tasks.
Run

	grunt docker

to generate the documentation files.


License
-------
Dares is released under the Apache License, Version 2.0.
