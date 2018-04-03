//
// Conversion batch from Oracle to MySQL
//

var strSQLOracleListTables = 'SELECT * FROM dba_tables'
var objSQLSchemaMap = {in:'*', out:'*'}
var arrTables = []

// Process command line arguments
for (var intIndex = 2; intIndex < process.argv.length; intIndex++) {
  var strValue = process.argv[intIndex]
  if (strValue === '-help' || strValue === '--help' || strValue === '-h' || strValue === '--h') {
    console.log('Usage: node oracle2mysql.js [-list_request "SELECT * FROM dba_tables"] [-schema_map "IN:OUT"]')
    process.exit(0)
  } else if (strValue === '-list_request') {
    strSQLOracleListTables = process.argv[++intIndex]
  } else if (strValue === '-schema_map') {
    var arrSQLSchemaMap = process.argv[++intIndex].split(':')
    objSQLSchemaMap.in = arrSQLSchemaMap[0].toUpperCase()
    objSQLSchemaMap.out = arrSQLSchemaMap[1].toUpperCase()
  }
}

var mysql = require('mysql')
var mysqlDBConfig = require('./mysqlDBConfig.js')
var oracleDB = require('oracledb')
var oracleDBConfig = require('./oracleDBConfig.js')
var async = require('async')

var mysqlDBConnectionPool = mysql.createPool({
  host: mysqlDBConfig.host,
  user: mysqlDBConfig.user,
  password: mysqlDBConfig.password,
  database: mysqlDBConfig.schema
})
console.log('Processing from Oracle 2 MySQL...')
console.log('Connecting to Oracle database...')

databaseLoop(function (err) {
  if (err) {
    console.error(err.message)
    process.exit(1)
  }
  console.log(JSON.stringify(arrTables))
  process.exit(0)
})

function oracleDBConnect (cb) {
  var pool = oracleDB.getPool();
  pool.getConnection(cb)
}

function oracleDBRelease (objSourceConnection) {
  objSourceConnection.close(
    function (err) {
      if (err) {
        console.error(err.message)
      }
    }
  )
}

function databaseLoop (cb) {
  console.log('Listing Oracle tables with request: ' + strSQLOracleListTables)
  oracleDB.createPool (
    {
      user: oracleDBConfig.user,
      password: oracleDBConfig.password,
      connectString: oracleDBConfig.connectString,
      privilege: oracleDB.SYSDBA
    },
    function(err, pool) {
      pool.getConnection (
        function (err, objSourceConnection) {
          if (err) {
            console.error(err.message)
            console.error('Check environment variables NODE_ORACLEDB_USER, NODE_ORACLEDB_PASSWORD, NODE_ORACLEDB_CONNECTIONSTRING and NODE_ORACLEDB_EXTERNALAUTH.')
            return (cb(err))
          }
          objSourceConnection.execute(
            // The statement to execute
            strSQLOracleListTables,

            // No parameter in SQL request
            [],

            // execute() options argument.  Since the query only returns one
            // row, we can optimize memory usage by reducing the default
            // maxRows value.  For the complete list of other options see
            // the documentation.
            {
              maxRows: 0,
              outFormat: oracleDB.OBJECT,  // query result format
              extendedMetaData: false,      // get extra metadata
              fetchArraySize: 1000         // internal buffer allocation size for tuning
            },

            // The callback function handles the SQL execution results
            function (err, result) {
              if (err) {
                console.error(err.message)
                oracleDBRelease(objSourceConnection)
                return (cb(err))
              }
              for (var intRows = 0; intRows < result.rows.length; intRows++) {
                var strTableOwner = result.rows[intRows].OWNER.toUpperCase()
                var strTableName = result.rows[intRows].TABLE_NAME.toUpperCase()
                var strTablespace = result.rows[intRows].TABLESPACE_NAME.toUpperCase()
                var strMySQLSchema = strTableOwner
                if (objSQLSchemaMap.out !== '*') {
                  strMySQLSchema = objSQLSchemaMap.out
                }
                arrTables.push({table_owner: strTableOwner, table_name: strTableName, table_space: strTablespace, mysql_schema: strMySQLSchema})
              }
              oracleDBRelease(objSourceConnection)

              async.eachOfLimit(arrTables, 3 /* limit */, databaseMapTable /* iteratee */, cb /* callbackopt */)

            }
          )
        }
      )
  })
}

function databaseMapTable(objTable, intTableKey, cb) {
  var strTableOwner = objTable.table_owner
  var strTableName = objTable.table_name
  var strTablespace = objTable.table_space
  if (objSQLSchemaMap.in === '*' || objSQLSchemaMap.in === strTableOwner) {
    console.log('#' + intTableKey.toString(10) + ' ' + strTableOwner + '.' + strTableName + ' [' + strTablespace + '] => ' + objTable.mysql_schema + '.' + strTableName)
    oracleDBConnect(function (err, objSourceConnection) {
      if (err) {
        throw err
      }
      objSourceConnection.execute(
        // To get a table definition, we use a SELECT from the ALL_TAB_COLUMNS special table
        'SELECT * FROM ALL_TAB_COLUMNS WHERE OWNER=:table_owner AND TABLE_NAME = :table_name ORDER BY COLUMN_ID',
    
        // Parameters: table owner and table name
        {
          table_owner: { dir: oracleDB.BIND_IN, val: strTableOwner, type: oracleDB.STRING },
          table_name: { dir: oracleDB.BIND_IN, val: strTableName, type: oracleDB.STRING }
        },
    
        {
          maxRows: 1000,
          outFormat: oracleDB.OBJECT,  // query result format
          extendedMetaData: false,     // no extra metadata
          fetchArraySize: 1000         // internal buffer allocation size for tuning
        },
    
        // Callback function
        function (err, result) {
          if (err) {
            oracleDBRelease(objSourceConnection)
            throw err
          }
          objTable.columns = []
          for (var intCols = 0; intCols < result.rows.length; intCols++) {
            var intColumnID = result.rows[intCols].COLUMN_ID
            var strColumnName = result.rows[intCols].COLUMN_NAME
            var strColumnType = result.rows[intCols].DATA_TYPE
            var objColumnDefaultValue = result.rows[intCols].DATA_DEFAULT
            var blnColumnNullable = result.rows[intCols].NULLABLE !== 'N'
            console.log('  COLUMN #' + intCols.toString(10) + ' "' + strColumnName + '"[' + strColumnType + ']')
            objTable.columns.push({ id:intColumnID, name:strColumnName, type:strColumnType, default:objColumnDefaultValue, nullable:blnColumnNullable })
          }
          oracleDBRelease(objSourceConnection)
          return (cb())
        }
      )
    })
  }
}
/*
    console.log('Connecting to MySQL database...')
    mysqlDBConnectionPool.getConnection(function (err, objDestinationConnection) {
      if (err) throw err
      console.log('Connected.')
      objDestinationConnection.query('CREATE TABLE IF NOT EXISTS ', function (error, results, fields) {
        // Release
        objDestinationConnection.release()
        // Handle error after the release.
        if (error) throw error
        // Don't use the objDestinationConnection here, it has been returned to the pool.
      })
    })
*/
