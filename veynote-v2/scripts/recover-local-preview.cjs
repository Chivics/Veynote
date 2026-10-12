// Offline recovery of ONLY the isolated local preview. Never modifies production.
// Work on a copy, export records, restore into a clean instance, verify byte-for-byte
// data dumps, then retain the original directory when switching to the verified copy.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const root = path.resolve(process.env.LOCALAPPDATA, 'Veynote', 'preview');
const bin = 'C:/Program Files/MySQL/MySQL Server 8.0/bin';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const recovery = path.join(root, `recovery-${stamp}`);
const config = JSON.parse(fs.readFileSync(path.join(root, 'credentials.json'), 'utf8'));
const original = path.resolve(config.dataDirectory || path.join(root, 'mysql'));
const copy = path.join(recovery, 'working-copy');
const restored = path.join(recovery, 'restored');
const processes = [];
function run(name, args, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn(path.join(bin, name), args, { windowsHide:true, stdio:['pipe','pipe','pipe'] });
    let output = '', error = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { error += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve(output);
      else { fs.appendFileSync(path.join(recovery, 'commands.log'), error); reject(new Error(`${name} failed (${code}); recovery log retained.`)); }
    });
    child.stdin.end(input);
  });
}
function listening(port) {
  return new Promise(resolve => {
    const socket = net.connect({host:'127.0.0.1',port});
    socket.setTimeout(1000);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
  });
}
function client(port, password = config.rootPassword) {
  const file = path.join(recovery, `client-${port}.ini`);
  fs.writeFileSync(file, `[client]\nprotocol=TCP\nhost=127.0.0.1\nport=${port}\nuser=root\npassword=${password}\n`, {mode:0o600});
  return `--defaults-file=${file}`;
}
async function start(directory, port, force = 0) {
  const log = fs.createWriteStream(path.join(recovery, `mysql-${port}.log`));
  const args = ['--no-defaults', `--basedir=${path.dirname(bin)}`, `--datadir=${directory}`, `--port=${port}`, '--bind-address=127.0.0.1', '--mysqlx=OFF', '--innodb-buffer-pool-size=128M', '--console'];
  if (force) args.push(`--innodb-force-recovery=${force}`);
  const child = spawn(path.join(bin, 'mysqld.exe'), args, {windowsHide:true, stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(log, {end:false}); child.stderr.pipe(log, {end:false});
  child.on('close', () => log.end());
  processes.push({child,port});
  for (let i=0;i<60;i++) {
    if (child.exitCode !== null) throw new Error(`Recovery instance ${port} could not start; original data untouched.`);
    if (await listening(port)) return;
    await new Promise(resolve => setTimeout(resolve,1000));
  }
  throw new Error(`Recovery instance ${port} timed out.`);
}
async function stopAll() {
  for (const item of processes) {
    if (item.child.exitCode !== null) continue;
    try { await run('mysqladmin.exe', [client(item.port), 'shutdown']); } catch { /* Retain logs and all data. */ }
    for (let i=0;i<30 && item.child.exitCode === null;i++) await new Promise(resolve => setTimeout(resolve,1000));
    if (item.child.exitCode === null) throw new Error('An owned recovery instance is still running; refusing directory switch.');
  }
}
async function dump(port, name, dataOnly = false) {
  const file = path.join(recovery, name);
  const args = [client(port), '--skip-lock-tables', '--set-gtid-purged=OFF', '--hex-blob', '--order-by-primary', '--skip-comments', `--result-file=${file}`];
  if (dataOnly) args.push('--no-create-info', '--skip-extended-insert');
  args.push('--databases','veynote_preview');
  await run('mysqldump.exe', args);
  return file;
}
async function main() {
  if (!original.startsWith(root + path.sep)) throw new Error('Source directory escaped the isolated preview.');
  for (const port of [3307,3308,3309,4001,5177]) if (await listening(port)) throw new Error(`Port ${port} is occupied. Stop the local preview before offline recovery.`);
  if (!config.bootstrapped || !config.schemaInitialized) throw new Error('Recovery requires an existing isolated preview database.');
  if (!fs.existsSync(path.join(original,'veynote_preview'))) throw new Error('Local preview database directory missing.');
  fs.mkdirSync(recovery, {recursive:false});
  console.log('Preserving the original local database; preparing an independent recovery copy...');
  fs.cpSync(original, copy, {recursive:true, errorOnExist:true});
  // MySQL documents 6 as the option that skips corrupt redo replay. It is used
  // only on this disposable copy, never as an application runtime setting.
  await start(copy,3308,6);
  const schemaDump = await dump(3308,'schema-and-records.sql');
  const sourceData = await dump(3308,'source-records.sql',true);
  console.log('Local records exported. Initializing a clean replacement for verification...');
  fs.mkdirSync(restored);
  await run('mysqld.exe', ['--no-defaults',`--basedir=${path.dirname(bin)}`,`--datadir=${restored}`,'--initialize-insecure','--console']);
  await start(restored,3309);
  await run('mysql.exe',[client(3309,''),'--batch'], `CREATE DATABASE veynote_preview CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER 'veynote_preview'@'127.0.0.1' IDENTIFIED BY '${config.databasePassword}'; GRANT ALL PRIVILEGES ON veynote_preview.* TO 'veynote_preview'@'127.0.0.1'; ALTER USER 'root'@'localhost' IDENTIFIED BY '${config.rootPassword}';`);
  await run('mysql.exe',[client(3309),'--batch'],fs.readFileSync(schemaDump));
  const restoredData = await dump(3309,'restored-records.sql',true);
  const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (digest(sourceData) !== digest(restoredData)) throw new Error('Restored records did not exactly match the recovered export; original database preserved.');
  await stopAll();
  if (await listening(3307)) throw new Error('The original preview started during recovery. Refusing directory switch.');
  if (!path.resolve(restored).startsWith(root + path.sep)) throw new Error('Recovered directory escaped the isolated preview.');
  // Keep the clean data directory at its original path; do not merge or reuse
  // a damaged redo directory. Retain the previous directory without alteration.
  config.dataDirectory = restored;
  fs.writeFileSync(path.join(root,'credentials.json'), JSON.stringify(config), {mode:0o600});
  console.log('Recovery verified: record exports match byte-for-byte. The original database and recovery exports are retained; the preview now uses the independent verified directory.');
}
main().catch(async error => { console.error(error.message); try { await stopAll(); } catch {} process.exitCode=1; });
