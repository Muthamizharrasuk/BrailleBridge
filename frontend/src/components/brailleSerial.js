// Pure helper mirroring backend format_serial_command. Does no I/O.
export function formatSerialCommand(page) {
  if (!Array.isArray(page) || page.length !== 3) throw new Error('page must have 3 cells')
  page.forEach((m) => {
    if (!Number.isInteger(m) || m < 0 || m > 63) throw new Error(`bad mask ${m}`)
  })
  return `P,${page.join(',')}\n`
}
