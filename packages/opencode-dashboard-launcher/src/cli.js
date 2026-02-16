#!/usr/bin/env node

const { ensureDashboard, checkDashboard, stopDashboard } = require('./index');

const command = process.argv[2];

switch (command) {
  case 'start':
    console.log('Starting OpenCode dashboard...');
    const result = ensureDashboard(true);
    if (result.launched) {
      console.log(`✓ Dashboard launched on http://127.0.0.1:${result.port} (PID: ${result.pid})`);
    } else {
      console.log(`✓ Dashboard already running on http://127.0.0.1:${result.port} (PID: ${result.pid})`);
    }
    break;
    
  case 'stop':
    console.log('Stopping OpenCode dashboard...');
    const stopResult = stopDashboard();
    if (stopResult.stopped) {
      console.log('✓ Dashboard stopped');
    } else {
      console.log(`✗ Dashboard not running or failed to stop: ${stopResult.reason}`);
    }
    break;
    
  case 'status':
    const status = checkDashboard();
    if (status.running) {
      console.log(`✓ Dashboard running on http://127.0.0.1:${status.port} (PID: ${status.pid})`);
    } else {
      console.log('✗ Dashboard not running');
    }
    break;
    
  case 'restart':
    console.log('Restarting OpenCode dashboard...');
    stopDashboard();
    setTimeout(() => {
      const restartResult = ensureDashboard(true);
      console.log(`✓ Dashboard restarted on http://127.0.0.1:${restartResult.port} (PID: ${restartResult.pid})`);
    }, 1000);
    break;
    
  default:
    console.log(`
OpenCode Dashboard Launcher

Usage:
  opencode-dashboard start    Launch dashboard (or open if already running)
  opencode-dashboard stop     Stop dashboard
  opencode-dashboard status   Check dashboard status
  opencode-dashboard restart  Restart dashboard
`);
    process.exit(command ? 1 : 0);
}
