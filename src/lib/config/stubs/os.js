// Browser stub for os module
export const platform = () => 'browser';
export const arch = () => 'x64';
export const release = () => '1.0.0';
export const hostname = () => 'localhost';
export const homedir = () => '/';
export const tmpdir = () => '/tmp';
export const type = () => 'Browser';
export const cpus = () => [];
export const totalmem = () => 0;
export const freemem = () => 0;

export default {
  platform,
  arch,
  release,
  hostname,
  homedir,
  tmpdir,
  type,
  cpus,
  totalmem,
  freemem
};