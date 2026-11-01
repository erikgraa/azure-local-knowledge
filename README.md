# Data archive

Machine-written history of the Azure Local Compendium index. Each commit is the published `index.json` after a daily
(or manual) build; a commit is only made when the content actually changed.

Nothing is ever removed from this archive: items that disappeared from the official sources are kept with
`lifecycle.state = "removed"`.

- `index.json` - the full index (see schema/index.schema.json on main)
- `meta.json`  - content hash used to skip no-op commits
