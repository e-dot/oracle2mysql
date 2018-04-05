//
// Conversion batch from Oracle to MySQL
//

var strSQLOracleListTables = 'SELECT * FROM dba_tables ORDER BY OWNER,TABLE_NAME'
var objSQLSchemaMap = {in: '*', out: '*'}
var arrTables = []
var intTimeout = 600 /* 10 minutes */
var blnDrop = true
var blnCreate = true
var blnTruncate = false
var strMySQLTableEngine = 'MyISAM'
var intSelectStep = 10000

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
  } else if (strValue === '-timeout') {
    intTimeout = parseInt(process.argv[++intIndex], 10)
  } else if (strValue === '-nodrop') {
    blnDrop = false
  } else if (strValue === '-nocreate') {
    blnCreate = false
  } else if (strValue === '-truncate') {
    blnTruncate = true
  } else if (strValue === '-engine') {
    strMySQLTableEngine = process.argv[++intIndex]
  } else if (strValue === '-step') {
    intSelectStep = parseInt(process.argv[++intIndex], 10)
  }
}

var mysql = require('mysql')
var mysqlDBConfig = require('./mysqlDBConfig.js')
var oracleDB = require('oracledb')
var oracleDBConfig = require('./oracleDBConfig.js')
var async = require('async')

// In order to process CLOB easily, process them as buffers
oracleDB.fetchAsBuffer = [ oracleDB.BLOB ]

var mysqlDBConnectionPool = mysql.createPool({
  connectionLimit : 10,
  host: mysqlDBConfig.host,
  user: mysqlDBConfig.user,
  password: mysqlDBConfig.password,
  database: (objSQLSchemaMap.out === '*' ? mysqlDBConfig.schema : objSQLSchemaMap.out),
  multipleStatements: true
})
console.log('Processing from Oracle 2 MySQL...')
console.log('Connecting to Oracle database...')

databaseLoop(function (err) {
  if (err) {
    console.error(err.message)
    process.exit(1)
  }
  for (var intTable = 0; intTable < arrTables.length; intTable++) {
    var objTable = arrTables[intTable] // {table_owner: strTableOwner, table_name: strTableName, table_space: strTablespace, mysql_schema: strMySQLSchema}
    // .columns.push({ id:intColumnID, name:strColumnName, type:strColumnType, default:objColumnDefaultValue, nullable:blnColumnNullable })
    var strSQLDropTable = 'DROP TABLE IF EXISTS `' + objTable.mysql_schema + '`.`' + objTable.table_name + '`\n;\n'
    var strSQLCreateTable = 'CREATE TABLE IF NOT EXISTS `' + objTable.mysql_schema + '`.`' + objTable.table_name +
      '` (' + objTable.columns.map(function (objColumn, intIndex, arrValues) {
        return ('\n  `' + objColumn.name + '` ' +
          databaseMapDataType(objColumn.type, objColumn.data_length, objColumn.data_precision, objColumn.data_scale) +
          (objColumn.nullable ? ' NULL' : ' NOT NULL') +
          databaseMapDefault(objColumn)
        )
      }) +
      '\n) ENGINE=' + strMySQLTableEngine + ' COMMENT \'oracle2mysql.js : ' + objTable.table_owner + '.' + objTable.table_name + ' [' + objTable.table_space + ']\'\n;\n'
    var strSQLTruncateTable = 'TRUNCATE TABLE `' + objTable.mysql_schema + '`.`' + objTable.table_name + '`\n;\n'
    // Full SQL request with drop/create/truncate, depending on command line parameters
    var strSQLDropCreateTruncateTable = ''
    if (blnDrop) {
      strSQLDropCreateTruncateTable += strSQLDropTable
    }
    if (blnCreate) {
      strSQLDropCreateTruncateTable += strSQLCreateTable
    }
    if (blnTruncate) {
      strSQLDropCreateTruncateTable += strSQLTruncateTable
    }
    // console.log('#' + intTable.toString(10) + ' SQL='+strSQLDropCreateTruncateTable)
    var arrMySQLColumns = objTable.columns.map(function (objColumn, intIndex, arrValues) {
      return ('`' + objColumn.name + '`')
    })
    var arrOracleColumns = objTable.columns.map(function (objColumn, intIndex, arrValues) {
      return (objColumn.name)
    })
    var strMySQLColumns = arrMySQLColumns.join(', ')
    var strOracleColumns = arrOracleColumns.join(', ')
    var strSQLSelectTable = 'SELECT ' +
      strOracleColumns +
      ' FROM ' + objTable.table_owner + '.' + objTable.table_name
    var strSQLInsertIntoTable = 'INSERT INTO `' + objTable.mysql_schema + '`.`' + objTable.table_name + '` (\n  ' + strMySQLColumns + '\n)\n'
    objTable.sql_create = strSQLDropCreateTruncateTable
    objTable.sql_select = strSQLSelectTable
    objTable.sql_insert = strSQLInsertIntoTable
  } // for

  // Create all tables
  async.eachOfLimit(arrTables, 3 /* limit */, databaseCreateTable /* iteratee */, function (err) {
    if (err) {
      throw err
    }
    console.log('MySQL: All tables created.')

    // Loop on all tables data (sql_select)
    async.eachOfLimit(arrTables, 1 /* limit */, databaseSelectInsertTable /* iteratee */, function (err) {
      if (err) {
        throw err
      }
      console.log('MySQL: All tables filled with data.')

      console.log('End.')
      process.exit(0)
    } /* callbackopt */)
  } /* callbackopt */)
})

function oracleDBConnect (cb) {
  var pool = oracleDB.getPool()
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
  console.log('Oracle: ' + strSQLOracleListTables)
  oracleDB.createPool(
    {
      user: oracleDBConfig.user,
      password: oracleDBConfig.password,
      connectString: oracleDBConfig.connectString,
      privilege: oracleDB.SYSDBA
    },
    function (err, pool) {
      if (err) {
        throw err
      }
      pool.getConnection(
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
    }
  )
}

function databaseMapTable (objTable, intTableKey, cb) {
  var strTableOwner = objTable.table_owner
  var strTableName = objTable.table_name
  if (objSQLSchemaMap.in === '*' || objSQLSchemaMap.in === strTableOwner) {
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
          maxRows: intSelectStep,
          outFormat: oracleDB.OBJECT,  // query result format
          extendedMetaData: false,     // no extra metadata
          fetchArraySize: 10000        // internal buffer allocation size for tuning
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
            objTable.columns.push({
              id: intColumnID,
              name: strColumnName,
              type: strColumnType,
              data_length: result.rows[intCols].DATA_LENGTH,
              data_precision: result.rows[intCols].DATA_PRECISION,
              data_scale: result.rows[intCols].DATA_SCALE,
              default: objColumnDefaultValue,
              nullable: blnColumnNullable
            })
          }
          oracleDBRelease(objSourceConnection)
          return (cb())
        }
      )
    })
  }
}

function databaseMapDataType (strSourceDataType, intDataLength, intDataPrecision, intDataScale) {
  var strDestinationDataType = strSourceDataType
  switch (strSourceDataType) {
    case 'CHAR':
      if (intDataLength >255) {
        if (intDataLength > 65535) {
          if (intDataLength > 16777215) {
            strDestinationDataType = 'LONGTEXT'
          } else {
            strDestinationDataType = 'MEDIUMTEXT'
          }
        } else {
          strDestinationDataType = 'TEXT'
        }
      } else {
        strDestinationDataType = 'CHAR(' + intDataLength + ')'
      }
      break
    case 'VARCHAR2':
      strDestinationDataType = 'VARCHAR(' + intDataLength + ')'
      break
    case 'NUMBER':
      if (intDataScale > 0) {
        strDestinationDataType = 'DECIMAL(' + intDataLength.toString(10) + ',' + intDataScale.toString(10) + ')'
      } else {
        strDestinationDataType = 'INTEGER'
      }
      break
    case 'CLOB':
    case 'LONG':
      strDestinationDataType = 'LONGTEXT'
      break
    case 'BLOB':
      strDestinationDataType = 'LONGBLOB'
      break
  }
  return (strDestinationDataType)
}

function databaseMapDefault (objColumn) {
  var strSQLDefault = ''
  if (objColumn.default !== null) {
    strSQLDefault = ' DEFAULT ' + objColumn.default
    if (objColumn.default.match(/^SYSDATE/)) {
      if (objColumn.type === 'DATETIME' || objColumn.type === 'TIMESTAMP') {
        strSQLDefault = ' DEFAULT CURRENT_TIMESTAMP'
      } else {
        // No direct translation from Oracle to MySQL: drop it
        strSQLDefault = ''
      }
    }
  }

  return (strSQLDefault)
}

function databaseCreateTable (objTable, intTable, cb) {
  mysqlDBConnectionPool.getConnection(function (err, objMySQLConnection) {
    if (err) {
      throw err
    }
    console.log('MySQL: ' + objTable.sql_create)
    objMySQLConnection.query({sql: objTable.sql_create, timeout: intTimeout*1000}, null, function (err, results, fields) {
      objMySQLConnection.release()
      if (err) {
        throw err
      }
      return cb()
    })
  })
}

function databaseSelectInsertTable (objTable, intTable, cb) {
  oracleDBConnect(function (err, objSourceConnection) {
    if (err) {
      throw err
    }
    console.log('Oracle:' + objTable.sql_select)
    objSourceConnection.execute(
      // Loop on all rows in source table
      objTable.sql_select,

      // Parameters: none
      {
      },

      // Options
      {
        maxRows: 0,                  // No limit
        outFormat: oracleDB.OBJECT,  // query result format
        extendedMetaData: false,     // no extra metadata
        resultSet: true              // return a Result Set
      },

      // Callback function
      function (err, result) {
        if (err) {
          oracleDBRelease(objSourceConnection)
          throw err
        }
        var numRows = 100  // number of rows to return from each call to getRows()
        databaseSelectInsertFetchRows(objSourceConnection, result.resultSet, numRows, objTable, intTable, cb)
      }
    )
  })
}

function databaseSelectInsertFetchRows (objSourceConnection, resultSet, numRows, objTable, intTable, cb) {
  resultSet.getRows( // get numRows rows
    numRows,
    function (err, rows) {
      if (err) {
        resultSet.close()
        oracleDBRelease(objSourceConnection)
        throw err
      } else if (rows.length > 0) {     // got some rows
        databaseSelectInsertProcessRows(objSourceConnection, rows, numRows, objTable, intTable, function (err) {
          if (err) throw err
          if (rows.length === numRows) {
            // might be more rows
            databaseSelectInsertFetchRows(objSourceConnection, resultSet, numRows, objTable, intTable, function (err) {
              if (err) throw err
              // Execute callback/end of loop (WARNING: in order to avoid crash "Maximum call stack size exceeded" we use setTimeout to wrap our cb call)
              return setTimeout(() => { cb(); });
            })
          } else {
            // got fewer rows than requested so must be at end
            // close the ResultSet and release the connection
            resultSet.close()
            oracleDBRelease(objSourceConnection)
            // Execute callback/end of loop (WARNING: in order to avoid crash "Maximum call stack size exceeded" we use setTimeout to wrap our cb call)
            return setTimeout(() => { cb(); });
          }
        })
      } else {
        // else no rows
        // close the ResultSet and release the connection
        resultSet.close()
        oracleDBRelease(objSourceConnection)
        // Execute callback/end of loop (WARNING: in order to avoid crash "Maximum call stack size exceeded" we use setTimeout to wrap our cb call)
        return setTimeout(() => { cb(); });
      }
    }
  )
}

function databaseSelectInsertProcessRows (objSourceConnection, rows, numRows, objTable, intTable, cb) {
  var arrRows = []
  for (var intRows = 0; intRows < rows.length; intRows++) {
    var objRow = rows[intRows]
    var arrCols = []
    for (var intCols = 0; intCols < objTable.columns.length; intCols++) {
      var strColumnName = objTable.columns[intCols].name
      var objColumnValue = objRow[strColumnName]
      arrCols.push(objColumnValue)
    }
    arrRows.push(arrCols)
  }
  if (arrRows.length > 0) {
    mysqlDBConnectionPool.getConnection(function (err, objMySQLConnection) {
      if (err) {
        throw err
      }
      var arrSQLValues = arrRows.map(function (arrCols, intRow, arrRows) {
        // Simply concatenate column values between parenthesis
        return ('(' + arrCols.map(function (objColumnValue, intColumn, arrCols) {
          // Simply encode the SQL value
          return (objMySQLConnection.escape(objColumnValue))
        }) + ')')
      })
      var strSQLInsertValues = objTable.sql_insert + ' VALUES \n' +
        arrSQLValues.join(', \n') + '\n'
      console.log('MySQL[' + arrRows.length + ']: ' + strSQLInsertValues)
      objMySQLConnection.query({sql: strSQLInsertValues, timeout: intTimeout*1000}, null, function (err, results, fields) {
        objMySQLConnection.release()
        if (err) {
          throw err
        }
        // Execute callback/end of loop
        return cb()
      })
    })
  }
}
