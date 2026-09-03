import { app } from './app.js';
import { config } from './core/config/index.js';

const port = config.apiPort;

app.listen(port, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║        VoiceTally API Server                 ║
║        Port: ${String(port).padEnd(31)}║
║        Env:  ${config.nodeEnv.padEnd(31)}║
╚══════════════════════════════════════════════╝
  `);
});
