// Browser stub for path module
export const join = (...args) => args.join('/');
export const resolve = (...args) => args.join('/');
export const dirname = (path) => path.split('/').slice(0, -1).join('/');
export const basename = (path) => path.split('/').pop();
export const extname = (path) => {
  const parts = path.split('.');
  return parts.length > 1 ? '.' + parts.pop() : '';
};
export const sep = '/';
export const delimiter = ':';
export const relative = (from, to) => to;
export const isAbsolute = (path) => path.startsWith('/');
export const normalize = (path) => path;
export const parse = (path) => ({
  root: '',
  dir: dirname(path),
  base: basename(path),
  ext: extname(path),
  name: basename(path, extname(path))
});

export default {
  join,
  resolve,
  dirname,
  basename,
  extname,
  sep,
  delimiter,
  relative,
  isAbsolute,
  normalize,
  parse
};