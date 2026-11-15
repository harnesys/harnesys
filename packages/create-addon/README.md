# @harnesys/create-addon

Scaffold a Harnesys add-on from the bundled template.

```sh
bunx @harnesys/create-addon acme.my-addon
cd acme.my-addon
bun install
```

The generator copies the `acme.example` template shipped with this package, rewrites the
add-on id, title, package name and SDK pin, then prints the next steps. It never touches
the network and never installs dependencies.

## Usage

```
create-addon <dir> [options]        external add-on: the id defaults to the directory name
create-addon --builtin <name>       monorepo add-on: creates add-ons/harnesys.<name>

Options:
  --id <publisher.name>   add-on id (overrides the derived one)
  --name "<Title>"        human title (defaults to a title-cased id)
  --sdk <range>           @harnesys/sdk version range (default ^1.0.0)
  --force                 overwrite a non-empty target directory
  --builtin               internal monorepo mode (add-ons/, file: SDK, extends root tsconfig)
  -h, --help              show this help
```

The manifest id must be `<publisher>.<name>` — lowercase letters, digits and dashes, at
least one dot (`^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$`). Pass `--id` when the directory name
is not a valid id.

After generation:

```sh
bun install
bun run typecheck
bun test
bun run build
```

Install the built directory (with `dist/`) into `~/.harnesys/add-ons/<id>/<version>/`,
then press **Reload** in **Settings → Add-ons**, or use **Install package** with a `.zip`.
Details: `docs/external-addons/install-on-a-host.md`.

## Template

The template is not stored in the package repository. `scripts/sync-template.ts` copies
`templates/external-addon/` from the monorepo into `template/` at build and prepack time;
`template/` is generated, ignored by git, and shipped in the tarball via the `files` field.
