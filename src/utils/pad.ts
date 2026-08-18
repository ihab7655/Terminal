export const fit = (value: string, width: number) => {
  if (width <= 0) return '';
  if (value.length <= width) return value.padEnd(width, ' ');
  if (width <= 3) return '.'.repeat(width);
  return value.slice(0, Math.max(0, width - 3)) + '...';
};

export const center = (value: string, width: number) => {
  if (value.length >= width) return fit(value, width);
  const left = Math.floor((width - value.length) / 2);
  return `${' '.repeat(left)}${value}`.padEnd(width, ' ');
};
