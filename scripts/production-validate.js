/**
 * Production Validation Script (Kodari Standard)
 * Ensures that the environment is correctly set up before starting or after starting apps.
 */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const PLACEHOLDER_SECRETS = [
    'REPLACE_WITH_STRONG_SECRET',
    'PLACEHOLDER',
    'INSERT_SECRET_HERE',
    'YOUR_SECRET_HERE'
];

function checkEnv(key) {
    const val = process.env[key];
    if (!val) {
        console.error(`[VALIDATION_ERROR] Missing environment variable: ${key}`);
        return false;
    }
    if (PLACEHOLDER_SECRETS.some(p => val.includes(p))) {
        console.error(`[VALIDATION_ERROR] Placeholder secret detected in ${key}: ${val}`);
        return false;
    }
    return true;
}

async function checkPortListen(port) {
    return new Promise((resolve) => {
        // Try to connect to localhost:port
        const socket = new (require('node:net').Socket)();
        socket.setTimeout(1000);
        socket.once('error', () => {
            resolve(false);
            socket.destroy();
        });
        socket.once('timeout', () => {
            resolve(false);
            socket.destroy();
        });
        socket.connect(port, '127.0.0.1', () => {
            resolve(true);
            socket.destroy();
        });
    });
}

async function checkHealth(url) {
    return new Promise((resolve) => {
        const req = http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const j = JSON.parse(data);
                        // Accept ok:true or status: 'ok' or similar
                        resolve(j.ok === true || j.status === 'ok' || j.service !== undefined);
                    } catch {
                        resolve(true);
                    }
                } else {
                    resolve(false);
                }
            });
        });
        req.on('error', () => resolve(false));
        req.setTimeout(5000, () => {
            req.destroy();
            resolve(false);
        });
    });
}

async function validate() {
    const mode = process.argv[2] || 'prestart';
    const appName = process.env.PM2_APP_NAME || 'unknown';

    console.log(`[VALIDATION_${mode.toUpperCase()}] Checking ${appName}...`);

    // Basic Envs
    const envsToCheck = [
        'NODE_ENV'
    ];

    if (appName.includes('paper-api')) {
        envsToCheck.push('ORBITALPHA_FUTURES_PAPER_API_SECRET', 'ORBITALPHA_FUTURES_PAPER_ROOT');
    }
    if (appName.includes('trading-api') || appName.includes('trading-server')) {
        envsToCheck.push('UPBIT_ACCESS_KEY', 'UPBIT_SECRET_KEY');
    }

    let ok = true;
    for (const k of envsToCheck) {
        if (!checkEnv(k)) ok = false;
    }

    if (mode === 'poststart') {
        const port = process.env.PORT || 3991;
        const isListening = await checkPortListen(Number(port));
        if (!isListening) {
            console.error(`[VALIDATION_ERROR] Process is online but port ${port} is NOT listening.`);
            ok = false;
        } else {
            console.log(`[VALIDATION_OK] Port ${port} is listening.`);
        }

        // Health check
        const healthUrl = `http://127.0.0.1:${port}/health`;
        const healthOk = await checkHealth(healthUrl);
        if (!healthOk) {
            console.error(`[VALIDATION_ERROR] Health check failed for ${healthUrl}`);
            ok = false;
        } else {
            console.log(`[VALIDATION_OK] Health check passed.`);
        }
    }

    if (!ok) {
        console.error(`[VALIDATION_FAILED] ${appName} is NOT in a healthy state.`);
        process.exit(1);
    } else {
        console.log(`[VALIDATION_SUCCESS] ${appName} looks good.`);
    }
}

validate().catch(err => {
    console.error(err);
    process.exit(1);
});
