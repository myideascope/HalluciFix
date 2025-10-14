// Browser stub for fs module
export const existsSync = () => false;
export const readFileSync = () => '';
export const writeFileSync = () => {};
export const mkdirSync = () => {};
export const stat = () => Promise.resolve({});
export const lstat = () => Promise.resolve({});
export const readdir = () => Promise.resolve([]);
export const realpath = () => Promise.resolve('');
export default {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  stat,
  lstat,
  readdir,
  realpath
};