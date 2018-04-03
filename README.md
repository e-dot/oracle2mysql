# oracle2mysql

Small data transfer script - from Oracle to MySQL

## Overview

This simple script converts data from an Oracle database to a MySQL database :
* List all tables using a connection to the Oracle database
* Maps data types to their MySQL equivalent
* Create and populate data to a MySQL connection

## Features

* Database requirements:
  * Requires a connection to an Oracle Database (via oracle-db npm package)
  * Requires a connection to a MySQL Database (via mysql npm package)
* Data type conversion:
  * TODO
* Command line parameters:
  * TODO

  
## Setup

### Install nodejs

* [https://nodejs.org/]

### Install Git

* [https://git-scm.com/downloads]

### Install Oracle Instant Client

* [http://www.oracle.com/technetwork/topics/winx64soft-089540.html]

### Checkout code

    git clone https://github.com/e-dot/oracle2mysql.git

### Install packages

    cd oracle2mysql
    cd setup
    npm install

## Usage
    cd ..
    node bin/oracle2mysql.js [options]

### Command Line Options

    TODO
