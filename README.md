# Scute Monorepo

## Monorepo Structure

```
├── apps
│   ├── dashboard
├── examples
│   ├── with-nextjs
│   ├── with-nodejs
│   ├── with-react
├── packages
│   ├── auth
│   │   ├── core
│   │   ├── edge
│   │   ├── nextjs
│   │   ├── node
│   │   ├── react
│   ├── auth-ui
│   │   ├── react
│   │   ├── shared
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── turbo.json
├── .gitignore
└── ...
```

## Examples

`with-nextjs`, `with-nodejs`,`with-react`

Install with no lockfile.
```bash
yarn install --no-lockfile
```

Set environment variables.

Start dev server
```bash
yarn dev
```

## Development Guide

It's recommended that using local npm registry server in order to test distributed packages.

### `verdaccio`

https://verdaccio.org/docs/what-is-verdaccio

#### Start `verdaccio` Local Registry Server

`pnpm verdaccio-start`

#### Publish packages to `verdaccio` local registry

Login with 
```bash 
pnpm login --registry http://localhost:4873
```

Make sure that you are in the right package to publish and run
```bash
pnpm publish --registry http://localhost:4873
```

Then add this to namespace and registry to the example project's `.npmrc`  in order to test.  

With this package manager will download packages from the local registry instead of `npmjs.com`

```bash
@scute:registry=http://localhost:4873
```

### `changesets` and release flow

#### Adding new changesets
To generate a new changeset, run `pnpm changeset` in the root of the repository. The generated markdown files in the `.changeset` directory should be committed to the repository.

#### Releasing changes
1. Run `pnpm changeset version`. This will bump the versions of the packages previously specified with `pnpm changeset` (and any dependents of those) and update the changelog files.
2. Run `pnpm install`. This will update the lockfile and rebuild packages.
3. Commit the changes.
4. Run `pnpm publish -r`. This command will publish all packages that have bumped versions not yet present in the registry.
5. You can publish to local `verdaccio` registry server with `pnpm publish -r --registry http://localhost:4873` command.


Docs

https://github.com/changesets/changesets/blob/main/docs/intro-to-using-changesets.md

https://pnpm.io/using-changesets