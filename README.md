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
* Reads data from Oracle and writes it to MySQL using SQL commands
* Data type conversion:
  * VARCHAR2 => VARCHAR
  * DATE => DATE
  * CLOB => LONGTEXT
  * BLOB => LONGBLOB
  * NUMBER => INTEGER or DECIMAL(...)
* Multiple command line parameters to adapt migration for your needs

  
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
    SET NODE_PATH=...\oracle2mysql\setup\node_modules
    SET NODE_ORACLEDB_USER=... [DEFAULT:system]
    SET NODE_ORACLEDB_PASSWORD=... [DEFAULT:empty]
    SET NODE_ORACLEDB_CONNECTIONSTRING=... [DEFAULT:localhost/orcl]
    cd ..
    node bin/oracle2mysql.js [options]

### Command Line Options

* -list_request : define the Oracle query to list all SQL tables for migration (defaults to <code>SELECT * FROM dba_tables ORDER BY OWNER, TABLE_NAME</code>)
  * -list_request "SELECT * FROM dba_tables WHERE OWNER = 'mylogin' ORDER BY TABLE_NAME" : process only tables owned by 'mylogin'
  * -list_request "SELECT * FROM dba_tables WHERE OWNER = 'mylogin' AND TABLE_NAME='mytable'" : process only table 'mytable' owned by 'mylogin'
* -schema_map : define the schema mapping from Oracle (owner) to MySQL (database) ; defaults to "*:*" (maps owner to database as-is)
  * -schema_map "*:MYBASE" : replace owner by 'mybase' (e.g. table OWNER.NAME is migrated into MYBASE.NAME)
* -timeout : define the query timeout, in seconds (defaults to 600 s i.e. 10 minutes)
* -nodrop : if set, no "DROP TABLE" will be executed during migration (you can pre-fill tables with specific values, if needed)
* -nocreate : if set, no "CREATE TABLE" will be executed during migration (you have to manually create tables first)
* -truncate : if set, a SQL command "TRUNCATE TABLE" will be execute during migration of every table (emptying the table)
* -engine: if set, all "CREATE TABLE" commands will use this ENGINE (defaults to "MyISAM")
* -step: define the number of rows browsed and copied on every loop (defaults to 1 000)
  * -step 100000 : list 100 000 entries from source table at a time and create a single INSERT command into destination table (faster, but uses more resources)

## FAQ

### How do I solve error "FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - process out of memory" ?

* Use option <code>--max_old_space_size</code> when launching node, e.g. :

    node --max_old_space_size=2048 bin/oracle2mysql.js [options]

### Why are my DATETIME fields have a 1 day shift (D-1) ? How do I solve this jetlag issue ?

* Set environment variable ORA_SDTZ before running node, e.g. on Windows:

    SET ORA_SDTZ=Europe/Paris

    node --max_old_space_size=2048 bin/oracle2mysql.js [options]

## References

### Oracle Data Types

* [https://docs.oracle.com/cd/B28359_01/server.111/b28318/datatype.htm]

### MySQL Data Types

* [https://dev.mysql.com/doc/refman/5.5/en/data-types.html]

### Working with Dates Using the Node.js Driver for Oracle

* [https://jsao.io/2016/09/working-with-dates-using-the-nodejs-driver/]



