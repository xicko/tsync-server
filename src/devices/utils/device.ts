export function getReadableDeviceName(name: string) {
  const [readable] = name.split('.');
  return readable ?? name;
}
