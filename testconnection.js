const mysql = require('mysql2');

// Use the IP address directly
const connection = mysql.createConnection({
  host: '185.27.134.136',   // Use the IP address directly
  user: 'if0_38160631',      // Your database username
  password: 'Divyam05',      // Your database password
  database: 'if0_38160631_test',  // Your database name
  port: 3306                 // Default MySQL port
});

// Establish the connection
connection.connect((err) => {
  if (err) {
    console.error('Connection failed: ' + err.stack);
    return;
  }
  console.log('Connected as id ' + connection.threadId);
  
  // Close the connection
  connection.end();
});
