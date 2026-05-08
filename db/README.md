This folder contains database assets that must ship with the compiled `dist/` output:

- `db/migrations/*.sql`: schema migrations (with `-- up` / `-- down` sections)
- `db/queries/**/*.sql`: parameterized queries used by repositories

The build copies these assets into `dist/db/` so runtime code can load them from disk.

