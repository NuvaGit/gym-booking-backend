const serverless = require('serverless-http');
const app = require('./server');

// Create a serverless handler from our Express app
const handler = serverless(app);

// Export the handler for AWS Lambda
module.exports.handler = async (event, context) => {
  // Return the serverless handler response
  return await handler(event, context);
};