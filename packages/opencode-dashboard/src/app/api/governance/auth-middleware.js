// Authentication middleware for governance API endpoints
// Validates API key from request headers

const { NextResponse } = require('next/server');

// In production, this should come from environment variables
const VALID_API_KEYS = new Set([
  process.env.GOVERNANCE_API_KEY || 'dev-governance-key-change-in-production'
]);

/**
 * Middleware to validate API key for governance endpoints
 * @param {Request} request - Next.js request object
 * @returns {Promise<{valid: boolean, response?: NextResponse}>} Validation result
 */
async function validateApiKey(request) {
  // Get API key from headers
  const apiKey = request.headers.get('x-api-key') || 
                 request.headers.get('authorization')?.replace('Bearer ', '') ||
                 request.headers.get('Authorization')?.replace('Bearer ', '');
  
  // Check if API key is valid
  if (!apiKey || !VALID_API_KEYS.has(apiKey)) {
    return {
      valid: false,
      response: NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid or missing API key' },
        { status: 401 }
      )
    };
  }
  
  return { valid: true };
}

module.exports = { validateApiKey };