// MySQL DB Configuration (user, password, host, database schema)

module.exports = {
  user: process.env.NODE_MYSQL_USER || 'root',

  password: process.env.NODE_MYSQL_PASSWORD || '',

  host: process.env.NODE_MYSQL_HOST || 'localhost',

  schema: process.env.NODE_MYSQL_SCHEMA || 'oracle2mysql'

}
