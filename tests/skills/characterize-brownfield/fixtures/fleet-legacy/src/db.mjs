// Thin data access over the fleet database; tables are kept in memory when no
// DATABASE_URL is configured.
const tables = new Map()
const connection = process.env.DATABASE_URL

const table = (name) => {
  if (!tables.has(name)) tables.set(name, [])
  return tables.get(name)
}

export const db = {
  connection,
  async all(name) { return [...table(name)] },
  async find(name, id) { return table(name).find((row) => row.id === id) },
  async insert(name, row) {
    const saved = { id: String(table(name).length + 1), ...row }
    table(name).push(saved)
    return saved
  },
  async update(name, row) {
    const rows = table(name)
    rows[rows.findIndex((existing) => existing.id === row.id)] = row
    return row
  },
}
