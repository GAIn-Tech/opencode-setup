import { NextResponse } from 'next/server';
import { GovernanceManager } from './governance-manager';
const { validateApiKey } = require('./auth-middleware');

// Singleton governance manager (persisted across requests)
let governanceManager = null;

function getGovernanceManager() {
  if (!governanceManager) {
    governanceManager = new GovernanceManager();
  }
  return governanceManager;
}

/**
 * GET /api/governance/status
 * Returns current governance settings.
 */
export async function GET(request) {
  try {
    // Validate API key
    const { valid, response } = await validateApiKey(request);
    if (!valid) return response;

    const manager = getGovernanceManager();
    const settings = manager.getSettings();

    return NextResponse.json({
      success: true,
      settings,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/governance/update
 * Updates governance settings.
 * Body: { budget?: { mode?: string }, learning?: {...}, verification?: {...}, routing?: {...} }
 */
export async function POST(request) {
  try {
    // Validate API key
    const { valid, response } = await validateApiKey(request);
    if (!valid) return response;

    const body = await request.json();
    const manager = getGovernanceManager();
    const updated = manager.updateSettings(body);

    return NextResponse.json({
      success: true,
      settings: updated,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 400 }
    );
  }
}
